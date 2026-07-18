import {
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import {
  TextMorphController,
  type MorphTiming,
  type RenderState,
} from '@dev-jelly/tinytipy';

/**
 * Options for {@link useTextMorph}. `from`/`to`/`timing`/`instant`/
 * `prefersReducedMotion` accept a plain value, a ref, or a getter so the
 * composable can be driven by any reactive source.
 */
export interface UseTextMorphOptions {
  from: MaybeRefOrGetter<string>;
  to: MaybeRefOrGetter<string>;
  timing?: MaybeRefOrGetter<Partial<MorphTiming> | undefined>;
  /** Begin playing on creation. Defaults to `true`. */
  autoPlay?: MaybeRefOrGetter<boolean | undefined>;
  instant?: MaybeRefOrGetter<boolean | undefined>;
  prefersReducedMotion?: MaybeRefOrGetter<boolean | undefined>;
  /** Fired once when the morph reaches the final (`to`) state. */
  onDone?: () => void;
}

/** Imperative handle returned by {@link useTextMorph}. */
export interface UseTextMorphReturn {
  /** Live render snapshot; updated on every controller emit. */
  state: Ref<RenderState>;
  play: () => void;
  pause: () => void;
  reset: () => void;
  finish: () => void;
  /** The underlying controller (escape hatch). */
  controller: TextMorphController;
}

/**
 * Vue composable that binds a single {@link TextMorphController} to reactive
 * sources and exposes the live {@link RenderState} plus imperative controls.
 *
 * Lifecycle contract:
 *   - Exactly ONE controller is created and reused for the lifetime of the
 *     calling effect scope. It is never reconstructed on re-render.
 *   - When `from`/`to`/`timing`/`instant`/`prefersReducedMotion` change, the
 *     plan is recomputed via `setPair` (which subsumes `setTiming` because it
 *     rebuilds the plan from the merged options). A single combined watcher
 *     avoids the double recompute that two separate watchers would cause on a
 *     simultaneous edit.
 *   - When `autoPlay` is set, the new pair plays automatically.
 *   - The controller is destroyed when the owning scope is disposed
 *     (component unmount or an explicit `effectScope.stop()`).
 */
export function useTextMorph(options: UseTextMorphOptions): UseTextMorphReturn {
  // SSR guard: never schedule timers on the server (onScopeDispose does not run
  // during renderToString, so autoplay timers would leak onto the server loop).
  const isBrowser = typeof window !== 'undefined';
  const initialAutoPlay = (toValue(options.autoPlay) ?? true) && isBrowser;

  const controller = new TextMorphController({
    from: toValue(options.from),
    to: toValue(options.to),
    timing: toValue(options.timing),
    instant: toValue(options.instant),
    prefersReducedMotion: toValue(options.prefersReducedMotion),
    autoPlay: initialAutoPlay,
    onDone: options.onDone,
  });

  const state = shallowRef<RenderState>(controller.snapshot);
  controller.subscribe((next) => {
    state.value = next;
  });

  watch(
    [
      () => toValue(options.from),
      () => toValue(options.to),
      () => toValue(options.timing),
      () => toValue(options.instant),
      () => toValue(options.prefersReducedMotion),
      () => toValue(options.autoPlay),
    ],
    ([from, to, timing, instant, prefersReducedMotion, autoPlay]) => {
      controller.setPair(from, to, { timing, instant, prefersReducedMotion });
      if ((autoPlay ?? true) && isBrowser) controller.play();
    },
  );

  onScopeDispose(() => {
    controller.destroy();
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
