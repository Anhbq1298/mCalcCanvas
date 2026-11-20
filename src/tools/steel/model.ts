/**
 * mSteelBeamColumn model: one EN 1993-1-1 cross-section worksheet (I/H, RHS or CHS) on the mCalcCanvas
 * engine. The page's inputs and each load combination are written into the sheet's input regions with
 * definition overrides; every number shown comes back from the sheet through probe regions.
 */
import { CalculationEngine } from '../../engine';
import { calcKey } from '../../canvas/calcOrder';
import { DEFAULT_TEXT_PROPS } from '../../canvas/model/types';
import { PAGE_GAP, pageSize } from '../../export/pageGeometry';
import { sectionById } from '../../engineering/steel/sections';
import type { MathShape, Shape } from '../../canvas/model/types';
import { hollowName, type Shape as Kind } from './sections';
import { choiceLabel } from './ltbCases';
import { buildDisplay } from '../../math/MathFormatter';
import { fractionUnitLatex } from '../../math/resultUnit';

export interface Combo { name: string; N: number; Vy: number; Vz: number; My: number; Mz: number }
export interface Hollow { h: number; b: number; t: number; d: number; cf: 0 | 1 }
/** Member data (EN 1993-1-1 §6.3): lengths in m, z_g in mm (I/H only); nLT = SN003b case 1–13, 0 = user C1, C2. */
export interface Member { psi?: number; Ly: number; ky: number; Lz: number; kz: number; Llt: number; nLT: number; C1: number; C2: number; zg: number; cNA: 0 | 1; Cmy: number; Cmz: number; CmLT: number; gammaM1: number }
export const DEFAULT_MEMBER: Member = { Ly: 4, ky: 1, Lz: 4, kz: 1, Llt: 4, nLT: 1, C1: 1, C2: 0, zg: 0, cNA: 1, Cmy: 1, Cmz: 1, CmLT: 1, gammaM1: 1 };
/** fyBasis: 1 = product-standard thickness steps (Singapore / UK NA), 0 = EN 1993-1-1 Table 3.1. probes: extra worksheet values to read (verification). */
export interface SteelState { shape: Kind; sectionId: number; hollow: Hollow; fyNom: number; fyBasis: 0 | 1; gammaM0: number; eta: number; member: Member; combos: Combo[]; probes?: [latex: string, unit: string | null][] }

/** Check keys per worksheet, with labels and clauses (the summary UR is their maximum). */
const MEMBER_CHECKS: [string, string, string][] = [['b.y', 'Flexural buckling y-y', '6.3.1'], ['b.z', 'Flexural buckling z-z', '6.3.1']];
const TAIL: [string, string, string][] = [['6.61', 'Interaction (6.61)', '6.3.3, Annex B'], ['6.62', 'Interaction (6.62)', '6.3.3, Annex B']];
export const CHECKS: Record<Kind, [key: string, label: string, clause: string][]> = {
  I: [['N', 'Axial force', '6.2.3/6.2.4'], ['V.z', 'Shear V_z', '6.2.6'], ['V.y', 'Shear V_y', '6.2.6'], ['M.y', 'Bending M_y', '6.2.5'], ['M.z', 'Bending M_z', '6.2.5'], ['sec', 'Section N + M_y + M_z', '6.2.9'],
    ...MEMBER_CHECKS, ['b.T', 'Torsional buckling', '6.3.1.4'], ['LT', 'Lateral-torsional buckling', '6.3.2'], ...TAIL],
  RHS: [['N', 'Axial force', '6.2.3/6.2.4'], ['V.z', 'Shear V_z', '6.2.6'], ['V.y', 'Shear V_y', '6.2.6'], ['M.y', 'Bending M_y', '6.2.5'], ['M.z', 'Bending M_z', '6.2.5'], ['sec', 'Section N + M_y + M_z', '6.2.9'],
    ...MEMBER_CHECKS, ['LT', 'Lateral-torsional buckling', '6.3.2'], ...TAIL],
  CHS: [['N', 'Axial force', '6.2.3/6.2.4'], ['V', 'Shear (resultant)', '6.2.6'], ['M', 'Bending (resultant)', '6.2.5'], ['sec', 'Section N + M', '6.2.9'], ...MEMBER_CHECKS, ['LT', 'Bending M_y with γ_M1 (no LTB)', '6.3.2'], ...TAIL],
};
/** Section (§6.2) or member (§6.3) check. */
export const isMemberCheck = (k: string) => ['b.y', 'b.z', 'b.T', 'LT', '6.61', '6.62'].includes(k);

/** Scalars read from the sheet: [key, latex, display unit]. Missing in a worksheet → NaN. */
const PROBES: [string, string, string | null][] = [
  ['Class', '\\mathrm{Class}', null], ['UR', '\\mathrm{UR}', null], ['fy', 'f_{y}', 'MPa'], ['eps', '\\varepsilon', null], ['rho', '\\rho', null], ['n', 'n', null],
  ['A', 'A', 'mm^2'], ['Wply', 'W_{pl.y}', 'mm^3'], ['Wplz', 'W_{pl.z}', 'mm^3'], ['Wely', 'W_{el.y}', 'mm^3'], ['Welz', 'W_{el.z}', 'mm^3'], ['Wpl', 'W_{pl}', 'mm^3'], ['Wel', 'W_{el}', 'mm^3'],
  ['Iy', 'I_{y}', 'mm^4'], ['Iz', 'I_{z}', 'mm^4'], ['I', 'I', 'mm^4'],
  ['h', 'h', 'mm'], ['b', 'b', 'mm'], ['tw', 't_{w}', 'mm'], ['tf', 't_{f}', 'mm'], ['r', 'r', 'mm'], ['t', 't', 'mm'], ['d', 'd', 'mm'], ['ro', 'r_{o}', 'mm'], ['ri', 'r_{i}', 'mm'],
  ['a', 'a', null], ['aw', 'a_{w}', null], ['af', 'a_{f}', null], ['hw', 'h_{w}', 'mm'],
  ['Npl', 'N_{pl.Rd}', 'kN'], ['NV', 'N_{V.Rd}', 'kN'], ['Vplz', 'V_{pl.z.Rd}', 'kN'], ['Vply', 'V_{pl.y.Rd}', 'kN'], ['Vpl', 'V_{pl.Rd}', 'kN'],
  ['Mcy', 'M_{c.y.Rd}', 'kN m'], ['Mcz', 'M_{c.z.Rd}', 'kN m'], ['Mc', 'M_{c.Rd}', 'kN m'],
  ['MNy', 'M_{N.y.Rd}', 'kN m'], ['MNz', 'M_{N.z.Rd}', 'kN m'], ['MN', 'M_{N.Rd}', 'kN m'], ['Mply', 'M_{pl.y.Rd}', 'kN m'], ['Mplz', 'M_{pl.z.Rd}', 'kN m'], ['Mpl', 'M_{pl.Rd}', 'kN m'],
  ['URpl', '\\mathrm{UR}_{pl}', null], ['URel', '\\mathrm{UR}_{el}', null], ['gM0', '\\gamma_{M0}', null],
  ['Nby', 'N_{b.y.Rd}', 'kN'], ['Nbz', 'N_{b.z.Rd}', 'kN'], ['NbT', 'N_{b.T.Rd}', 'kN'], ['chiy', '\\chi_{y}', null], ['chiz', '\\chi_{z}', null], ['chiT', '\\chi_{T}', null],
  ['lamy', '\\lambda_{y}', null], ['lamz', '\\lambda_{z}', null], ['Mcr', 'M_{cr}', 'kN m'], ['lamLT', '\\lambda_{LT}', null], ['chiLT', '\\chi_{LT}', null], ['Mb', 'M_{b.Rd}', 'kN m'],
  ['C1', 'C_{1}', null], ['kyy', 'k_{yy}', null], ['kyz', 'k_{yz}', null], ['kzy', 'k_{zy}', null], ['kzz', 'k_{zz}', null], ['Lcry', 'L_{cr.y}', 'm'], ['Lcrz', 'L_{cr.z}', 'm'],
];

export interface SummaryLine { label: string; latex: string; ur?: number; error?: string }
export interface SummaryGroup { title: string; lines: SummaryLine[] }
const U = (k: string) => `\\mathrm{UR}_{${k}}`;
const buckling = (ax: 'y' | 'z'): [string, string][] => [[`L_{cr.${ax}}`, 'Buckling length'], [`N_{cr.${ax}}`, 'Elastic critical force'], [`\\lambda_{${ax}}`, 'Relative slenderness'],
  [`\\alpha_{${ax}}`, 'Imperfection factor'], [`\\chi_{${ax}}`, 'Reduction factor'], [`N_{b.${ax}.Rd}`, 'Buckling resistance'], [U(`b.${ax}`), 'Utilisation']];
const COMMON_HEAD: [string, [string, string][]] = ['Material and class', [['f_{y}', 'Yield strength'], ['\\varepsilon', 'Material parameter'], ['\\mathrm{Class}', 'Section class (Table 5.2)']]];
const MEMBER_TAIL = (shape: Kind): [string, [string, string][]][] => [
  ['Flexural buckling y-y (§6.3.1)', buckling('y')],
  ['Flexural buckling z-z (§6.3.1)', buckling('z')],
  ...(shape === 'I' ? [['Torsional buckling (§6.3.1.4)', [['N_{cr.T}', 'Elastic critical force'], ['\\lambda_{T}', 'Relative slenderness'], ['\\chi_{T}', 'Reduction factor'], ['N_{b.T.Rd}', 'Buckling resistance'], [U('b.T'), 'Utilisation']]] as [string, [string, string][]]] : []),
  ['Lateral-torsional buckling (§6.3.2)', [['C_{1}', 'Moment diagram factor'], ['M_{cr}', 'Elastic critical moment'], ['\\lambda_{LT}', 'Relative slenderness'], ['\\chi_{LT}', 'Reduction factor'], ['M_{b.Rd}', 'Buckling resistance moment'], [U('LT'), 'Utilisation']]],
  ['Compression and bending (§6.3.3, Annex B)', [['n_{y}', 'Axial ratio y'], ['n_{z}', 'Axial ratio z'], ['k_{yy}', 'Interaction factor'], ['k_{yz}', 'Interaction factor'], ['k_{zy}', 'Interaction factor'], ['k_{zz}', 'Interaction factor'], [U('6.61'), '(6.61)'], [U('6.62'), '(6.62)']]],
  ['Summary', [['\\mathrm{UR}_{6.2}', 'Cross-section'], ['\\mathrm{UR}_{6.3}', 'Member'], ['\\mathrm{UR}', 'Governing']]],
];
const SUMMARY: Record<Kind, [string, [string, string][]][]> = {
  I: [COMMON_HEAD,
    ['Shear (§6.2.6)', [['V_{pl.z.Rd}', 'Plastic shear resistance z'], [U('V.z'), 'Utilisation'], ['V_{pl.y.Rd}', 'Plastic shear resistance y'], [U('V.y'), 'Utilisation'], ['\\rho', 'Shear reduction (6.29)']]],
    ['Axial force and bending (§6.2.3–6.2.5)', [['N_{pl.Rd}', 'Plastic axial resistance'], [U('N'), 'Utilisation'], ['M_{c.y.Rd}', 'Bending resistance y'], [U('M.y'), 'Utilisation'], ['M_{c.z.Rd}', 'Bending resistance z'], [U('M.z'), 'Utilisation']]],
    ['Bending and axial force (§6.2.9)', [['n', 'Axial ratio'], ['M_{N.y.Rd}', 'Reduced moment resistance y'], ['M_{N.z.Rd}', 'Reduced moment resistance z'], ['\\mathrm{UR}_{el}', 'Elastic check (6.42)'], [U('sec'), 'Utilisation']]],
    ...MEMBER_TAIL('I')],
  RHS: [COMMON_HEAD,
    ['Shear (§6.2.6)', [['V_{pl.z.Rd}', 'Plastic shear resistance z'], [U('V.z'), 'Utilisation'], ['V_{pl.y.Rd}', 'Plastic shear resistance y'], [U('V.y'), 'Utilisation'], ['\\rho', 'Shear reduction (6.29)']]],
    ['Axial force and bending (§6.2.3–6.2.5)', [['N_{pl.Rd}', 'Plastic axial resistance'], [U('N'), 'Utilisation'], ['M_{c.y.Rd}', 'Bending resistance y'], [U('M.y'), 'Utilisation'], ['M_{c.z.Rd}', 'Bending resistance z'], [U('M.z'), 'Utilisation']]],
    ['Bending and axial force (§6.2.9)', [['n', 'Axial ratio'], ['M_{N.y.Rd}', 'Reduced moment resistance y'], ['M_{N.z.Rd}', 'Reduced moment resistance z'], ['\\alpha', 'Exponent (6.41)'], ['\\mathrm{UR}_{el}', 'Elastic check (6.42)'], [U('sec'), 'Utilisation']]],
    ...MEMBER_TAIL('RHS')],
  CHS: [COMMON_HEAD,
    ['Shear (§6.2.6)', [['V_{Ed}', 'Resultant shear'], ['V_{pl.Rd}', 'Plastic shear resistance'], [U('V'), 'Utilisation'], ['\\rho', 'Shear reduction (6.29)']]],
    ['Axial force and bending (§6.2.3–6.2.5)', [['N_{pl.Rd}', 'Plastic axial resistance'], [U('N'), 'Utilisation'], ['M_{Ed}', 'Resultant moment'], ['M_{c.Rd}', 'Bending resistance'], [U('M'), 'Utilisation']]],
    ['Bending and axial force (§6.2.9)', [['n', 'Axial ratio'], ['M_{N.Rd}', 'Reduced moment resistance (SCI P363)'], ['\\mathrm{UR}_{el}', 'Elastic check (6.42)'], [U('sec'), 'Utilisation']]],
    ...MEMBER_TAIL('CHS')],
};

export interface ComboResult { name: string; v: Record<string, number>; ur: Record<string, number>; extra: number[]; errors: string[] }
export interface Governing { combo: number; key: string; ur: number }

const DEF = /^(.*?)\\coloneq\s*(-?\d+(?:\.\d+)?)(.*)$/;
const UNIT: Record<string, string> = { 'N_{Ed}': 'kN', 'V_{z.Ed}': 'kN', 'V_{y.Ed}': 'kN', 'M_{y.Ed}': 'kN m', 'M_{z.Ed}': 'kN m', 'f_{y.nom}': 'MPa', h: 'mm', b: 'mm', t: 'mm', d: 'mm',
  L_y: 'm', L_z: 'm', 'L_{y}': 'm', 'L_{z}': 'm', 'L_{LT}': 'm', 'z_{g}': 'mm' };
const PLAIN = ['\\mathrm{Section}', '\\gamma_{M0}', '\\gamma_{M1}', '\\eta', '\\mathrm{CF}', 'c_{fy}', 'k_{y}', 'k_{z}', 'n_{LT}', 'C_{1.u}', 'C_{2.u}', 'C_{1}', 'c_{NA}', 'C_{my}', 'C_{mz}', 'C_{mLT}'];
const LATEX_UNIT: Record<string, string> = { kN: '\\,\\mathrm{kN}', 'kN m': '\\,\\mathrm{kN}\\cdot\\mathrm{m}', MPa: '\\,\\mathrm{MPa}', mm: '\\,\\mathrm{mm}', m: '\\,\\mathrm{m}' };

export class SteelModel {
  readonly doc: { shapes: Shape[]; inputResult?: { rows: unknown[] } } & Record<string, unknown>;
  private readonly e = new CalculationEngine({ unitSystem: 'SI' });
  /** input name → region id */
  private readonly ids = new Map<string, string>();
  private readonly current = new Map<string, number>();
  /** defined name → region id (first definition) */
  private readonly byName = new Map<string, string>();

  readonly shape: Kind;

  constructor(raw: string, shape: Kind) {
    this.shape = shape;
    this.doc = JSON.parse(raw);
    const rec = Object.fromEntries(this.doc.shapes.map((s) => [s.id, s]));
    for (const s of this.doc.shapes) {
      if (s.type !== 'math') continue;
      const m = DEF.exec((s as MathShape).props.latex.trim());
      if (m && (m[1] in UNIT || PLAIN.includes(m[1])) && !this.ids.has(m[1])) this.ids.set(m[1], s.id);
    }
    this.e.batch(() => {
      for (const s of this.doc.shapes) {
        if (s.type !== 'math') continue;
        const p = (s as MathShape).props;
        this.e.setRegion(s.id, { latex: p.latex, order: calcKey(s, rec), displayUnit: p.displayUnit?.trim() || null, precision: p.precision >= 0 ? p.precision : null });
        const name = /^(.*?)\\coloneq/.exec(p.latex.trim())?.[1];
        if (name && !this.byName.has(name)) this.byName.set(name, s.id);
      }
      PROBES.forEach(([k, latex, unit], i) => this.e.setRegion(`probe:${k}`, { latex: `${latex}=`, order: [1e9, i] as never, displayUnit: unit, precision: null }));
      CHECKS[this.shape].forEach(([k], i) => this.e.setRegion(`probe:UR.${k}`, { latex: `\\mathrm{UR}_{${k}}=`, order: [1e9, 100 + i] as never, displayUnit: null, precision: null }));
    });
  }

  private set(name: string, value: number): void {
    const id = this.ids.get(name);
    if (!id || !Number.isFinite(value) || this.current.get(name) === value) return;
    this.current.set(name, value);
    this.e.setDefinitionOverride(id, { value, unit: UNIT[name] ?? null } as never);
  }

  /** Section, material and factors (everything but the load combination). */
  setSection(st: SteelState): void {
    this.e.batch(() => {
      this.set('f_{y.nom}', st.fyNom);
      this.set('c_{fy}', st.fyBasis ?? 1);
      this.set('\\gamma_{M0}', st.gammaM0);
      this.set('\\eta', st.eta);
      if (this.shape === 'I') this.set('\\mathrm{Section}', st.sectionId);
      if (this.shape === 'RHS') { this.set('h', st.hollow.h); this.set('b', st.hollow.b); this.set('t', st.hollow.t); this.set('\\mathrm{CF}', st.hollow.cf); }
      if (this.shape === 'CHS') { this.set('d', st.hollow.d); this.set('t', st.hollow.t); this.set('\\mathrm{CF}', st.hollow.cf); }
      for (const [name, v] of Object.entries(memberValues(st))) this.set(name, v);
    });
  }

  private probed = 0;
  /** Extra values by worksheet name (probe regions after the sheet). */
  private extra(probes: [string, string | null][] = []): number[] {
    if (probes.length > this.probed) {
      this.e.batch(() => { for (let i = this.probed; i < probes.length; i++) this.e.setRegion(`probe:x${i}`, { latex: '0=', order: [1e9, 1000 + i] as never, displayUnit: null, precision: null }); });
      this.probed = probes.length;
    }
    this.e.batch(() => probes.forEach(([latex, unit], i) => this.e.setRegion(`probe:x${i}`, { latex: `${latex}=`, order: [1e9, 1000 + i] as never, displayUnit: unit, precision: null })));
    return probes.map((_, i) => { const r = this.e.getResult(`probe:x${i}`); return r?.status === 'valid' ? r.value!.number! : NaN; });
  }

  run(c: Combo, probes?: [string, string | null][]): ComboResult {
    this.e.batch(() => {
      this.set('N_{Ed}', c.N); this.set('M_{y.Ed}', c.My); this.set('M_{z.Ed}', c.Mz); this.set('V_{z.Ed}', c.Vz); this.set('V_{y.Ed}', c.Vy);
    });
    const v: Record<string, number> = {}, ur: Record<string, number> = {};
    for (const [k] of PROBES) { const r = this.e.getResult(`probe:${k}`); v[k] = r?.status === 'valid' ? r.value!.number! : NaN; }
    for (const [k] of CHECKS[this.shape]) { const r = this.e.getResult(`probe:UR.${k}`); ur[k] = r?.status === 'valid' ? r.value!.number! : NaN; }
    const errors: string[] = [];
    if (!Number.isFinite(v.UR)) {
      for (const s of this.doc.shapes) {
        const r = s.type === 'math' ? this.e.getResult(s.id) : null;
        if (r?.status === 'error') errors.push(`${(s as MathShape).props.latex.slice(0, 48)}: ${r.error?.message}`);
        if (errors.length >= 3) break;
      }
    }
    return { name: c.name, v, ur, extra: this.extra(probes), errors };
  }

  runAll(st: SteelState): ComboResult[] {
    this.setSection(st);
    return st.combos.map((c) => this.run(c, st.probes));
  }

  /** Lightest-first candidates: every combination must pass (UR ≤ target, Class ≤ 3). The previous worst combination is tried first. */
  passes(st: SteelState, target: number, order: number[]): { ok: boolean; worst: number; ur: number } {
    this.setSection(st);
    let worst = -1, max = -Infinity;
    for (const i of order) {
      const r = this.run(st.combos[i]);
      const u = Number.isFinite(r.v.UR) && r.v.Class <= 3 ? r.v.UR : Infinity;
      if (u > max) { max = u; worst = i; }
      if (u > target) return { ok: false, worst: i, ur: u };
    }
    return { ok: true, worst, ur: max };
  }

  /**
   * Main formulas of one combination for the page: each as name = formula = result (no substitution;
   * a piecewise definition shows only its value), grouped by check, with the check utilisations.
   */
  summary(st: SteelState, combo: number): SummaryGroup[] {
    this.setSection(st);
    this.run(st.combos[combo] ?? st.combos[0]);
    const line = (name: string, label: string): SummaryLine | null => {
      const id = this.byName.get(name);
      if (!id) return null;
      const shape = this.doc.shapes.find((x) => x.id === id) as MathShape;
      const r = this.e.getResult(id);
      if (!r || r.status !== 'valid') return { label, latex: shape.props.latex, error: r?.error?.message ?? 'not calculated' };
      const unit = r.value?.unitLatex;
      const res = unit ? { ...r, value: { ...r.value!, latex: r.value!.latex.replace(unit, fractionUnitLatex(unit)) } } : r;
      const piecewise = shape.props.latex.includes('\\begin{array}');
      const latex = buildDisplay(shape.props.latex, res, piecewise ? 'result' : 'formulaResult').latex;
      const ur = name.startsWith('\\mathrm{UR}') && !/_\{(el|pl)\}$/.test(name) ? r.value?.number : undefined;
      return { label, latex, ...(ur !== undefined ? { ur } : {}) };
    };
    return SUMMARY[this.shape].map(([title, rows]) => ({ title, lines: rows.map(([n, l]) => line(n, l)).filter((x): x is SummaryLine => !!x) }))
      .filter((g) => g.lines.length);
  }

  /** The worksheet with the page inputs and the governing combination written in, all combinations in Input & Results. */
  reportDocument(st: SteelState, results: ComboResult[], gov: Governing): Record<string, unknown> {
    const c = st.combos[gov.combo] ?? st.combos[0];
    const values: Record<string, number> = {
      'f_{y.nom}': st.fyNom, 'c_{fy}': st.fyBasis ?? 1, '\\gamma_{M0}': st.gammaM0, '\\eta': st.eta, 'N_{Ed}': c.N, 'M_{y.Ed}': c.My, 'M_{z.Ed}': c.Mz, 'V_{z.Ed}': c.Vz, 'V_{y.Ed}': c.Vy,
      ...(this.shape === 'I' ? { '\\mathrm{Section}': st.sectionId } : this.shape === 'RHS' ? { h: st.hollow.h, b: st.hollow.b, t: st.hollow.t, '\\mathrm{CF}': st.hollow.cf } : { d: st.hollow.d, t: st.hollow.t, '\\mathrm{CF}': st.hollow.cf }),
      ...memberValues(st),
    };
    const shapes: Shape[] = this.doc.shapes.map((s) => {
      if (s.type !== 'math') return s;
      const m = DEF.exec((s as MathShape).props.latex.trim());
      if (!m || !(m[1] in values) || this.ids.get(m[1]) !== s.id) return s;
      const u = UNIT[m[1]];
      return { ...s, props: { ...(s as MathShape).props, latex: `${m[1]}\\coloneq ${+values[m[1]].toPrecision(10)}${u ? LATEX_UNIT[u] : ''}` } } as Shape;
    });
    const name = this.shape === 'I' ? sectionById(st.sectionId).name : hollowName(this.shape === 'RHS' ? { kind: 'RHS', ...st.hollow } : { kind: 'CHS', d: st.hollow.d, t: st.hollow.t });
    const keys = CHECKS[this.shape].map(([k]) => k);
    const f = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '–');
    const rows = st.combos.map((cb, i) => {
      const r = results[i], g = i === gov.combo ? ' <b>(governing: the sheet above)</b>' : '';
      return `<li>${escape(cb.name)}: N = ${f(cb.N, 1)} kN, M<sub>y</sub> = ${f(cb.My, 1)}, M<sub>z</sub> = ${f(cb.Mz, 1)} kN m, V<sub>z</sub> = ${f(cb.Vz, 1)}, V<sub>y</sub> = ${f(cb.Vy, 1)} kN → Class ${f(r?.v.Class ?? NaN, 0)}, ${keys.map((k) => `UR<sub>${k}</sub> ${f(r?.ur[k] ?? NaN)}`).join(', ')}; <b>UR ${f(r?.v.UR ?? NaN)}</b>${g}</li>`;
    }).join('');
    const stride = pageSize('portrait').h + PAGE_GAP;
    const y0 = (Math.floor(Math.max(...shapes.map((s) => s.y)) / stride) + 1) * stride + 60;
    shapes.push({ id: 'steel-combos', type: 'text', x: 76, y: y0, props: { ...DEFAULT_TEXT_PROPS, fontFamily: 'Roboto', fontSize: 12, w: 640, h: 90 + 44 * st.combos.length, pageBreak: true,
      html: `<h2>Load combinations (mSteelBeamColumn)</h2><p>${escape(name)}, f<sub>y,nom</sub> = ${st.fyNom} MPa (${st.fyBasis === 0 ? 'EN 1993-1-1 Table 3.1' : 'product standard'}). Member: ${memberText(st, this.shape)}. The sheet is evaluated for the governing combination; every combination is also in Input &amp; Results (Calculation tab) to re-run or print.</p><ul>${rows}</ul>` } } as unknown as Shape);
    const ir = this.doc.inputResult as { rows: unknown[] } | undefined;
    const inputResult = ir ? { ...ir, rows: st.combos.map((cb, i) => ({ id: `c${i + 1}`, name: cb.name, values: { n: cb.N, my: cb.My, mz: cb.Mz, vz: cb.Vz, vy: cb.Vy } })) } : undefined;
    return { ...this.doc, title: `Steel cross-section check – ${name}`, shapes, ...(inputResult ? { inputResult } : {}) };
  }
}

/** Worksheet inputs of the member data (names not in a sheet are ignored). */
function memberValues(st: SteelState): Record<string, number> {
  const m = st.member;
  return { '\\gamma_{M1}': m.gammaM1, 'L_{y}': m.Ly, 'k_{y}': m.ky, 'L_{z}': m.Lz, 'k_{z}': m.kz, 'L_{LT}': m.Llt, 'n_{LT}': m.nLT, 'C_{1.u}': m.C1, 'C_{2.u}': m.C2, 'C_{1}': m.C1,
    'z_{g}': m.zg, 'c_{NA}': m.cNA, 'C_{my}': m.Cmy, 'C_{mz}': m.Cmz, 'C_{mLT}': m.CmLT };
}

/** Member data as written into the sheet, with the source of C1, C2 (SN003b case, ψ or user). */
function memberText(st: SteelState, shape: Kind): string {
  const m = st.member;
  const parts = [`L_y = ${m.Ly} m (k_y ${m.ky})`, `L_z = ${m.Lz} m (k_z ${m.kz})`];
  if (shape !== 'CHS') parts.push(`L_LT = ${m.Llt} m`, `moment diagram: ${escape(choiceLabel(m))}`, `LTB ${m.cNA ? '§6.3.2.3 with the Singapore / UK NA' : '§6.3.2.2'}`);
  if (shape === 'I') parts.push(`z_g = ${+m.zg.toFixed(1)} mm`);
  parts.push(`C_my ${m.Cmy}, C_mz ${m.Cmz}${shape === 'I' ? `, C_mLT ${m.CmLT}` : ''}`, `γ_M1 ${m.gammaM1}`);
  return parts.join('; ');
}

function escape(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Governing combination and check over all results (a result that cannot be evaluated never passes). */
export function governing(results: ComboResult[], shape: Kind): Governing {
  let g: Governing = { combo: 0, key: '', ur: -Infinity };
  results.forEach((r, i) => {
    for (const [k] of CHECKS[shape]) {
      const u = Number.isFinite(r.ur[k]) ? r.ur[k] : Infinity;
      if (u > g.ur) g = { combo: i, key: k, ur: u };
    }
    if (!(r.v.Class <= 3) && g.ur < Infinity) g = { combo: i, key: 'class', ur: Infinity };
  });
  return g;
}
