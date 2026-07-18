import { onReducedMotionChange, prefersReducedMotion } from './reduced-motion';
import type { MorphOptions, MorphTiming, RenderState } from './types';
import { planMorph } from './plan';
import type { MorphPlan } from './types';

/** Options for {@link TextMorphController}. */
export interface ControllerOptions extends MorphOptions {
  /** Called once when the morph reaches the final (`to`) state. */
  onDone?: () => void;
  /** Begin playing automatically as soon as constructed. */
  autoPlay?: boolean;
}

/**
 * Drives a {@link MorphPlan} over time.
 *
 * The controller owns the timing side effects (setTimeout scheduling, listener
 * notification, reduced-motion reaction). It exposes a small imperative API
 * that the framework adapters bind to reactive primitives.
 *
 * Scheduling is cumulative: each step fires `delayMs` after the previous one,
 * so cancelling on pause/replay never leaves stray timers that desynchronise
 * the visible state.
 */
export class TextMorphController {
  private plan: MorphPlan;
  private state: RenderState;
  private readonly listeners = new Set<(state: RenderState) => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private options: ControllerOptions;
  private playing = false;
  /** Latch ensuring onDone fires at most once per play attempt. */
  private doneFired = false;
  private readonly unsubscribeRm: () => void;

  constructor(options: ControllerOptions) {
    this.options = options;
    this.plan = planMorph(options);
    this.state = this.resolveInitialState();
    // Only short-circuit an animation that is actually in flight. Toggling
    // reduced motion while idle or after completion must be a no-op so we never
    // fire onDone or jump state without the user starting playback.
    this.unsubscribeRm = onReducedMotionChange((reduced) => {
      if (reduced && this.playing) this.finish();
    });
    if (options.autoPlay) this.play();
  }

  /** Fire onDone exactly once for the current attempt (guarded by doneFired). */
  private fireDone(): void {
    if (this.doneFired) return;
    this.doneFired = true;
    const onDone = this.options.onDone;
    if (onDone) onDone();
  }

  private resolveInitialState(): RenderState {
    if (this.shouldSkip()) return this.plan.final;
    return this.plan.initial;
  }

  private shouldSkip(): boolean {
    const reduced = this.options.prefersReducedMotion ?? prefersReducedMotion();
    return Boolean(this.options.instant) || reduced || this.plan.noOp;
  }

  /** Current render snapshot. */
  get snapshot(): RenderState {
    return this.state;
  }

  /** Subscribe to state changes. The listener is called immediately with the
   *  current state, and on every subsequent change. Returns an unsubscribe. */
  subscribe(listener: (state: RenderState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  /** Replace the from/to pair and recompute the plan. Resets playback. */
  setPair(from: string, to: string, options?: Partial<ControllerOptions>): void {
    this.pause();
    this.doneFired = false;
    this.options = {
      ...this.options,
      ...options,
      from,
      to,
    };
    this.plan = planMorph(this.options);
    this.state = this.resolveInitialState();
    this.emit();
  }

  /** Update timing without changing the pair (recomputes the plan). */
  setTiming(timing: Partial<MorphTiming>): void {
    this.pause();
    this.doneFired = false;
    this.options = { ...this.options, timing: { ...this.options.timing, ...timing } };
    this.plan = planMorph(this.options);
    this.state = this.resolveInitialState();
    this.emit();
  }

  /** Whether playback is currently running. */
  get isPlaying(): boolean {
    return this.playing;
  }

  /** Start (or restart) the morph from the beginning. */
  play(): void {
    if (this.playing) return;
    // A new play attempt begins: re-arm the onDone latch.
    this.doneFired = false;
    if (this.shouldSkip()) {
      this.state = this.plan.final;
      this.emit();
      this.fireDone();
      return;
    }
    this.playing = true;
    this.state = this.plan.initial;
    this.emit();

    let cumulative = 0;
    for (const step of this.plan.steps) {
      cumulative += step.delayMs;
      const target = step.state;
      const isLast = step.state.done;
      const id = setTimeout(() => {
        this.state = target;
        this.emit();
        if (isLast) {
          this.playing = false;
          this.fireDone();
        }
      }, cumulative);
      this.timers.push(id);
    }
  }

  /** Stop playback and hold the current visible state. */
  pause(): void {
    this.playing = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  /** Stop and return to the initial (`from`) snapshot. */
  reset(): void {
    this.pause();
    this.doneFired = false;
    this.state = this.resolveInitialState();
    this.emit();
  }

  /** Stop and jump straight to the final (`to`) snapshot. Idempotent per
   *  attempt: onDone fires at most once until the next play/reset/setPair. */
  finish(): void {
    this.pause();
    this.state = this.plan.final;
    this.emit();
    this.fireDone();
  }

  /** Tear down: cancel timers and release listeners. */
  destroy(): void {
    this.pause();
    this.listeners.clear();
    this.unsubscribeRm();
  }
}
