/// <reference lib="webworker" />
/** mSteelBeamColumn calculation worker: the three section worksheets run here, one load combination at a time. */
import tplI from '../../../templates/Steel_Section_I_EC3.mCCV?raw';
import tplRHS from '../../../templates/Steel_Section_RHS_EC3.mCCV?raw';
import tplCHS from '../../../templates/Steel_Section_CHS_EC3.mCCV?raw';
import { CHECKS, governing, isMemberCheck, SteelModel, type ComboResult, type SteelState, type SummaryGroup } from './model';
import type { Shape } from './sections';

export type ToWorker =
  | { kind: 'run'; request: number; state: SteelState; key: string }
  | { kind: 'report'; request: number; state: SteelState }
  // main formulas of one combination for the page
  | { kind: 'sheet'; request: number; state: SteelState; combo: number }
  // lightest candidates (sections × grades, sorted by the page) that pass every combination
  | { kind: 'design'; token: number; state: SteelState; candidates: Candidate[]; tSection: number; tMember: number; maxClass: number; keep: number };

export type FromWorker =
  | { kind: 'results'; request: number; key: string; results: ComboResult[] }
  | { kind: 'report'; request: number; doc: unknown }
  | { kind: 'sheet'; request: number; groups: SummaryGroup[] }
  | { kind: 'progress'; token: number; i: number; n: number; name: string }
  | { kind: 'designed'; token: number; picks: Pick[]; tried: number; seconds: number };

/** A section (and grade) to try; patch is merged into the page state. */
export interface Candidate { name: string; mass: number; patch: { sectionId?: number; hollow?: { h?: number; b?: number; t?: number; d?: number }; fyNom?: number } }
export interface Pick { name: string; mass: number; patch: Candidate['patch']; section: number; member: number; ur: number; combo: string; check: string; cls: number }

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
  if (m.kind === 'sheet') return post({ kind: 'sheet', request: m.request, groups: model(m.state.shape).summary(m.state, m.combo) });
  if (m.kind === 'design') {
    const t0 = performance.now(), md = model(m.state.shape), keys = CHECKS[m.state.shape].map(([k]) => k);
    const picks: Pick[] = [];
    let order = m.state.combos.map((_, i) => i), tried = 0;
    for (const c of m.candidates) {
      tried++;
      if (tried % 4 === 1) post({ kind: 'progress', token: m.token, i: tried, n: m.candidates.length, name: c.name });
      const st: SteelState = { ...m.state, ...c.patch, hollow: { ...m.state.hollow, ...(c.patch.hollow ?? {}) } };
      md.setSection(st);
      let ok = true, sec = 0, mem = 0, worst = { ur: -1, combo: '', check: '' }, cls = 0;
      for (const i of order) {
        const r = md.run(st.combos[i]);
        cls = Math.max(cls, r.v.Class);
        let s1 = 0, m1 = 0;
        for (const k of keys) {
          const u = Number.isFinite(r.ur[k]) ? r.ur[k] : Infinity;
          if (isMemberCheck(k)) m1 = Math.max(m1, u); else s1 = Math.max(s1, u);
          if (u > worst.ur) worst = { ur: u, combo: st.combos[i].name, check: k };
        }
        sec = Math.max(sec, s1); mem = Math.max(mem, m1);
        if (!(r.v.Class <= m.maxClass) || s1 > m.tSection || m1 > m.tMember) {
          ok = false;
          order = [i, ...order.filter((j) => j !== i)];
          break;
        }
      }
      if (ok) picks.push({ name: c.name, mass: c.mass, patch: c.patch, section: sec, member: mem, ur: Math.max(sec, mem), combo: worst.combo, check: worst.check, cls });
      if (picks.length >= m.keep) break;
    }
    return post({ kind: 'designed', token: m.token, picks, tried, seconds: (performance.now() - t0) / 1000 });
  }
};
