/// <reference lib="webworker" />
/**
 * mCompositeBeamDesign calculation worker: the worksheet runs here so typing and
 * scrolling stay responsive while it recalculates (no long task on the main thread).
 */
import raw from '../../../templates/Composite_Beam_EC4.mCCV?raw';
import { CompositeModel, DEFLECTION_CHECKS, governingCheck } from './model';

export type ToWorker =
  | { kind: 'input'; id: string; value: number }
  | { kind: 'section'; id: number }
  | { kind: 'table'; id: string; rows: string[][] }
  | { kind: 'report'; request: number } | { kind: 'hello' }
  | { kind: 'optimize'; family: string; maxDepth: number | null }
  // optimizer pool: copy the page's inputs, then check one section at a time
  | { kind: 'state'; values: Record<string, number>; tables: { id: string; rows: string[][] }[] }
  | { kind: 'evaluate'; id: number; token: number };

export type { OptimizeResult } from './model';

const model = new CompositeModel(raw);
let screen: CompositeModel | null = null; // optimiser pool only: fast rejection without the deflection curves
const post = (msg: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

let pending = false;
self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.kind === 'hello') return post({ kind: 'init', inputs: model.inputs, tables: model.tables, sectionId: model.sectionId, results: model.results() });
  if (m.kind === 'state') {
    screen ??= new CompositeModel(raw, { screening: true });
    for (const x of [model, screen]) {
      for (const f of x.inputs) x.setInput(f.id, m.values[f.id] ?? f.value);
      for (const t of m.tables) x.setTableRows(t.id, t.rows);
    }
    return;
  }
  if (m.kind === 'evaluate') {
    // 1. screening model: a check other than deflection above 1 fails the section for certain
    if (screen) {
      screen.setSection(m.id);
      const s = screen.results();
      const g = s.errors.length ? null : governingCheck(s, DEFLECTION_CHECKS);
      if (g && g.ur > 1) return post({ kind: 'evaluated', token: m.token, id: m.id, ur: g.ur, label: g.label, screened: true });
    }
    // 2. full worksheet
    model.setSection(m.id);
    const r = model.results();
    const g = r.errors.length ? { ur: Infinity, label: 'worksheet error' } : governingCheck(r);
    return post({ kind: 'evaluated', token: m.token, id: m.id, ur: g.ur, label: g.label });
  }
  if (m.kind === 'input') model.setInput(m.id, m.value);
  else if (m.kind === 'section') model.setSection(m.id);
  else if (m.kind === 'table') model.setTableRows(m.id, m.rows);
  else if (m.kind === 'report') return post({ kind: 'report', request: m.request, doc: model.reportDocument() });
  else if (m.kind === 'optimize') post({ kind: 'opt-done', result: model.optimizeSection(m.family, (i, n, name) => post({ kind: 'opt-progress', i, n, name }), m.maxDepth) });
  // Several edits in a row: calculate once, after the queue is empty.
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    post({ kind: 'results', results: model.results(), tables: model.tables, sectionId: model.sectionId });
  }, 0);
};
