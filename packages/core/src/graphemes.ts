/**
 * Grapheme-aware string splitting.
 *
 * Diffing and typing must operate on user-perceived characters, not UTF-16
 * code units, so that emoji, surrogate pairs, and combining marks survive
 * intact. We prefer the platform `Intl.Segmenter` and fall back to code-point
 * iteration where it is unavailable (older runtimes / SSR without polyfill).
 */

let segmenter: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
  if (segmenter !== undefined) return segmenter;
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    } else {
      segmenter = null;
    }
  } catch {
    segmenter = null;
  }
  return segmenter;
}

/** Split `input` into an array of grapheme clusters. */
export function graphemes(input: string): string[] {
  if (input.length === 0) return [];
  const seg = getSegmenter();
  if (seg) {
    const out: string[] = [];
    for (const part of seg.segment(input)) out.push(part.segment);
    return out;
  }
  // Fallback: iterate by code point. Correct for astral planes, approximate
  // for combining sequences (acceptable where Segmenter is unavailable).
  return Array.from(input);
}

/** Count grapheme clusters in `input`. */
export function graphemeLength(input: string): number {
  if (input.length === 0) return 0;
  const seg = getSegmenter();
  if (seg) {
    let n = 0;
    for (const _ of seg.segment(input)) n++;
    return n;
  }
  let n = 0;
  for (const _ of input) n++;
  return n;
}
