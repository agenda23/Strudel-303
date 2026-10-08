import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

/**
 * Strudel-style active-step highlighting.
 * Every hap produced by the mini-notation carries `context.locations` ({start, end} offsets into the
 * evaluated code). Haps that are active "now" are marked in the editor.
 */
const setActive = StateEffect.define<DecorationSet>();

export const activeStepField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setActive)) return e.value;
    return tr.docChanged ? Decoration.none : value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const activeStepTheme = EditorView.baseTheme({
  '.cm-active-step': {
    backgroundColor: 'rgba(57, 255, 20, 0.28)',
    outline: '1px solid rgba(57, 255, 20, 0.7)',
    borderRadius: '2px',
  },
});

const mark = Decoration.mark({ class: 'cm-active-step' });

export interface SchedulerLike {
  now(): number;
  pattern?: { queryArc(begin: number, end: number): any[] };
}

export function startHighlighter(
  view: EditorView,
  getScheduler: () => SchedulerLike | null,
  getEvaluatedCode: () => string | null,
): () => void {
  let raf = 0;
  let last = 0;
  let hadMarks = false;

  const frame = (ts: number) => {
    raf = requestAnimationFrame(frame);
    if (ts - last < 33) return;
    last = ts;

    const scheduler = getScheduler();
    const code = getEvaluatedCode();
    const clear = () => {
      if (hadMarks) {
        view.dispatch({ effects: setActive.of(Decoration.none) });
        hadMarks = false;
      }
    };
    if (!scheduler?.pattern || code === null || view.state.doc.toString() !== code) return clear();

    let haps: any[];
    try {
      const now = scheduler.now();
      haps = scheduler.pattern.queryArc(now, now + 1e-4);
    } catch {
      return clear();
    }

    const len = view.state.doc.length;
    const ranges = new Map<string, [number, number]>();
    for (const hap of haps) {
      if (!hap.whole) continue;
      for (const loc of hap.context?.locations ?? []) {
        const from = Number(loc.start);
        const to = Number(loc.end);
        if (Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to <= len && from < to) {
          ranges.set(`${from}:${to}`, [from, to]);
        }
      }
    }
    if (ranges.size === 0) return clear();

    const marks = [...ranges.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([f, t]) => mark.range(f, t));
    view.dispatch({ effects: setActive.of(Decoration.set(marks, true)) });
    hadMarks = true;
  };

  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
