/*!
 * Usability Tracker - tiny, dependency-free UX friction tracker.
 * Tracks clicks, rage clicks, dead clicks, form errors, JS errors,
 * scroll depth, active time and timed tasks. Data stays in the browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UsabilityTracker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[onclick],[tabindex]';

  function selectorOf(el) {
    if (!el || !el.tagName) return '';
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    if (el.classList && el.classList.length) s += '.' + el.classList[0];
    return s;
  }

  function UsabilityTracker(options) {
    this.opts = Object.assign({
      storageKey: 'usability-tracker',
      rageClicks: 3,        // clicks...
      rageWindowMs: 1000,   // ...within this window...
      rageRadiusPx: 30,     // ...inside this radius
      idleAfterMs: 15000,   // stop counting active time after this
      maxEvents: 500
    }, options || {});
    this.reset();
    this._cleanup = [];
    this._listeners = {};
  }

  var P = UsabilityTracker.prototype;

  P.reset = function () {
    this.startedAt = Date.now();
    this.events = [];
    this.tasks = {};
    this.counts = { clicks: 0, rage: 0, dead: 0, formErrors: 0, jsErrors: 0 };
    this.maxScroll = 0;
    this.activeMs = 0;
    this._recent = [];
    this._lastInput = Date.now();
  };

  P.on = function (type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
    return this;
  };

  P._emit = function (type, data) {
    var ev = { type: type, t: Date.now() - this.startedAt, data: data || {} };
    this.events.push(ev);
    if (this.events.length > this.opts.maxEvents) this.events.shift();
    (this._listeners[type] || []).concat(this._listeners['*'] || []).forEach(function (fn) { fn(ev); });
    this._save();
    return ev;
  };

  P.start = function () {
    var self = this;
    function add(target, name, fn, opts) {
      target.addEventListener(name, fn, opts || true);
      self._cleanup.push(function () { target.removeEventListener(name, fn, opts || true); });
    }

    add(document, 'click', function (e) {
      self._touch();
      self.counts.clicks++;
      var el = e.target, sel = selectorOf(el), now = Date.now();
      self._emit('click', { target: sel });

      if (!el.closest || !el.closest(INTERACTIVE)) {
        self.counts.dead++;
        self._emit('dead-click', { target: sel });
      }

      self._recent = self._recent.filter(function (c) { return now - c.t < self.opts.rageWindowMs; });
      self._recent.push({ t: now, x: e.clientX, y: e.clientY });
      var near = self._recent.filter(function (c) {
        return Math.hypot(c.x - e.clientX, c.y - e.clientY) <= self.opts.rageRadiusPx;
      });
      if (near.length >= self.opts.rageClicks) {
        self.counts.rage++;
        self._recent = [];
        self._emit('rage-click', { target: sel });
      }
    });

    add(document, 'invalid', function (e) {
      self.counts.formErrors++;
      self._emit('form-error', { field: e.target.name || selectorOf(e.target) });
    });

    add(window, 'error', function (e) {
      self.counts.jsErrors++;
      self._emit('js-error', { message: e.message });
    }, false);

    add(window, 'scroll', function () {
      self._touch();
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var pct = h > 0 ? Math.round((window.scrollY / h) * 100) : 100;
      if (pct > self.maxScroll) { self.maxScroll = pct; self._emit('scroll-depth', { percent: pct }); }
    }, { passive: true });

    ['keydown', 'mousemove', 'touchstart'].forEach(function (n) {
      add(document, n, function () { self._touch(); }, { passive: true });
    });

    var timer = setInterval(function () {
      if (!document.hidden && Date.now() - self._lastInput < self.opts.idleAfterMs) {
        self.activeMs += 1000;
        self._emit('tick');
      }
    }, 1000);
    this._cleanup.push(function () { clearInterval(timer); });
    return this;
  };

  P.stop = function () {
    this._cleanup.forEach(function (fn) { fn(); });
    this._cleanup = [];
    return this;
  };

  P._touch = function () { this._lastInput = Date.now(); };

  // Timed tasks: tracker.startTask('signup'); ... tracker.endTask('signup', true)
  P.startTask = function (name) {
    this.tasks[name] = { start: Date.now() };
    this._emit('task-start', { task: name });
  };

  P.endTask = function (name, success) {
    var t = this.tasks[name];
    if (!t || t.end) return null;
    t.end = Date.now();
    t.ms = t.end - t.start;
    t.success = success !== false;
    this._emit('task-end', { task: name, ms: t.ms, success: t.success });
    return t;
  };

  // 0-100 friction score: higher is smoother.
  P.score = function () {
    var c = this.counts, failed = 0;
    for (var k in this.tasks) if (this.tasks[k].end && !this.tasks[k].success) failed++;
    var s = 100 - c.rage * 8 - c.dead * 2 - c.formErrors * 4 - c.jsErrors * 10 - failed * 15;
    return Math.max(0, Math.min(100, s));
  };

  P.summary = function () {
    return {
      startedAt: new Date(this.startedAt).toISOString(),
      activeSeconds: Math.round(this.activeMs / 1000),
      maxScrollPercent: this.maxScroll,
      counts: this.counts,
      tasks: this.tasks,
      score: this.score()
    };
  };

  P.exportJSON = function () {
    return JSON.stringify({ summary: this.summary(), events: this.events }, null, 2);
  };

  P.exportCSV = function () {
    var rows = ['time_ms,type,details'];
    this.events.forEach(function (e) {
      if (e.type === 'tick') return;
      rows.push([e.t, e.type, '"' + JSON.stringify(e.data).replace(/"/g, '""') + '"'].join(','));
    });
    return rows.join('\n');
  };

  P._save = function () {
    try { localStorage.setItem(this.opts.storageKey, this.exportJSON()); } catch (e) { /* storage unavailable */ }
  };

  return UsabilityTracker;
});
