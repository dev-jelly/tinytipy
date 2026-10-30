import { describe, expect, it } from 'vitest';
import { easeDelays, easingFunction, isLinearEasing, resolveEasing } from '../src/easing';
import { planMorph } from '../src/plan';

function visible(state: { runs: ReadonlyArray<{ text: string }> }): string {
  return state.runs.map((r) => r.text).join('');
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

describe('resolveEasing', () => {
  it('keeps CSS keywords and cubic-bezier tuples', () => {
    expect(resolveEasing('ease-in-out')).toBe('ease-in-out');
    expect(resolveEasing([0.4, 0, 0.2, 1])).toEqual([0.4, 0, 0.2, 1]);
  });

  it('falls back to linear for invalid values', () => {
    expect(resolveEasing(undefined)).toBe('linear');
    expect(resolveEasing('bounce')).toBe('linear');
    expect(resolveEasing([0.4, 0, 1.2, 1])).toBe('linear'); // x2 out of [0,1]
    expect(resolveEasing([0, 0, 1])).toBe('linear');
  });

  it('treats linear and [0,0,1,1] as linear', () => {
    expect(isLinearEasing('linear')).toBe(true);
    expect(isLinearEasing([0, 0, 1, 1])).toBe(true);
    expect(isLinearEasing('ease')).toBe(false);
  });
});

describe('easingFunction', () => {
  it('is the identity for linear', () => {
    const ease = easingFunction('linear');
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(1)).toBe(1);
  });

  it('starts slow for ease-in and fast for ease-out', () => {
    expect(easingFunction('ease-in')(0.5)).toBeLessThan(0.5);
    expect(easingFunction('ease-out')(0.5)).toBeGreaterThan(0.5);
  });

  it('is symmetric around the midpoint for ease-in-out', () => {
    const ease = easingFunction('ease-in-out');
    expect(ease(0.5)).toBeCloseTo(0.5, 3);
    expect(ease(0.25)).toBeLessThan(0.25);
    expect(ease(0.75)).toBeGreaterThan(0.75);
  });
});

describe('easeDelays', () => {
  it('is a no-op for linear', () => {
    expect(easeDelays([10, 20, 30], 'linear')).toEqual([10, 20, 30]);
  });

  it('preserves total duration', () => {
    const delays = [240, 55, 55, 55, 42, 42, 42, 180];
    for (const easing of ['ease', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      expect(sum(easeDelays(delays, easing))).toBe(sum(delays));
    }
  });

  it('front-loads time for ease-in and back-loads for ease-out', () => {
    const delays = Array.from({ length: 20 }, () => 10);
    const easeIn = easeDelays(delays, 'ease-in');
    const easeOut = easeDelays(delays, 'ease-out');
    expect(sum(easeIn.slice(0, 5))).toBeGreaterThan(sum(easeIn.slice(-5)));
    expect(sum(easeOut.slice(0, 5))).toBeLessThan(sum(easeOut.slice(-5)));
  });
});

describe('planMorph easing', () => {
  const pair = { from: 'abcdefghij', to: 'klmnopqrst' };

  it('does not change delays when easing is linear / omitted', () => {
    const base = planMorph(pair);
    const explicit = planMorph({ ...pair, timing: { easing: 'linear' } });
    expect(explicit.steps.map((s) => s.delayMs)).toEqual(base.steps.map((s) => s.delayMs));
  });

  it('keeps snapshots identical and total duration the same', () => {
    const linear = planMorph(pair);
    const eased = planMorph({ ...pair, timing: { easing: 'ease-in-out' } });
    expect(eased.steps.map((s) => visible(s.state))).toEqual(linear.steps.map((s) => visible(s.state)));
    expect(sum(eased.steps.map((s) => s.delayMs))).toBe(sum(linear.steps.map((s) => s.delayMs)));
    expect(eased.steps.map((s) => s.delayMs)).not.toEqual(linear.steps.map((s) => s.delayMs));
  });

  it('accepts a cubic-bezier 4-tuple', () => {
    const linear = planMorph(pair);
    const eased = planMorph({ ...pair, timing: { easing: [0.4, 0, 0.2, 1] } });
    expect(sum(eased.steps.map((s) => s.delayMs))).toBe(sum(linear.steps.map((s) => s.delayMs)));
    expect(eased.steps.map((s) => s.delayMs)).not.toEqual(linear.steps.map((s) => s.delayMs));
  });
});
