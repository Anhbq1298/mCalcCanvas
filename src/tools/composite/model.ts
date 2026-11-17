/**
 * mCompositeBeamDesign: the EC4 composite beam worksheet (templates/Composite_Beam_EC4.mCCV)
 * run headless on the CalcCanvas engine. The worksheet is the single source of the
 * calculation: this model only finds its inputs, overrides them, and reads results.
 * No formula is duplicated here.
 */
import { sections } from '../../engineering/steel/sections';
import { CalculationEngine } from '../../engine';
import { calcKey } from '../../canvas/calcOrder';
import { inputTableColumns, inputTableRegionId } from '../../canvas/inputTable';
import type { Shape, TableShape, TextShape, MathShape } from '../../canvas/model/types';

export interface InputField {
  id: string;
  name: string; // latex name, e.g. s_{sc.A}
  label: string;
  group: string;
  value: number;
  unit: string; // '' for dimensionless
  latex: string; // original definition
}

export interface LoadTable {
  id: string;
  title: string;
  headers: string[];
  units: string[];
  rows: string[][];
}

/** Results read from the worksheet (numbers in the units given in OUTPUTS). */
export type Results = Record<string, number> & { vectors: Record<string, number[]>; errors: string[] };

type Probe = [key: string, latex: string, unit: string | null];

const SCALARS: Probe[] = [
  // loading
  ['M2', 'M_{2.Ed}', 'kN m'], ['xM', 'x_M', 'm'], ['V2', 'V_{2.Ed}', 'kN'], ['M1', 'M_{1.Ed}', 'kN m'], ['w1', 'w_{1.Ed}', 'kN/m'],
  ['g0', 'g_0', 'kN/m'], ['ga', 'g_a', 'kN/m'], ['gsw', '\\gamma_{G.sw}', null], ['gc', 'g_c', 'kN/m'], ['w1k', 'w_{1.k}', 'kN/m'], ['d1', '\\delta_1', 'mm'], ['L', 'L', 'm'], ['L1', 'L_1', 'm'],
  // section
  ['h_a', 'h_a', 'mm'], ['b_a', 'b_a', 'mm'], ['t_f', 't_f', 'mm'], ['t_w', 't_w', 'mm'], ['r', 'r', 'mm'], ['A_a', 'A_a', 'cm^2'],
  ['I_a', 'I_a', 'cm^4'], ['I_z', 'I_z', 'cm^4'], ['W_pl', 'W_{pl}', 'cm^3'], ['I_t', 'I_t', 'cm^4'], ['I_w', 'I_w', 'cm^6'], ['m_a', 'm_a', 'kg/m'],
  ['h_c', 'h_c', 'mm'], ['b_eff', 'b_{eff}', 'mm'], ['f_y', 'f_y', 'MPa'], ['f_cd', 'f_{cd}', 'MPa'], ['I_0', 'I_0', 'cm^4'], ['I_L', 'I_L', 'cm^4'],
  ['MaRd', 'M_{a.Rd}', 'kN m'], ['MplRd', 'M_{pl.Rd}', 'kN m'], ['VplRd', 'V_{pl.Rd}', 'kN'],
  // studs and PNA
  ['PRd', 'P_{Rd}', 'kN'], ['nA', 'n_A', null], ['nB', 'n_B', null], ['nh', 'n_h', null], ['nreq', 'n_{req}', null],
  ['eta', '\\eta', null], ['etaMin', '\\eta_{min}', null], ['Ncf', 'N_{c.f}', 'kN'], ['Nc', 'N_c', 'kN'], ['xf', 'x_f', 'mm'], ['xc', 'x_c', 'mm'],
  ['ya', 'y_a', 'mm'], ['kM', 'k_M', null], ['MRd', 'M_{Rd}', 'kN m'], ['MRdpl', 'M_{Rd.pl}', 'kN m'], ['comp', 'c_{comp}', null],
  // longitudinal shear in the slab (EC4 6.6.6, EC2 6.2.4)
  ['fsd', 'f_{sd}', 'MPa'], ['vf', 'v_f', 'kN/m'], ['vLEd', 'v_{L.Ed}', 'MPa'], ['asfReq', 'a_{sf.req}', 'mm^2/m'], ['asf', 'a_{sf}', 'mm^2/m'], ['vLRd', 'v_{L.Rd}', 'MPa'], ['vmax', 'v_{max}', 'MPa'], ['cta', 'c_{\\theta.a}', null], ['ctb', 'c_{\\theta.b}', null], ['vbRd', 'v_{b.Rd}', 'MPa'], ['dst', 'd_{s.t}', 'mm'], ['sft', 's_{f.t}', 'mm'], ['dsb', 'd_{s.b}', 'mm'], ['sfb', 's_{f.b}', 'mm'],
  ['at', 'a_t', 'mm^2/m'], ['ctop', 'c_{top}', null], ['ab', 'a_b', 'mm^2/m'], ['lb', 'l_b', 'mm'], ['vbEd', 'v_{b.Ed}', 'MPa'], ['asbReq', 'a_{sf.b.req}', 'mm^2/m'], ['asb', 'a_{sf.b}', 'mm^2/m'],
  ['dhead', 'd_{head}', 'mm'], ['hsc', 'h_{sc}', 'mm'], ['dsc', 'd_{sc}', 'mm'], ['b0', 'b_0', 'mm'],
  // profiled steel deck (all neutral for a solid slab: h_pe = 0, k_d = 1, n_re = 1)
  ['cdeck', 'c_{deck}', null], ['ctr', 'c_{tr}', null], ['hpe', 'h_{pe}', 'mm'], ['ht', 'h_t', 'mm'], ['br', 'b_r', 'mm'], ['er', 'e_r', 'mm'], ['kd', 'k_d', null], ['kt', 'k_t', null], ['kl', 'k_l', null], ['ktmax', 'k_{t.max}', null],
  ['nre', 'n_{re}', null], ['sA', 's_A', 'mm'], ['sB', 's_B', 'mm'], ['ape', 'a_{pe}', 'mm^2/m'], ['cbb', 'c_{bb}', null], ['Idyn', 'I_{dyn}', 'cm^4'], ['NcRd', 'N_{c.Rd}', 'kN'], ['LLT', 'L_{LT}', 'm'], ['smax', 's_{max}', 'mm'], ['smin', 's_{min}', 'mm'], ['dgmax', '\\delta_{g.max}', 'mm'], ['cprop', 'c_{prop}', null], ['rlim', 'r_{lim}', null], ['rlim1', 'r_{lim.1}', null], ['rlimq', 'r_{lim.q}', null], ['c16', 'c_{16}', null], ['cre', 'c_{re}', null],
  // deflection
  ['dmax', '\\delta_{max}', 'mm'], ['wc', 'w_c', 'mm'], ['ccam', 'c_{cam}', null], ['dlim', '\\delta_{lim}', 'mm'], ['dq', '\\delta_{q.max}', 'mm'], ['dnc', '\\delta_{nc}', 'mm'], ['f1', 'f_1', 'Hz'], ['f1nc', 'f_{1.nc}', 'Hz'], ['flim', 'f_{lim}', 'Hz'], ['Ecdyn', 'E_{c.dyn}', 'GPa'], ['ddyn', '\\delta_{dyn}', 'mm'], ['ddynnc', '\\delta_{dyn.nc}', 'mm'], ['LLTnc', 'L_{LT.nc}', 'mm'],
];

/** Utilisations by code, in report order: [key, label, clause, basis]. basis: c = composite only, n = non-composite only. */
export const CHECKS: [string, string, string, '' | 'c' | 'n'][] = [
  ['M.1', 'Bending, construction', 'EN 1993-1-1 §6.2.5', ''],
  ['V.1', 'Shear, construction', 'EN 1993-1-1 §6.2.6', ''],
  ['LT', 'LTB, construction', 'EN 1993-1-1 §6.3.2', ''],
  ['d.1', 'Deflection, construction', 'SLS', ''],
  ['M.2', 'Bending at x_M', 'EN 1994-1-1 §6.2.1', 'c'],
  ['M.x', 'Bending along the span (studs)', 'EN 1994-1-1 §6.6.1.3', 'c'],
  ['MV', 'Bending with shear', 'EN 1994-1-1 §6.2.2.4', 'c'],
  ['V.2', 'Vertical shear', 'EN 1994-1-1 §6.2.2', ''],
  ['F.P', 'Web under point loads', 'EN 1993-1-5 §6', ''],
  ['F.S', 'Web at supports', 'EN 1993-1-5 §6', ''],
  ['FM', 'Web interaction', 'EN 1993-1-5 §7.2', 'c'],
  ['d.x', 'Deflection, composite', 'EN 1994-1-1 §7.3.1', 'c'],
  ['d.q', 'Live-load deflection, composite', 'SLS, L / r_lim.q', 'c'],
  ['sf', 'Slab transverse bars, surface a-a', 'EN 1994-1-1 §6.6.6', 'c'],
  ['L', 'Slab concrete strut, surface a-a', 'EN 1992-1-1 §6.2.4', 'c'],
  ['sf.b', 'Slab transverse bars, surface b-b', 'EN 1994-1-1 §6.6.6', 'c'],
  ['L.b', 'Slab concrete strut, surface b-b', 'EN 1992-1-1 §6.2.4', 'c'],
  ['fn', 'Natural frequency', 'SCI P354 / project limit', 'c'],
  ['MV.nc', 'Bending with shear, bare steel', 'EN 1993-1-1 §6.2.8', 'n'],
  ['LT.nc', 'LTB, bare steel (L = stud spacing)', 'EN 1994-1-1 §6.4.1', 'n'],
  ['FM.nc', 'Web interaction, bare steel', 'EN 1993-1-5 §7.2', 'n'],
  ['d.nc', 'Deflection, bare steel', 'SLS', 'n'],
  ['d.q.nc', 'Live-load deflection, bare steel', 'SLS, L / r_lim.q', 'n'],
  ['fn.nc', 'Natural frequency, bare steel', 'SCI P354 / project limit', 'n'],
  ['des', 'Permanent stage, design basis used', 'Summary', ''],
];

/**
 * The governing utilisation the page shows: every check of the design basis in use (composite or bare
 * steel), construction stage included. The section optimiser uses the same rule.
 */
/** Serviceability (deflection) checks; every other check of the basis in use counts as strength. */
export const SLS_CHECKS = ['d.1', 'd.x', 'd.q', 'd.nc', 'd.q.nc', 'fn', 'fn.nc'];
/** Construction-stage checks of the steel beam alone: they do not depend on the studs or the slab bars. */
export const CONSTRUCTION_CHECKS = ['M.1', 'V.1', 'LT', 'd.1'];

/** etaMin / etaMax: project range of the degree of shear connection (0…1) for a composite result, on top of the code minimum. */
export interface Targets { strength: number; deflection: number; etaMin?: number; etaMax?: number }
/** Degree of shear connection inside the project range. */
export const etaInRange = (eta: number, t: Targets): boolean => eta >= (t.etaMin ?? 0) - 1e-9 && eta <= (t.etaMax ?? 1) + 1e-9;
export interface Governing { ur: number; key: string; label: string }
export interface OptimizeResult {
  family: string; maxDepth: number | null; targets: Targets; tried: number; total: number;
  best: { id: number; name: string; mass: number; h: number; sc: number; scB?: number; bar: number; sf?: number; nr?: number; eta?: number; studs?: number; camber?: number; layout?: 'uniform' | 'segmented'; composite: boolean; strength: Governing; deflection: Governing } | null;
}

/**
 * Design criteria of the section optimiser (the approach of RAM Steel Beam: for each section the fewest studs
 * that work, a camber from rules, separate deflection limits in the worksheet, lightest section wins).
 */
export interface DesignCriteria extends Targets {
  /**
   * uniform: one spacing over the span; segmented: each shear span (support to x_M) gets the same number of studs;
   * prefer-uniform: uniform, and segmented only for a section where no uniform layout passes.
   */
  studs: 'uniform' | 'segmented' | 'prefer-uniform';
  /** Transverse bar diameters to try, smallest first. */
  bars: number[];
  /** Transverse bar spacings to try (mm, top and bottom alike); absent = the spacing stays as entered. */
  barSpacings?: number[];
  /** Camber rules; null keeps the precamber inputs as entered. Lengths in mm, minSpan in m. */
  camber: { pct: number; min: number; max: number; step: number; minSpan: number } | null;
  /** Section fixed (stud button): construction-stage checks are left out. */
  detail?: boolean;
}
export interface Design {
  pass: boolean; composite: boolean; sc: number; scB: number; nr?: number; bar: number; sf?: number; eta: number;
  studs: number; camber: number; strength: Governing; deflection: Governing; evals: number;
  /** Stud distribution of the result (prefer-uniform resolves to one of the two). */
  layout?: 'uniform' | 'segmented';
  /** Failed on something no stud layout changes: the other distribution need not be tried. */
  hopeless?: boolean;
}
const SLAB_BAR_CHECKS = ['sf', 'sf.b']; // the only checks a larger transverse bar can cure
const SLAB_CHECKS = ['sf', 'L', 'sf.b', 'L.b']; // get worse with more studs: no reason to reject a section at its densest layout

/** Camber from the rules: a share of the self-weight deflection, rounded down to the increment, dropped if small. */
export function camberFor(c: DesignCriteria['camber'], spanM: number, dgMax: number, propped: boolean): number {
  if (!c || propped || spanM < c.minSpan - 1e-9 || !(dgMax > 0)) return 0;
  let w = (c.pct / 100) * dgMax;
  if (c.step > 0) w = Math.floor(w / c.step + 1e-9) * c.step;
  if (w < c.min - 1e-9) return 0;
  return Math.min(w, c.max > 0 ? c.max : w);
}

/**
 * Stud layouts for one section, fewest studs first. A stud count per shear span is turned into a spacing
 * (rounded down to 5 mm, within s_min … s_max); counts run from the one bending needs (linear interaction,
 * minimum degree) to the allowed maximum in steps of about 5 % of full connection. Transverse deck: studs sit
 * in the ribs, so the layouts are multiples of the pitch, then two per rib.
 */
export function studPlans(p: Results, c: DesignCriteria): { sc: number; scB: number; nr?: number }[] {
  const xa = p.xM * 1000, xb = (p.L - p.xM) * 1000, sMax = Math.floor(p.smax / 5 + 1e-9) * 5;
  if (p.ctr >= 1 && p.er > 0) {
    const out: { sc: number; scB: number; nr?: number }[] = [];
    for (let k = Math.max(1, Math.floor(sMax / p.er)); k >= 1; k--) out.push({ sc: k * p.er, scB: k * p.er, nr: 1 });
    out.push({ sc: p.er, scB: p.er, nr: 2 });
    return out;
  }
  const full = p.Ncf / p.PRd; // studs per shear span for full connection
  const etaM = p.MplRd > p.MaRd ? (p.M2 - p.MaRd) / (p.MplRd - p.MaRd) : p.M2 <= p.MaRd ? 0 : Infinity;
  const etaTop = Math.min(1, c.etaMax ?? 1);
  const etaNeed = Math.max(c.etaMin ?? 0, p.etaMin, etaM, 0);
  if (etaM > etaTop + 1e-9) return []; // bending needs more studs than allowed
  const nTop = Math.max(1, etaTop >= 1 ? Math.ceil(full - 1e-9) : Math.floor(etaTop * full + 1e-9));
  const n0 = Math.min(nTop, Math.max(1, Math.ceil(etaNeed * full - 1e-9)));
  const step = Math.max(1, Math.round(0.05 * full));
  const counts: number[] = [];
  for (let n = n0; n < nTop; n += step) counts.push(n);
  counts.push(nTop);
  const fit = (x: number, n: number) => Math.min(sMax, Math.floor(x / n / 5 + 1e-9) * 5);
  const out: { sc: number; scB: number }[] = [];
  for (const n of counts) {
    const sc = c.studs === 'segmented' ? fit(xa, n) : fit(Math.min(xa, xb), n);
    const scB = c.studs === 'segmented' ? fit(xb, n) : sc;
    if (sc < p.smin - 1e-9 || scB < p.smin - 1e-9) break; // a single row cannot hold more
    if (!out.some((o) => o.sc === sc && o.scB === scB)) out.push({ sc, scB });
  }
  return out;
}

/**
 * Design one section: camber from the rules, then the fewest studs and the smallest transverse bar that pass
 * every check within the targets. mode 'bare': the stud and bar details stay as they are and composite action
 * is not required. screen (optional): the fast model without deflection curves, used to reject early.
 */
export function designSection(model: CompositeModel, screen: CompositeModel | null, id: number, c: DesignCriteria, mode: 'composite' | 'bare'): Design {
  if (c.studs === 'prefer-uniform') {
    const u = designSection(model, screen, id, { ...c, studs: 'uniform' }, mode);
    if (u.pass || u.hopeless || mode === 'bare') return u;
    const g = designSection(model, screen, id, { ...c, studs: 'segmented' }, mode);
    return { ...g, evals: g.evals + u.evals };
  }
  const models = screen ? [screen, model] : [model];
  const set = (m: CompositeModel, name: string, v: number) => { const f = m.inputs.find((x) => x.name === name); if (f) m.setInput(f.id, v); };
  const skip = c.detail ? CONSTRUCTION_CHECKS : [];
  let evals = 0;
  const fail = (hopeless = false): Design => ({ hopeless, pass: false, composite: false, sc: 0, scB: 0, bar: 0, eta: 0, studs: 0, camber: 0, strength: { ur: Infinity, key: '', label: '' }, deflection: { ur: Infinity, key: '', label: '' }, evals });
  for (const m of models) { m.setSection(id); if (c.camber) { set(m, 'c_{cam}', 0); set(m, 'w_{c.0}', 0); } }
  const p = models[0].results(); evals++;
  if (p.errors.length) return fail(true);
  let camber = p.wc;
  if (c.camber) { camber = camberFor(c.camber, p.L, p.dgmax, p.cprop >= 1); for (const m of models) set(m, 'w_{c.0}', camber); }
  const over = (r: Results, keys: string[]) => keys.some((k) => !(r[`UR.${k}`] <= c.strength));
  const done = (r: Results, d: { sc: number; scB: number; nr?: number; bar: number; sf?: number }): Design => ({ layout: d.sc === d.scB ? 'uniform' : 'segmented', pass: true, composite: r.comp >= 1, ...d, eta: r.eta, studs: r.nA + r.nB, camber, ...governingSplit(r, skip), evals });
  const passes = (r: Results, composite: boolean) => {
    if (r.errors.length || (composite && (r.comp < 1 || !etaInRange(r.eta, c)))) return false;
    const g = governingSplit(r, skip);
    return g.strength.ur <= c.strength && g.deflection.ur <= c.deflection;
  };
  if (mode === 'bare') {
    const d = model.detail();
    if (screen) { const q = screen.results(); evals++; if (!q.errors.length && !screenPasses(q, c, skip)) return fail(); }
    const r = model.results(); evals++;
    return passes(r, false) ? done(r, { ...d }) : fail();
  }
  const plans = studPlans(p, c);
  if (!plans.length) return fail(true);
  /** One layout: bars from the smallest up; 'next' = a denser layout may still work, 'stop' = it cannot. */
  // Transverse bars: every diameter × spacing, least steel first. The bar checks are proportional to
  // 1 / area, so a failing one tells the area needed and the list is entered at that point.
  const rebar = c.bars.flatMap((bar) => (c.barSpacings?.length ? c.barSpacings : [undefined]).map((sf) => ({ bar, sf, area: (Math.PI * bar * bar) / 4 / (sf ?? 1) })))
    .sort((a, b) => a.area - b.area || a.bar - b.bar);
  const heavier = (k: number, r: Results) => {
    const need = rebar[k].area * (Math.max(...SLAB_BAR_CHECKS.map((x) => r[`UR.${x}`])) / c.strength) * (1 - 1e-9);
    const n = rebar.findIndex((x, i) => i > k && x.area >= need);
    return n < 0 && k < rebar.length - 1 && !Number.isFinite(need) ? k + 1 : n;
  };
  const tryPlan = (plan: (typeof plans)[number]): Design | 'next' | 'hopeless' => {
    for (let k = 0; k >= 0 && k < rebar.length;) {
      const d = { ...plan, bar: rebar[k].bar, ...(rebar[k].sf !== undefined ? { sf: rebar[k].sf } : {}) };
      if (screen) {
        screen.setDetail(d);
        const q = screen.results(); evals++;
        if (q.errors.length) return 'next';
        if (q.comp < 1 || !etaInRange(q.eta, c) || !screenPasses(q, c, skip)) {
          if (over(q, SLAB_BAR_CHECKS)) { const n = heavier(k, q); if (n > k) { k = n; continue; } }
          // hopeless: something other than the slab fails although this is the densest layout
          const g = governingSplit(q, [...DEFLECTION_CHECKS, ...skip, ...SLAB_CHECKS]);
          return g.strength.ur > c.strength || g.deflection.ur > c.deflection || q.eta < Math.max(c.etaMin ?? 0, q.etaMin) - 1e-9 ? 'hopeless' : 'next';
        }
      }
      model.setDetail(d);
      const r = model.results(); evals++;
      if (passes(r, true)) return done(r, d);
      if (over(r, SLAB_BAR_CHECKS)) { const n = heavier(k, r); if (n > k) { k = n; continue; } }
      const g = governingSplit(r, [...skip, ...SLAB_CHECKS]);
      return !r.errors.length && (g.strength.ur > c.strength || g.deflection.ur > c.deflection) ? 'hopeless' : 'next';
    }
    return 'next';
  };
  // The densest layout first: if it fails on anything but the slab, no layout of this section works.
  const last = plans[plans.length - 1];
  const top = tryPlan(last);
  if (top === 'hopeless') return fail(true);
  if (plans.length === 1) return typeof top === 'object' ? top : fail();
  for (const plan of plans.slice(0, -1)) {
    const r = tryPlan(plan);
    if (typeof r === 'object') return r;
  }
  return typeof top === 'object' ? top : fail();
}

/** Detail choices the optimiser tries for every section: uniform stud spacing and both transverse bar diameters. */
export const STUD_SPACINGS = [200, 175, 150, 125, 100]; // mm, widest (cheapest) first
export const BAR_DIAMETERS = [10, 12, 13]; // mm, smallest first
export const BAR_SPACINGS = [200, 175, 150, 125, 100]; // mm
export const DETAIL_INPUTS = { scA: 's_{sc.A}', scB: 's_{sc.B}', barT: 'd_{s.t}', barB: 'd_{s.b}' } as const;

/** bare: the bare-steel fallback (current stud and bar details, composite action not required). */
export interface Candidate { id: number; name: string; mass: number; h: number; sc: number; scB: number; bar: number; bare: boolean; sf?: number; nr?: number }

/** Stud layouts tried, cheapest first. Transverse deck (pitch given): studs sit in the ribs, so alternate ribs, every rib, then two per rib. */
export function studLayouts(pitch?: number): { sc: number; nr?: number }[] {
  return pitch ? [{ sc: 2 * pitch, nr: 1 }, { sc: pitch, nr: 1 }, { sc: pitch, nr: 2 }] : STUD_SPACINGS.map((sc) => ({ sc }));
}

/**
 * Composite designs first: every section × bar × spacing, lightest section first, cheapest detail first within a
 * section, each one required to reach composite action. Only when none passes, the sections again as bare steel
 * with the details as they are now (stud spacing and bars then have no effect).
 */
export function candidatesFor(secs: { id: number; name: string; values: { mass: number; h: number } }[], current: { sc: number; scB: number; bar: number; nr?: number }, pitch?: number): Candidate[] {
  const c = (s: (typeof secs)[number], sc: number, scB: number, bar: number, bare: boolean): Candidate => ({ id: s.id, name: s.name, mass: s.values.mass, h: s.values.h, sc, scB, bar, bare });
  return [
    ...secs.flatMap((s) => BAR_DIAMETERS.flatMap((bar) => studLayouts(pitch).map((l) => ({ ...c(s, l.sc, l.sc, bar, false), ...(l.nr ? { nr: l.nr } : {}) })))),
    ...secs.map((s) => ({ ...c(s, current.sc, current.scB, current.bar, true), ...(pitch && current.nr ? { nr: current.nr } : {}) })),
  ];
}

/** Governing strength and deflection checks of the basis in use (skip: checks not available, as in screening). */
export function governingSplit(res: Results, skip: readonly string[] = []): { strength: Governing; deflection: Governing } {
  const pick = (sls: boolean) => governingCheck(res, [...skip, ...CHECKS.map(([k]) => k).filter((k) => SLS_CHECKS.includes(k) !== sls)]);
  return { strength: pick(false), deflection: pick(true) };
}

/** Screening model: can the section still pass? (strength complete; of deflection only the construction check) */
export function screenPasses(res: Results, t: Targets, skip: readonly string[] = []): boolean {
  const g = governingSplit(res, [...DEFLECTION_CHECKS, ...skip]);
  return g.strength.ur <= t.strength && g.deflection.ur <= t.deflection;
}

/** Checks that need the deflection curves: unknown in a screening model. */
export const DEFLECTION_CHECKS = ['d.x', 'd.q', 'd.nc', 'd.q.nc'];

export function governingCheck(res: Results, skip: readonly string[] = []): { ur: number; key: string; label: string } {
  const composite = res.comp >= 1;
  const shown = CHECKS.filter(([key, , , basis]) => key !== 'des' && (!basis || (basis === 'c') === composite));
  let g = { ur: -Infinity, key: '', label: '' };
  for (const [key, label] of shown) {
    if (skip.includes(key)) continue;
    const u = res[`UR.${key}`];
    if (!Number.isFinite(u)) return { ur: Infinity, key, label }; // a check that cannot be evaluated never passes
    if (u > g.ur) g = { ur: u, key, label };
  }
  return g;
}

const VECTORS: Probe[] = [
  ['x', 'x_v', 'm'], ['V', 'V_v', 'kN'], ['M', 'M_v', 'kN m'], ['MRdx', 'M_{Rd.x}', 'kN m'], ['d', '\\delta_{x.d}', 'mm'], ['dq', '\\delta_{q.d}', 'mm'], ['x1v', 'x_{1.v}', 'm'], ['d1v', '\\delta_{1.v}', 'mm'], ['nx', 'n_{x}', null],
];

const DEF = /^(.*?)\\coloneq\s*(-?\d+(?:\.\d+)?)(?:\\,\\mathrm\{([^}]*)\})?$/;
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

export class CompositeModel {
  readonly doc: { shapes: Shape[] } & Record<string, unknown>;
  readonly inputs: InputField[] = [];
  readonly tables: LoadTable[] = [];
  sectionId = 0;
  private readonly e = new CalculationEngine({ unitSystem: 'SI' });
  private readonly rec: Record<string, Shape>;
  private readonly sectionRegion: string;
  private readonly tableShapes = new Map<string, TableShape>();
  private readonly values = new Map<string, { value: number; unit: string }>();

  /**
   * screening: the deflection curves (map of d_w over the span, two thirds of the calculation time) are
   * left out, so only the checks in DEFLECTION_CHECKS are unknown; every other result is the full one.
   * Used by the optimiser to reject sections quickly.
   */
  constructor(raw: string, options: { screening?: boolean } = {}) {
    this.doc = JSON.parse(raw);
    if (options.screening) {
      for (const s of this.doc.shapes) {
        if (s.type === 'math' && /\\mathrm\{map\}\\left\(d_/.test((s as MathShape).props.latex)) {
          const m = s as MathShape;
          m.props = { ...m.props, latex: m.props.latex.replace(/\\coloneq[\s\S]*$/, '\\coloneq 0\\,\\mathrm{mm}') };
        }
      }
    }
    const shapes = this.doc.shapes;
    this.rec = Object.fromEntries(shapes.map((s) => [s.id, s]));
    const loading = shapes.find((s) => s.type === 'text' && text((s as TextShape).props.html).startsWith('2. LOADING'));
    const yEnd = loading ? loading.y : Infinity;
    const sorted = [...shapes].sort((a, b) => a.y - b.y || a.x - b.x);
    let group = '';
    let section = '';
    for (const s of sorted) {
      if (s.y >= yEnd) break;
      if (s.type === 'text' && (s as TextShape).props.heading === 3) group = text((s as TextShape).props.html).replace(/^1\.\d+\s*/, '');
      if (s.type === 'table' && (s as TableShape).props.input) {
        const t = s as TableShape;
        this.tableShapes.set(t.id, t);
        const title = text((shapes.find((x) => x.type === 'text' && Math.abs(x.y - (t.y - 26)) < 20 && Math.abs(x.x - t.x) < 40) as TextShape | undefined)?.props.html ?? '') || 'Loads';
        this.tables.push({ id: t.id, title, headers: t.props.cells[0].map((c) => c.value), units: t.props.cells[1].map((c) => c.value), rows: t.props.cells.slice(2).map((r) => r.map((c) => c.value)) });
      }
      if (s.type !== 'math') continue;
      const latex = (s as MathShape).props.latex;
      const m = DEF.exec(latex.trim());
      if (!m) continue;
      if (m[1] === '\\mathrm{Section}') {
        section = s.id;
        this.sectionId = Number(m[2]);
        continue;
      }
      const label = s.printGroupId ? text((shapes.find((x) => x.type === 'text' && x.printGroupId === s.printGroupId) as TextShape | undefined)?.props.html ?? '') : '';
      this.inputs.push({ id: s.id, name: m[1], label: label || m[1], group, value: Number(m[2]), unit: m[3] ?? '', latex });
    }
    this.sectionRegion = section;
    this.register();
  }

  private register(): void {
    const e = this.e;
    e.batch(() => {
      for (const s of this.doc.shapes) {
        if (s.type === 'math') e.setRegion(s.id, { latex: (s as MathShape).props.latex, order: calcKey(s, this.rec), displayUnit: (s as MathShape).props.displayUnit || null, precision: null });
        if (s.type === 'table' && (s as TableShape).props.input) this.registerTable(s as TableShape);
      }
      SCALARS.forEach(([key, latex, unit], i) => e.setRegion(`probe:${key}`, { latex: `${latex}=`, order: [1e9, i] as never, displayUnit: unit, precision: null }));
      // vectors probe under their own prefix, so a scalar and a vector may share a key (dq)
      VECTORS.forEach(([key, latex, unit], i) => e.setRegion(`probe:v.${key}`, { latex: `${latex}=`, order: [1e9, 300 + i] as never, displayUnit: unit, precision: null }));
      CHECKS.forEach(([key], i) => e.setRegion(`probe:UR.${key}`, { latex: `\\mathrm{UR}_{${key}}=`, order: [1e9, 500 + i] as never, displayUnit: null, precision: null }));
    });
  }

  private registerTable(t: TableShape): void {
    for (const c of inputTableColumns(t)) this.e.setRegion(inputTableRegionId(t.id, c.column), { latex: c.latex, order: [...calcKey(t, this.rec), c.column] as never, displayUnit: null, precision: null });
  }

  /** Write one detail candidate into the worksheet: uniform stud spacing and both bar diameters. */
  setDetail(c: { sc: number; bar: number; scB?: number; sf?: number; nr?: number }): void {
    const id = (name: string) => this.inputs.find((f) => f.name === name)!.id;
    this.setInput(id(DETAIL_INPUTS.scA), c.sc);
    this.setInput(id(DETAIL_INPUTS.scB), c.scB ?? c.sc);
    this.setInput(id(DETAIL_INPUTS.barT), c.bar);
    this.setInput(id(DETAIL_INPUTS.barB), c.bar);
    if (c.sf !== undefined) { this.setInput(id('s_{f.t}'), c.sf); this.setInput(id('s_{f.b}'), c.sf); }
    if (c.nr !== undefined) this.setInput(id('n_r'), c.nr);
  }

  detail(): { sc: number; scB: number; bar: number } {
    const id = (name: string) => this.inputs.find((f) => f.name === name)!.id;
    return { sc: this.inputValue(id(DETAIL_INPUTS.scA)), scB: this.inputValue(id(DETAIL_INPUTS.scB)), bar: this.inputValue(id(DETAIL_INPUTS.barT)) };
  }

  setInput(id: string, value: number): void {
    const f = this.inputs.find((x) => x.id === id);
    if (!f || !Number.isFinite(value)) return;
    this.values.set(id, { value, unit: f.unit });
    this.e.setDefinitionOverride(id, { value, unit: f.unit || null } as never);
  }

  inputValue(id: string): number {
    return this.values.get(id)?.value ?? this.inputs.find((x) => x.id === id)!.value;
  }

  setSection(id: number): void {
    this.sectionId = id;
    this.e.setDefinitionOverride(this.sectionRegion, { value: id } as never);
  }

  setTableRows(id: string, rows: string[][]): void {
    const t = this.tableShapes.get(id);
    const table = this.tables.find((x) => x.id === id);
    if (!t || !table) return;
    // A blank ULS factor (or a row without that column) takes the pattern default, γ_G or γ_Q.
    const fi = table.headers.findIndex((h) => /gamma_\{?F/.test(h));
    const gamma = (name: string, d: number) => this.values.get(this.inputs.find((f) => f.name === name)?.id ?? '')?.value ?? this.inputs.find((f) => f.name === name)?.value ?? d;
    rows = rows.map((r) => {
      const row = table.headers.map((_, j) => r[j] ?? '');
      if (fi >= 0 && !row[fi].trim()) row[fi] = String(row[0].trim().toUpperCase() === 'Q' ? gamma('\\gamma_Q', 1.5) : gamma('\\gamma_G', 1.35));
      return row;
    });
    table.rows = rows.map((r) => [...r]);
    // An input table needs at least one row to define its columns; with none, the engine (and the report)
    // get a single zero load (point loads at mid-span) instead of keeping the previous rows.
    const L = this.inputs.find((f) => f.name === 'L');
    const zero = table.headers.map((h, j) => (j === 0 ? 'G' : j === fi ? String(gamma('\\gamma_G', 1.35)) : /^a_/.test(h.trim()) ? String((L ? this.values.get(L.id)?.value ?? L.value : 0) / 2) : '0'));
    const engineRows = rows.length ? rows : [zero];
    const cells = [t.props.cells[0], t.props.cells[1], ...engineRows.map((r) => r.map((v) => ({ value: v })))];
    const next: TableShape = { ...t, props: { ...t.props, rows: cells.length, cells } };
    this.tableShapes.set(id, next);
    this.registerTable(next);
  }

  /**
   * Lightest section of a family that passes every check (governing UR ≤ 1, construction stage included):
   * candidates by increasing mass, the first that passes is the lightest. Without one, the section is restored.
   */
  optimizeSection(
    family: string,
    opts: { maxDepth?: number | null; targets?: Targets; screen?: CompositeModel; progress?: (i: number, n: number, name: string) => void } = {},
  ): OptimizeResult {
    const maxDepth = opts.maxDepth ?? null, targets = opts.targets ?? { strength: 1, deflection: 1 }, screen = opts.screen;
    const start = this.sectionId;
    // optional depth limit h ≤ maxDepth (mm), e.g. from the ceiling void
    const keep = this.detail();
    const cands = candidatesFor(sections
      .filter((s) => s.family === family && Number.isFinite(s.values.mass) && (maxDepth === null || s.values.h <= maxDepth + 1e-9))
      .sort((a, b) => a.values.mass - b.values.mass), keep);
    let tried = 0;
    for (const c of cands) {
      tried++;
      opts.progress?.(tried, cands.length, c.name);
      if (screen) {
        screen.setSection(c.id);
        screen.setDetail(c);
        const q = screen.results();
        if (!q.errors.length && (!screenPasses(q, targets) || (!c.bare && (q.comp < 1 || !etaInRange(q.eta, targets))))) continue;
      }
      this.setSection(c.id);
      this.setDetail(c);
      const r = this.results();
      if (r.errors.length) continue;
      const g = governingSplit(r);
      if (g.strength.ur <= targets.strength && g.deflection.ur <= targets.deflection && (c.bare || (r.comp >= 1 && etaInRange(r.eta, targets))))
        return { family, maxDepth, targets, tried, total: cands.length, best: { id: c.id, name: c.name, mass: c.mass, h: c.h, sc: c.sc, bar: c.bar, eta: r.eta, composite: r.comp >= 1, ...g } };
    }
    this.setSection(start);
    this.setDetail(keep);
    return { family, maxDepth, targets, tried, total: cands.length, best: null };
  }

  results(): Results {
    const out = { vectors: {}, errors: [] as string[] } as unknown as Results;
    for (const [key] of SCALARS) {
      const r = this.e.getResult(`probe:${key}`);
      out[key] = r?.status === 'valid' ? r.value!.number : NaN;
    }
    for (const [key] of CHECKS) {
      const r = this.e.getResult(`probe:UR.${key}`);
      out[`UR.${key}`] = r?.status === 'valid' ? r.value!.number : NaN;
    }
    for (const [key] of VECTORS) {
      const r = this.e.getResult(`probe:v.${key}`);
      out.vectors[key] = r?.status === 'valid' ? (r.value!.items ?? []) : [];
    }
    for (const s of this.doc.shapes) {
      if (s.type !== 'math') continue;
      const r = this.e.getResult(s.id);
      if (r?.status === 'error') out.errors.push(`${(s as MathShape).props.latex.slice(0, 40)}: ${r.error?.message}`);
    }
    return out;
  }

  /** The worksheet with the current inputs written in: a complete .mCCV document for the report. */
  reportDocument(): Record<string, unknown> {
    const shapes = this.doc.shapes.map((s) => {
      if (s.id === this.sectionRegion) return { ...s, props: { ...(s as MathShape).props, latex: `\\mathrm{Section}\\coloneq${this.sectionId}` } };
      const v = this.values.get(s.id);
      if (v) {
        const f = this.inputs.find((x) => x.id === s.id)!;
        return { ...s, props: { ...(s as MathShape).props, latex: `${f.name}\\coloneq ${v.value}${f.unit ? `\\,\\mathrm{${f.unit}}` : ''}` } };
      }
      const t = this.tableShapes.get(s.id);
      return t ?? s;
    });
    return { ...this.doc, shapes, title: 'Composite Beam EC4 — mCompositeBeamDesign', updatedAt: new Date().toISOString() };
  }
}
