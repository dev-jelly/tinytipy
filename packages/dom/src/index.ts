/**
 * @dev-jelly/tinytipy-dom — vanilla, framework-free adapter for tinytipy.
 *
 * Binds {@link TextMorphController} (from `@dev-jelly/tinytipy`) to a real DOM tree
 * and patches it efficiently on every snapshot. The DOM structure mirrors the
 * shared adapter spec exactly so the canonical stylesheet
 * (`@dev-jelly/tinytipy/styles.css`) renders it correctly.
 *
 *   <span class="tm-root" data-cursor-layout="overlay">
 *     <span class="tm-reserve" aria-hidden="true">…reserve texts…</span>
 *     <span class="tm-layer"   aria-hidden="true">…run spans + cursor…</span>
 *     <span class="tm-sr-only">…final `to` text…</span>
 *   </span>
 *
 * Import the stylesheet ONCE per app (not bundled here):
 *   import "@dev-jelly/tinytipy/styles.css";
 */

import { TextMorphController, getRenderTokens, getReserveTexts } from '@dev-jelly/tinytipy';
import type { CursorLayout, MorphTiming, RenderState, ReserveLayout } from '@dev-jelly/tinytipy';

/** Options accepted by {@link createTextMorph} and {@link renderTextMorph}. */
export interface TextMorphOptions {
  /** Source text. Required. */
  from: string;
  /** Target text. Required. */
  to: string;
  /** Optional timing overrides merged onto `defaultTiming`. */
  timing?: Partial<MorphTiming>;
  /** Begin playing on mount (default `true`). */
  autoPlay?: boolean;
  /** Skip the animation and jump straight to `to`. */
  instant?: boolean;
  /** Force reduced-motion behaviour (skip to final). */
  prefersReducedMotion?: boolean;
  /** How much of the from/to text to reserve so the box does not reflow. */
  reserveLayout?: ReserveLayout;
  /** Cursor layout mode. Defaults to zero-width `overlay`; `inline` preserves legacy spacing. */
  cursorLayout?: CursorLayout;
  /** Extra classes appended to the root element (after `tm-root`). */
  className?: string;
  /** Alias of {@link TextMorphOptions.className} for parity with HTML attrs. */
  class?: string;
  /** Fires once when the morph reaches the final (`to`) state. */
  onDone?: () => void;
}

/** Options that may change after construction via {@link TextMorphHandle.setPair}. */
export type SetPairOptions = Partial<Omit<TextMorphOptions, 'from' | 'to'>>;

/** Imperative handle returned by {@link createTextMorph} / {@link renderTextMorph}. */
export interface TextMorphHandle {
  /** The underlying controller (for advanced use). */
  readonly controller: TextMorphController;
  /** Tear down: cancel timers, unsubscribe, and stop touching the DOM. Idempotent. */
  destroy(): void;
  /** Swap the from/to pair (re-plans and, by default, replays when `autoPlay`). */
  setPair(from: string, to: string, options?: SetPairOptions): void;
  /** Start (or restart) the morph from the beginning. */
  play(): void;
  /** Stop and hold the current visible state. */
  pause(): void;
  /** Stop and return to the initial (`from`) snapshot. */
  reset(): void;
  /** Stop and jump to the final (`to`) snapshot. */
  finish(): void;
}

/** A {@link TextMorphHandle} plus the standalone root element it renders into. */
export interface RenderedTextMorph extends TextMorphHandle {
  /** The `.tm-root` element (not yet attached to the document). */
  readonly element: HTMLElement;
}

/** Build the `tm-root` class list, always keeping `tm-root` first. */
function composeRootClass(extra: string): string {
  const trimmed = extra.trim();
  return trimmed ? `tm-root ${trimmed}` : 'tm-root';
}

/** Remove every child of a node without relying on `replaceChildren`. */
function clearChildren(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Build the `.tm-reserve` / `.tm-layer` / `.tm-sr-only` children inside `root`,
 * wire a {@link TextMorphController}, and patch the DOM on every snapshot.
 *
 * Patching is keyed and incremental: one span per run id is created once and
 * reused across snapshots (textContent / `data-status` / kind class are updated
 * in place); a single cursor span is moved or removed. `innerHTML` is never
 * rebuilt on a tick, so the browser only touches what actually changed.
 */
function mount(root: HTMLSpanElement, options: TextMorphOptions): TextMorphHandle {
  const reserve = document.createElement('span');
  reserve.className = 'tm-reserve';
  reserve.setAttribute('aria-hidden', 'true');

  const layer = document.createElement('span');
  layer.className = 'tm-layer';
  layer.setAttribute('aria-hidden', 'true');

  const srOnly = document.createElement('span');
  srOnly.className = 'tm-sr-only';

  root.appendChild(reserve);
  root.appendChild(layer);
  root.appendChild(srOnly);

  // Adapter-local state (never mutate the caller's `options` object).
  let from = options.from;
  let to = options.to;
  let reserveLayout: ReserveLayout = options.reserveLayout ?? 'both';
  let cursorLayout: CursorLayout = options.cursorLayout ?? 'overlay';
  let extraClass = (options.className ?? options.class ?? '').trim();
  let autoPlayFlag = options.autoPlay ?? true;
  let destroyed = false;
  let lastReserveKey = '';

  // Reusable render nodes keyed by run id (stable across a single plan).
  const runNodes = new Map<string, HTMLSpanElement>();
  // A single cursor span, created lazily and moved in/out of the layer.
  let cursorNode: HTMLSpanElement | null = null;

  const controller = new TextMorphController({
    from: options.from,
    to: options.to,
    timing: options.timing,
    instant: options.instant,
    prefersReducedMotion: options.prefersReducedMotion,
    autoPlay: autoPlayFlag,
    onDone: options.onDone,
  });

  function applyClassName(): void {
    root.className = composeRootClass(extraClass);
  }
  applyClassName();

  function applyCursorLayout(): void {
    root.setAttribute('data-cursor-layout', cursorLayout);
  }
  applyCursorLayout();

  /** Rebuild the reserve spans + screen-reader copy only when inputs change. */
  function renderReserve(): void {
    const key = `${reserveLayout}\u0000${from}\u0000${to}`;
    if (key === lastReserveKey) return;
    lastReserveKey = key;

    clearChildren(reserve);
    for (const text of getReserveTexts(reserveLayout, from, to)) {
      const span = document.createElement('span');
      span.textContent = text;
      reserve.appendChild(span);
    }
    if (srOnly.textContent !== to) srOnly.textContent = to;
  }

  /** Reconcile `.tm-layer` to a snapshot with minimal DOM mutation. */
  function patch(state: RenderState): void {
    const tokens = getRenderTokens(state);

    // 1. Collect the desired run ids and drop any stale run spans.
    const desiredRunIds = new Set<string>();
    for (const token of tokens) {
      if (token.type === 'run') desiredRunIds.add(token.id);
    }
    for (const [id, node] of runNodes) {
      if (!desiredRunIds.has(id)) {
        node.remove();
        runNodes.delete(id);
      }
    }

    // 2. Toggle the cursor: remove it when no cursor token is present.
    const hasCursor = tokens.some((t) => t.type === 'cursor');
    if (!hasCursor && cursorNode) cursorNode.remove();

    // 3. Ensure + update each run span (text, kind class, status) in place.
    for (const token of tokens) {
      if (token.type !== 'run') continue;
      let node = runNodes.get(token.id);
      if (!node) {
        node = document.createElement('span');
        runNodes.set(token.id, node);
      }
      const cls = `tm-run tm-run--${token.kind}`;
      if (node.className !== cls) node.className = cls;
      if (node.getAttribute('data-status') !== token.status) {
        node.setAttribute('data-status', token.status);
      }
      if (node.textContent !== token.text) node.textContent = token.text;
    }

    // 4. Lazily create the (single) cursor span if one is needed now.
    if (hasCursor && !cursorNode) {
      cursorNode = document.createElement('span');
      cursorNode.className = 'tm-cursor';
      cursorNode.setAttribute('aria-hidden', 'true');
    }

    // 5. Order the layer children to match the token order. `insertBefore`
    //    moves existing nodes, so unchanged runs are never touched.
    let anchor: Node | null = null;
    for (const token of tokens) {
      const node: HTMLSpanElement | null =
        token.type === 'run' ? (runNodes.get(token.id) ?? null) : cursorNode;
      if (!node) continue;
      const referenceNode: Node | null = anchor ? anchor.nextSibling : layer.firstChild;
      if (referenceNode !== node) {
        if (referenceNode) layer.insertBefore(node, referenceNode);
        else layer.appendChild(node);
      }
      anchor = node;
    }
  }

  const unsubscribe = controller.subscribe(patch);
  renderReserve();

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    unsubscribe();
    controller.destroy();
  }

  function setPair(newFrom: string, newTo: string, opts?: SetPairOptions): void {
    if (destroyed) return;
    const {
      timing,
      instant,
      prefersReducedMotion,
      autoPlay,
      onDone,
      reserveLayout: newLayout,
      cursorLayout: newCursorLayout,
      className: newClassName,
      class: newClass,
    } = opts ?? {};

    if (newLayout !== undefined) reserveLayout = newLayout;
    if (newCursorLayout !== undefined) {
      cursorLayout = newCursorLayout;
      applyCursorLayout();
    }
    if (newClassName !== undefined) extraClass = newClassName.trim();
    else if (newClass !== undefined) extraClass = newClass.trim();
    if (newClassName !== undefined || newClass !== undefined) applyClassName();

    const shouldPlay = autoPlay ?? autoPlayFlag;
    if (autoPlay !== undefined) autoPlayFlag = autoPlay;

    controller.setPair(newFrom, newTo, {
      ...(timing !== undefined ? { timing } : {}),
      ...(instant !== undefined ? { instant } : {}),
      ...(prefersReducedMotion !== undefined ? { prefersReducedMotion } : {}),
      ...(onDone !== undefined ? { onDone } : {}),
    });

    from = newFrom;
    to = newTo;
    renderReserve();
    if (shouldPlay) controller.play();
  }

  return {
    controller,
    destroy,
    setPair,
    play: () => {
      if (!destroyed) controller.play();
    },
    pause: () => {
      if (!destroyed) controller.pause();
    },
    reset: () => {
      if (!destroyed) controller.reset();
    },
    finish: () => {
      if (!destroyed) controller.finish();
    },
  };
}

/**
 * Mount a tinytipy instance inside `target`.
 *
 * `target` hosts the content: a `.tm-root` element is appended to it and kept
 * in sync with the controller. Returns an imperative handle. Call
 * `handle.destroy()` to tear down (cancel timers + unsubscribe).
 */
export function createTextMorph(target: HTMLElement, options: TextMorphOptions): TextMorphHandle {
  const root = document.createElement('span');
  target.appendChild(root);
  const inner = mount(root, options);
  const baseDestroy = inner.destroy;

  return {
    controller: inner.controller,
    destroy() {
      baseDestroy();
      root.remove();
    },
    setPair: inner.setPair,
    play: inner.play,
    pause: inner.pause,
    reset: inner.reset,
    finish: inner.finish,
  };
}

/**
 * Build a standalone tinytipy root element (not yet attached to the document).
 *
 * Convenience for callers that want to construct the element themselves and
 * append it later. The returned `.element` is the `.tm-root` node; the rest of
 * the object is the usual imperative handle.
 */
export function renderTextMorph(options: TextMorphOptions): RenderedTextMorph {
  const root = document.createElement('span');
  const inner = mount(root, options);
  return {
    element: root,
    controller: inner.controller,
    destroy: inner.destroy,
    setPair: inner.setPair,
    play: inner.play,
    pause: inner.pause,
    reset: inner.reset,
    finish: inner.finish,
  };
}

export type { CursorLayout, MorphTiming, RenderState, ReserveLayout } from '@dev-jelly/tinytipy';
