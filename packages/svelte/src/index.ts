/**
 * @dev-jelly/tinytipy-svelte
 *
 * Svelte 4 & 5 adapter for tinytipy. Built entirely on the runtime store API
 * (`svelte/store`) plus a Svelte action, so this entry is plain TypeScript
 * compiled by tsup/esbuild — no runes (`$state`/`$derived`) and no `.svelte`
 * files (those would need the Svelte compiler).
 *
 * Two entry points:
 *
 *  - `createTextMorph(opts)`  -> a readable store of {@link RenderState} plus
 *    imperative controls. Use it for full markup control with `$state`.
 *
 *  - `morphAction` / `morph`   -> a Svelte action (`use:morph`) that builds the
 *    canonical `tm-root` DOM structure into its host node and patches it on
 *    every snapshot. This is the closest thing to a `<TextMorph />` component
 *    without shipping a compiled `.svelte` file:
 *      <span use:morph={{ from, to }}></span>
 *
 * Import the canonical stylesheet ONCE per app (it is NOT bundled here, by spec):
 *   import "@dev-jelly/tinytipy/styles.css";
 */

import { readonly, writable, type Readable } from 'svelte/store';
import {
  TextMorphController,
  getRenderTokens,
  getReserveTexts,
  type ControllerOptions,
  type CursorLayout,
  type MorphTiming,
  type RenderState,
  type ReserveLayout,
} from '@dev-jelly/tinytipy';

/** Options accepted by {@link createTextMorph} and {@link morphAction}. */
export interface TextMorphOptions {
  from: string;
  to: string;
  timing?: Partial<MorphTiming>;
  /** Begin playing automatically. @default true */
  autoPlay?: boolean;
  /** Skip the animation and jump straight to `to`. */
  instant?: boolean;
  /** Force reduced-motion behaviour (jump to final). */
  prefersReducedMotion?: boolean;
  /** Which hidden strings to render in the reserve layer. @default 'both' */
  reserveLayout?: ReserveLayout;
  /** Cursor layout mode. @default 'overlay' */
  cursorLayout?: CursorLayout;
  /** Extra class(es) appended to the root element (always keeps `tm-root`). */
  class?: string;
  /** Fired once when the morph reaches the final (`to`) state. */
  onDone?: () => void;
}

/** Subset of options that may accompany a `setPair` update. */
export type TextMorphPairOptions = Omit<TextMorphOptions, 'from' | 'to'>;

/** Imperative handle returned by {@link createTextMorph}. */
export interface TextMorphHandle {
  /** Readable store of the current {@link RenderState} (use with `$state`). */
  readonly state: Readable<RenderState>;
  /** The underlying controller (escape hatch). */
  readonly controller: TextMorphController;
  play(): void;
  pause(): void;
  reset(): void;
  finish(): void;
  setPair(from: string, to: string, options?: TextMorphPairOptions): void;
  setTiming(timing: Partial<MorphTiming>): void;
  /** Cancel timers, unsubscribe, and tear the controller down. */
  destroy(): void;
}

/** Object returned by a Svelte action (`use:morph`). */
export interface MorphActionHandle {
  /** Called by Svelte whenever the action's params change. */
  update(options: TextMorphOptions): void;
  /** Called by Svelte when the host element is removed. */
  destroy(): void;
}

const DEFAULT_RESERVE_LAYOUT: ReserveLayout = 'both';
const DEFAULT_CURSOR_LAYOUT: CursorLayout = 'overlay';

function resolveReserveLayout(layout: ReserveLayout | undefined): ReserveLayout {
  return layout ?? DEFAULT_RESERVE_LAYOUT;
}

function resolveCursorLayout(layout: CursorLayout | undefined): CursorLayout {
  return layout ?? DEFAULT_CURSOR_LAYOUT;
}

/**
 * Build a minimal options object for `controller.setPair`, omitting `undefined`
 * values so we never clobber previously-set options (notably `onDone`).
 */
function pickControllerOptions(
  options: TextMorphPairOptions,
): Partial<ControllerOptions> {
  const out: Partial<ControllerOptions> = {};
  if (options.timing !== undefined) out.timing = options.timing;
  if (options.autoPlay !== undefined) out.autoPlay = options.autoPlay;
  if (options.instant !== undefined) out.instant = options.instant;
  if (options.prefersReducedMotion !== undefined) {
    out.prefersReducedMotion = options.prefersReducedMotion;
  }
  if (options.onDone !== undefined) out.onDone = options.onDone;
  return out;
}

function timingEqual(a: Partial<MorphTiming> | undefined, b: Partial<MorphTiming> | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Rebuild the reserve layer's hidden children from a reservation strategy. */
function buildReserve(
  reserve: HTMLElement,
  layout: ReserveLayout,
  from: string,
  to: string,
): void {
  reserve.textContent = '';
  for (const text of getReserveTexts(layout, from, to)) {
    const span = document.createElement('span');
    span.textContent = text;
    reserve.appendChild(span);
  }
}

/** Mutable DOM-patch state kept across snapshot ticks for one layer. */
interface LayerContext {
  runs: Map<string, HTMLSpanElement>;
  cursor: HTMLSpanElement | null;
}

/**
 * Patch the visible animated layer in place from a snapshot, keyed by run id.
 * Run nodes are created once and only their class/status/text are updated per
 * tick; the single cursor span is reused and repositioned. Nodes are removed
 * only when their run disappears. This avoids tearing down and rebuilding the
 * subtree on every animation tick.
 */
function patchLayer(layer: HTMLElement, state: RenderState, ctx: LayerContext): void {
  const tokens = getRenderTokens(state);
  const seenIds = new Set<string>();
  let cursorSeen = false;

  // Walk the layer's children with a `reference` cursor; insertBefore places
  // each node in token order (and is a cheap no-op when already in place).
  let reference: Node | null = layer.firstChild;
  const place = (node: HTMLElement): void => {
    if (node !== reference) layer.insertBefore(node, reference);
    reference = node.nextSibling;
  };

  for (const token of tokens) {
    let node: HTMLElement;
    if (token.type === 'cursor') {
      cursorSeen = true;
      if (!ctx.cursor) {
        const cursor = document.createElement('span');
        cursor.className = 'tm-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        ctx.cursor = cursor;
      }
      node = ctx.cursor as HTMLElement;
    } else {
      seenIds.add(token.id);
      const existing = ctx.runs.get(token.id);
      const run: HTMLSpanElement = existing ?? document.createElement('span');
      if (!existing) ctx.runs.set(token.id, run);
      const cls = `tm-run tm-run--${token.kind}`;
      if (run.className !== cls) run.className = cls;
      if (run.getAttribute('data-status') !== token.status) {
        run.setAttribute('data-status', token.status);
      }
      if (run.textContent !== token.text) run.textContent = token.text;
      node = run;
    }
    place(node);
  }

  // Drop run nodes whose runs have vanished.
  for (const [id, node] of ctx.runs) {
    if (!seenIds.has(id) && node.parentNode === layer) {
      layer.removeChild(node);
      ctx.runs.delete(id);
    }
  }
  // Drop the cursor node when no cursor token is present (keep the element for reuse).
  if (!cursorSeen && ctx.cursor && ctx.cursor.parentNode === layer) {
    layer.removeChild(ctx.cursor);
  }
}

/**
 * Create a morph controller bound to a readable store of {@link RenderState}.
 *
 * Subscribe inside a Svelte component with the `$state` auto-subscription:
 *
 *   <script>
 *     import { createTextMorph } from '@dev-jelly/tinytipy-svelte';
 *     const { state, play, pause } = createTextMorph({ from: 'a', to: 'b' });
 *   </script>
 *   <!-- $state holds the live RenderState -->
 */
export function createTextMorph(options: TextMorphOptions): TextMorphHandle {
  const isBrowser = typeof window !== 'undefined';
  const controller = new TextMorphController({
    from: options.from,
    to: options.to,
    timing: options.timing,
    // SSR guard: never schedule timers on the server (onDestroy does not run
    // during Svelte SSR, so autoplay timers would leak per request).
    autoPlay: (options.autoPlay ?? true) && isBrowser,
    instant: options.instant,
    prefersReducedMotion: options.prefersReducedMotion,
    onDone: options.onDone,
  });

  // Seed with the current snapshot so `$state` has a value before the first
  // subscriber attaches; the controller's own subscribe() also fires
  // immediately and on every change.
  const store = writable<RenderState>(controller.snapshot);
  const unsubscribe = controller.subscribe((state) => store.set(state));

  return {
    state: readonly(store),
    controller,
    play: () => controller.play(),
    pause: () => controller.pause(),
    reset: () => controller.reset(),
    finish: () => controller.finish(),
    setPair: (from, to, opts) =>
      controller.setPair(from, to, opts ? pickControllerOptions(opts) : undefined),
    setTiming: (timing) => controller.setTiming(timing),
    destroy() {
      unsubscribe();
      controller.destroy();
    },
  };
}

/**
 * Svelte action that renders the canonical `tm-root` structure into its host
 * node and keeps it in sync with the morph.
 *
 *   <span use:morph={{ from: 'a', to: 'b', reserveLayout: 'both' }}></span>
 *
 * One controller is created on mount and reused for the lifetime of the node;
 * `update()` only calls `setPair`/`setTiming` when the relevant props change.
 */
export function morphAction(node: HTMLElement, options: TextMorphOptions): MorphActionHandle {
  node.classList.add('tm-root');
  node.setAttribute('data-cursor-layout', resolveCursorLayout(options.cursorLayout));

  const reserve = document.createElement('span');
  reserve.className = 'tm-reserve';
  reserve.setAttribute('aria-hidden', 'true');

  const layer = document.createElement('span');
  layer.className = 'tm-layer';
  layer.setAttribute('aria-hidden', 'true');

  const srOnly = document.createElement('span');
  srOnly.className = 'tm-sr-only';

  node.appendChild(reserve);
  node.appendChild(layer);
  node.appendChild(srOnly);

  let current = options;
  let prevExtraClass = '';

  const applyClass = (extra: string | undefined): void => {
    if (prevExtraClass) {
      for (const c of prevExtraClass.split(/\s+/).filter(Boolean)) {
        node.classList.remove(c);
      }
    }
    prevExtraClass = extra ?? '';
    if (prevExtraClass) {
      for (const c of prevExtraClass.split(/\s+/).filter(Boolean)) {
        node.classList.add(c);
      }
    }
    node.classList.add('tm-root');
  };

  const renderReserve = (): void => {
    buildReserve(
      reserve,
      resolveReserveLayout(current.reserveLayout),
      current.from,
      current.to,
    );
    srOnly.textContent = current.to;
  };

  const isBrowser = typeof window !== 'undefined';
  const controller = new TextMorphController({
    from: current.from,
    to: current.to,
    timing: current.timing,
    autoPlay: (current.autoPlay ?? true) && isBrowser,
    instant: current.instant,
    prefersReducedMotion: current.prefersReducedMotion,
    // Stable wrapper reading the live `current` so a swapped onDone is always
    // current without needing to re-register it on the controller.
    onDone: () => current.onDone?.(),
  });

  const layerCtx: LayerContext = { runs: new Map(), cursor: null };
  // subscribe() fires immediately with the initial snapshot, then on each step.
  const unsubscribe = controller.subscribe((state) => patchLayer(layer, state, layerCtx));
  renderReserve();
  applyClass(current.class);

  let destroyed = false;

  return {
    update(next: TextMorphOptions) {
      if (destroyed) {
        current = next;
        return;
      }
      const pairChanged = next.from !== current.from || next.to !== current.to;
      const timingChanged = !timingEqual(next.timing, current.timing);
      const runtimeChanged =
        next.instant !== current.instant ||
        next.prefersReducedMotion !== current.prefersReducedMotion;

      // onDone is read through the live `current` closure, so it needs no forwarding.
      const runtimeOpts: Partial<ControllerOptions> = {};
      if (next.instant !== undefined) runtimeOpts.instant = next.instant;
      if (next.prefersReducedMotion !== undefined) {
        runtimeOpts.prefersReducedMotion = next.prefersReducedMotion;
      }

      if (pairChanged) {
        controller.setPair(next.from, next.to, runtimeOpts);
        if (next.autoPlay !== false && isBrowser) controller.play();
      } else if (timingChanged) {
        controller.setTiming(next.timing ?? {});
        if (next.autoPlay !== false && isBrowser) controller.play();
      } else if (runtimeChanged) {
        // Only instant / prefersReducedMotion changed — re-apply without a new pair.
        controller.setPair(current.from, current.to, runtimeOpts);
      }

      const reserveChanged =
        resolveReserveLayout(next.reserveLayout) !==
          resolveReserveLayout(current.reserveLayout) ||
        next.from !== current.from ||
        next.to !== current.to;
      if (reserveChanged) renderReserve();

      if (next.class !== current.class) applyClass(next.class);
      if (resolveCursorLayout(next.cursorLayout) !== resolveCursorLayout(current.cursorLayout)) {
        node.setAttribute('data-cursor-layout', resolveCursorLayout(next.cursorLayout));
      }

      current = next;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      controller.destroy();
      if (reserve.parentNode === node) node.removeChild(reserve);
      if (layer.parentNode === node) node.removeChild(layer);
      if (srOnly.parentNode === node) node.removeChild(srOnly);
      node.classList.remove('tm-root');
      node.removeAttribute('data-cursor-layout');
    },
  };
}

/** Alias so consumers can write `use:morph` directly: `import { morph }`. */
export { morphAction as morph };

// Re-export the core types users commonly need alongside this adapter.
export type {
  CursorLayout,
  RenderState,
  MorphTiming,
  ReserveLayout,
  RenderToken,
  RunState,
  RunKind,
  RunStatus,
} from '@dev-jelly/tinytipy';
export type { ControllerOptions } from '@dev-jelly/tinytipy';
