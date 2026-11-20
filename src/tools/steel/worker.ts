/// <reference lib="webworker" />
/** mSteelBeamColumn calculation worker: the three section worksheets run here, one load combination at a time. */
import tplI from '../../../templates/Steel_Section_I_EC3.mCCV?raw';
import tplRHS from '../../../templates/Steel_Section_RHS_EC3.mCCV?raw';
import tplCHS from '../../../templates/Steel_Section_CHS_EC3.mCCV?raw';
import { governing, SteelModel, type ComboResult, type SteelState } from './model';
import { hollowSections, iSections, type Shape } from './sections';

export type ToWorker =
  | { kind: 'run'; request: number; state: SteelState; key: string }
  | { kind: 'report'; request: number; state: SteelState }
  // lightest section of a family that passes every combination
  | { kind: 'design'; token: number; state: SteelState; family: string; target: number; maxDepth: number | null };

export type FromWorker =
  | { kind: 'results'; request: number; key: string; results: ComboResult[] }
  | { kind: 'report'; request: number; doc: unknown }
  | { kind: 'progress'; token: number; i: number; n: number; name: string }
  | { kind: 'designed'; token: number; pick: { name: string; state: SteelState; ur: number } | null; tried: number; seconds: number };

const RAW: Record<Shape, string> = { I: tplI, RHS: tplRHS, CHS: tplCHS };
const models: Partial<Record<Shape, SteelModel>> = {};
const model = (s: Shape) => (models[s] ??= new SteelModel(RAW[s], s));
const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.kind === 'run') return post({ kind: 'results', request: m.request, key: m.key, results: model(m.state.shape).runAll(m.state) });
  if (m.kind === 'report') {
    const md = model(m.state.shape), results = md.runAll(m.state);
    return post({ kind: 'report', request: m.request, doc: md.reportDocument(m.state, results, governing(results, m.state.shape)) });
  }
  if (m.kind === 'design') {
    const t0 = performance.now(), st = m.state, md = model(st.shape);
    const cands: { name: string; state: SteelState }[] = st.shape === 'I'
      ? iSections(m.family).filter((s) => m.maxDepth === null || s.values.h <= m.maxDepth + 1e-9).map((s) => ({ name: s.name, state: { ...st, sectionId: s.id } }))
      : hollowSections(m.family as 'SHS' | 'RHS' | 'CHS', st.hollow.cf)
        .filter((s) => m.maxDepth === null || (s.dims.h ?? s.dims.d ?? 0) <= m.maxDepth + 1e-9)
        .map((s) => ({ name: s.name, state: { ...st, hollow: { ...st.hollow, ...s.dims } } }));
    let order = st.combos.map((_, i) => i), tried = 0;
    for (const c of cands) {
      tried++;
      if (tried % 4 === 1) post({ kind: 'progress', token: m.token, i: tried, n: cands.length, name: c.name });
      const r = md.passes(c.state, m.target, order);
      if (r.ok) return post({ kind: 'designed', token: m.token, pick: { name: c.name, state: c.state, ur: r.ur }, tried, seconds: (performance.now() - t0) / 1000 });
      order = [r.worst, ...order.filter((i) => i !== r.worst)];
    }
    return post({ kind: 'designed', token: m.token, pick: null, tried, seconds: (performance.now() - t0) / 1000 });
  }
};
