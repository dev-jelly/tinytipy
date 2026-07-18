// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { TextMorphController } from '@dev-jelly/tinytipy';
import { TextMorph, useTextMorph } from '../src';

/** Concatenate the visible text of every run in a snapshot. */
function visible(el: Element): string {
  return Array.from(el.querySelectorAll('.tm-run'))
    .map((n) => n.textContent ?? '')
    .join('');
}

describe('@dev-jelly/tinytipy-vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('<TextMorph> component', () => {
    it('renders `from` initially', () => {
      const wrapper = mount(TextMorph, {
        props: { from: 'Hello', to: 'Help' },
      });

      expect(visible(wrapper.element)).toBe('Hello');
      // The screen-reader copy always holds the FINAL `to` text.
      expect(wrapper.find('.tm-sr-only').text()).toBe('Help');
      // No cursor before playback advances.
      expect(wrapper.find('.tm-cursor').exists()).toBe(false);
    });

    it('keeps the root `tm-root` class and renders all three layers', () => {
      const wrapper = mount(TextMorph, {
        props: { from: 'ab', to: 'cd' },
      });

      const root = wrapper.element;
      expect(root.classList.contains('tm-root')).toBe(true);
      expect(wrapper.find('.tm-reserve').exists()).toBe(true);
      expect(wrapper.find('.tm-layer').exists()).toBe(true);
      expect(wrapper.find('.tm-sr-only').exists()).toBe(true);
    });

    it('animates to `to` when time advances', async () => {
      const wrapper = mount(TextMorph, {
        props: { from: 'ab', to: 'cd', timing: { settleMs: 0 } },
      });

      expect(visible(wrapper.element)).toBe('ab');

      // Run every scheduled step, then let Vue flush the re-render.
      vi.runAllTimers();
      await nextTick();

      expect(visible(wrapper.element)).toBe('cd');
    });

    it('shows a cursor while editing and keeps it at the end', async () => {
      const wrapper = mount(TextMorph, {
        props: { from: 'ab', to: 'cd' },
      });

      expect(wrapper.find('.tm-cursor').exists()).toBe(false);

      // initialDelayMs is 240ms; advance just past the first "mark" step so the
      // cursor anchors to the active run.
      vi.advanceTimersByTime(250);
      await nextTick();

      expect(wrapper.find('.tm-cursor').exists()).toBe(true);
      const cursor = wrapper.find('.tm-cursor').element;
      expect(cursor.getAttribute('aria-hidden')).toBe('true');

      // Resolve to the final state: cursor moves after the resolved text.
      vi.runAllTimers();
      await nextTick();

      expect(wrapper.find('.tm-cursor').exists()).toBe(true);
      expect(wrapper.find('.tm-layer').element.lastElementChild).toBe(
        wrapper.find('.tm-cursor').element,
      );
    });

    it('emits run spans with the right kind class and data-status', () => {
      const wrapper = mount(TextMorph, {
        props: { from: 'ab', to: 'cd' },
      });

      // diff('ab','cd') => [remove 'ab', add 'cd']; initial hides the add run.
      const runs = wrapper.findAll('.tm-run');
      expect(runs.length).toBe(2);
      expect(runs[0].classes()).toContain('tm-run--remove');
      expect(runs[0].attributes('data-status')).toBe('pending');
      expect(runs[1].classes()).toContain('tm-run--add');
      // add run has empty text initially.
      expect((runs[1].element.textContent ?? '')).toBe('');
    });

    it('renders the reserve layer with both texts by default', () => {
      const wrapper = mount(TextMorph, {
        props: { from: 'Hello', to: 'Help' },
      });

      const reserve = wrapper.find('.tm-reserve');
      expect(reserve.attributes('aria-hidden')).toBe('true');
      // 'both' stacks two hidden spans: from + to.
      expect(reserve.findAll('span').length).toBe(2);
      expect(reserve.text()).toBe('HelloHelp');
    });

    it('respects reserveLayout variants', () => {
      const onlyTo = mount(TextMorph, {
        props: { from: 'Hello', to: 'Help', reserveLayout: 'to' },
      });
      expect(onlyTo.find('.tm-reserve').text()).toBe('Help');

      const onlyFrom = mount(TextMorph, {
        props: { from: 'Hello', to: 'Help', reserveLayout: 'from' },
      });
      expect(onlyFrom.find('.tm-reserve').text()).toBe('Hello');

      const none = mount(TextMorph, {
        props: { from: 'Hello', to: 'Help', reserveLayout: 'none' },
      });
      expect(none.find('.tm-reserve').findAll('span').length).toBe(0);
      expect(none.find('.tm-reserve').text()).toBe('');
    });

    it('marks reserve + layer as aria-hidden, keeps sr-only visible', () => {
      const wrapper = mount(TextMorph, {
        props: { from: 'ab', to: 'cd' },
      });

      expect(wrapper.find('.tm-reserve').attributes('aria-hidden')).toBe('true');
      expect(wrapper.find('.tm-layer').attributes('aria-hidden')).toBe('true');
      // sr-only must NOT be aria-hidden so AT can read the destination.
      expect(wrapper.find('.tm-sr-only').attributes('aria-hidden')).toBeFalsy();
    });

    it('passes an extra class through to the root (keeping tm-root)', () => {
      const wrapper = mount(TextMorph, {
        props: { from: 'ab', to: 'cd' },
        attrs: { class: 'extra-class' },
      });

      expect(wrapper.element.classList.contains('tm-root')).toBe(true);
      expect(wrapper.element.classList.contains('extra-class')).toBe(true);
    });

    it('reuses one controller: changing from/to re-plans without remount', async () => {
      const wrapper = mount(TextMorph, {
        props: { from: 'a', to: 'b', timing: { settleMs: 0 } },
      });

      await wrapper.setProps({ from: 'x', to: 'y' });
      await nextTick();

      // setPair resets to the new `from` initial before playback advances.
      expect(visible(wrapper.element)).toBe('x');

      vi.runAllTimers();
      await nextTick();

      expect(visible(wrapper.element)).toBe('y');
    });

    it('exposes imperative controls via template ref', async () => {
      const wrapper = mount(TextMorph, {
        props: { from: 'ab', to: 'cd', autoPlay: false },
      });

      const vm = wrapper.vm as unknown as {
        play: () => void;
        finish: () => void;
      };

      expect(visible(wrapper.element)).toBe('ab');

      vm.finish();
      await nextTick();
      expect(visible(wrapper.element)).toBe('cd');
    });

    it('cleans up the controller on unmount (no leak, no throw)', () => {
      // vi.spyOn calls through to the original implementation by default.
      const destroySpy = vi.spyOn(TextMorphController.prototype, 'destroy');

      const wrapper = mount(TextMorph, {
        props: { from: 'ab', to: 'cd' },
      });

      expect(destroySpy).not.toHaveBeenCalled();

      wrapper.unmount();

      expect(destroySpy).toHaveBeenCalledTimes(1);

      // After destroy, timers are cancelled — advancing the clock is a no-op
      // and must not throw any listener callback.
      expect(() => vi.runAllTimers()).not.toThrow();

      destroySpy.mockRestore();
    });

    it('fires onDone exactly once when the morph completes', async () => {
      const onDone = vi.fn();
      const wrapper = mount(TextMorph, {
        props: { from: 'ab', to: 'cd', timing: { settleMs: 0 }, onDone },
      });

      vi.runAllTimers();
      await nextTick();

      expect(onDone).toHaveBeenCalledTimes(1);
      expect(visible(wrapper.element)).toBe('cd');
    });
  });

  describe('useTextMorph() composable', () => {
    it('exposes a reactive state and imperative controls', async () => {
      const from = ref('a');
      const to = ref('b');
      const destroySpy = vi.spyOn(TextMorphController.prototype, 'destroy');

      const scope = effectScope();
      const result = scope.run(() =>
        useTextMorph({
          from,
          to,
          timing: { settleMs: 0 },
        }),
      )!;

      expect(result.state.value.runs.map((r) => r.text).join('')).toBe('a');

      result.play();
      vi.runAllTimers();
      await nextTick();

      expect(result.state.value.runs.map((r) => r.text).join('')).toBe('b');
      expect(result.state.value.done).toBe(true);

      // Stopping the owning scope must tear down the controller.
      expect(destroySpy).not.toHaveBeenCalled();
      scope.stop();
      expect(destroySpy).toHaveBeenCalledTimes(1);

      // And subsequent operations must not throw.
      expect(() => result.controller.snapshot).not.toThrow();

      destroySpy.mockRestore();
    });

    it('re-plans reactively when from/to change (autoPlay replays)', async () => {
      const from = ref('a');
      const to = ref('b');

      const scope = effectScope();
      const result = scope.run(() =>
        useTextMorph({ from, to, timing: { settleMs: 0 } }),
      )!;

      // Change the pair: the watcher calls setPair, resetting to the new `from`.
      from.value = 'x';
      to.value = 'y';
      await nextTick();

      expect(result.state.value.runs.map((r) => r.text).join('')).toBe('x');

      vi.runAllTimers();
      await nextTick();

      expect(result.state.value.runs.map((r) => r.text).join('')).toBe('y');

      scope.stop();
    });

    it('renders via a hand-built component using the composable', async () => {
      const Plain = {
        setup() {
          const { state } = useTextMorph({
            from: 'ab',
            to: 'cd',
            timing: { settleMs: 0 },
          });
          return () =>
            h('span', { class: 'plain' }, state.value.runs.map((r) => r.text).join(''));
        },
      };

      const wrapper = mount(Plain);
      expect(wrapper.text()).toBe('ab');

      vi.runAllTimers();
      await nextTick();

      expect(wrapper.text()).toBe('cd');
    });
  });
});
