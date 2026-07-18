import { describe, expect, it } from 'vitest';
import { diffText } from '../src/diff';

function reconstruct(segments: ReturnType<typeof diffText>) {
  let from = '';
  let to = '';
  for (const s of segments) {
    if (s.type === 'equal' || s.type === 'delete') from += s.text;
    if (s.type === 'equal' || s.type === 'insert') to += s.text;
  }
  return { from, to };
}

describe('diffText', () => {
  it('returns no segments when both sides are empty', () => {
    expect(diffText('', '')).toEqual([]);
  });

  it('returns a single insert when from is empty', () => {
    expect(diffText('', 'abc')).toEqual([{ type: 'insert', text: 'abc' }]);
  });

  it('returns a single delete when to is empty', () => {
    expect(diffText('abc', '')).toEqual([{ type: 'delete', text: 'abc' }]);
  });

  it('returns a single equal segment when strings match', () => {
    expect(diffText('abc', 'abc')).toEqual([{ type: 'equal', text: 'abc' }]);
  });

  it('coalesces consecutive same-type ops into one segment', () => {
    const segs = diffText('hello', 'help');
    // h e l equal, l->p change at the end
    expect(reconstruct(segs)).toEqual({ from: 'hello', to: 'help' });
    expect(segs.some((s) => s.type === 'equal' && s.text === 'hel')).toBe(true);
    expect(segs.some((s) => s.type === 'delete' && s.text === 'lo')).toBe(true);
    expect(segs.some((s) => s.type === 'insert' && s.text === 'p')).toBe(true);
  });

  it('only changes the differing grapheme when the rest is shared (Korean)', () => {
    const segs = diffText('기운', '기온');
    expect(reconstruct(segs)).toEqual({ from: '기운', to: '기온' });
    const dels = segs.filter((s) => s.type === 'delete').map((s) => s.text).join('');
    const ins = segs.filter((s) => s.type === 'insert').map((s) => s.text).join('');
    expect(dels).toBe('운');
    expect(ins).toBe('온');
    expect(segs.some((s) => s.type === 'equal' && s.text === '기')).toBe(true);
  });

  it('handles a full multi-word Korean sentence correction', () => {
    const from = '현재 평균 응답 시간은 3초 정도이고, 최적화 이후 처리 속도가 기존보다 2% 정도 빨라졌습니다.';
    const to = '현재 평균 응답 시간은 300ms 정도이고, 최적화 이후 처리 속도가 기존보다 20% 정도 빨라졌습니다.';
    const segs = diffText(from, to);
    expect(reconstruct(segs)).toEqual({ from, to });
    // The shared spans should survive as equal runs.
    expect(segs.some((s) => s.type === 'equal' && s.text.includes('응답 시간은'))).toBe(true);
    expect(segs.some((s) => s.type === 'equal' && s.text.includes('최적화 이후'))).toBe(true);
  });

  it('treats an emoji as a single grapheme unit', () => {
    const segs = diffText('a👍b', 'a🚀b');
    expect(reconstruct(segs)).toEqual({ from: 'a👍b', to: 'a🚀b' });
    expect(segs.some((s) => s.type === 'delete' && s.text === '👍')).toBe(true);
    expect(segs.some((s) => s.type === 'insert' && s.text === '🚀')).toBe(true);
    expect(segs.filter((s) => s.type === 'equal').map((s) => s.text).join('')).toBe('ab');
  });

  it('falls back to coarse replacement for very large inputs', () => {
    const from = 'a'.repeat(2000);
    const to = 'b'.repeat(2000);
    const segs = diffText(from, to);
    expect(segs.length).toBe(2);
    expect(segs[0].type).toBe('delete');
    expect(segs[1].type).toBe('insert');
  });

  it('preserves insertion order for pure appends', () => {
    const segs = diffText('abc', 'abcdef');
    expect(reconstruct(segs)).toEqual({ from: 'abc', to: 'abcdef' });
    expect(segs).toEqual([
      { type: 'equal', text: 'abc' },
      { type: 'insert', text: 'def' },
    ]);
  });
});
