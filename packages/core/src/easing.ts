import type { MorphCubicBezier, MorphEaseName, MorphEasing } from './types';

/** CSS `transition-timing-function` keywords we accept by name. */
export const EASE_NAMES = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'] as const;

const NAMED_BEZIERS: Record<Exclude<MorphEaseName, 'linear'>, MorphCubicBezier> = {
  // CSS cubic-bezier keywords (https://www.w3.org/TR/css-easing-1/).
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

const NAME_SET: ReadonlySet<string> = new Set(EASE_NAMES);

function isCubicBezier(value: unknown): value is MorphCubicBezier {
  if (!Array.isArray(value) || value.length !== 4) return false;
  const [x1, y1, x2, y2] = value;
  return (
    typeof x1 === 'number' &&
    typeof y1 === 'number' &&
    typeof x2 === 'number' &&
    typeof y2 === 'number' &&
    Number.isFinite(x1) &&
    Number.isFinite(y1) &&
    Number.isFinite(x2) &&
    Number.isFinite(y2) &&
    x1 >= 0 &&
    x1 <= 1 &&
    x2 >= 0 &&
    x2 <= 1
  );
}

/** Coerce a user-supplied easing to a known keyword or cubic-bezier. Invalid values become `linear`. */
export function resolveEasing(value: unknown): MorphEasing {
  if (typeof value === 'string' && NAME_SET.has(value)) return value as MorphEaseName;
  if (isCubicBezier(value)) return [value[0], value[1], value[2], value[3]];
  return 'linear';
}

export function isLinearEasing(easing: MorphEasing): boolean {
  if (easing === 'linear') return true;
  if (Array.isArray(easing)) {
    return easing[0] === 0 && easing[1] === 0 && easing[2] === 1 && easing[3] === 1;
  }
  return false;
}

function bezierFor(easing: MorphEasing): MorphCubicBezier | null {
  if (easing === 'linear' || isLinearEasing(easing)) return null;
  if (typeof easing === 'string') return NAMED_BEZIERS[easing];
  return easing;
}

/**
 * CSS cubic-bezier: map time in [0, 1] to eased progress in (approximately) [0, 1].
 * Control points are P1=(x1,y1), P2=(x2,y2) with P0=(0,0) and P3=(1,1).
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (time: number) => number {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;

  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const sampleXd = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const slope = sampleXd(t);
      if (Math.abs(slope) < 1e-3) break;
      t -= (sampleX(t) - x) / slope;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    let lo = 0;
    let hi = 1;
    t = Math.min(1, Math.max(0, t));
    for (let i = 0; i < 20; i++) {
      const current = sampleX(t);
      if (Math.abs(current - x) < 1e-6) return t;
      if (current < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (time: number): number => {
    if (time <= 0) return 0;
    if (time >= 1) return 1;
    return sampleY(solveT(time));
  };
}

/** Time → progress. Linear is the identity. */
export function easingFunction(easing: MorphEasing): (time: number) => number {
  const bezier = bezierFor(resolveEasing(easing));
  if (!bezier) return (time) => (time <= 0 ? 0 : time >= 1 ? 1 : time);
  return cubicBezier(bezier[0], bezier[1], bezier[2], bezier[3]);
}

/** Progress → time, the inverse of {@link easingFunction}. */
function invertEasing(ease: (time: number) => number, progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let lo = 0;
  let hi = 1;
  let t = progress;
  for (let i = 0; i < 24; i++) {
    const current = ease(t);
    if (Math.abs(current - progress) < 1e-6) return t;
    if (current < progress) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

/**
 * Redistribute `delays` over the same total duration so that linear work
 * progress follows `easing` (CSS time→value). `ease-in` spends more time on
 * the first steps; `ease-out` on the last; `ease-in-out` on both ends.
 *
 * Original relative weights are preserved: a 240ms lead-in still occupies a
 * larger share of the timeline than a 42ms type frame, just warped by the curve.
 */
export function easeDelays(delays: readonly number[], easing: MorphEasing): number[] {
  const n = delays.length;
  if (n === 0) return [];
  const resolved = resolveEasing(easing);
  if (isLinearEasing(resolved)) return delays.map((d) => d);

  const total = delays.reduce((sum, d) => sum + d, 0);
  if (total <= 0) return delays.map((d) => d);

  const ease = easingFunction(resolved);
  const out: number[] = new Array(n);
  let prevTime = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += delays[i];
    const t = invertEasing(ease, acc / total) * total;
    out[i] = t - prevTime;
    prevTime = t;
  }

  const rounded = out.map((d) => Math.max(0, Math.round(d)));
  let drift = Math.round(total) - rounded.reduce((sum, d) => sum + d, 0);
  if (drift !== 0) {
    let idx = n - 1;
    if (rounded[idx] + drift < 0) {
      let max = -1;
      for (let i = 0; i < n; i++) {
        if (rounded[i] > max) {
          max = rounded[i];
          idx = i;
        }
      }
    }
    rounded[idx] = Math.max(0, rounded[idx] + drift);
  }
  return rounded;
}
