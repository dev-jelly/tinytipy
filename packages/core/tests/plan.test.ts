import { describe, expect, it } from 'vitest';
import { planMorph } from '../src/plan';
import type { RenderState } from '../src/types';

function visible(state: RenderState): string {
  return state.runs.map((r) => r.text).join('');
}

describe('planMorph', () => {
  it('renders `from` initially and `to` finally', () => {
    const plan = planMorph({ from: '기운', to: '기온' });
    expect(visible(plan.initial)).toBe('기운');
    expect(visible(plan.final)).toBe('기온');
  });

  it('is a no-op (empty steps) when from equals to', () => {
    const plan = planMorph({ from: 'same', to: 'same' });
    expect(plan.noOp).toBe(true);
    expect(plan.steps).toEqual([]);
    expect(visible(plan.initial)).toBe('same');
  });

  it('has the cursor anchored while editing and cleared at the end', () => {
    const plan = planMorph({ from: '기운', to: '기온' });
    const editing = plan.steps.filter((s) => !s.state.done);
    expect(editing.length).toBeGreaterThan(0);
    for (const step of editing) {
      expect(step.state.cursorRunId).not.toBeNull();
    }
    // Final step resolves done with no cursor.
    const last = plan.steps[plan.steps.length - 1];
    expect(last.state.done).toBe(true);
    expect(last.state.cursorRunId).toBeNull();
  });

  it('ends every plan on the `to` text', () => {
    const cases = [
      ['abc', 'abcdef'],
      ['abcdef', 'abc'],
      ['기운', '기온'],
      ['3초 정도', '300ms 정도'],
    ] as const;
    for (const [from, to] of cases) {
      const plan = planMorph({ from, to });
      expect(visible(plan.steps[plan.steps.length - 1].state)).toBe(to);
    }
  });

  it('keeps run ids stable across all snapshots', () => {
    const plan = planMorph({ from: 'hello world', to: 'hallo welt' });
    const ids = plan.initial.runs.map((r) => r.id);
    for (const step of plan.steps) {
      expect(step.state.runs.map((r) => r.id)).toEqual(ids);
    }
    expect(plan.final.runs.map((r) => r.id)).toEqual(ids);
  });

  it('only marks changed runs as pending initially', () => {
    const plan = planMorph({ from: '기운', to: '기온' });
    // keep run (기) is done; remove (운) and add (온) are pending.
    const pendingKinds = plan.initial.runs
      .filter((r) => r.status === 'pending')
      .map((r) => r.kind)
      .sort();
    expect(pendingKinds).toEqual(['add', 'remove']);
    const doneKinds = plan.initial.runs
      .filter((r) => r.status === 'done')
      .map((r) => r.kind);
    expect(doneKinds).toContain('keep');
  });

  it('respects custom timing in step delays', () => {
    const plan = planMorph({
      from: 'ab',
      to: 'cd',
      timing: { erasePerCharMs: 10, typePerFrameMs: 7, initialDelayMs: 1, hunkDelayMs: 2, pauseBeforeTypingMs: 3, settleMs: 5 },
    });
    const delays = plan.steps.map((s) => s.delayMs);
    expect(delays[0]).toBe(1); // initialDelay before first edit
    expect(delays.includes(10)).toBe(true); // erase per char
    expect(delays[delays.length - 1]).toBe(5); // settle
  });

  it('types a pure insertion from a completely empty state', () => {
    const plan = planMorph({ from: '', to: '새 문장' });
    expect(visible(plan.initial)).toBe('');
    expect(visible(plan.final)).toBe('새 문장');
    const hasRemove = plan.initial.runs.some((r) => r.kind === 'remove');
    expect(hasRemove).toBe(false);
    expect(
      plan.steps.some((step) => {
        const text = visible(step.state);
        return text.length > 0 && text !== '새 문장';
      }),
    ).toBe(true);
  });

  it('handles a pure deletion (no inserts)', () => {
    const plan = planMorph({ from: 'hello!', to: 'hello' });
    expect(visible(plan.initial)).toBe('hello!');
    expect(visible(plan.final)).toBe('hello');
    const hasAdd = plan.initial.runs.some((r) => r.kind === 'add');
    expect(hasAdd).toBe(false);
  });

  it('marks every run as done in the final snapshot', () => {
    for (const [from, to] of [
      ['abcdef', 'abc'],
      ['abc', 'abcdef'],
      ['기운', '기온'],
      ['3초 정도', '300ms 정도'],
    ] as const) {
      const plan = planMorph({ from, to });
      const allDone = plan.final.runs.every((r) => r.status === 'done');
      expect(allDone).toBe(true);
    }
  });

  it('transitions a remove run to done once it is fully erased', () => {
    const plan = planMorph({ from: 'abcdef', to: 'abc' });
    const removeId = plan.initial.runs.find((r) => r.kind === 'remove')!.id;
    const removeSnapshots = plan.steps.map(
      (s) => s.state.runs.find((r) => r.id === removeId)!,
    );
    // starts pending, ends done
    expect(plan.initial.runs.find((r) => r.id === removeId)!.status).toBe('pending');
    expect(removeSnapshots[removeSnapshots.length - 1].status).toBe('done');
    expect(removeSnapshots[removeSnapshots.length - 1].text).toBe('');
  });
});
