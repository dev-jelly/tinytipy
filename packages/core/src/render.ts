import type { RenderState, RunKind, RunStatus } from './types';

/**
 * Pure rendering helpers shared by every framework adapter. They turn a
 * {@link RenderState} into a flat, framework-neutral description that an
 * adapter maps to its own vnode/element model. Keeping this logic in core
 * guarantees the cursor-placement and reservation rules are identical across
 * React, Vue, Svelte, Solid, and the DOM adapter.
 */

/** A single piece of the rendered morph output. */
export type RenderToken =
  | { readonly type: 'run'; readonly id: string; readonly kind: RunKind; readonly text: string; readonly status: RunStatus }
  | { readonly type: 'cursor' };

/**
 * Flatten a snapshot into an ordered list of {@link RenderToken}s. While an
 * edit is active, the cursor follows that run. Once the morph is done, a cursor
 * is appended after every run so the resolved text keeps a live caret.
 *
 * Core guarantees the cursor's offset is always at the tail of the active run's
 * text, so a trailing cursor (appended after the run) is always correct — there
 * is never a need to split a run.
 */
export function getRenderTokens(state: RenderState): RenderToken[] {
  const tokens: RenderToken[] = [];
  for (const run of state.runs) {
    tokens.push({
      type: 'run',
      id: run.id,
      kind: run.kind,
      text: run.text,
      status: run.status,
    });
    if (!state.done && state.cursorRunId !== null && run.id === state.cursorRunId) {
      tokens.push({ type: 'cursor' });
    }
  }
  if (state.done) {
    tokens.push({ type: 'cursor' });
  }
  return tokens;
}

/** How much of the from/to text to reserve so the box does not reflow. */
export type ReserveLayout = 'both' | 'to' | 'from' | 'none';

/** The hidden reserve text(s) to render for a given reservation strategy. */
export function getReserveTexts(
  layout: ReserveLayout,
  from: string,
  to: string,
): readonly string[] {
  switch (layout) {
    case 'both':
      return [from, to];
    case 'to':
      return [to];
    case 'from':
      return [from];
    case 'none':
      return [];
  }
}
