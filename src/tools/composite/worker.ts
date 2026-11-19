/// <reference lib="webworker" />
/**
 * mCompositeBeamDesign calculation worker: the worksheet runs here so typing and
 * scrolling stay responsive while it recalculates (no long task on the main thread).
 */
import template from '../../../templates/Composite_Beam_EC4.mCCV?raw';
import { applyCompositeState, CompositeModel, designSection, withPageDefaults, type ConstructionBracing, type DesignCriteria, type SlabZones, type TaperProfile } from './model';

export type ToWorker =
  | { kind: 'preview'; request: number; sectionId: number; values: Record<string, number>; tables: { id: string; rows: string[][] }[]; bracing: ConstructionBracing; taper?: TaperProfile; slab?: SlabZones }
  | { kind: 'construction'; values: Record<string, number>; bracing: ConstructionBracing }
  | { kind: 'bracing'; bracing: ConstructionBracing }
  // tapered beam depth profile with the end depths (sheet inputs h_A.in, h_B.in), applied together
  | { kind: 'taper'; taper: TaperProfile; values: Record<string, number> }
  // sunken slab zones
  | { kind: 'slab'; slab: SlabZones }
  | { kind: 'input'; id: string; value: number }
  | { kind: 'section'; id: number }
  | { kind: 'table'; id: string; rows: string[][] }
  | { kind: 'report'; request: number } | { kind: 'hello' }
  // optimizer pool: copy the page's inputs, then check one section at a time
  | { kind: 'state'; bracing?: ConstructionBracing; taper?: TaperProfile; slab?: SlabZones; values: Record<string, number>; tables: { id: string; rows: string[][] }[] }
  // design engine: one section per message (camber, fewest studs, smallest bar)
  | { kind: 'design'; id: number; mode: 'composite' | 'bare'; token: number; criteria: DesignCriteria }

export type { OptimizeResult } from './model';

const raw = withPageDefaults(template); // the page opens with its own default case
const model = new CompositeModel(raw);
let screen: CompositeModel | null = null; // optimiser pool only: fast rejection without the deflection curves
const post = (msg: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

let pending = false;
let calculationRevision = 0;
self.onmessage = (ev: MessageEvent<ToWorker & { calculationRevision?: number }>) => {
  const m = ev.data;
  if (m.kind === 'preview') { applyCompositeState(model, m); model.setSection(m.sectionId); return post({ kind: 'preview', request: m.request, results: model.results() }); }
  if (m.kind === 'hello') return post({ kind: 'init', bracing: model.bracing, taper: model.taper, slab: model.slab, inputs: model.inputs, tables: model.tables, sectionId: model.sectionId, results: model.results() });
  if (m.kind === 'state') {
    screen ??= new CompositeModel(raw, { screening: true });
    for (const x of [model, screen]) applyCompositeState(x, m);
    return;
  }
  if (m.kind === 'design') return post({ kind: 'designed', token: m.token, id: m.id, design: designSection(model, screen, m.id, m.criteria, m.mode) });
  if (m.kind === 'construction') {
    for (const f of model.inputs) if (m.values[f.id] !== undefined) model.setInput(f.id, m.values[f.id]);
    model.setBracing(m.bracing);
  } else if (m.kind === 'bracing') model.setBracing(m.bracing);
  else if (m.kind === 'slab') model.setSlabZones(m.slab);
  else if (m.kind === 'taper') {
    for (const f of model.inputs) if (m.values[f.id] !== undefined) model.setInput(f.id, m.values[f.id]);
    model.setTaper(m.taper);
  }
  else if (m.kind === 'input') model.setInput(m.id, m.value);
  else if (m.kind === 'section') model.setSection(m.id);
  else if (m.kind === 'table') model.setTableRows(m.id, m.rows);
  else if (m.kind === 'report') return post({ kind: 'report', request: m.request, doc: model.reportDocument() });
  calculationRevision = m.calculationRevision ?? calculationRevision;
  // Several edits in a row: calculate once, after the queue is empty.
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    post({ kind: 'results', calculationRevision, results: model.results(), tables: model.tables, sectionId: model.sectionId });
  }, 0);
};
