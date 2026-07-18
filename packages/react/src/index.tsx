import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  TextMorphController,
  getRenderTokens,
  getReserveTexts,
  planMorph,
  type MorphTiming,
  type RenderState,
  type ReserveLayout,
} from '@dev-jelly/tinytipy';

export type { MorphTiming, RenderState, ReserveLayout, RenderToken } from '@dev-jelly/tinytipy';
export { TextMorphController, getRenderTokens, getReserveTexts, planMorph } from '@dev-jelly/tinytipy';

/** Props for the {@link TextMorph} component. */
export interface TextMorphProps {
  from: string;
  to: string;
  timing?: Partial<MorphTiming>;
  autoPlay?: boolean;
  instant?: boolean;
  prefersReducedMotion?: boolean;
  reserveLayout?: ReserveLayout;
  onDone?: () => void;
  /** Extra class(es) appended to the root element (which always keeps `tm-root`). */
  className?: string;
}

/** Imperative handle exposed by {@link TextMorph} via ref. */
export interface TextMorphHandle {
  play: () => void;
  pause: () => void;
  reset: () => void;
  finish: () => void;
}

/** Options accepted by {@link useTextMorph}. */
export type UseTextMorphOptions = Omit<TextMorphProps, 'className' | 'reserveLayout'>;

/** Return value of {@link useTextMorph}. */
export interface UseTextMorphReturn {
  state: RenderState;
  controller: TextMorphController | null;
  play: () => void;
  pause: () => void;
  reset: () => void;
  finish: () => void;
}

function timingKey(timing: Partial<MorphTiming> | undefined): string {
  return timing ? JSON.stringify(timing) : '';
}

/**
 * Drive a text morph from a React component. Creates a single
 * {@link TextMorphController}, forwards `from`/`to`/`timing`/option changes
 * without recreating the controller, and tears it down on unmount.
 *
 * The controller is created inside a mount effect (StrictMode-safe: it is
 * recreated on the simulated remount). The first render is seeded from a pure
 * plan so SSR/first paint shows `from` with no flash.
 */
export function useTextMorph(options: UseTextMorphOptions): UseTextMorphReturn {
  const { from, to, timing, autoPlay = true, instant, prefersReducedMotion, onDone } = options;

  // Always-current onDone without re-creating the controller.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const controllerRef = useRef<TextMorphController | null>(null);
  const [state, setState] = useState<RenderState>(() => planMorph({ from, to }).initial);

  // Create + subscribe (StrictMode-safe: recreated on the simulated remount).
  useEffect(() => {
    const controller = new TextMorphController({
      from,
      to,
      timing,
      autoPlay,
      instant,
      prefersReducedMotion,
      onDone: () => onDoneRef.current?.(),
    });
    controllerRef.current = controller;
    setState(controller.snapshot);
    const unsubscribe = controller.subscribe(setState);
    return () => {
      unsubscribe();
      controller.destroy();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
    // Initial values only; updates are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Forward from/to + boolean option changes (skips the initial mount run).
  const lastSyncRef = useRef<string | null>(null);
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const sig = [from, to, instant ? 1 : 0, prefersReducedMotion ? 1 : 0, autoPlay ? 1 : 0].join(' ');
    if (lastSyncRef.current === null) {
      lastSyncRef.current = sig;
      return;
    }
    if (lastSyncRef.current === sig) return;
    lastSyncRef.current = sig;
    controller.setPair(from, to, {
      instant,
      prefersReducedMotion,
      onDone: () => onDoneRef.current?.(),
    });
    if (autoPlay) controller.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, instant, prefersReducedMotion, autoPlay]);

  // Forward timing changes (skips the initial mount run).
  const lastTimingRef = useRef<string | null>(null);
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const key = timingKey(timing);
    if (lastTimingRef.current === null) {
      lastTimingRef.current = key;
      return;
    }
    if (lastTimingRef.current === key) return;
    lastTimingRef.current = key;
    controller.setTiming(timing ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timing]);

  return {
    state,
    controller: controllerRef.current,
    play: () => controllerRef.current?.play(),
    pause: () => controllerRef.current?.pause(),
    reset: () => controllerRef.current?.reset(),
    finish: () => controllerRef.current?.finish(),
  };
}

/** Build the morph DOM from a snapshot. Pure and framework-neutral JSX. */
export function renderMorph(
  state: RenderState,
  from: string,
  to: string,
  reserveLayout: ReserveLayout,
  className?: string,
): ReactElement {
  const tokens = getRenderTokens(state);
  const reserve = getReserveTexts(reserveLayout, from, to);
  const rootClass = className ? `tm-root ${className}` : 'tm-root';

  return (
    <span className={rootClass}>
      <span className="tm-reserve" aria-hidden="true">
        {reserve.map((text, i) => (
          <span key={i}>{text}</span>
        ))}
      </span>
      <span className="tm-layer" aria-hidden="true">
        {tokens.map((token) =>
          token.type === 'cursor' ? (
            <span key="tm-cursor" className="tm-cursor" aria-hidden="true" />
          ) : (
            <span
              key={token.id}
              className={`tm-run tm-run--${token.kind}`}
              data-status={token.status}
            >
              {token.text}
            </span>
          ),
        )}
      </span>
      <span className="tm-sr-only">{to}</span>
    </span>
  );
}

/**
 * `<TextMorph from={...} to={...} />` — render a morphing text span. Imperative
 * controls (play/pause/reset/finish) are available via a {@link TextMorphHandle} ref.
 */
export const TextMorph = forwardRef<TextMorphHandle, TextMorphProps>(function TextMorph(
  { reserveLayout = 'both', className, ...hookOptions },
  ref,
) {
  const { state, play, pause, reset, finish } = useTextMorph(hookOptions);
  useImperativeHandle(ref, () => ({ play, pause, reset, finish }), [play, pause, reset, finish]);
  return renderMorph(state, hookOptions.from, hookOptions.to, reserveLayout, className);
});
