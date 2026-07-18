# tinytipy

> Diff-driven text morphing: animate **only the changed parts** when transforming text from A → B, with a typing cursor. Korean IME-aware.

Given two strings, tinytipy diffs them, then animates the transition — erasing the removed characters and typing the inserted ones (composing Korean syllable-by-syllable like a real IME), while shared text stays put. Perfect for showing **speech-recognition corrections**, **AI edits**, **form fixes**, or any A→B text reveal.

- 🎯 **Only the diffs move** — unchanged text is never re-typed.
- ⌨️ **Korean IME composition** — `최근` types as `ㅊ → 최 → 최ㄱ → 최그 → 최근`.
- ✨ **Live trailing cursor** — a substantial caret follows each edit, then keeps blinking at the end.
- 🧩 **One core, every framework** — React, Vue, Svelte, Solid, and vanilla DOM adapters. Import only what you use.
- 🪶 **Tiny & tree-shakeable** — framework-agnostic core, side-effect-free adapters, and an explicitly preserved stylesheet.
- ♿ **Accessible by default** — screen-reader text + `prefers-reduced-motion` support.
- 📐 **No layout shift** — reserves the final box so the page doesn't reflow mid-morph.

---

## Install

Pick the adapter for your framework (each pulls in `@dev-jelly/tinytipy`):

```bash
npm install @dev-jelly/tinytipy-react
# alternatives: @dev-jelly/tinytipy-vue, -svelte, -solid, or -dom
```

Then import the stylesheet **once** in your app entry:

```ts
import '@dev-jelly/tinytipy/styles.css';
```

## Quick start

### React

```tsx
import { TextMorph } from '@dev-jelly/tinytipy-react';
import '@dev-jelly/tinytipy/styles.css';

export function Demo() {
  return (
    <TextMorph
      from="현재 평균 응답 시간은 3초 정도이고, ... 2% 정도 빨라졌습니다."
      to="현재 평균 응답 시간은 300ms 정도이고, ... 20% 정도 빨라졌습니다."
    />
  );
}
```

Need full control of the markup? Use the hook:

```tsx
import { useTextMorph } from '@dev-jelly/tinytipy-react';

const { state, play, pause, reset, finish } = useTextMorph({ from, to, autoPlay: true });
// state.runs / state.cursorRunId / state.done — render however you like
```

### Vue

```vue
<script setup lang="ts">
import { TextMorph } from '@dev-jelly/tinytipy-vue';
</script>

<template>
  <TextMorph from="P95 응답 시간은 8초 ..." to="P95 응답 시간은 0.8초 ..." />
</template>
```

### Svelte

```svelte
<script lang="ts">
  import { morph } from '@dev-jelly/tinytipy-svelte';
  let from = '3초 정도';
  let to = '300ms 정도';
</script>

<!-- action: mounts the morph into any element -->
<span use:morph={{ from, to }} />
```

### Solid

```tsx
import { TextMorph } from '@dev-jelly/tinytipy-solid';
import '@dev-jelly/tinytipy/styles.css';

<TextMorph from={from()} to={to()} />
```

### Vanilla DOM

```ts
import { createTextMorph } from '@dev-jelly/tinytipy-dom';
import '@dev-jelly/tinytipy/styles.css';

const el = document.getElementById('morph')!;
const api = createTextMorph(el, { from: '3초', to: '300ms' });
// api.play(); api.pause(); api.reset(); api.finish(); api.destroy();
```

---

## Props / options

| option                | type                                  | default  | description                                              |
| --------------------- | ------------------------------------- | -------- | -------------------------------------------------------- |
| `from`                | `string`                              | —        | Source text (the "before").                              |
| `to`                  | `string`                              | —        | Target text (the "after").                               |
| `timing`              | `Partial<MorphTiming>`                | see below| Animation timing overrides.                              |
| `autoPlay`            | `boolean`                             | `true`   | Start playing on mount.                                  |
| `instant`             | `boolean`                             | `false`  | Skip the animation; jump straight to `to`.               |
| `prefersReducedMotion`| `boolean`                             | auto     | Force reduced-motion (jump to `to`). Auto-detected otherwise. |
| `reserveLayout`       | `'both' \| 'to' \| 'from' \| 'none'`  | `'both'` | Reserve box size to prevent reflow.                      |
| `onDone`              | `() => void`                          | —        | Fires once when the morph reaches `to`.                  |

### Timing (`MorphTiming`)

```ts
{
  initialDelayMs: 240,     // delay before the first edit
  hunkDelayMs: 190,        // "mark" pause before each changed region
  erasePerCharMs: 55,      // per-character erase speed
  pauseBeforeTypingMs: 60, // pause between erase and type in a hunk
  typePerFrameMs: 42,      // per composition-frame typing speed
  settleMs: 180,           // final settle before `done`
}
```

---

## How it works

tinytipy is a monorepo:

```
packages/
  core/     # framework-agnostic: diff + composition + planner + controller
  react/    # useTextMorph + <TextMorph/>
  vue/      # useTextMorph + <TextMorph/>
  svelte/   # store + use:morph action + createTextMorph()
  solid/    # createTextMorph + <TextMorph/>
  dom/      # createTextMorph(el, opts)
examples/
  data/pairs.ts   # 18 demos, including empty-state typing
  playground/     # Vite + React demo
```

1. **`diffText(from, to)`** — grapheme-level LCS diff → `equal` / `delete` / `insert` segments. Only the changed regions become editable runs.
2. **`buildCompositionFrames(text)`** — splits Korean syllables into 초성 → 초중성 → 완성 frames; one frame per non-Korean grapheme.
3. **`planMorph(opts)`** — a **pure** description of the animation: an initial snapshot (renders `from`), a final snapshot (renders `to`), and the timed steps between.
4. **`TextMorphController`** — schedules the plan with `setTimeout`, notifies subscribers, reacts to reduced-motion. The only stateful piece.
5. **Adapters** — bind the controller to each framework and render the snapshot via the shared `getRenderTokens()` helper. The cursor follows the active edit and remains at the end after completion.

## Why only the diffs move

Because the diff marks shared substrings as `equal`, they render once and never change. The morph spends its time only on `delete` runs (erased char-by-char) and `insert` runs (typed frame-by-frame). The cursor anchors to whichever run is actively being edited.

## Accessibility

- The animated layer is `aria-hidden`; a visually-hidden (`.tm-sr-only`) copy always exposes the final `to` text to assistive tech.
- Under `prefers-reduced-motion: reduce`, the morph jumps to `to` and the cursor stops blinking.

## Release

Run the complete local release gate:

```bash
pnpm install --frozen-lockfile
pnpm release:dry-run
```

This builds every package and the playground, type-checks the workspace, runs
the full test suite, rebuilds each package during `prepack`, and performs a
no-publish registry dry run. Once the project is in a clean Git repository and
the npm account has access to the `@dev-jelly` scope, publish in dependency
order with:

```bash
pnpm -r --filter './packages/*' publish
```

## License

MIT
