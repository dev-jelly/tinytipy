# @dev-jelly/tinytipy

Framework-agnostic core of [tinytipy](../../README.md): diff-driven text morphing that animates **only the changed parts**, with Korean IME-aware typing.

Zero runtime dependencies. Use this directly if you want to drive the animation
yourself, or pick a ready-made framework adapter:
`@dev-jelly/tinytipy-react`, `@dev-jelly/tinytipy-vue`,
`@dev-jelly/tinytipy-svelte`, `@dev-jelly/tinytipy-solid`, or
`@dev-jelly/tinytipy-dom`.

## Install

```bash
npm install @dev-jelly/tinytipy
```

## The pieces

### `diffText(from, to): Segment[]`

Grapheme-level LCS diff. Returns ordered segments:

```ts
type Segment = { type: 'equal' | 'delete' | 'insert'; text: string };

diffText('자글로', '다글로');
// => [ { type: 'delete', text: '자' }, { type: 'insert', text: '다' }, { type: 'equal', text: '글로' } ]
```

Shared substrings survive as `equal`, so only genuinely changed regions need animating. Operates on grapheme clusters (emoji-safe) via `Intl.Segmenter`.

### `buildCompositionFrames(text): string[]`

Korean IME typing frames — the cumulative visible text at each step:

```ts
buildCompositionFrames('최근');
// => ['ㅊ', '최', '최ㄱ', '최그', '최근']
```

A 받침-less syllable is 2 frames (`ㅊ → 최`); a 받침 syllable is 3 (`ㄱ → 그 → 근`). Non-Korean graphemes (latin, digits, punctuation, emoji) are one frame each, so `FP8` types as `F → FP → FP8`. Input is NFC-normalized so decomposed (NFD) Hangul composes correctly.

### `planMorph(options): MorphPlan`

A **pure** description of the whole animation — no timers, no side effects:

```ts
const plan = planMorph({
  from: '3초 정도',
  to: '300ms 정도',
  timing: { typePerFrameMs: 30 }, // Partial<MorphTiming>
});
// plan.initial        -> RenderState rendering `from`
// plan.final          -> RenderState rendering `to`
// plan.steps          -> ordered { delayMs, state } snapshots to apply
// plan.noOp           -> true when from === to
```

### `TextMorphController`

Drives a plan over time. The only stateful piece:

```ts
import { TextMorphController } from '@dev-jelly/tinytipy';

const c = new TextMorphController({
  from: '3초 정도',
  to: '300ms 정도',
  autoPlay: true,
  onDone: () => console.log('settled'),
});

const unsubscribe = c.subscribe((state: RenderState) => {
  // re-render from `state`
});

c.play();    // (re)start from `from`
c.pause();   // hold current state
c.reset();   // back to `from`
c.finish();  // jump to `to` (idempotent per attempt)
c.setPair(newFrom, newTo);   // recompute for new text
c.setTiming({ typePerFrameMs: 30 });
c.destroy(); // cancel timers + unsubscribe
```

`onDone` fires exactly once per play attempt. Reduced motion (`prefers-reduced-motion: reduce`) is auto-detected and short-circuits to the final state; only an in-flight animation is interrupted.

### Rendering helpers

```ts
import { getRenderTokens, getReserveTexts } from '@dev-jelly/tinytipy';

getRenderTokens(state);
// ordered RenderToken[] — { type: 'run', id, kind, text, status } and { type: 'cursor' }
// (cursor follows the active run, then sits after all runs when done — render in order)

getReserveTexts('both', from, to); // hidden reserve text(s) to prevent reflow
```

### `RenderState`

```ts
interface RenderState {
  runs: ReadonlyArray<{
    id: string;
    kind: 'keep' | 'remove' | 'add';
    text: string;          // currently visible text
    finalText: string;     // target text
    status: 'pending' | 'done';
  }>;
  cursorRunId: string | null;  // active run id, or null when idle/done
  cursorOffset: number;        // always === active run's text length (trailing cursor)
  done: boolean;
}
```

## Styles

Import once in your app entry (any adapter):

```ts
import '@dev-jelly/tinytipy/styles.css';
```

Provides `.tm-root` (inline-grid), `.tm-reserve` (hidden sizer), `.tm-layer`, `.tm-run`, `.tm-cursor` (blinking, `currentColor`), and `.tm-sr-only`. The cursor follows the active edit and remains at the resolved text's end. Color inherits from surrounding text; no colors or underlines.

## License

MIT
