// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextMorphController } from '../src/controller';

/**
 * matchMedia is not implemented in jsdom, so we install a tiny controllable
 * stub. These tests verify the reduced-motion *listener* contract: it must only
 * short-circuit an animation that is actually in flight, and must be a no-op
 * while idle or after completion (no spurious onDone, no state jump).
 */
function installMatchMedia() {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const mql = {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null as ((e: { matches: boolean }) => void) | null,
    addEventListener: (_type: string, listener: (e: { matches: boolean }) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (e: { matches: boolean }) => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: (e: { matches: boolean }) => void) => listeners.add(listener),
    removeListener: (listener: (e: { matches: boolean }) => void) => listeners.delete(listener),
    dispatchEvent: () => false,
  };
  vi.stubGlobal('matchMedia', () => mql);
  return {
    toggle(matches: boolean) {
      mql.matches = matches;
      for (const listener of listeners) listener({ matches });
    },
  };
}

function visible(state: { runs: ReadonlyArray<{ text: string }> }): string {
  return state.runs.map((r) => r.text).join('');
}

describe('TextMorphController reduced-motion listener', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installMatchMedia();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does NOT fire onDone or change state when toggled while idle', () => {
    const onDone = vi.fn();
    const media = installMatchMedia();
    const c = new TextMorphController({ from: 'abc', to: 'xyz', onDone });
    // No play() called.
    expect(visible(c.snapshot)).toBe('abc');
    media.toggle(true);
    expect(visible(c.snapshot)).toBe('abc');
    expect(onDone).not.toHaveBeenCalled();
    c.destroy();
  });

  it('finishes the in-flight animation when reduced motion turns on', () => {
    const onDone = vi.fn();
    const media = installMatchMedia();
    const c = new TextMorphController({ from: 'abc', to: 'xyzdef', onDone });
    c.play();
    expect(c.isPlaying).toBe(true);
    media.toggle(true);
    expect(c.isPlaying).toBe(false);
    expect(c.snapshot.done).toBe(true);
    expect(visible(c.snapshot)).toBe('xyzdef');
    expect(onDone).toHaveBeenCalledTimes(1);
    c.destroy();
  });

  it('does not double-fire onDone if motion turns on after natural completion', () => {
    const onDone = vi.fn();
    const media = installMatchMedia();
    const c = new TextMorphController({
      from: 'abc',
      to: 'xyzdef',
      timing: { settleMs: 0 },
      onDone,
    });
    c.play();
    vi.runAllTimers();
    expect(onDone).toHaveBeenCalledTimes(1);
    // Later, the user enables reduced motion.
    media.toggle(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    c.destroy();
  });
});
