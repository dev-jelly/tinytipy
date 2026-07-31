/**
 * @dev-jelly/tinytipy
 *
 * Diff-driven text morphing primitives. Framework-agnostic and dependency-free.
 *
 *   planMorph({ from, to })            // pure value describing the animation
 *   new TextMorphController(opts)      // schedules the plan over time
 *   diffText(from, to)                 // grapheme-level LCS diff
 *   buildCompositionFrames(text)       // Korean IME typing frames
 */

export { diffText } from './diff';
export { buildCompositionFrames, compositionFrameCount } from './composition';
export { planMorph } from './plan';
export { TextMorphController } from './controller';
export type { ControllerOptions } from './controller';
export { prefersReducedMotion, onReducedMotionChange } from './reduced-motion';
export { defaultTiming, resolveTiming, clampMs } from './timing';
export { graphemes, graphemeLength } from './graphemes';
export { getRenderTokens, getReserveTexts } from './render';
export type { CursorLayout, RenderToken, ReserveLayout } from './render';

export type {
  CursorAnchor,
  MorphOptions,
  MorphPlan,
  MorphStep,
  MorphTiming,
  RenderState,
  RunKind,
  RunState,
  RunStatus,
  Segment,
  SegmentType,
} from './types';

export const VERSION = '0.1.2';
