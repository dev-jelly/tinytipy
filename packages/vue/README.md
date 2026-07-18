# @dev-jelly/tinytipy-vue

Vue 3 adapter for **tinytipy** — diff-driven text morphing with a typing
cursor (Korean IME aware). Built on the framework-agnostic
[`@dev-jelly/tinytipy`](../core).

- `<TextMorph from="..." to="..." />` — drop-in component.
- `useTextMorph({ from, to, ... })` — composable returning a reactive
  `RenderState` plus imperative controls, for full-markup control.

## Install

```bash
pnpm add @dev-jelly/tinytipy-vue @dev-jelly/tinytipy vue
```

`vue` (>= 3.3) is a peer dependency.

### One-time CSS import (required)

The adapter does **not** import CSS itself. Import the canonical stylesheet from
core exactly once in your app entry:

```ts
// main.ts / app entry
import '@dev-jelly/tinytipy/styles.css';
```

The classes are: `.tm-root`, `.tm-reserve`, `.tm-layer`, `.tm-run`,
`.tm-run--keep | --remove | --add`, `.tm-cursor`, `.tm-sr-only`.

## `<TextMorph>` component

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { TextMorph } from '@dev-jelly/tinytipy-vue';

const text = ref('현재 3초');
function correct() {
  text.value = '현재 300ms';
}
</script>

<template>
  <TextMorph from="현재 3초" :to="text" class="my-text" @click="correct" />
</template>
```

### Props

| Prop                  | Type                                             | Default     | Notes                                              |
| --------------------- | ------------------------------------------------ | ----------- | -------------------------------------------------- |
| `from`                | `string`                                         | required    | Source text.                                       |
| `to`                  | `string`                                         | required    | Target text.                                       |
| `timing`              | `Partial<MorphTiming>`                           | `undefined` | Per-step cadence overrides.                        |
| `autoPlay`            | `boolean`                                        | `true`      | Play on mount and after `from`/`to` change.        |
| `instant`             | `boolean`                                        | `undefined` | Skip straight to `to`.                             |
| `prefersReducedMotion`| `boolean`                                        | `undefined` | Force on/off; omit to auto-detect via `matchMedia`. |
| `reserveLayout`       | `'both' \| 'to' \| 'from' \| 'none'`             | `'both'`    | Hidden reserve text(s) to prevent reflow.          |
| `onDone`              | `() => void`                                     | `undefined` | Fires once when the morph reaches `to`.            |

A `class` / `style` / attrs passthrough lands on the root `.tm-root` element
(Vue single-root fallthrough keeps `tm-root` first).

### Imperative controls

Grab a template ref and call `play() / pause() / reset() / finish()`:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { TextMorph } from '@dev-jelly/tinytipy-vue';
import type { TextMorphExposed } from '@dev-jelly/tinytipy-vue';

const morph = ref<TextMorphExposed>();
</script>

<template>
  <TextMorph ref="morph" from="a" to="b" />
  <button @click="morph?.finish()">Finish now</button>
</template>
```

## `useTextMorph()` composable

For full control over the markup, drive it yourself from the live snapshot:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useTextMorph } from '@dev-jelly/tinytipy-vue';

const from = ref('Hello');
const to = ref('Help');
const { state, play, pause, reset, finish } = useTextMorph({
  from,
  to,
  onDone: () => console.log('done'),
});
</script>

<template>
  <span class="my-root">
    <!-- map state.runs yourself, or use getRenderTokens(state) -->
    {{ state.runs.map((r) => r.text).join('') }}
  </span>
</template>
```

`from` / `to` / `timing` / `instant` / `prefersReducedMotion` each accept a
plain value, a `ref`, or a getter. The composable creates **one** controller,
re-plans on changes, and destroys it when the owning scope is disposed
(component unmount or `effectScope.stop()`).

## Rendering model

The component renders (styled by `@dev-jelly/tinytipy/styles.css`):

```html
<span class="tm-root">
  <span class="tm-reserve" aria-hidden="true">…</span>
  <span class="tm-layer" aria-hidden="true">
    <span class="tm-run tm-run--{kind}" data-status="{status}">…</span>
    <span class="tm-cursor" aria-hidden="true"></span>
    …
  </span>
  <span class="tm-sr-only">{final `to` text}</span>
</span>
```

The cursor trails the active run while editing and the full resolved text when
done; the reserve layer sizes the box to prevent layout shift; `.tm-sr-only`
always holds the final `to` text for assistive tech.

## License

MIT
