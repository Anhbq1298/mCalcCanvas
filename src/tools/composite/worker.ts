/// <reference lib="webworker" />
/**
 * mCompositeBeamDesign calculation worker: the worksheet runs here so typing and
 * scrolling stay responsive while it recalculates (no long task on the main thread).
 */
import raw from '../../../templates/Composite_Beam_EC4.mCCV?raw';
import { CompositeModel } from './model';

export type ToWorker =
  | { kind: 'input'; id: string; value: number }
  | { kind: 'section'; id: number }
  | { kind: 'table'; id: string; rows: string[][] }
  | { kind: 'report'; request: number } | { kind: 'hello' }
  | { kind: 'optimize'; family: string };

export type { OptimizeResult } from './model';

const model = new CompositeModel(raw);
const post = (msg: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

let pending = false;
self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.kind === 'hello') return post({ kind: 'init', inputs: model.inputs, tables: model.tables, sectionId: model.sectionId, results: model.results() });
  if (m.kind === 'input') model.setInput(m.id, m.value);
  else if (m.kind === 'section') model.setSection(m.id);
  else if (m.kind === 'table') model.setTableRows(m.id, m.rows);
  else if (m.kind === 'report') return post({ kind: 'report', request: m.request, doc: model.reportDocument() });
  else if (m.kind === 'optimize') post({ kind: 'opt-done', result: model.optimizeSection(m.family, (i, n, name) => post({ kind: 'opt-progress', i, n, name })) });
  // Several edits in a row: calculate once, after the queue is empty.
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    post({ kind: 'results', results: model.results(), tables: model.tables, sectionId: model.sectionId });
  }, 0);
};
