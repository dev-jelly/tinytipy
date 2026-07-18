import { describe, expect, it } from 'vitest';
import { buildCompositionFrames, compositionFrameCount } from '../src/composition';

describe('buildCompositionFrames', () => {
  it('returns an empty array for empty input', () => {
    expect(buildCompositionFrames('')).toEqual([]);
  });

  it('produces one frame per latin character', () => {
    expect(buildCompositionFrames('FP8')).toEqual(['F', 'FP', 'FP8']);
  });

  it('treats punctuation and digits as single frames', () => {
    expect(buildCompositionFrames('20%')).toEqual(['2', '20', '20%']);
  });

  it('composes a 받침-less syllable in two frames (최)', () => {
    expect(buildCompositionFrames('최')).toEqual(['ㅊ', '최']);
  });

  it('composes a 받침 syllable in three frames (근)', () => {
    expect(buildCompositionFrames('근')).toEqual(['ㄱ', '그', '근']);
  });

  it('accumulates the full word 최근 exactly like the reference effect', () => {
    expect(buildCompositionFrames('최근')).toEqual(['ㅊ', '최', '최ㄱ', '최그', '최근']);
  });

  it('ends on the exact input string', () => {
    const inputs = ['FP8', '최근', '안녕하세요', 'Hello 한국!', '20%'];
    for (const input of inputs) {
      const frames = buildCompositionFrames(input);
      expect(frames[frames.length - 1]).toBe(input);
    }
  });

  it('handles mixed Korean/ASCII/punctuation accumulation', () => {
    const frames = buildCompositionFrames('다 API');
    expect(frames).toEqual(['ㄷ', '다', '다 ', '다 A', '다 AP', '다 API']);
  });

  it('counts frames consistently with buildCompositionFrames', () => {
    for (const input of ['', 'FP8', '최근', '안녕', '증기압', 'Hello 한국!']) {
      expect(compositionFrameCount(input)).toBe(buildCompositionFrames(input).length);
    }
  });

  it('composes NFD-decomposed Hangul the same as precomposed NFC', () => {
    const nfc = '가';
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc); // sanity: actually decomposed
    expect(buildCompositionFrames(nfd)).toEqual(['ㄱ', '가']);

    const word = '안녕하세요';
    expect(buildCompositionFrames(word.normalize('NFD'))).toEqual(
      buildCompositionFrames(word),
    );
  });
});
