# Usability Tracker

A tiny, dependency-free JavaScript library that shows where visitors struggle on a page. Everything runs in the browser and nothing is sent anywhere.

## What it tracks

| Signal | How it is detected |
|---|---|
| Rage clicks | 3+ clicks within 1 second inside a 30px radius |
| Dead clicks | Clicks on elements that aren't interactive |
| Form errors | Browser `invalid` events on form fields |
| JS errors | `window.onerror` |
| Scroll depth | Furthest point scrolled, in % |
| Active time | Seconds with recent input and a visible tab |
| Tasks | Timed flows you mark with `startTask` / `endTask` |

These combine into a 0-100 smoothness score.

## Quick start

```html
<script src="src/usability-tracker.js"></script>
<script>
  const tracker = new UsabilityTracker().start();
  tracker.startTask('checkout');
  // ...when the user finishes:
  tracker.endTask('checkout', true);   // false marks the task as failed
  console.log(tracker.summary());
</script>
```

Open `index.html` for a live demo with a dashboard.

## API

- `new UsabilityTracker(options)`: options include `rageClicks`, `rageWindowMs`, `rageRadiusPx`, `idleAfterMs`, `storageKey`
- `.start()` / `.stop()`: attach or remove listeners
- `.startTask(name)` / `.endTask(name, success)`
- `.on(type, fn)`: listen for an event type, or `'*'` for all
- `.summary()`, `.score()`, `.exportJSON()`, `.exportCSV()`, `.reset()`

The current session is also saved to `localStorage` under `usability-tracker`.

## Roadmap

- Heatmap of click positions
- Compare sessions side by side
- Optional endpoint to send events to

## License

MIT
