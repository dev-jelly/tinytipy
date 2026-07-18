/**
 * @dev-jelly/tinytipy-vue — Vue 3 adapter for tinytipy.
 *
 * Diff-driven text morphing with a typing cursor, built on the
 * framework-agnostic `@dev-jelly/tinytipy`. Ships a `<TextMorph>` component (render
 * functions, no SFCs) and a `useTextMorph()` composable for full-markup control.
 *
 * Import the stylesheet once (it is NOT bundled here):
 *
 * ```ts
 * import '@dev-jelly/tinytipy/styles.css'
 * ```
 */

export { TextMorph } from './component';
export type { TextMorphProps, TextMorphExposed } from './component';

export { useTextMorph } from './composable';
export type { UseTextMorphOptions, UseTextMorphReturn } from './composable';

// Re-export the bits of core that adapter consumers reach for directly.
export {
  TextMorphController,
  defaultTiming,
  prefersReducedMotion,
  getRenderTokens,
  getReserveTexts,
} from '@dev-jelly/tinytipy';
export type {
  MorphTiming,
  RenderState,
  RenderToken,
  ReserveLayout,
  RunState,
} from '@dev-jelly/tinytipy';
