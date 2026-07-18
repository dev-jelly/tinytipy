import { graphemes } from './graphemes';
import type { Segment, SegmentType } from './types';

/**
 * Diff two strings into a minimal list of {@link Segment}s at grapheme
 * granularity.
 *
 * Implementation: a classic LCS dynamic-programming pass (filled from the
 * bottom-right), then a forward walk that emits equal / delete / insert ops.
 * Because equal graphemes are preserved in place, only the genuinely changed
 * regions become `delete` / `insert` runs — which is exactly what the morph
 * planner needs to animate "only the changed parts".
 *
 * Cost is O(n·m) time and space. For typical morph targets (sentences) this is
 * trivial; for pathological inputs we fall back to a coarse whole-replacement
 * diff so memory stays bounded.
 */
export function diffText(from: string, to: string): Segment[] {
  const a = graphemes(from);
  const b = graphemes(to);
  const n = a.length;
  const m = b.length;

  if (n === 0) return m === 0 ? [] : [{ type: 'insert', text: b.join('') }];
  if (m === 0) return [{ type: 'delete', text: a.join('') }];

  // Bounded fallback: avoid allocating an enormous DP table.
  const MAX_CELLS = 1_000_000;
  if (n * m > MAX_CELLS) {
    const segs: Segment[] = [];
    segs.push({ type: 'delete', text: a.join('') });
    segs.push({ type: 'insert', text: b.join('') });
    return segs;
  }

  // dp[i][j] = length of LCS of a[i..] and b[j..]
  const dp: Uint32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i];
    const next = dp[i + 1];
    const ai = a[i];
    for (let j = m - 1; j >= 0; j--) {
      if (ai === b[j]) {
        row[j] = next[j + 1] + 1;
      } else {
        const down = next[j];
        const right = row[j + 1];
        row[j] = down >= right ? down : right;
      }
    }
  }

  // Forward walk producing per-grapheme ops.
  const ops: Array<{ type: SegmentType; g: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', g: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // Prefer delete-first so a change renders as erase-then-type.
      ops.push({ type: 'delete', g: a[i] });
      i++;
    } else {
      ops.push({ type: 'insert', g: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'delete', g: a[i++] });
  while (j < m) ops.push({ type: 'insert', g: b[j++] });

  // Coalesce consecutive ops of the same type into segments.
  const segments: Segment[] = [];
  for (const op of ops) {
    const last = segments.length - 1 >= 0 ? segments[segments.length - 1] : null;
    if (last && last.type === op.type) {
      (last as { text: string }).text += op.g;
    } else {
      segments.push({ type: op.type, text: op.g });
    }
  }
  return segments;
}
