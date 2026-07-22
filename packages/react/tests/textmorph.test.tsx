import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { TextMorph, useTextMorph } from '../src/index';

function layerText(container: HTMLElement): string {
  return container.querySelector('.tm-layer')?.textContent ?? '';
}
function hasCursor(container: HTMLElement): boolean {
  return !!container.querySelector('.tm-cursor');
}
function srOnly(container: HTMLElement): string {
  return container.querySelector('.tm-sr-only')?.textContent ?? '';
}

describe('@dev-jelly/tinytipy-react <TextMorph>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders `from` on first paint', () => {
    const { container } = render(<TextMorph from="abc" to="xyz" />);
    expect(layerText(container)).toBe('abc');
  });

  it('defaults to overlay cursor layout and keeps a cursor for empty resolved text', () => {
    const { container } = render(<TextMorph from="a" to="" instant />);
    const root = container.querySelector('.tm-root');
    const cursor = container.querySelector('.tm-cursor');
    expect(root?.getAttribute('data-cursor-layout')).toBe('overlay');
    expect(cursor?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.tm-layer')?.lastElementChild).toBe(cursor);
  });

  it('supports the legacy inline cursor layout', () => {
    const { container } = render(
      <TextMorph from="a" to="b" instant cursorLayout="inline" />,
    );
    expect(container.querySelector('.tm-root')?.getAttribute('data-cursor-layout')).toBe(
      'inline',
    );
    expect(container.querySelector('.tm-cursor')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('animates to `to` and fires onDone once after timers flush', () => {
    const onDone = vi.fn();
    const { container } = render(<TextMorph from="abc" to="xyz" onDone={onDone} />);
    act(() => {
      vi.runAllTimers();
    });
    expect(layerText(container)).toBe('xyz');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('types into a completely empty initial state', () => {
    const { container } = render(
      <TextMorph
        from=""
        to="새 문장"
        timing={{
          initialDelayMs: 0,
          hunkDelayMs: 0,
          typePerFrameMs: 1,
          settleMs: 0,
        }}
      />,
    );
    expect(layerText(container)).toBe('');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(layerText(container).length).toBeGreaterThan(0);
    act(() => {
      vi.runAllTimers();
    });
    expect(layerText(container)).toBe('새 문장');
  });

  it('shows the trailing cursor during editing and keeps it at the end', () => {
    const { container } = render(<TextMorph from="abc" to="wxyz" />);
    // Past initialDelay -> the first edit hunk is active -> cursor present.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(hasCursor(container)).toBe(true);
    act(() => {
      vi.runAllTimers();
    });
    expect(hasCursor(container)).toBe(true);
    expect(container.querySelector('.tm-layer')?.lastElementChild).toBe(
      container.querySelector('.tm-cursor'),
    );
  });

  it('exposes the final `to` text to screen readers and reserves layout', () => {
    const { container } = render(<TextMorph from="3초" to="300ms" reserveLayout="both" />);
    expect(srOnly(container)).toBe('300ms');
    const reserve = container.querySelector('.tm-reserve');
    expect(reserve?.getAttribute('aria-hidden')).toBe('true');
  });

  it('jumps straight to `to` when instant', () => {
    const { container } = render(<TextMorph from="abc" to="abcdef" instant />);
    expect(layerText(container)).toBe('abcdef');
  });

  it('forwards from/to changes when props update', () => {
    const { container, rerender } = render(<TextMorph from="abc" to="xyz" />);
    act(() => {
      vi.runAllTimers();
    });
    expect(layerText(container)).toBe('xyz');
    rerender(<TextMorph from="hello" to="help" />);
    expect(layerText(container)).toBe('hello');
    act(() => {
      vi.runAllTimers();
    });
    expect(layerText(container)).toBe('help');
  });

  it('calls the latest onDone even if it changes between renders', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<TextMorph from="abc" to="xyz" onDone={first} />);
    rerender(<TextMorph from="abc" to="xyz" onDone={second} />);
    act(() => {
      vi.runAllTimers();
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not throw on unmount', () => {
    const { unmount } = render(<TextMorph from="abc" to="xyz" />);
    expect(() => unmount()).not.toThrow();
  });
});

describe('@dev-jelly/tinytipy-react useTextMorph', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('exposes state + controls and drives playback', () => {
    let captured!: ReturnType<typeof useTextMorph>;
    function Probe() {
      captured = useTextMorph({ from: 'ab', to: 'cd' });
      return null;
    }
    render(<Probe />);
    expect(captured.state.runs.map((r) => r.text).join('')).toBe('ab');
    act(() => {
      vi.runAllTimers();
    });
    expect(captured.state.done).toBe(true);
    expect(captured.state.runs.map((r) => r.text).join('')).toBe('cd');
    expect(typeof captured.play).toBe('function');
  });
});
