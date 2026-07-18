import type { MorphTiming } from './types';

/**
 * Default timing. Mirrors the cadence of a real-time transcription + AI
 * correction effect: a short initial delay, a brief "mark" before each hunk,
 * per-character erase, a pause before typing, per-frame typing, and a settle.
 */
export const defaultTiming: MorphTiming = {
  initialDelayMs: 240,
  hunkDelayMs: 190,
  erasePerCharMs: 55,
  pauseBeforeTypingMs: 60,
  typePerFrameMs: 42,
  settleMs: 180,
};

/** Merge a partial timing override onto the defaults. */
export function resolveTiming(override?: Partial<MorphTiming>): MorphTiming {
  return { ...defaultTiming, ...override };
}

/** Clamp a timing value to a non-negative finite number. */
export function clampMs(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}
