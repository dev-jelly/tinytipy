import { defineComponent, h, type PropType } from 'vue';
import {
  getRenderTokens,
  getReserveTexts,
  type MorphTiming,
  type RenderState,
  type ReserveLayout,
  type RenderToken,
} from '@dev-jelly/tinytipy';
import { useTextMorph } from './composable';

/** Props accepted by the {@link TextMorph} component. */
export interface TextMorphProps {
  from: string;
  to: string;
  timing?: Partial<MorphTiming>;
  autoPlay?: boolean;
  instant?: boolean;
  prefersReducedMotion?: boolean;
  reserveLayout?: ReserveLayout;
  onDone?: () => void;
}

/** Imperative controls exposed on the component instance (via template refs). */
export interface TextMorphExposed {
  play: () => void;
  pause: () => void;
  reset: () => void;
  finish: () => void;
}

const RESERVE_LAYOUTS: readonly ReserveLayout[] = ['both', 'to', 'from', 'none'];

function renderToken(token: RenderToken) {
  if (token.type === 'cursor') {
    return h('span', { class: 'tm-cursor', 'aria-hidden': 'true' });
  }
  return h(
    'span',
    {
      class: `tm-run tm-run--${token.kind}`,
      'data-status': token.status,
    },
    token.text,
  );
}

/**
 * `<TextMorph>` — renders a diff-driven morphing text span.
 *
 * Renders this structure (styled by `@dev-jelly/tinytipy/styles.css`):
 *
 * ```html
 * <span class="tm-root">
 *   <span class="tm-reserve" aria-hidden="true">…reserve spans…</span>
 *   <span class="tm-layer" aria-hidden="true">
 *     <span class="tm-run tm-run--{kind}" data-status="{status}">…</span>
 *     <span class="tm-cursor" aria-hidden="true"></span>   <!-- active edit or resolved text end -->
 *     …
 *   </span>
 *   <span class="tm-sr-only">{final `to` text}</span>
 * </span>
 * ```
 *
 * A single controller is scoped to the component and destroyed on unmount.
 * Parent `class`/`style`/attrs fall through to the root (Vue single-root
 * fallthrough), keeping `tm-root` first.
 */
export const TextMorph = defineComponent({
  name: 'TextMorph',
  props: {
    from: { type: String as PropType<string>, required: true },
    to: { type: String as PropType<string>, required: true },
    timing: { type: Object as PropType<Partial<MorphTiming>>, default: undefined },
    autoPlay: { type: Boolean, default: true },
    // `type: Boolean` with an explicit `undefined` default preserves a true
    // tri-state (true / false / unset). "Unset" lets the controller auto-detect
    // reduced motion via matchMedia instead of being forced off.
    instant: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    prefersReducedMotion: {
      type: Boolean as PropType<boolean | undefined>,
      default: undefined,
    },
    reserveLayout: {
      type: String as PropType<ReserveLayout>,
      default: 'both',
      validator: (value: ReserveLayout) => RESERVE_LAYOUTS.includes(value),
    },
    onDone: { type: Function as PropType<(() => void) | undefined>, default: undefined },
  },
  setup(props, { expose }) {
    const { state, play, pause, reset, finish } = useTextMorph({
      from: () => props.from,
      to: () => props.to,
      timing: () => props.timing,
      autoPlay: () => props.autoPlay,
      instant: () => props.instant,
      prefersReducedMotion: () => props.prefersReducedMotion,
      // Read through the reactive props proxy so a swapped handler is always current.
      onDone: () => props.onDone?.(),
    });

    // Imperative controls for parents holding a template ref.
    expose({ play, pause, reset, finish });

    return () => {
      const snapshot: RenderState = state.value;
      const tokens = getRenderTokens(snapshot);

      const layerChildren = tokens.map(renderToken);

      const reserveChildren = getReserveTexts(
        props.reserveLayout,
        props.from,
        props.to,
      ).map((text) => h('span', text));

      return h('span', { class: 'tm-root' }, [
        h('span', { class: 'tm-reserve', 'aria-hidden': 'true' }, reserveChildren),
        h('span', { class: 'tm-layer', 'aria-hidden': 'true' }, layerChildren),
        h('span', { class: 'tm-sr-only' }, props.to),
      ]);
    };
  },
});
