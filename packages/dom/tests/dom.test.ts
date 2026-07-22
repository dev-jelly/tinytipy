import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTextMorph, renderTextMorph } from '../src/index';

/** Concatenate the visible run text inside `.tm-layer` (skips the empty cursor). */
function layerText(root: ParentNode): string {
  const layer = root.querySelector('.tm-layer');
  if (!layer) return '';
  return Array.from(layer.querySelectorAll('.tm-run'))
    .map((n) => n.textContent ?? '')
    .join('');
}

describe('createTextMorph', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders `from` initially', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    createTextMorph(host, { from: 'hello', to: 'world' });

    expect(host.querySelector('.tm-root')).not.toBeNull();
    expect(layerText(host)).toBe('hello');
  });

  it('defaults to overlay and retains cursor layout across partial setPair updates', () => {
    const host = document.createElement('div');
    const handle = createTextMorph(host, { from: 'a', to: 'b', instant: true });
    const root = host.querySelector('.tm-root')!;
    expect(root.getAttribute('data-cursor-layout')).toBe('overlay');
    expect(root.querySelector('.tm-cursor')?.getAttribute('aria-hidden')).toBe('true');

    handle.setPair('b', 'c', { cursorLayout: 'inline', instant: true });
    expect(root.getAttribute('data-cursor-layout')).toBe('inline');
    handle.setPair('c', 'd', { instant: true });
    expect(root.getAttribute('data-cursor-layout')).toBe('inline');
  });

  it('appends the extra className onto the root (keeping tm-root)', () => {
    const host = document.createElement('div');
    createTextMorph(host, { from: 'a', to: 'b', className: 'big  bold' });
    const root = host.querySelector('.tm-root')!;
    expect(root.classList.contains('tm-root')).toBe(true);
    expect(root.classList.contains('big')).toBe(true);
    expect(root.classList.contains('bold')).toBe(true);
  });

  it('renders the reserve layer + sr-only for the default "both" layout', () => {
    const host = document.createElement('div');
    createTextMorph(host, { from: 'AAA', to: 'BBBB' });

    const reserve = host.querySelector('.tm-reserve')!;
    expect(reserve.getAttribute('aria-hidden')).toBe('true');
    expect(reserve.textContent).toContain('AAA');
    expect(reserve.textContent).toContain('BBBB');
    expect(host.querySelector('.tm-sr-only')!.textContent).toBe('BBBB');
  });

  it('leaves the reserve layer empty when reserveLayout is "none"', () => {
    const host = document.createElement('div');
    createTextMorph(host, { from: 'AAA', to: 'BBBB', reserveLayout: 'none' });
    expect(host.querySelector('.tm-reserve')!.children.length).toBe(0);
    // sr-only still carries the final text.
    expect(host.querySelector('.tm-sr-only')!.textContent).toBe('BBBB');
  });

  it('animates from `from` to `to` once timers flush', () => {
    const host = document.createElement('div');
    createTextMorph(host, { from: 'abc', to: 'xyz' });
    expect(layerText(host)).toBe('abc');

    vi.runAllTimers();

    expect(layerText(host)).toBe('xyz');
    // The live cursor remains after the resolved text.
    const cursor = host.querySelector('.tm-cursor');
    expect(cursor).not.toBeNull();
    expect(host.querySelector('.tm-layer')?.lastElementChild).toBe(cursor);
  });

  it('shows the typing cursor at some point while editing', () => {
    const host = document.createElement('div');
    createTextMorph(host, { from: 'abc', to: 'xyz' });

    let sawCursor = false;
    // Step through fake time in small increments to land mid-animation.
    for (let i = 0; i < 500; i++) {
      vi.advanceTimersByTime(2);
      if (host.querySelector('.tm-cursor')) {
        sawCursor = true;
        break;
      }
    }
    expect(sawCursor).toBe(true);

    vi.runAllTimers();
    expect(host.querySelector('.tm-cursor')).not.toBeNull();
  });

  it('exposes imperative controls (finish / reset)', () => {
    const host = document.createElement('div');
    const handle = createTextMorph(host, { from: 'abc', to: 'xyz', autoPlay: false });

    expect(layerText(host)).toBe('abc');
    handle.finish();
    expect(layerText(host)).toBe('xyz');
    handle.reset();
    expect(layerText(host)).toBe('abc');
    handle.destroy();
  });

  it('re-plans on setPair and animates to the new target', () => {
    const host = document.createElement('div');
    const handle = createTextMorph(host, { from: 'abc', to: 'xyz' });

    vi.runAllTimers();
    expect(layerText(host)).toBe('xyz');

    handle.setPair('xyz', '123');
    // Initial snapshot of the new pair renders its `from`.
    expect(layerText(host)).toBe('xyz');
    expect(host.querySelector('.tm-sr-only')!.textContent).toBe('123');

    vi.runAllTimers();
    expect(layerText(host)).toBe('123');
    handle.destroy();
  });

  it('destroy tears down the controller: no further updates and no throw', () => {
    const host = document.createElement('div');
    const handle = createTextMorph(host, { from: 'abc', to: 'xyz' });
    const root = host.querySelector('.tm-root')!;
    const textBefore = layerText(root);

    handle.destroy();

    // Re-entrant + post-destroy calls must never throw.
    expect(() => handle.destroy()).not.toThrow();
    expect(() => handle.play()).not.toThrow();
    expect(() => handle.pause()).not.toThrow();
    expect(() => handle.reset()).not.toThrow();
    expect(() => handle.finish()).not.toThrow();
    expect(() => handle.setPair('x', 'y')).not.toThrow();

    // Flushing timers must not drive any further DOM change (subscription gone):
    // the detached root is frozen at its last rendered text.
    vi.runAllTimers();
    expect(layerText(root)).toBe(textBefore);
    // The root was removed from its host on destroy (no DOM leak).
    expect(host.querySelector('.tm-root')).toBeNull();
  });
});

describe('renderTextMorph', () => {
  it('returns a standalone root element with the full tm structure', () => {
    const rendered = renderTextMorph({ from: 'hi', to: 'yo' });
    const el = rendered.element;

    expect(el.classList.contains('tm-root')).toBe(true);
    expect(el.querySelector('.tm-reserve')).not.toBeNull();
    expect(el.querySelector('.tm-layer')).not.toBeNull();
    expect(el.querySelector('.tm-sr-only')!.textContent).toBe('yo');
    expect(layerText(el)).toBe('hi');

    rendered.destroy();
  });

  it('does not attach the element to the document', () => {
    const rendered = renderTextMorph({ from: 'a', to: 'b' });
    expect(rendered.element.isConnected).toBe(false);
    rendered.destroy();
  });
});
