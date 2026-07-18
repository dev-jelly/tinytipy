/**
 * @dev-jelly/tinytipy — public type surface.
 *
 * The core turns a pair of strings (from -> to) into a pure {@link MorphPlan}
 * (a list of timed {@link RenderState} snapshots). A {@link TextMorphController}
 * then schedules those snapshots. Framework adapters wrap the controller.
 */

/** A diff segment produced by {@link diffText}. */
export type SegmentType = 'equal' | 'delete' | 'insert';

export interface Segment {
  readonly type: SegmentType;
  /** The grapheme text belonging to this segment. */
  readonly text: string;
}

/** Lifecycle of a single render run. */
export type RunStatus = 'pending' | 'done';

/** What a run represents in the from->to transition. */
export type RunKind = 'keep' | 'remove' | 'add';

/** A single, addressable piece of the morphing text at a point in time. */
export interface RunState {
  /** Stable id across all snapshots of a plan (e.g. "r3"). */
  readonly id: string;
  readonly kind: RunKind;
  /** Target text for this run (keep: shared text, remove: from text, add: to text). */
  readonly finalText: string;
  /** Currently visible text. */
  readonly text: string;
  readonly status: RunStatus;
}

/** A complete, renderable snapshot of the morph at one instant. */
export interface RenderState {
  /** Ordered run snapshots to render. */
  readonly runs: readonly RunState[];
  /** id of the run the cursor currently anchors to, or null when idle. */
  readonly cursorRunId: string | null;
  /** Character offset within the cursor run's `text` where the cursor sits. */
  readonly cursorOffset: number;
  /** True once the morph has fully resolved to `to`. */
  readonly done: boolean;
}

/** One scheduled step: wait `delayMs` after the previous step, then show `state`. */
export interface MorphStep {
  readonly delayMs: number;
  readonly state: RenderState;
}

/** A fully described animation, free of any timing side effects. */
export interface MorphPlan {
  /** Snapshot shown at t=0 (renders `from`). */
  readonly initial: RenderState;
  /** Snapshot shown when finished (renders `to`). */
  readonly final: RenderState;
  /** Steps to apply in order; cumulative timing via `delayMs`. */
  readonly steps: readonly MorphStep[];
  /** True when `from` equals `to` (nothing to animate). */
  readonly noOp: boolean;
}

/** Tunable animation timing. All fields optional when passed by users. */
export interface MorphTiming {
  /** Delay before the very first edit begins. */
  initialDelayMs: number;
  /** Delay used to "mark" a hunk before erasing it, or before a pure insertion. */
  hunkDelayMs: number;
  /** Per-character delay while erasing a removed run. */
  erasePerCharMs: number;
  /** Pause between erasing a removed run and typing its paired inserted run. */
  pauseBeforeTypingMs: number;
  /** Per composition-frame delay while typing an inserted run. */
  typePerFrameMs: number;
  /** Final settle delay before resolving to `done`. */
  settleMs: number;
}

/** Cursor anchor descriptor (used internally by planners and adapters). */
export interface CursorAnchor {
  readonly id: string;
  readonly offset: number;
}

/** Options accepted by {@link planMorph} and {@link TextMorphController}. */
export interface MorphOptions {
  from: string;
  to: string;
  timing?: Partial<MorphTiming>;
  /**
   * Force reduced-motion behaviour (skip straight to `final`).
   * When omitted, the controller auto-detects via `matchMedia`.
   */
  prefersReducedMotion?: boolean;
  /** Skip the animation entirely and jump to `final`. */
  instant?: boolean;
}
