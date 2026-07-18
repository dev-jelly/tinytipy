# @dev-jelly/tinytipy-solid

Solid 1.8+ adapter for [tinytipy](../../) — diff-driven text morphing with a
typing cursor. Binds the framework-agnostic `@dev-jelly/tinytipy` to Solid's
reactivity primitives and renders the canonical
`tm-root / tm-reserve / tm-layer / tm-sr-only` structure described in
[`ADAPTERS_SPEC.md`](../../ADAPTERS_SPEC.md).

## Install

```bash
pnpm add @dev-jelly/tinytipy-solid @dev-jelly/tinytipy solid-js
```

### One-time CSS import

Import the canonical stylesheet **once** in your app entry. The component does
**not** import any CSS from JS — your bundler is in charge.

```ts
// app entry (e.g. src/index.tsx)
import "@dev-jelly/tinytipy/styles.css";
```

## `<TextMorph />` component

Declarative. Renders the full structure for you.

```tsx
import { TextMorph } from "@dev-jelly/tinytipy-solid";

function LiveLabel() {
  return <TextMorph from="3s" to="300ms" />;
}
```

### Props

| Prop                  | Type                                              | Default     | Notes                                                                 |
| --------------------- | ------------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| `from`                | `string`                                          | required    | Source text.                                                          |
| `to`                  | `string`                                          | required    | Target text.                                                          |
| `timing`              | `Partial<MorphTiming>`                            | `defaultTiming` | Per-phase timing overrides.                                          |
| `autoPlay`            | `boolean`                                         | `true`      | Play on mount and after `from`/`to` changes.                          |
| `instant`             | `boolean`                                         | `false`     | Skip animation, jump straight to `to`.                                |
| `prefersReducedMotion`| `boolean`                                         | auto-detect | Force reduced-motion behaviour.                                       |
| `reserveLayout`       | `'both' \| 'to' \| 'from' \| 'none'`              | `'both'`    | Hidden reserve text to prevent reflow.                                |
| `class` / `className` | `string`                                          | —           | Appended to the root element (`tm-root` is always kept).              |
| `onDone`              | `() => void`                                      | —           | Fires once when the morph reaches `to`.                               |
| `controllerRef`       | `(c: TextMorphController) => void`                | —           | Receive the underlying controller for imperative control on mount.    |

## `createTextMorph` primitive

For full markup control. Returns an accessor over the live `RenderState` plus
imperative controls. Accepts values **or** accessors for the reactive inputs.

```tsx
import { createTextMorph } from "@dev-jelly/tinytipy-solid";
import { For } from "solid-js";

function CustomMorph(props: { from: string; to: string }) {
  const { state, play, pause, reset, finish } = createTextMorph({
    from: () => props.from,
    to: () => props.to,
    onDone: () => console.log("done"),
  });

  return (
    <span>
      <For each={state().runs}>
        {(run) => <span data-status={run.status}>{run.text}</span>}
      </For>
      <button onClick={() => reset()}>reset</button>
    </span>
  );
}
```

### Return

| Field        | Type                          | Description                                                  |
| ------------ | ----------------------------- | ------------------------------------------------------------ |
| `state`      | `Accessor<RenderState>`       | Live snapshot — `runs`, `cursorRunId`, `cursorOffset`, `done`. |
| `play`       | `() => void`                  | Start/restart the morph.                                     |
| `pause`      | `() => void`                  | Hold the current visible state.                              |
| `reset`      | `() => void`                  | Return to the initial (`from`) snapshot.                     |
| `finish`     | `() => void`                  | Jump straight to `to`.                                       |
| `controller` | `TextMorphController`         | The underlying controller (one per call).                    |

### Lifecycle guarantees

- Exactly **one** `TextMorphController` is constructed per `createTextMorph`
  call. It is reused for every `from`/`to`/`timing` change (`setPair` /
  internal plan recompute) — never recreated.
- The controller is destroyed automatically via `onCleanup` when the owning
  reactive scope disposes (component unmount, root disposal). All timers are
  cancelled and listeners unsubscribed.
- `autoPlay` is read once at creation; flipping it later does not restart an
  in-flight morph.

## Rendering rules (custom markup)

If you use `createTextMorph` directly and build your own DOM, follow the
canonical structure so the canonical stylesheet works:

```html
<span class="tm-root">
  <span class="tm-reserve" aria-hidden="true"><!-- reserve text(s) --></span>
  <span class="tm-layer" aria-hidden="true">
    <!-- one node per token from getRenderTokens(state) -->
    <span class="tm-run tm-run--{kind}" data-status="{status}">{text}</span>
    <span class="tm-cursor" aria-hidden="true"></span> <!-- active edit or resolved text end -->
  </span>
  <span class="tm-sr-only">{final `to` text}</span>
</span>
```

Use `getRenderTokens(state)` from `@dev-jelly/tinytipy` to get an ordered list
(`run` and `cursor` tokens — the cursor follows the active run, then the full
resolved text) and `getReserveTexts(reserveLayout, from, to)` for the reserve
layer.

## Package shape

This package ships **source** (`src/index.tsx`); the consumer's
`vite-plugin-solid` pipeline compiles the JSX. The `build` script is
`tsc --emitDeclarationOnly` — it only emits the `.d.ts` files.
