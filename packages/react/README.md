# @dev-jelly/tinytipy-react

React adapter for [tinytipy](../../README.md) — animate **only the changed parts** when morphing text from A → B, with a Korean IME-aware typing cursor.

## Install

```bash
npm install @dev-jelly/tinytipy-react @dev-jelly/tinytipy
```

Import the stylesheet once in your app entry:

```ts
import '@dev-jelly/tinytipy/styles.css';
```

## Component

```tsx
import { TextMorph } from '@dev-jelly/tinytipy-react';

export function Demo() {
  return (
    <TextMorph
      from="현재 평균 응답 시간은 3초 정도이고, ... 2% 정도 빨라졌습니다."
      to="현재 평균 응답 시간은 300ms 정도이고, ... 20% 정도 빨라졌습니다."
    />
  );
}
```

### Props

| prop                  | type                                  | default  | description                                              |
| --------------------- | ------------------------------------- | -------- | -------------------------------------------------------- |
| `from`                | `string`                              | —        | Source text.                                             |
| `to`                  | `string`                              | —        | Target text.                                             |
| `timing`              | `Partial<MorphTiming>`                | defaults | Timing overrides.                                        |
| `autoPlay`            | `boolean`                             | `true`   | Play on mount.                                           |
| `instant`             | `boolean`                             | `false`  | Jump straight to `to`.                                   |
| `prefersReducedMotion`| `boolean`                             | auto     | Force reduced-motion.                                    |
| `reserveLayout`       | `'both' \| 'to' \| 'from' \| 'none'`  | `'both'` | Reserve box size to prevent reflow.                      |
| `onDone`              | `() => void`                          | —        | Fires once when the morph reaches `to`.                  |
| `className`           | `string`                              | —        | Extra class on the root (root always keeps `tm-root`).   |

The component accepts a ref of type `TextMorphHandle` exposing `play`, `pause`, `reset`, `finish`.

## Hook

For full control of the markup, use `useTextMorph`:

```tsx
import { useTextMorph } from '@dev-jelly/tinytipy-react';

function Custom() {
  const { state, play, pause, reset, finish } = useTextMorph({ from, to });
  // state.runs / state.cursorRunId / state.cursorOffset / state.done
  return <span>{/* render state however you like */}</span>;
}
```

`state` is a `RenderState` from `@dev-jelly/tinytipy`; use `getRenderTokens(state)` to get an ordered list of run + cursor tokens.

## Behavior notes

- Exactly **one** controller is created and reused; `from`/`to`/`timing` changes are forwarded via `setPair`/`setTiming`, never by recreating the controller.
- The controller is created inside a mount effect, so it is StrictMode-safe.
- The first render is seeded from a pure plan — SSR and first paint show `from` with no flash.
- `onDone` always calls the latest callback (no stale closures).

## License

MIT
