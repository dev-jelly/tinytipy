/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import { createRoot, createSignal } from 'solid-js';
import {
  TextMorphController,
  type RenderState,
} from '@dev-jelly/tinytipy';
import {
  TextMorph,
  createTextMorph,
  type CreateTextMorphReturn,
} from '../src';

/** Fast timing so animations resolve quickly under fake timers. */
const fastTiming = {
  initialDelayMs: 0,
  hunkDelayMs: 0,
  erasePerCharMs: 1,
  pauseBeforeTypingMs: 0,
  typePerFrameMs: 1,
  settleMs: 0,
} as const;

const visibleText = (el: ParentNode | null | undefined, selector: string): string =>
  (el?.querySelector(selector)?.textContent ?? '').replace(/\s+/g, '');

describe('TextMorph component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the `from` text initially (autoPlay = false)', () => {
    const { container } = render(() => (
      <TextMorph from="abc" to="xyz" autoPlay={false} />
    ));
    expect(visibleText(container, '.tm-layer')).toBe('abc');
  });

  it('defaults to overlay cursor layout', () => {
    const { container } = render(() => <TextMorph from="a" to="b" instant />);
    expect(container.querySelector('.tm-root')?.getAttribute('data-cursor-layout')).toBe(
      'overlay',
    );
    expect(container.querySelector('.tm-cursor')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('supports the legacy inline cursor layout', () => {
    const { container } = render(() => (
      <TextMorph from="a" to="b" instant cursorLayout="inline" />
    ));
    expect(container.querySelector('.tm-root')?.getAttribute('data-cursor-layout')).toBe(
      'inline',
    );
    expect(container.querySelector('.tm-cursor')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the canonical tm-root structure (reserve + layer + sr-only)', () => {
    const { container } = render(() => (
      <TextMorph from="abc" to="wxyz" autoPlay={false} />
    ));
    expect(container.querySelector('.tm-root')).not.toBeNull();
    const reserve = container.querySelector('.tm-reserve');
    expect(reserve?.getAttribute('aria-hidden')).toBe('true');
    const layer = container.querySelector('.tm-layer');
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    // Screen-reader copy always carries the final `to` text.
    expect(container.querySelector('.tm-sr-only')?.textContent).toBe('wxyz');
  });

  it('reserve layer holds both `from` and `to` by default', () => {
    const { container } = render(() => (
      <TextMorph from="abc" to="wxyz" autoPlay={false} />
    ));
    const reserveText = container.querySelector('.tm-reserve')?.textContent ?? '';
    expect(reserveText).toContain('abc');
    expect(reserveText).toContain('wxyz');
  });

  it('honours reserveLayout="to" (only `to` is reserved)', () => {
    const { container } = render(() => (
      <TextMorph from="abc" to="wxyz" reserveLayout="to" autoPlay={false} />
    ));
    const reserveText = container.querySelector('.tm-reserve')?.textContent ?? '';
    expect(reserveText).toContain('wxyz');
    expect(reserveText).not.toContain('abc');
  });

  it('honours reserveLayout="none" (reserve layer empty)', () => {
    const { container } = render(() => (
      <TextMorph from="abc" to="wxyz" reserveLayout="none" autoPlay={false} />
    ));
    const reserve = container.querySelector('.tm-reserve');
    expect(reserve?.textContent ?? '').toBe('');
  });

  it('animates from -> to when autoPlay and timers advance', async () => {
    const { container } = render(() => (
      <TextMorph from="abc" to="xyz" timing={fastTiming} />
    ));
    expect(visibleText(container, '.tm-layer')).toBe('abc');
    await vi.advanceTimersByTimeAsync(1000);
    expect(visibleText(container, '.tm-layer')).toBe('xyz');
    // Every run gets a .tm-run node.
    expect(container.querySelectorAll('.tm-run').length).toBeGreaterThan(0);
  });

  it('shows a cursor while editing, then keeps it at the end', async () => {
    const { container } = render(() => (
      <TextMorph
        from="abc"
        to="abd"
        timing={{ ...fastTiming, settleMs: 5000 }}
      />
    ));
    // The morph is in flight; the cursor must appear at some point.
    await vi.advanceTimersByTimeAsync(5);
    await vi.waitFor(() => {
      expect(container.querySelector('.tm-cursor')).not.toBeNull();
    });
    // Finishing the morph moves the rendered cursor after the resolved text.
    await vi.advanceTimersByTimeAsync(10_000);
    const cursor = container.querySelector('.tm-cursor');
    expect(cursor).not.toBeNull();
    expect(container.querySelector('.tm-layer')?.lastElementChild).toBe(cursor);
  });

  it('appends an extra class onto tm-root (keeping tm-root)', () => {
    const { container } = render(() => (
      <TextMorph from="a" to="b" class="my-extra" autoPlay={false} />
    ));
    const root = container.querySelector('.tm-root');
    expect(root?.classList.contains('tm-root')).toBe(true);
    expect(root?.classList.contains('my-extra')).toBe(true);
  });

  it('appends className as an alias of class', () => {
    const { container } = render(() => (
      <TextMorph from="a" to="b" className="viaClassName" autoPlay={false} />
    ));
    const root = container.querySelector('.tm-root');
    expect(root?.classList.contains('viaClassName')).toBe(true);
  });

  it('cleanup destroys the controller (no timer leak, no throw)', async () => {
    let controller: TextMorphController | null = null;
    const rendered = render(() => (
      <TextMorph
        from="abc"
        to="xyz"
        timing={fastTiming}
        controllerRef={(c) => {
          controller = c;
        }}
      />
    ));
    expect(controller).not.toBeNull();
    // Let a few timers schedule.
    await vi.advanceTimersByTimeAsync(2);
    const timersBefore = vi.getTimerCount();
    expect(timersBefore).toBeGreaterThan(0);

    rendered.unmount();

    // destroy() paused and cleared all timers — nothing pending globally.
    expect(vi.getTimerCount()).toBe(0);
    // Subsequent imperative calls on the destroyed controller must not throw.
    expect(() => controller!.play()).not.toThrow();
    expect(() => controller!.pause()).not.toThrow();
    expect(() => controller!.reset()).not.toThrow();
    expect(() => controller!.finish()).not.toThrow();
  });

  it('exposes onDone firing once when the morph resolves', async () => {
    const onDone = vi.fn();
    render(() => (
      <TextMorph from="abc" to="xyz" timing={fastTiming} onDone={onDone} />
    ));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('createTextMorph primitive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a state accessor and imperative controls', () => {
    const dispose = createRoot((dispose) => {
      const m = createTextMorph({ from: 'abc', to: 'xyz', autoPlay: false });
      expect(typeof m.state).toBe('function');
      expect(typeof m.play).toBe('function');
      expect(typeof m.pause).toBe('function');
      expect(typeof m.reset).toBe('function');
      expect(typeof m.finish).toBe('function');
      expect(m.controller).toBeInstanceOf(TextMorphController);
      const runs = m.state().runs;
      expect(runs.map((r) => r.text).join('')).toBe('abc');
      return dispose;
    });
    dispose();
  });

  it('updates the state accessor as the morph progresses', async () => {
    let m: CreateTextMorphReturn | undefined;
    const dispose = createRoot((d) => {
      m = createTextMorph({
        from: 'abc',
        to: 'xyz',
        timing: fastTiming,
      });
      return d;
    });
    try {
      expect(m!.state().runs.map((r) => r.text).join('')).toBe('abc');
      await vi.advanceTimersByTimeAsync(1000);
      expect(m!.state().runs.map((r) => r.text).join('')).toBe('xyz');
      expect(m!.state().done).toBe(true);
    } finally {
      dispose();
    }
  });

  it('reuses one controller when reactive from/to change (no recreation)', async () => {
    const [from, setFrom] = createSignal('abc');
    const [to, setTo] = createSignal('xyz');
    let m: CreateTextMorphReturn | undefined;
    const dispose = createRoot((d) => {
      m = createTextMorph({ from, to, autoPlay: false });
      return d;
    });
    try {
      const firstController = m!.controller;
      expect(firstController).toBeInstanceOf(TextMorphController);

      setFrom('hello');
      setTo('help');
      await vi.advanceTimersByTimeAsync(0); // flush Solid effects

      // Same instance — setPair was called, not `new TextMorphController`.
      expect(m!.controller).toBe(firstController);
      // Plan was recomputed for the new pair: initial state renders `hello`.
      expect(m!.state().runs.map((r) => r.text).join('')).toBe('hello');
    } finally {
      dispose();
    }
  });

  it('onCleanup unsubscribes existing listeners (no further emits)', () => {
    let m: CreateTextMorphReturn | undefined;
    const seen: RenderState[] = [];
    const dispose = createRoot((d) => {
      m = createTextMorph({ from: 'abc', to: 'xyz', autoPlay: false });
      // Tap the controller directly so we can observe post-destroy behaviour.
      m!.controller.subscribe((s) => seen.push(s));
      return d;
    });
    // subscribe fires once immediately with the initial snapshot.
    expect(seen.length).toBe(1);

    dispose();

    // After cleanup, destroy() cleared all listeners: subsequent emissions
    // must not reach our observer.
    const before = seen.length;
    expect(() => m!.controller.finish()).not.toThrow();
    expect(seen.length).toBe(before);
  });
});
