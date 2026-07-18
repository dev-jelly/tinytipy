import { graphemes } from './graphemes';

/**
 * Hangul (Korean) IME composition.
 *
 * A fully-composed Hangul syllable (U+AC00..U+D7A3) is built from a leading
 * consonant (초성), a vowel (중성), and an optional trailing consonant (종성).
 * To mimic real Korean typing we don't reveal the finished syllable at once;
 * instead we accumulate it: first the lone 초성, then the 초성+중성 syllable,
 * then (if there is a 받침) the completed syllable.
 *
 * Non-Hangul graphemes (spaces, latin, digits, punctuation, emoji) each become
 * a single frame, so "FP8" types one glyph at a time and "20%" types frame by
 * frame too.
 *
 * Each frame returned is the *accumulated* text of the whole input up to that
 * point — e.g. buildCompositionFrames("최근") yields
 *   ["ㅊ", "최", "최ㄱ", "최그", "최근"].
 */

const HANGUL_S_BASE = 0xac00;
const HANGUL_S_END = 0xd7a3;
const VOWEL_COUNT = 21;
const TRAILING_COUNT = 28;
const FACTOR = VOWEL_COUNT * TRAILING_COUNT; // 588

// Compatibility Jamo for the lone-초성 frame (matches how a real IME previews).
const LEADS = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ',
  'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

interface HangulParts {
  lead: number;
  vowel: number;
  trailing: number;
}

function decomposeHangul(codePoint: number): HangulParts | null {
  if (codePoint < HANGUL_S_BASE || codePoint > HANGUL_S_END) return null;
  const offset = codePoint - HANGUL_S_BASE;
  const lead = Math.floor(offset / FACTOR);
  const vowel = Math.floor((offset % FACTOR) / TRAILING_COUNT);
  const trailing = offset % TRAILING_COUNT;
  return { lead, vowel, trailing };
}

function syllable(lead: number, vowel: number, trailing: number): string {
  return String.fromCodePoint(HANGUL_S_BASE + lead * FACTOR + vowel * TRAILING_COUNT + trailing);
}

/**
 * Build the cumulative composition-frame sequence for `text`.
 * The first element is the first partial; the last element equals `text`
 * (unless `text` is empty, in which case the result is empty).
 */
export function buildCompositionFrames(text: string): string[] {
  if (text.length === 0) return [];
  // NFC so decomposed (NFD) Hangul is composed before splitting into graphemes;
  // otherwise L+V+T Jamo clusters collapse to a single frame and skip the IME
  // build-up. NFC is a no-op for already-composed text, ASCII, and emoji.
  const normalized = text.normalize('NFC');
  const frames: string[] = [];
  let acc = '';

  for (const grapheme of graphemes(normalized)) {
    const codePoint = grapheme.codePointAt(0);
    const parts = codePoint === undefined ? null : decomposeHangul(codePoint);

    if (parts) {
      const leadChar = LEADS[parts.lead] ?? grapheme;
      frames.push(acc + leadChar);
      if (parts.trailing === 0) {
        // No 받침: the 초성+중성 syllable is already the finished glyph.
        acc += grapheme;
        frames.push(acc);
      } else {
        frames.push(acc + syllable(parts.lead, parts.vowel, 0));
        acc += grapheme;
        frames.push(acc);
      }
    } else {
      acc += grapheme;
      frames.push(acc);
    }
  }

  return frames;
}

/** The number of typing frames for `text` (without allocating the frames). */
export function compositionFrameCount(text: string): number {
  if (text.length === 0) return 0;
  const normalized = text.normalize('NFC');
  let count = 0;
  for (const grapheme of graphemes(normalized)) {
    const codePoint = grapheme.codePointAt(0);
    const parts = codePoint === undefined ? null : decomposeHangul(codePoint);
    if (parts) {
      // lead frame + (lv frame when 받침) + final frame => 2 or 3 frames.
      count += parts.trailing === 0 ? 2 : 3;
    } else {
      count += 1;
    }
  }
  return count;
}
