/**
 * @dev-jelly/tinytipy-solid — Solid 1.8+ adapter for tinytipy.
 *
 * Binds the framework-agnostic {@link TextMorphController} from `@dev-jelly/tinytipy`
 * to Solid's reactivity primitives, and renders the canonical
 * `tm-root / tm-reserve / tm-layer / tm-sr-only` structure described in
 * `ADAPTERS_SPEC.md`.
 *
 * This package ships SOURCE. The consumer's `vite-plugin-solid` pipeline
 * compiles the JSX. The `build` script therefore only emits `.d.ts` files.
 *
 * One-time CSS import (do this once in your app entry):
 *   import "@dev-jelly/tinytipy/styles.css";
 */

import {
  type Accessor,
  type JSX,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  For,
} from 'solid-js';
import {
  TextMorphController,
  getRenderTokens,
  getReserveTexts,
  type MorphTiming,
  type RenderState,
  type RenderToken,
  type ReserveLayout,
} from '@dev-jelly/tinytipy';

/** A value or an accessor returning that value. */
export type MaybeAccessor<T> = T | Accessor<T>;

/** Read the inner value of a {@link MaybeAccessor}. */
function toValue<T>(value: MaybeAccessor<T>): T {
  return typeof value === 'function' ? (value as Accessor<T>)() : value;
}

/** Options accepted by {@link createTextMorph}. */
export interface CreateTextMorphOptions {
  /** Source text (the "from" side of the morph). Reactive. */
  from: MaybeAccessor<string>;
  /** Target text (the "to" side of the morph). Reactive. */
  to: MaybeAccessor<string>;
  /** Optional timing overrides. Reactive. */
  timing?: MaybeAccessor<Partial<MorphTiming> | undefined>;
  /** Begin playing automatically (default `true`). Read once at creation. */
  autoPlay?: MaybeAccessor<boolean | undefined>;
  /** Skip the animation and jump straight to `to`. Reactive. */
  instant?: MaybeAccessor<boolean | undefined>;
  /** Force reduced-motion behaviour. Reactive. */
  prefersReducedMotion?: MaybeAccessor<boolean | undefined>;
  /** Fires once when the morph reaches the final (`to`) state. */
  onDone?: () => void;
}

/** Imperative + reactive handle returned by {@link createTextMorph}. */
export interface CreateTextMorphReturn {
  /** Live render-state accessor. */
  state: Accessor<RenderState>;
  /** Start (or restart) the morph from the beginning. */
  play: () => void;
  /** Stop playback and hold the current visible state. */
  pause: () => void;
  /** Stop and return to the initial (`from`) snapshot. */
  reset: () => void;
  /** Stop and jump straight to the final (`to`) snapshot. */
  finish: () => void;
  /** The underlying {@link TextMorphController} (one per call). */
  controller: TextMorphController;
}

/**
 * Bind a {@link TextMorphController} to Solid reactivity. Creates exactly ONE
 * controller for the lifetime of the owning reactive scope and reuses it for
 * every `from`/`to`/`timing` change. The controller is destroyed automatically
 * when the owner cleans up.
 *
 * Use this when you want full control of the markup. For the default markup,
 * use the {@link TextMorph} component.
 */
export function createTextMorph(
  opts: CreateTextMorphOptions,
): CreateTextMorphReturn {
  // Hold the latest onDone so the controller always calls the freshest copy.
  // Solid props callbacks are usually stable, but reading at call time
  // avoids any chance of a stale closure.
  const onDoneWrapper = (): void => {
    opts.onDone?.();
  };

  // Construct synchronously so the very first read of `state` reflects the
  // initial snapshot — no first-paint flash of the empty state.
  const controller = new TextMorphController({
    from: toValue(opts.from),
    to: toValue(opts.to),
    timing: toValue(opts.timing),
    instant: toValue(opts.instant),
    prefersReducedMotion: toValue(opts.prefersReducedMotion),
    autoPlay: toValue(opts.autoPlay) ?? true,
    onDone: onDoneWrapper,
  });

  // The controller always assigns a brand-new RenderState on every genuine
  // change, so the default referential equality propagates every real emit
  // (and skips idempotent re-emits of the same snapshot reference).
  const [state, setState] = createSignal<RenderState>(controller.snapshot);

  // Subscribe before seeding so we never miss an emit between construction
  // and subscription.
  const unsubscribe = controller.subscribe((next) => setState(() => next));

  onCleanup(() => {
    unsubscribe();
    controller.destroy();
  });

  // React to from/to/timing changes. The first run is a no-op because the
  // controller was already constructed with the initial values.
  let firstRun = true;
  createEffect(() => {
    const from = toValue(opts.from);
    const to = toValue(opts.to);
    const timing = toValue(opts.timing);
    const instant = toValue(opts.instant);
    const prefersReducedMotion = toValue(opts.prefersReducedMotion);
    // autoPlay is intentionally read outside tracking — flipping it should
    // not restart an in-flight morph. It only matters for new pairs.
    const autoPlay = untrack(() => toValue(opts.autoPlay) ?? true);

    if (firstRun) {
      firstRun = false;
      return;
    }

    controller.setPair(from, to, { timing, instant, prefersReducedMotion });
    if (autoPlay) controller.play();
  });

  return {
    state,
    play: () => controller.play(),
    pause: () => controller.pause(),
    reset: () => controller.reset(),
    finish: () => controller.finish(),
    controller,
  };
}

/** Props for the {@link TextMorph} component. */
export interface TextMorphProps {
  /** Source text. */
  from: string;
  /** Target text. */
  to: string;
  /** Optional timing overrides. */
  timing?: Partial<MorphTiming>;
  /** Begin playing automatically (default `true`). */
  autoPlay?: boolean;
  /** Skip the animation and jump straight to `to`. */
  instant?: boolean;
  /** Force reduced-motion behaviour. */
  prefersReducedMotion?: boolean;
  /**
   * How much of the from/to text to reserve so the box does not reflow.
   * Default `'both'`.
   */
  reserveLayout?: ReserveLayout;
  /** Extra class(es) appended to the root element (`tm-root` is always kept). */
  class?: string;
  /** Alias of {@link TextMorphProps.class} for React muscle memory. */
  className?: string;
  /** Fires once when the morph reaches the final (`to`) state. */
  onDone?: () => void;
  /**
   * Optional callback invoked once on mount with the underlying
   * {@link TextMorphController}. Use this for imperative controls when you
   * prefer the component over {@link createTextMorph}.
   */
  controllerRef?: (controller: TextMorphController) => void;
}

type RunToken = Extract<RenderToken, { type: 'run' }>;

/** A single, shared cursor token so <For> never needs a new node for it. */
const CURSOR_TOKEN: RenderToken = { type: 'cursor' };

/**
 * Memo producing referentially-stable render tokens. Solid's `<For>` tracks
 * items by reference: by reusing the same object for an unchanged run (and one
 * shared object for the cursor), only the genuinely-changed run gets a new
 * reference each tick — so `<For>` patches text in place instead of disposing
 * and recreating every row.
 */
function createStableTokens(state: Accessor<RenderState>): Accessor<RenderToken[]> {
  const cache = new Map<string, RunToken>();
  return createMemo<RenderToken[]>(() => {
    const tokens = getRenderTokens(state());
    const present = new Set<string>();
    const out: RenderToken[] = [];
    for (const token of tokens) {
      if (token.type === 'cursor') {
        out.push(CURSOR_TOKEN);
        continue;
      }
      present.add(token.id);
      const cached = cache.get(token.id);
      if (
        cached &&
        cached.kind === token.kind &&
        cached.text === token.text &&
        cached.status === token.status
      ) {
        out.push(cached);
      } else {
        cache.set(token.id, token);
        out.push(token);
      }
    }
    for (const id of [...cache.keys()]) {
      if (!present.has(id)) cache.delete(id);
    }
    return out;
  });
}

/**
 * Declarative Solid component that morphs `from` into `to` with a typing
 * cursor. Renders the canonical `tm-root` structure; pair it with the
 * one-time CSS import `import "@dev-jelly/tinytipy/styles.css";`.
 *
 * For imperative control or custom markup, use {@link createTextMorph}.
 */
export function TextMorph(props: TextMorphProps): JSX.Element {
  const morph = createTextMorph({
    from: () => props.from,
    to: () => props.to,
    timing: () => props.timing,
    autoPlay: () => props.autoPlay,
    instant: () => props.instant,
    prefersReducedMotion: () => props.prefersReducedMotion,
    onDone: () => props.onDone?.(),
  });

  // Hand the controller to the parent exactly once.
  if (props.controllerRef) props.controllerRef(morph.controller);

  const reserveTexts = createMemo<readonly string[]>(() =>
    getReserveTexts(props.reserveLayout ?? 'both', props.from, props.to),
  );

  // Referentially-stable tokens: unchanged runs keep the same object reference
  // across ticks (and the cursor is one shared object), so Solid <For> reuses
  // DOM nodes instead of remounting every row on each animation tick.
  const tokens = createStableTokens(morph.state);

  const rootClass = createMemo(() => {
    const extra = props.class ?? props.className;
    return extra && extra.length > 0 ? `tm-root ${extra}` : 'tm-root';
  });

  return (
    <span class={rootClass()}>
      <span class="tm-reserve" aria-hidden="true">
        <For each={reserveTexts()} fallback={null}>
          {(text) => <span>{text}</span>}
        </For>
      </span>
      <span class="tm-layer" aria-hidden="true">
        <For each={tokens()} fallback={null}>
          {(token) =>
            token.type === 'run' ? (
              <span
                class={`tm-run tm-run--${token.kind}`}
                data-status={token.status}
              >
                {token.text}
              </span>
            ) : (
              <span class="tm-cursor" aria-hidden="true" />
            )
          }
        </For>
      </span>
      <span class="tm-sr-only">{props.to}</span>
    </span>
  );
}

// Re-export the public types/values users are likely to need.
export {
  TextMorphController,
  getRenderTokens,
  getReserveTexts,
} from '@dev-jelly/tinytipy';
export type {
  MorphTiming,
  RenderState,
  RenderToken,
  ReserveLayout,
  RunKind,
  RunState,
  RunStatus,
} from '@dev-jelly/tinytipy';
