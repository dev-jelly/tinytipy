import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextMorphController } from '../src/controller';
import { planMorph } from '../src/plan';

function visible(state: { runs: ReadonlyArray<{ text: string }> }): string {
  return state.runs.map((r) => r.text).join('');
}

describe('TextMorphController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes the `from` snapshot before play', () => {
    const c = new TextMorphController({ from: '기운', to: '기온' });
    expect(visible(c.snapshot)).toBe('기운');
    c.destroy();
  });

  it('jumps to `to` when instant is set', () => {
    const c = new TextMorphController({ from: 'abc', to: 'abcdef', instant: true });
    expect(visible(c.snapshot)).toBe('abcdef');
    c.destroy();
  });

  it('jumps to `to` when reduced motion is forced', () => {
    const c = new TextMorphController({ from: 'abc', to: 'abcdef', prefersReducedMotion: true });
    expect(visible(c.snapshot)).toBe('abcdef');
    c.destroy();
  });

  it('animates through to the final state when time advances', () => {
    const onDone = vi.fn();
    const c = new TextMorphController({ from: 'ab', to: 'cd', timing: { settleMs: 0 }, onDone });
    c.play();
    expect(visible(c.snapshot)).toBe('ab');
    // Advance past every scheduled step.
    vi.runAllTimers();
    expect(visible(c.snapshot)).toBe('cd');
    expect(c.snapshot.done).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    c.destroy();
  });

  it('notifies subscribers on every change', () => {
    const c = new TextMorphController({ from: 'a', to: 'b', timing: { settleMs: 0 } });
    const seen: string[] = [];
    c.subscribe((s) => seen.push(visible(s)));
    c.play();
    vi.runAllTimers();
    expect(seen[0]).toBe('a'); // initial immediate callback
    expect(seen[seen.length - 1]).toBe('b');
    c.destroy();
  });

  it('pause holds the current state and clears pending timers', () => {
    const c = new TextMorphController({ from: 'abcdef', to: 'xyz' });
    c.play();
    vi.advanceTimersByTime(500);
    const held = visible(c.snapshot);
    c.pause();
    vi.advanceTimersByTime(10_000);
    expect(visible(c.snapshot)).toBe(held);
    expect(c.isPlaying).toBe(false);
    c.destroy();
  });

  it('finish jumps directly to `to`', () => {
    const c = new TextMorphController({ from: 'abcdef', to: 'xyz' });
    c.finish();
    expect(visible(c.snapshot)).toBe('xyz');
    expect(c.snapshot.done).toBe(true);
    c.destroy();
  });

  it('reset returns to `from`', () => {
    const c = new TextMorphController({ from: 'abcdef', to: 'xyz' });
    c.play();
    vi.runAllTimers();
    c.reset();
    expect(visible(c.snapshot)).toBe('abcdef');
    c.destroy();
  });

  it('setPair recomputes the plan for a new text pair', () => {
    const c = new TextMorphController({ from: 'a', to: 'b' });
    c.play();
    vi.runAllTimers();
    expect(visible(c.snapshot)).toBe('b');
    c.setPair('Hello', 'Help');
    expect(visible(c.snapshot)).toBe('Hello');
    c.play();
    vi.runAllTimers();
    expect(visible(c.snapshot)).toBe('Help');
    c.destroy();
  });

  it('reaches the same final state as the pure planner', () => {
    const from = '현재 평균 응답 시간은 3초 정도이고, 최적화 이후 처리 속도가 기존보다 2% 정도 빨라졌습니다.';
    const to = '현재 평균 응답 시간은 300ms 정도이고, 최적화 이후 처리 속도가 기존보다 20% 정도 빨라졌습니다.';
    const plan = planMorph({ from, to });
    const c = new TextMorphController({ from, to });
    c.play();
    vi.runAllTimers();
    expect(visible(c.snapshot)).toBe(visible(plan.final));
    expect(visible(c.snapshot)).toBe(to);
    c.destroy();
  });

  it('finish() is idempotent: onDone fires once even if called repeatedly', () => {
    const onDone = vi.fn();
    const c = new TextMorphController({ from: 'abc', to: 'xyz', onDone });
    c.finish();
    c.finish();
    c.finish();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(c.snapshot.done).toBe(true);
    c.destroy();
  });

  it('re-arming: onDone fires again on a fresh play() after reset', () => {
    const onDone = vi.fn();
    const c = new TextMorphController({ from: 'a', to: 'b', timing: { settleMs: 0 }, onDone });
    c.play();
    vi.runAllTimers();
    expect(onDone).toHaveBeenCalledTimes(1);
    c.reset();
    c.play();
    vi.runAllTimers();
    expect(onDone).toHaveBeenCalledTimes(2);
    c.destroy();
  });
});
