import { buildCompositionFrames } from './composition';
import { diffText } from './diff';
import { graphemes } from './graphemes';
import { resolveTiming } from './timing';
import type {
  CursorAnchor,
  MorphOptions,
  MorphPlan,
  MorphStep,
  MorphTiming,
  RenderState,
  RunKind,
  RunState,
  RunStatus,
} from './types';

interface PlannedRun {
  id: string;
  kind: RunKind;
  finalText: string;
}

/**
 * Build a fully-described {@link MorphPlan} for morphing `from` into `to`.
 *
 * Pipeline:
 *   1. diffText(from, to)  -> ordered segments (equal / delete / insert)
 *   2. each segment becomes a render run (keep / remove / add) with a stable id
 *   3. we walk the runs in order, emitting timed steps:
 *        - keep runs are inert
 *        - remove runs erase one grapheme per step (cursor anchored at the tail)
 *        - add runs type one composition frame per step (Korean IME aware)
 *   4. a final settle step resolves `done`
 *
 * The first edit waits `initialDelayMs`; subsequent removes wait `hunkDelayMs`
 * (the "mark"); an add that directly follows a remove waits
 * `pauseBeforeTypingMs` instead. The plan is a pure value — the controller
 * only schedules it.
 */
export function planMorph(options: MorphOptions): MorphPlan {
  const timing: MorphTiming = resolveTiming(options.timing);
  // Normalize to NFC so decomposed Hangul (e.g. NFD Korean from macOS/HFS+ or
  // some DBs) is treated as its precomposed syllable. This keeps diff, the
  // composition frames, and the final text byte-for-byte consistent.
  const from = options.from.normalize('NFC');
  const to = options.to.normalize('NFC');
  const segments = diffText(from, to);
  const noOp = from === to;

  const runs: PlannedRun[] = segments.map((segment, index) => {
    const kind: RunKind =
      segment.type === 'equal' ? 'keep' : segment.type === 'delete' ? 'remove' : 'add';
    return { id: `r${index}`, kind, finalText: segment.text };
  });

  const runCount = runs.length;

  const statusFor = (kind: RunKind, text: string, finalText: string): RunStatus => {
    if (kind === 'keep') return 'done';
    if (kind === 'add') return text === finalText ? 'done' : 'pending';
    // remove: resolved once the run has been fully erased.
    return text.length === 0 ? 'done' : 'pending';
  };

  const snapshot = (texts: string[], cursor: CursorAnchor | null, done: boolean): RenderState => {
    const out: RunState[] = new Array(runCount);
    for (let k = 0; k < runCount; k++) {
      const run = runs[k];
      const text = texts[k];
      out[k] = {
        id: run.id,
        kind: run.kind,
        finalText: run.finalText,
        text,
        status: statusFor(run.kind, text, run.finalText),
      };
    }
    return {
      runs: out,
      cursorRunId: cursor ? cursor.id : null,
      cursorOffset: cursor ? cursor.offset : 0,
      done,
    };
  };

  // initial: renders `from`  (keep + remove shown, add hidden)
  const initialTexts = runs.map((r) => (r.kind === 'add' ? '' : r.finalText));
  // final: renders `to`      (keep + add shown, remove hidden)
  const finalTexts = runs.map((r) => (r.kind === 'remove' ? '' : r.finalText));

  const initial: RenderState = snapshot(initialTexts, null, false);
  const final: RenderState = snapshot(finalTexts, null, true);

  const steps: MorphStep[] = [];
  if (noOp) {
    return { initial, final, steps, noOp: true };
  }

  const texts = initialTexts.slice();
  let started = false;

  for (let idx = 0; idx < runCount; idx++) {
    const run = runs[idx];
    if (run.kind === 'keep') continue;

    const prev = idx > 0 ? runs[idx - 1] : null;

    if (run.kind === 'remove') {
      // "Mark" the hunk before we start erasing.
      const leadIn = started ? timing.hunkDelayMs : (started = true, timing.initialDelayMs);
      steps.push({
        delayMs: leadIn,
        state: snapshot(texts, { id: run.id, offset: texts[idx].length }, false),
      });

      const chars = graphemes(run.finalText);
      for (let k = chars.length - 1; k >= 0; k--) {
        texts[idx] = chars.slice(0, k).join('');
        steps.push({
          delayMs: timing.erasePerCharMs,
          state: snapshot(texts, { id: run.id, offset: texts[idx].length }, false),
        });
      }
      // Ensure the run is fully emptied even when it had no graphemes.
      texts[idx] = '';
    } else {
      // add: type one composition frame at a time.
      const leadIn = prev && prev.kind === 'remove'
        ? timing.pauseBeforeTypingMs
        : started ? timing.hunkDelayMs : timing.initialDelayMs;
      if (!started) started = true;

      const frames = buildCompositionFrames(run.finalText);
      if (frames.length === 0) {
        texts[idx] = run.finalText; // empty string
        continue;
      }
      steps.push({
        delayMs: leadIn,
        state: snapshot(texts, { id: run.id, offset: 0 }, false),
      });
      for (const frame of frames) {
        texts[idx] = frame;
        steps.push({
          delayMs: timing.typePerFrameMs,
          state: snapshot(texts, { id: run.id, offset: frame.length }, false),
        });
      }
    }
  }

  // Final settle resolves `done` and clears the active-run cursor anchor.
  // Renderers derive a completion cursor at the end of the resolved text.
  steps.push({ delayMs: timing.settleMs, state: snapshot(texts, null, true) });

  return { initial, final, steps, noOp: false };
}
