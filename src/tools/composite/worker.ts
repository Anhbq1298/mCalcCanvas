/// <reference lib="webworker" />
/**
 * mCompositeBeamDesign calculation worker: the worksheet runs here so typing and
 * scrolling stay responsive while it recalculates (no long task on the main thread).
 */
import template from '../../../templates/Composite_Beam_EC4.mCCV?raw';
import { CompositeModel, designSection, withPageDefaults, type DesignCriteria } from './model';

export type ToWorker =
  | { kind: 'input'; id: string; value: number }
  | { kind: 'section'; id: number }
  | { kind: 'table'; id: string; rows: string[][] }
  | { kind: 'report'; request: number } | { kind: 'hello' }
  // optimizer pool: copy the page's inputs, then check one section at a time
  | { kind: 'state'; values: Record<string, number>; tables: { id: string; rows: string[][] }[] }
  // design engine: one section per message (camber, fewest studs, smallest bar)
  | { kind: 'design'; id: number; mode: 'composite' | 'bare'; token: number; criteria: DesignCriteria }

export type { OptimizeResult } from './model';

const raw = withPageDefaults(template); // the page opens with its own default case
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
  if (m.kind === 'design') return post({ kind: 'designed', token: m.token, id: m.id, design: designSection(model, screen, m.id, m.criteria, m.mode) });
  if (m.kind === 'input') model.setInput(m.id, m.value);
  else if (m.kind === 'section') model.setSection(m.id);
  else if (m.kind === 'table') model.setTableRows(m.id, m.rows);
  else if (m.kind === 'report') return post({ kind: 'report', request: m.request, doc: model.reportDocument() });
  // Several edits in a row: calculate once, after the queue is empty.
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    post({ kind: 'results', results: model.results(), tables: model.tables, sectionId: model.sectionId });
  }, 0);
};
