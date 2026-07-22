# @dev-jelly/tinytipy-svelte

Svelte 4 & 5 adapter for [tinytipy](../../) — diff-driven text morphing with a
typing cursor. It binds the framework-agnostic `@dev-jelly/tinytipy` to the shared
render model using the runtime **store** API plus a Svelte **action**.

This entry is plain TypeScript (compiled by `tsup`/`esbuild`). It deliberately
avoids runes (`$state`/`$derived`) and `.svelte` files so it works unchanged on
both Svelte 4 and 5.

## Install

```bash
pnpm add @dev-jelly/tinytipy-svelte @dev-jelly/tinytipy
```

Import the canonical stylesheet **once per app** (it is not bundled here):

```ts
import '@dev-jelly/tinytipy/styles.css';
```

## 1. Action — `use:morph` (component-like)

The simplest way to render. The action builds the `tm-root` structure into its
host node, wires one controller, and patches the DOM on every snapshot:

```svelte
<script>
  import { morph } from '@dev-jelly/tinytipy-svelte';
  let pair = { from: '기운', to: '기온' };
</script>

<!-- `node` itself becomes `.tm-root`. Extra classes pass through `class`. -->
<span class="headline" use:morph={pair}></span>
```

`use:morph` accepts the full options object: `from`, `to`, `timing?`,
`autoPlay?` (default `true`), `instant?`, `prefersReducedMotion?`,
`reserveLayout?` (`'both'` | `'to'` | `'from'` | `'none'`, default `'both'`),
`cursorLayout?` (`'overlay'` | `'inline'`, default `'overlay'`), `onDone?`, and
`class?` (appended to the root, always keeps `tm-root`). When
`from`/`to` change, the action calls `setPair` and replays when `autoPlay`.

## 2. Store + controls — `createTextMorph`

For full markup control, use the readable store of `RenderState` and the
imperative controls:

```svelte
<script>
  import { createTextMorph } from '@dev-jelly/tinytipy-svelte';

  const { state, play, pause, reset, finish, controller } = createTextMorph({
    from: '현재 3초',
    to: '현재 300ms',
    onDone: () => console.log('done'),
  });

  // $state auto-subscribes (the store contract: subscribe + optional set/update).
  $: runs = $state.runs;
</script>

<!-- Render whatever markup you like from $state. -->
<span class="tm-root" data-cursor-layout="overlay">
  <span class="tm-layer" aria-hidden="true">
    {#each runs as run (run.id)}
      <span class="tm-run tm-run--{run.kind}" data-status={run.status}>{run.text}</span>
    {/each}
  </span>
  <span class="tm-sr-only">{$state.runs.map((r) => r.finalText).join('')}</span>
</span>

<button on:click={reset}>reset</button>
```

### Returned handle

| field        | type                          | description                                  |
| ------------ | ----------------------------- | -------------------------------------------- |
| `state`      | `Readable<RenderState>`       | live snapshot store (use as `$state`)        |
| `controller` | `TextMorphController`         | underlying core controller (escape hatch)    |
| `play`       | `() => void`                  | start/restart the morph                       |
| `pause`      | `() => void`                  | hold the current visible state               |
| `reset`      | `() => void`                  | return to the `from` snapshot                |
| `finish`     | `() => void`                  | jump to the `to` snapshot                    |
| `setPair`    | `(from, to, opts?) => void`   | recompute the plan for a new pair            |
| `setTiming`  | `(timing) => void`            | update timing without changing the pair      |
| `destroy`    | `() => void`                  | cancel timers, unsubscribe, tear down        |

## Rendered DOM

Both entry points render the same canonical structure (styled by
`@dev-jelly/tinytipy/styles.css`):

```html
<span class="tm-root">
  <span class="tm-reserve" aria-hidden="true"><!-- hidden reserve text(s) --></span>
  <span class="tm-layer" aria-hidden="true">
    <span class="tm-run tm-run--{kind}" data-status="{status}">{text}</span>
    <span class="tm-cursor" aria-hidden="true"></span> <!-- active edit or resolved text end -->
    ...
  </span>
  <span class="tm-sr-only">{final `to` text}</span>
</span>
```

During editing the cursor trails the active run (core guarantees
`cursorOffset === active run text length`), so runs are never split. Once done,
the cursor trails the full resolved text.

The default overlay mode uses a zero-width flow anchor and positioned caret, so
it does not consume horizontal space. `inline` preserves the legacy cursor
spacing. Both modes keep the completion and empty-text cursor, inherit
`currentColor`, and become steady under reduced motion.

## License

MIT
