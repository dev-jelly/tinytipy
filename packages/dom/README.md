# @dev-jelly/tinytipy-dom

Vanilla, framework-free DOM adapter for [tinytipy](../../). Animates only the
changed parts when morphing text from `A` to `B`, with a typing cursor and
reflow-free layout reservation — no framework required.

It binds the framework-agnostic core (`@dev-jelly/tinytipy`) to a real DOM tree and
patches it incrementally on every snapshot (one span per run, reused across
ticks; `innerHTML` is never rebuilt on a tick).

## Install

```bash
pnpm add @dev-jelly/tinytipy @dev-jelly/tinytipy-dom
```

## One-time CSS import

Import the canonical stylesheet **once per app** (it is not bundled here):

```ts
import '@dev-jelly/tinytipy/styles.css';
```

## Usage

### `createTextMorph(target, options)`

Mount a morph inside an existing element. Returns an imperative handle.

```ts
import { createTextMorph } from '@dev-jelly/tinytipy-dom';

const host = document.getElementById('title')!;
const handle = createTextMorph(host, {
  from: '기운',
  to: '기온',
  className: 'title',          // appended after `tm-root`
  reserveLayout: 'both',       // 'both' | 'to' | 'from' | 'none' (default 'both')
  cursorLayout: 'overlay',     // 'overlay' (default) | 'inline' (legacy spacing)
  onDone: () => console.log('settled'),
});

// Imperative controls:
handle.play();
handle.pause();
handle.reset();
handle.finish();

// Swap the pair later (re-plans and, by default, replays):
handle.setPair('기온', '안녕');

// Tear down (cancels timers + unsubscribes; removes the root from `host`):
handle.destroy();
```

### `renderTextMorph(options)`

Build a standalone `.tm-root` element (not yet attached) for callers that want
to place it themselves.

```ts
import { renderTextMorph } from '@dev-jelly/tinytipy-dom';

const { element, destroy } = renderTextMorph({ from: 'abc', to: 'xyz' });
document.body.appendChild(element);
// ...later
destroy();
```

## Rendered structure

```html
<span class="tm-root" data-cursor-layout="overlay">
  <span class="tm-reserve" aria-hidden="true"><!-- reserve text(s) --></span>
  <span class="tm-layer" aria-hidden="true">
    <span class="tm-run tm-run--{kind}" data-status="{status}">{text}</span>
    <span class="tm-cursor" aria-hidden="true"></span>   <!-- active edit or resolved text end -->
    ...
  </span>
  <span class="tm-sr-only"><!-- final `to` text --></span>
</span>
```

- `.tm-reserve` sizes the box (prevents reflow) per `reserveLayout`; it and
  `.tm-layer` are `aria-hidden`.
- `.tm-sr-only` always carries the **final** `to` text for screen readers.
- The cursor is a single trailing node appended after the active run while
  editing, then after all runs once the text resolves.
- Overlay uses a zero-width flow anchor and positioned caret, so it adds no
  horizontal advance. `inline` preserves the legacy space-consuming cursor.
  Both modes support empty text, inherit `currentColor`, and become steady under
  reduced motion.

## Options

| Option                 | Type                                  | Default | Notes                                              |
| ---------------------- | ------------------------------------- | ------- | -------------------------------------------------- |
| `from` / `to`          | `string`                              | —       | Required. Source and target text.                  |
| `timing`               | `Partial<MorphTiming>`                | —       | Overrides merged onto `defaultTiming`.             |
| `autoPlay`             | `boolean`                             | `true`  | Play on mount.                                     |
| `instant`              | `boolean`                             | —       | Skip straight to `to`.                             |
| `prefersReducedMotion` | `boolean`                             | auto    | Force reduced-motion (skip to final).              |
| `reserveLayout`        | `'both' \| 'to' \| 'from' \| 'none'`  | `'both'`| Reflow reservation strategy.                       |
| `cursorLayout`         | `'overlay' \| 'inline'`                | `'overlay'` | Zero-width overlay or legacy inline cursor.    |
| `className` / `class`  | `string`                              | —       | Extra classes on the root (after `tm-root`).       |
| `onDone`               | `() => void`                          | —       | Fires once when the morph reaches `to`.            |
