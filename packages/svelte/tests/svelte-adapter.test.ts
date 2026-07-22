import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  createTextMorph,
  morphAction,
  type TextMorphOptions,
} from '../src/index';
import type { RenderState } from '@dev-jelly/tinytipy';

/** Concatenate the visible run text inside the action's layer. */
function visibleRuns(node: HTMLElement): string {
  const layer = node.querySelector('.tm-layer');
  if (!layer) return '';
  return Array.from(layer.querySelectorAll('.tm-run'))
    .map((r) => r.textContent || '')
    .join('');
}

/** Concatenate run text directly from a snapshot (independent of DOM). */
function visible(state: RenderState): string {
  return state.runs.map((r) => r.text).join('');
}

describe('createTextMorph (store + controls)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('seeds the store with the `from` snapshot and exposes controls', () => {
    const handle = createTextMorph({ from: 'abc', to: 'xyz' });
    expect(visible(get(handle.state))).toBe('abc');
    expect(typeof handle.play).toBe('function');
    expect(typeof handle.pause).toBe('function');
    expect(typeof handle.reset).toBe('function');
    expect(typeof handle.finish).toBe('function');
    handle.destroy();
  });

  it('auto-plays to `to` as time advances (store updates live)', () => {
    const onDone = vi.fn();
    const handle = createTextMorph({
      from: 'ab',
      to: 'cd',
      timing: { settleMs: 0 },
      onDone,
    });
    expect(visible(get(handle.state))).toBe('ab');
    vi.runAllTimers();
    expect(visible(get(handle.state))).toBe('cd');
    expect(get(handle.state).done).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('honours autoPlay: false (no progress without play())', () => {
    const handle = createTextMorph({
      from: 'ab',
      to: 'cd',
      autoPlay: false,
      timing: { settleMs: 0 },
    });
    vi.runAllTimers();
    expect(visible(get(handle.state))).toBe('ab');
    handle.play();
    vi.runAllTimers();
    expect(visible(get(handle.state))).toBe('cd');
    handle.destroy();
  });

  it('setPair recomputes for a new pair without dropping onDone', () => {
    const onDone = vi.fn();
    const handle = createTextMorph({ from: 'a', to: 'b', timing: { settleMs: 0 }, onDone });
    vi.runAllTimers();
    expect(onDone).toHaveBeenCalledTimes(1);
    // setPair without re-passing onDone must NOT clear the callback.
    handle.setPair('Hello', 'Help');
    expect(visible(get(handle.state))).toBe('Hello');
    handle.play();
    vi.runAllTimers();
    expect(visible(get(handle.state))).toBe('Help');
    expect(onDone).toHaveBeenCalledTimes(2);
    handle.destroy();
  });

  it('emit a cursor-bearing snapshot mid-animation (cursor renders as a node)', () => {
    const handle = createTextMorph({
      from: 'a',
      to: 'b',
      timing: { settleMs: 0 },
    });
    const seen: RenderState[] = [];
    const unsub = handle.state.subscribe((s) => seen.push(s));
    vi.runAllTimers();
    const cursorSeen = seen.some((s) => s.cursorRunId !== null && !s.done);
    expect(cursorSeen).toBe(true);
    // initial and final must both be cursor-free.
    expect(seen[0].cursorRunId).toBeNull();
    expect(seen[seen.length - 1].cursorRunId).toBeNull();
    unsub();
    handle.destroy();
  });

  it('destroy stops updates (store value frozen) and does not throw', () => {
    const handle = createTextMorph({ from: 'a', to: 'b', timing: { settleMs: 0 } });
    expect(() => handle.destroy()).not.toThrow();
    const before = visible(get(handle.state));
    // Advancing timers after destroy must not mutate the store.
    vi.runAllTimers();
    expect(visible(get(handle.state))).toBe(before);
  });
});

describe('morphAction (use:morph)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders `from` initially with the canonical structure', () => {
    const host = document.createElement('span');
    const handle = morphAction(host, { from: 'abc', to: 'xyz' });

    expect(host.classList.contains('tm-root')).toBe(true);
    expect(visibleRuns(host)).toBe('abc');

    const reserve = host.querySelector('.tm-reserve');
    expect(reserve).not.toBeNull();
    expect(reserve?.getAttribute('aria-hidden')).toBe('true');

    const layer = host.querySelector('.tm-layer');
    expect(layer?.getAttribute('aria-hidden')).toBe('true');

    // Screen-reader copy always holds the FINAL `to` text.
    expect(host.querySelector('.tm-sr-only')?.textContent).toBe('xyz');

    handle.destroy();
  });

  it('defaults to overlay and updates to the legacy inline cursor layout', () => {
    const host = document.createElement('span');
    const handle = morphAction(host, { from: 'a', to: 'b', instant: true });
    expect(host.getAttribute('data-cursor-layout')).toBe('overlay');
    expect(host.querySelector('.tm-cursor')?.getAttribute('aria-hidden')).toBe('true');

    handle.update({ from: 'a', to: 'b', instant: true, cursorLayout: 'inline' });
    expect(host.getAttribute('data-cursor-layout')).toBe('inline');

    handle.destroy();
    expect(host.hasAttribute('data-cursor-layout')).toBe(false);
  });

  it('animates to `to` as time advances', () => {
    const host = document.createElement('span');
    const handle = morphAction(host, {
      from: 'ab',
      to: 'cd',
      timing: { settleMs: 0 },
    });
    expect(visibleRuns(host)).toBe('ab');
    vi.runAllTimers();
    expect(visibleRuns(host)).toBe('cd');
    handle.destroy();
  });

  it('renders a trailing cursor node and keeps it at the end when done', () => {
    const host = document.createElement('span');
    const handle = morphAction(host, { from: 'a', to: 'b' });
    // Default initialDelayMs is 240ms; advancing past it lands on the first
    // editing step (cursor anchored on the active run).
    vi.advanceTimersByTime(260);
    expect(host.querySelector('.tm-layer .tm-cursor')).not.toBeNull();

    vi.runAllTimers();
    const cursor = host.querySelector('.tm-layer .tm-cursor');
    expect(cursor).not.toBeNull();
    expect(host.querySelector('.tm-layer')?.lastElementChild).toBe(cursor);
    handle.destroy();
  });

  it('emits run nodes with kind class + data-status', () => {
    const host = document.createElement('span');
    const handle = morphAction(host, { from: 'a', to: 'b' });
    vi.advanceTimersByTime(260); // mid-edit: remove run present
    const runs = host.querySelectorAll('.tm-layer .tm-run');
    expect(runs.length).toBeGreaterThan(0);
    for (const run of Array.from(runs)) {
      expect(run.classList.contains('tm-run')).toBe(true);
      const status = run.getAttribute('data-status');
      expect(status === 'pending' || status === 'done').toBe(true);
    }
    handle.destroy();
  });

  it('renders the reserve layer with both texts by default', () => {
    const host = document.createElement('span');
    const handle = morphAction(host, { from: 'hi', to: 'hello' });
    const reserve = host.querySelector('.tm-reserve');
    expect(reserve).not.toBeNull();
    const texts = Array.from(reserve!.querySelectorAll('span')).map(
      (s) => s.textContent || '',
    );
    expect(texts).toEqual(['hi', 'hello']);
    handle.destroy();
  });

  it('respects reserveLayout: "none" leaves the reserve empty', () => {
    const host = document.createElement('span');
    const handle = morphAction(host, {
      from: 'hi',
      to: 'hello',
      reserveLayout: 'none',
    });
    const reserve = host.querySelector('.tm-reserve');
    expect(reserve?.querySelectorAll('span').length).toBe(0);
    handle.destroy();
  });

  it('update() with a new from/to calls setPair and replays', () => {
    const host = document.createElement('span');
    const handle = morphAction(host, {
      from: 'a',
      to: 'b',
      timing: { settleMs: 0 },
    });
    vi.runAllTimers();
    expect(visibleRuns(host)).toBe('b');

    handle.update({ from: 'Hello', to: 'Help', timing: { settleMs: 0 } });
    expect(visibleRuns(host)).toBe('Hello'); // setPair resets to `from`
    vi.runAllTimers();
    expect(visibleRuns(host)).toBe('Help');
    handle.destroy();
  });

  it('appends a user-supplied class while keeping tm-root', () => {
    const host = document.createElement('span');
    const handle = morphAction(host, {
      from: 'a',
      to: 'b',
      class: 'big flashy',
    });
    expect(host.classList.contains('tm-root')).toBe(true);
    expect(host.classList.contains('big')).toBe(true);
    expect(host.classList.contains('flashy')).toBe(true);

    handle.update({ from: 'a', to: 'b', class: 'tiny' });
    expect(host.classList.contains('big')).toBe(false);
    expect(host.classList.contains('flashy')).toBe(false);
    expect(host.classList.contains('tiny')).toBe(true);
    expect(host.classList.contains('tm-root')).toBe(true);
    handle.destroy();
  });

  it('cleanup destroys the controller and does not throw afterwards', () => {
    const host = document.createElement('span');
    const handle = morphAction(host, { from: 'a', to: 'b' });
    expect(() => handle.destroy()).not.toThrow();
    // Post-destroy operations must not throw and must leave the DOM cleaned up.
    expect(host.querySelector('.tm-layer')).toBeNull();
    expect(host.querySelector('.tm-reserve')).toBeNull();
    expect(() => handle.update({ from: 'c', to: 'd' })).not.toThrow();
    // Advancing timers after destroy must not fire anything.
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
