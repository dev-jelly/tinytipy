import { describe, expect, it } from 'vitest';
import { getRenderTokens, getReserveTexts, planMorph } from '../src/index';
import type { RenderState } from '../src/types';

describe('getRenderTokens', () => {
  it('emits a run token per run with no cursor when idle', () => {
    const { initial } = planMorph({ from: 'abc', to: 'abc' });
    const tokens = getRenderTokens(initial);
    expect(tokens.every((t) => t.type === 'run')).toBe(true);
  });

  it('inserts exactly one cursor token after the active run', () => {
    const { steps } = planMorph({ from: '기운', to: '기온' });
    const editing = steps.find((s) => !s.state.done && s.state.cursorRunId !== null)!.state;
    const tokens = getRenderTokens(editing);
    const cursors = tokens.filter((t) => t.type === 'cursor');
    expect(cursors).toHaveLength(1);
    const idx = tokens.findIndex((t) => t.type === 'cursor');
    const prev = tokens[idx - 1];
    expect(prev.type).toBe('run');
    expect(prev.id).toBe(editing.cursorRunId);
  });

  it('appends exactly one cursor after the resolved text', () => {
    const { final } = planMorph({ from: '기운', to: '기온' });
    const tokens = getRenderTokens(final);
    expect(tokens.filter((token) => token.type === 'cursor')).toHaveLength(1);
    expect(tokens.at(-1)).toEqual({ type: 'cursor' });
  });

  it('renders a completion cursor for an empty resolved string', () => {
    const { final } = planMorph({ from: 'text', to: '' });
    const tokens = getRenderTokens(final);
    expect(tokens.at(-1)).toEqual({ type: 'cursor' });
  });

  it('preserves run order and carries kind/status', () => {
    const state: RenderState = {
      runs: [
        { id: 'a', kind: 'keep', finalText: 'x', text: 'x', status: 'done' },
        { id: 'b', kind: 'remove', finalText: 'y', text: 'y', status: 'pending' },
      ],
      cursorRunId: 'b',
      cursorOffset: 1,
      done: false,
    };
    const tokens = getRenderTokens(state);
    expect(tokens.map((t) => (t.type === 'run' ? `${t.kind}:${t.id}` : 'cursor'))).toEqual([
      'keep:a',
      'remove:b',
      'cursor',
    ]);
  });
});

describe('getReserveTexts', () => {
  const from = 'AAAA';
  const to = 'BBBB';
  it('returns both for "both"', () => {
    expect(getReserveTexts('both', from, to)).toEqual([from, to]);
  });
  it('returns only to for "to"', () => {
    expect(getReserveTexts('to', from, to)).toEqual([to]);
  });
  it('returns only from for "from"', () => {
    expect(getReserveTexts('from', from, to)).toEqual([from]);
  });
  it('returns none for "none"', () => {
    expect(getReserveTexts('none', from, to)).toEqual([]);
  });
});
