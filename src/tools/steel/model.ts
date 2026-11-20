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

export interface Combo { name: string; N: number; Vy: number; Vz: number; My: number; Mz: number }
export interface Hollow { h: number; b: number; t: number; d: number; cf: 0 | 1 }
export interface SteelState { shape: Kind; sectionId: number; hollow: Hollow; fyNom: number; gammaM0: number; eta: number; combos: Combo[] }

/** Check keys per worksheet, with labels and clauses (the summary UR is their maximum). */
export const CHECKS: Record<Kind, [key: string, label: string, clause: string][]> = {
  I: [['N', 'Axial force', '6.2.3/6.2.4'], ['V.z', 'Shear V_z', '6.2.6'], ['V.y', 'Shear V_y', '6.2.6'], ['M.y', 'Bending M_y', '6.2.5'], ['M.z', 'Bending M_z', '6.2.5'], ['sec', 'N + M_y + M_z', '6.2.9']],
  RHS: [['N', 'Axial force', '6.2.3/6.2.4'], ['V.z', 'Shear V_z', '6.2.6'], ['V.y', 'Shear V_y', '6.2.6'], ['M.y', 'Bending M_y', '6.2.5'], ['M.z', 'Bending M_z', '6.2.5'], ['sec', 'N + M_y + M_z', '6.2.9']],
  CHS: [['N', 'Axial force', '6.2.3/6.2.4'], ['V', 'Shear (resultant)', '6.2.6'], ['M', 'Bending (resultant)', '6.2.5'], ['sec', 'N + M', '6.2.9']],
};

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
];

export interface ComboResult { name: string; v: Record<string, number>; ur: Record<string, number>; errors: string[] }
export interface Governing { combo: number; key: string; ur: number }

const DEF = /^(.*?)\\coloneq\s*(-?\d+(?:\.\d+)?)(.*)$/;
const UNIT: Record<string, string> = { 'N_{Ed}': 'kN', 'V_{z.Ed}': 'kN', 'V_{y.Ed}': 'kN', 'M_{y.Ed}': 'kN m', 'M_{z.Ed}': 'kN m', 'f_{y.nom}': 'MPa', h: 'mm', b: 'mm', t: 'mm', d: 'mm' };
const LATEX_UNIT: Record<string, string> = { kN: '\\,\\mathrm{kN}', 'kN m': '\\,\\mathrm{kN}\\cdot\\mathrm{m}', MPa: '\\,\\mathrm{MPa}', mm: '\\,\\mathrm{mm}' };

export class SteelModel {
  readonly doc: { shapes: Shape[]; inputResult?: { rows: unknown[] } } & Record<string, unknown>;
  private readonly e = new CalculationEngine({ unitSystem: 'SI' });
  /** input name → region id */
  private readonly ids = new Map<string, string>();
  private readonly current = new Map<string, number>();

  readonly shape: Kind;

  constructor(raw: string, shape: Kind) {
    this.shape = shape;
    this.doc = JSON.parse(raw);
    const rec = Object.fromEntries(this.doc.shapes.map((s) => [s.id, s]));
    for (const s of this.doc.shapes) {
      if (s.type !== 'math') continue;
      const m = DEF.exec((s as MathShape).props.latex.trim());
      if (m && (m[1] in UNIT || ['\\mathrm{Section}', '\\gamma_{M0}', '\\eta', '\\mathrm{CF}'].includes(m[1])) && !this.ids.has(m[1])) this.ids.set(m[1], s.id);
    }
    this.e.batch(() => {
      for (const s of this.doc.shapes) if (s.type === 'math') this.e.setRegion(s.id, { latex: (s as MathShape).props.latex, order: calcKey(s, rec), displayUnit: (s as MathShape).props.displayUnit || null, precision: null });
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
      this.set('\\gamma_{M0}', st.gammaM0);
      this.set('\\eta', st.eta);
      if (this.shape === 'I') this.set('\\mathrm{Section}', st.sectionId);
      if (this.shape === 'RHS') { this.set('h', st.hollow.h); this.set('b', st.hollow.b); this.set('t', st.hollow.t); this.set('\\mathrm{CF}', st.hollow.cf); }
      if (this.shape === 'CHS') { this.set('d', st.hollow.d); this.set('t', st.hollow.t); }
    });
  }

  run(c: Combo): ComboResult {
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
    return { name: c.name, v, ur, errors };
  }

  runAll(st: SteelState): ComboResult[] {
    this.setSection(st);
    return st.combos.map((c) => this.run(c));
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

  /** The worksheet with the page inputs and the governing combination written in, all combinations in Input & Results. */
  reportDocument(st: SteelState, results: ComboResult[], gov: Governing): Record<string, unknown> {
    const c = st.combos[gov.combo] ?? st.combos[0];
    const values: Record<string, number> = {
      'f_{y.nom}': st.fyNom, '\\gamma_{M0}': st.gammaM0, '\\eta': st.eta, 'N_{Ed}': c.N, 'M_{y.Ed}': c.My, 'M_{z.Ed}': c.Mz, 'V_{z.Ed}': c.Vz, 'V_{y.Ed}': c.Vy,
      ...(this.shape === 'I' ? { '\\mathrm{Section}': st.sectionId } : this.shape === 'RHS' ? { h: st.hollow.h, b: st.hollow.b, t: st.hollow.t, '\\mathrm{CF}': st.hollow.cf } : { d: st.hollow.d, t: st.hollow.t }),
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
      html: `<h2>Load combinations (mSteelBeamColumn)</h2><p>${escape(name)}, f<sub>y,nom</sub> = ${st.fyNom} MPa. The sheet is evaluated for the governing combination; every combination is also in Input &amp; Results (Calculation tab) to re-run or print.</p><ul>${rows}</ul>` } } as unknown as Shape);
    const ir = this.doc.inputResult as { rows: unknown[] } | undefined;
    const inputResult = ir ? { ...ir, rows: st.combos.map((cb, i) => ({ id: `c${i + 1}`, name: cb.name, values: { n: cb.N, my: cb.My, mz: cb.Mz, vz: cb.Vz, vy: cb.Vy } })) } : undefined;
    return { ...this.doc, title: `Steel cross-section check – ${name}`, shapes, ...(inputResult ? { inputResult } : {}) };
  }
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
