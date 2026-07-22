# tinytipy — adapter rendering spec

Every framework adapter (`@dev-jelly/tinytipy-react`,
`@dev-jelly/tinytipy-vue`, `@dev-jelly/tinytipy-svelte`,
`@dev-jelly/tinytipy-solid`, and `@dev-jelly/tinytipy-dom`) binds the **same**
framework-agnostic core (`@dev-jelly/tinytipy`) to the **same** DOM rendering
model. This document is the single source of truth for that model. Adapter
implementers must follow it exactly so behaviour is consistent.

## Core API (already built & tested)

```ts
import {
  TextMorphController,   // schedules the plan
  defaultTiming,         // timing defaults
  type RenderState,      // { runs, cursorRunId, cursorOffset, done }
  type RunState,         // { id, kind: 'keep'|'remove'|'add', text, finalText, status }
  type MorphTiming,
  type MorphOptions,
} from '@dev-jelly/tinytipy'
```

`new TextMorphController({ from, to, timing?, autoPlay?, prefersReducedMotion?, instant?, onDone? })`
exposes: `subscribe(fn) => unsub`, `play()`, `pause()`, `reset()`, `finish()`,
`setPair(from,to,opts?)`, `setTiming(timing)`, `destroy()`, `snapshot`, `isPlaying`.

The controller emits `RenderState` snapshots. **Rendering is derived purely from a
snapshot — never schedule timers inside an adapter.**

## Render model

Given a `RenderState`, render this exact structure:

```html
<span class="tm-root" data-cursor-layout="overlay">
  <span class="tm-reserve" aria-hidden="true">  <!-- reserve text (see below) --></span>
  <span class="tm-layer" aria-hidden="true">
    <!-- one <span class="tm-run ..."> per run, in order -->
    <span class="tm-run tm-run--keep" data-status="done">기</span>
    <span class="tm-run tm-run--remove" data-status="pending">운</span>
    <span class="tm-cursor" aria-hidden="true"></span>      <!-- after active run, or all runs when done -->
    <span class="tm-run tm-run--add" data-status="pending">온</span>
    ...
  </span>
  <span class="tm-sr-only">  <!-- final `to` text, for screen readers --> </span>
</span>
```

Rules:
1. **Cursor is a *trailing* cursor.** During editing it is rendered once,
   immediately after the run whose `id === state.cursorRunId`. Core guarantees
   `cursorOffset === that run's text.length`, so you never need to split a run's
   text. When `state.done` is true, render it after all runs so the resolved text
   keeps a live cursor. A non-done idle state has no cursor.
2. **Run classes**: `tm-run`, plus `tm-run--{kind}` (`keep` | `remove` | `add`),
   plus `data-status="{status}"` (`pending` | `done`).
3. **Layout reservation** (`reserveLayout` prop, default `'both'`): render the
   reserve layer so the container does not reflow during the animation.
   - `'both'`: render BOTH `from` and `to` inside `.tm-reserve` (two stacked
     hidden spans) → box stays at least max(from, to).
   - `'to'`: render only `to`.
   - `'from'`: render only `from`.
   - `'none'`: render nothing in the reserve layer.
   The reserve layer is `aria-hidden` and `visibility:hidden` (handled by CSS).
4. **Cursor layout** (`cursorLayout` prop, default `'overlay'`): set the resolved
   value on `.tm-root` as `data-cursor-layout="overlay|inline"`. Overlay uses the
   canonical zero-width flow anchor and absolutely positioned caret so it adds
   no horizontal advance. `inline` preserves the legacy space-consuming cursor.
   Both modes keep active-edit, completion, and empty-text placement.
5. **Accessibility**: `.tm-sr-only` always contains the FINAL `to` text. The
   reserve and animated layers are `aria-hidden="true"`. Reduced-motion users get
   the final state immediately (core handles this; the adapter just renders
   whatever snapshot it receives).
6. **Styles**: ship/import `@dev-jelly/tinytipy/styles.css` (the canonical stylesheet).
   Do not inline styles in adapters beyond what the spec requires. Document the
   one-time CSS import in each adapter's README.

## Public adapter API (keep consistent across frameworks)

- A **component** named `TextMorph`:
  - props/attrs: `from`, `to`, `timing?`, `autoPlay?` (default `true`),
    `instant?`, `prefersReducedMotion?`, `reserveLayout?` (`'both'|'to'|'from'|'none'`, default `'both'`),
    `cursorLayout?` (`'overlay'|'inline'`, default `'overlay'`),
    `class?`/`className?` (merged onto root), `onDone?`, `play?`/`as?` only if trivial.
  - When `from`/`to` change, the controller calls `setPair` automatically.
  - Cleans up the controller on unmount/destroy.
- A **hook / composable / directive** that returns the current `RenderState`
  (or a render-ready model) for users who want full control of markup:
  - React: `useTextMorph({ from, to, ...opts }) => { state, play, pause, reset, finish }`
  - Vue: `useTextMorph(...)` returning reactive refs
  - Solid: `createTextMorph(...)`
  - Svelte: `textMorph(...)` store + a `use:morph` action
  - DOM: `createTextMorph(element, opts) => controller`

## Build / package conventions

- `tsup` with `format: ['esm','cjs']`, `dts: true`, `external: ['@dev-jelly/tinytipy', <framework>]`.
- `sideEffects: false` (CSS is imported from core, not bundled here).
- Framework as `peerDependencies` (and `devDependencies` for build).
- `"types"` + `"exports"` map, `"files": ["dist","README.md"]`.
- Each adapter's `tsconfig.json` extends `../../tsconfig.base.json`.
- `jsx` setting per framework (React: `react-jsx`; Solid: `preserve` + solid plugin via tsup; Vue: `vue` not needed for render functions / use `jsx: preserve` and import from 'vue' h).

## Quality bar

- Strict TypeScript, zero lint errors.
- The component must not re-create the controller on every render — only when
  `from`/`to` actually change (use the framework's appropriate memo/effect).
- No layout shift when `reserveLayout !== 'none'`.
- Reduced motion → final state with a steady (non-blinking) cursor handled by CSS.
