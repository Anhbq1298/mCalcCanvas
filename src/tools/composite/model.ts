/**
 * mCompositeBeamDesign: the EC4 composite beam worksheet (templates/Composite_Beam_EC4.mCCV)
 * run headless on the CalcCanvas engine. The worksheet is the single source of the
 * calculation: this model only finds its inputs, overrides them, and reads results.
 * No formula is duplicated here.
 */
import { sections } from '../../engineering/steel/sections';
import { chiLTMod, ltbCriticalFactor, solveBeam, type DistLoad } from '../../engineering/fem';
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
  ['at', 'a_t', 'mm^2/m'], ['ctop', 'c_{top}', null], ['ab', 'a_b', 'mm^2/m'], ['lb', 'l_b', 'mm'], ['chd', 'c_{hd}', 'mm'], ['cb', 'c_b', 'mm'], ['thead', 't_{head}', 'mm'], ['lc', 'l_c', 'mm'], ['ccc', 'c_{cc}', null], ['vcEd', 'v_{c.Ed}', 'MPa'], ['ascReq', 'a_{sf.c.req}', 'mm^2/m'], ['vbEd', 'v_{b.Ed}', 'MPa'], ['asbReq', 'a_{sf.b.req}', 'mm^2/m'], ['asb', 'a_{sf.b}', 'mm^2/m'],
  ['dhead', 'd_{head}', 'mm'], ['hsc', 'h_{sc}', 'mm'], ['dsc', 'd_{sc}', 'mm'], ['b0', 'b_0', 'mm'],
  // profiled steel deck (all neutral for a solid slab: h_pe = 0, k_d = 1, n_re = 1)
  ['cdeck', 'c_{deck}', null], ['ctr', 'c_{tr}', null], ['hpe', 'h_{pe}', 'mm'], ['ht', 'h_t', 'mm'], ['br', 'b_r', 'mm'], ['er', 'e_r', 'mm'], ['kd', 'k_d', null], ['kt', 'k_t', null], ['kl', 'k_l', null], ['ktmax', 'k_{t.max}', null],
  ['nre', 'n_{re}', null], ['sA', 's_A', 'mm'], ['sB', 's_B', 'mm'], ['ape', 'a_{pe}', 'mm^2/m'], ['cbb', 'c_{bb}', null], ['Idyn', 'I_{dyn}', 'cm^4'], ['NcRd', 'N_{c.Rd}', 'kN'], ['LLT', 'L_{LT}', 'm'], ['smax', 's_{max}', 'mm'], ['smin', 's_{min}', 'mm'], ['dgmax', '\\delta_{g.max}', 'mm'], ['cbrace', 'c_{brace}', null], ['rlim', 'r_{lim}', null], ['rlim1', 'r_{lim.1}', null], ['rlimq', 'r_{lim.q}', null], ['c16', 'c_{16}', null], ['cre', 'c_{re}', null],
  // deflection
  ['dmax', '\\delta_{max}', 'mm'], ['wc', 'w_c', 'mm'], ['ccam', 'c_{cam}', null], ['dlim', '\\delta_{lim}', 'mm'], ['dq', '\\delta_{q.max}', 'mm'], ['dnc', '\\delta_{nc}', 'mm'], ['f1', 'f_1', 'Hz'], ['f1nc', 'f_{1.nc}', 'Hz'], ['flim', 'f_{lim}', 'Hz'], ['Ecdyn', 'E_{c.dyn}', 'GPa'], ['ddyn', '\\delta_{dyn}', 'mm'], ['ddynnc', '\\delta_{dyn.nc}', 'mm'], ['LLTnc', 'L_{LT.nc}', 'mm'],
  // tapered beam
  ['McrSN', 'M_{cr.SN}', 'kN m'], ['McrSheet', 'M_{cr}', 'kN m'], ['McrncSN', 'M_{cr.nc.SN}', 'kN m'], ['ctap', 'c_{tap}', null], ['hA', 'h_A', 'mm'], ['hB', 'h_B', 'mm'],
  ['Ea', 'E_a', 'MPa'], ['Ga', 'G_a', 'MPa'], ['gM1', '\\gamma_{M1}', null], ['aLT', '\\alpha_{LT}', null], ['cweld', 'c_{weld}', null], ['czg', 'c_{zg}', null], ['cNA', 'c_{NA}', null], ['kGM', 'k_{G.M}', null], ['kQM', 'k_{Q.M}', null], ['cbM', 'c_{b.M}', null], ['Mamax', 'M_{a.max}', 'kN m'], ['Mbmax', 'M_{b.max}', 'kN m'], ['Lbr', 'L_{br}', 'm'], ['kLT', 'k_{LT}', null],
  ['cFP', 'c_{F.P}', null], ['FRda', 'F_{Rd.a}', 'kN'], ['MelRd', 'M_{el.Rd}', 'kN m'],
];
/** Utilisations the summary uses but the check table does not list (bare-steel bending and shear at x_M). */
const EXTRA_UR = ['M.nc', 'V.nc'];

/**
 * Tapered beam: how each check is combined from the sheet run at the depths of the critical sections.
 * support: shear-type checks at A and B, scaled by each end's reaction; max: the worst depth (stability,
 * interaction, local web checks); span: deflections, weighted by the curvature–virtual-moment product
 * along the span; x: bending along the span against the resistance at the local depth; load: the web under
 * each point load (F.P, FM, FM.nc) at the depth h(a_i) of that load. Every other check
 * is taken at the section of the maximum moment, x_M.
 */
const TAPER_SUPPORT = ['V.1', 'V.2', 'F.S', 'V.nc'];
const TAPER_MAX = ['LT', 'LT.nc', 'MV', 'MV.nc', 'F.P', 'FM', 'FM.nc'];
/** Web checks under the point loads, recomputed at the depth h(a_i) of each load (replacing the worst-depth bound). */
const TAPER_LOAD = ['F.P', 'FM', 'FM.nc'];
const TAPER_SPAN = ['d.1', 'd.x', 'd.q', 'd.nc', 'd.q.nc'];
const TAPER_FREQ = ['fn', 'fn.nc'];
const UR_COMPOSITE = ['M.2', 'M.x', 'MV', 'V.2', 'F.P', 'F.S', 'FM', 'd.x', 'd.q', 'fn', 'sf', 'L', 'sf.b', 'L.b', 'sf.c', 'L.c'];
const UR_BARE = ['M.nc', 'MV.nc', 'V.nc', 'LT.nc', 'F.P', 'F.S', 'FM.nc', 'd.nc', 'd.q.nc', 'fn.nc'];

/**
 * Lateral-torsional buckling of the steel beam alone by finite elements (src/engineering/fem), for uniform and
 * tapered beams alike, simply supported with fork supports:
 * - internal forces by the in-plane beam FE (beam.ts), the LTB eigenvalue α_cr with the real moment diagram and
 *   the load height (ltb.ts); M_cr = α_cr M_Ed,max is used directly (no C1 / C2);
 * - EN 1993-1-1 §6.3.2 / §6.3.4: α_ult,k = min_x W_pl(x) f_y / M_Ed(x), λ̄ = √(α_ult,k / α_cr), χ_LT by the NA
 *   (c_NA = 1 Singapore: §6.3.2.3 (6.57)–(6.58) for rolled sections, k_c = 1/√C1 with C1 from the FE; else (6.56)),
 *   UR = γ_M1 / (χ_LT α_ult,k). For a uniform beam this is §6.3.2 with M_cr from the FE (λ̄ = √(W_pl f_y / M_cr)).
 *   Curve (Table 6.4) by h/b at the critical section: rolled I a / b; a tapered beam welded (c_weld = 1) c / d.
 * - Construction (LT): w_1,Ed on the simple span L; bracing (c_brace, k_LT) = fork restraints at k_LT L, the moment
 *   diagram unchanged. Not used when the deck restrains the flange (L_LT = e_r, the sheet's value stays).
 * - Bare steel (LT.nc): the ULS design loads (self-weight and the load tables) on the whole span, only when the
 *   flange is unrestrained (L_LT,nc = L); with the studs restraining it the sheet's value stays.
 * - Load position c_zg: 1 top flange (z_g = h(x)/2), 0 shear centre, −1 bottom flange, for every load.
 */
type LtbOut = { ur: number; x: number; acr: number; aul: number; lam: number; chi: number; alpha: number; Mcr: number; C1: number };
/** ULS loads of the composite stage on the steel beam, N/mm, N and mm: self-weight γ_G,sw g_0 and the load tables. */
export interface FeLoads { dist: DistLoad[]; point: { x: number; P: number }[] }
function feLtb(rM: Results, rRef: Results, hAtM: (x: number) => number, loads: FeLoads | null): { LT?: LtbOut; nc?: LtbOut } {
  const hAt = (xmm: number) => hAtM(xmm / 1000); // depth at x in mm
  const hR = rRef.h_a, tf = rRef.t_f, tw = rRef.t_w, b = rRef.b_a, r = rRef.r, fy = rRef.f_y, E = rRef.Ea, G = rRef.Ga;
  if (![hR, tf, tw, b, r, fy, E, G, rRef.I_z, rRef.I_t, rRef.I_w, rRef.W_pl].every(Number.isFinite)) return {};
  const Af = (1 - Math.PI / 4) * r * r;
  const Wnom = (h: number) => b * tf * (h - tf) + (tw * (h - 2 * tf) ** 2) / 4 + 4 * Af * (h / 2 - tf - 0.2234 * r);
  // properties at depth h from the run at h_ref, the sheet's own rules (section 1.4), mm
  const Iz = (h: number) => rRef.I_z * 1e4 + (tw ** 3 * (h - hR)) / 12;
  const It = (h: number) => rRef.I_t * 1e4 + (tw ** 3 * (h - hR)) / 3;
  const Iw = (h: number) => rRef.I_w * 1e6 * ((h - tf) / (hR - tf)) ** 2;
  const Wpl = (h: number) => rRef.W_pl * 1e3 + Wnom(h) - Wnom(hR);
  const props = (x: number) => { const h = hAt(x); return { EIz: E * Iz(h), GIt: G * It(h), EIw: E * Iw(h) }; };
  const gM1 = Number.isFinite(rM.gM1) ? rM.gM1 : 1;
  const welded = rM.ctap >= 1 && !(rM.cweld < 1); // as the sheet's α_LT
  // National Annex (c_NA = 1 Singapore, = UK NA values): rolled §6.3.2.3 with λ0 0.4, β 0.75, curves b / c / d by
  // h/b ≤ 2 / ≤ 3.1, k_c = 1/√C1; welded λ0 0.2, β 1, c / d. Recommended values: §6.3.2.2, Table 6.4.
  const na = !(rM.cNA < 1);
  const alphaAt = (h: number) => (welded ? (h / b <= 2 ? 0.49 : 0.76) : na ? (h / b <= 2 ? 0.34 : h / b <= 3.1 ? 0.49 : 0.76) : h / b <= 2 ? 0.21 : 0.34);
  const rolled632 = na && !welded, lam0 = rolled632 ? 0.4 : 0.2, beta = rolled632 ? 0.75 : 1;
  const zf = Number.isFinite(rM.czg) ? Math.max(-1, Math.min(1, rM.czg)) : 1; // load height, fraction of h/2
  const L = rM.L * 1000;
  // one simply supported, fork-ended span [x0, x0 + l] (mm) under its loads: FE internal forces, then the eigenvalue
  const segment = (x0: number, l: number, sl: FeLoads, braces: number[] = []) => {
    const beam = solveBeam({ L: l, EI: () => E * rRef.I_a * 1e4, supports: [{ x: 0, w: true }, { x: l, w: true }], loads: sl });
    const qAt = (x: number) => sl.dist.reduce((s, d) => s + (x >= d.x1 - 1e-9 && x <= d.x2 + 1e-9 ? d.q1 : 0), 0);
    const acr = ltbCriticalFactor({
      L: l, props: (x) => props(x0 + x), M: beam.M, restraints: braces, elements: 24 + 8 * braces.length,
      qzg: (x) => (qAt(x) * zf * hAt(x0 + x)) / 2,
      pointLoads: sl.point.map((p) => ({ x: p.x, Pzg: (p.P * zf * hAt(x0 + p.x)) / 2 })),
    });
    let au = Infinity, xu = x0 + l / 2, Mmax = 0;
    for (let i = 0; i <= 200; i++) {
      const x = (l * i) / 200, m = Math.abs(beam.M(x));
      Mmax = Math.max(Mmax, m);
      if (m > 1e-9) { const a = (Wpl(hAt(x0 + x)) * fy) / m; if (a < au) { au = a; xu = x0 + x; } }
    }
    if (!Number.isFinite(au) || !(acr > 0)) return null;
    // k_c = 1/√C1 (Singapore NA, rolled): C1 = M_cr of this moment diagram at the shear centre / M_cr of a uniform
    // moment, both by the FE with the same restraints
    let C1 = 1;
    if (rolled632) {
      const base = { L: l, props: (x: number) => props(x0 + x), restraints: braces, elements: 24 + 8 * braces.length };
      C1 = Math.max(1, (ltbCriticalFactor({ ...base, M: beam.M }) * Mmax) / ltbCriticalFactor({ ...base, M: () => 1 }));
    }
    const alpha = alphaAt(hAt(xu)), lam = Math.sqrt(au / acr), { chi } = chiLTMod(lam, alpha, lam0, beta, rolled632 ? 1 / Math.sqrt(C1) : 1);
    return { ur: gM1 / (chi * au), x: xu / 1000, acr, aul: au, lam, chi, alpha, Mcr: (acr * Mmax) / 1e6, C1 };
  };
  const out: ReturnType<typeof feLtb> = {};
  const w1 = rM.w1; // kN/m = N/mm
  // construction: the simple span L under w_1,Ed; bracing (c_brace, k_LT) adds fork restraints at k_LT L, the
  // moments stay those of the span. Not used when the deck restrains the flange (L_LT = e_r).
  if (Number.isFinite(w1) && !(rM.LLT * 1000 < rM.Lbr * 1000 - 1)) {
    const n = rM.cbrace >= 1 && rM.kLT > 0 ? Math.max(1, Math.round(1 / rM.kLT)) : 1;
    const braces = Array.from({ length: n - 1 }, (_, i) => ((i + 1) * L) / n);
    const s = segment(0, L, { dist: [{ x1: 0, x2: L, q1: w1 }], point: [] }, braces);
    if (s) out.LT = s;
  }
  if (loads && rM.LLTnc >= L - 1) {
    const s = segment(0, L, loads);
    if (s) out.nc = s;
  }
  return out;
}

/** Write the finite-element LTB into a result: UR, location, α_cr, M_cr; then the design summary again. */
function applyFeLtb(out: Results, lt: ReturnType<typeof feLtb>, at: (k: string, x: number) => void): void {
  for (const [k, v] of [['LT', lt.LT], ['LT.nc', lt.nc]] as const) {
    if (!v) continue;
    out[`UR.${k}`] = v.ur; at(k, v.x);
    out[`acr.${k}`] = v.acr; out[`aul.${k}`] = v.aul; out[`lam.${k}`] = v.lam; out[`chi.${k}`] = v.chi; out[`alpha.${k}`] = v.alpha; out[`Mcr.${k}`] = v.Mcr; out[`C1.${k}`] = v.C1;
  }
}

/** Permanent-stage summary, as the sheet: the composite or the bare-steel set. */
function urDes(r: Results): number {
  const max = (keys: string[]) => Math.max(...keys.map((k) => r[`UR.${k}`]).filter(Number.isFinite));
  return r.comp >= 1 ? max(UR_COMPOSITE) : max(UR_BARE);
}

/** Linear interpolation of y over x (x ascending, clamped at the ends). */
function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return xs[i] - xs[i - 1] < 1e-12 ? ys[i] : ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}

/**
 * Combine sheet runs at the depths of the critical sections of a tapered beam (depth h_A at x = 0 to h_B at
 * x = L). runs: the results at depth h(x_M), h_A and h_B, plus rP at the depths of the point-load positions
 * (nodes for values at a local depth). The result reads like a single run: same keys, the
 * section values of x_M, the checks combined as above, plus at.<check> = x (m) of the governing section
 * (NaN for span-wide checks and the worst-depth checks) and hat.<check> = the depth used (mm; NaN span-wide).
 */
export function combineTaper(rM: Results, rA: Results, rB: Results, rP: Results[] = [], loads: FeLoads | null = null): Results {
  const L = rM.L, hA = rM.hA, hB = rM.hB, xM = rM.xM;
  const hAt = (x: number) => hA + ((hB - hA) * x) / L;
  const out = { ...rM, vectors: { ...rM.vectors }, errors: [rM, rA, rB, ...rP].flatMap((r) => r.errors) } as Results;
  const at = (k: string, x: number, h = Number.isFinite(x) ? hAt(x) : NaN) => { out[`at.${k}`] = x; out[`hat.${k}`] = h; };
  for (const [k] of CHECKS) at(k, xM);
  for (const k of EXTRA_UR) at(k, xM);
  const V = rM.vectors.V ?? [];
  const RA = Math.abs(V[0] ?? 1), RB = Math.abs(V[V.length - 1] ?? 1), R = Math.max(RA, RB, 1e-9);
  for (const k of TAPER_SUPPORT) {
    // V.1 (construction, uniform load) has equal reactions; the composite-stage reactions scale the others
    const a = rA[`UR.${k}`] * (k === 'V.1' ? 1 : RA / R), b = rB[`UR.${k}`] * (k === 'V.1' ? 1 : RB / R);
    out[`UR.${k}`] = Math.max(a, b);
    at(k, a >= b ? 0 : L);
  }
  for (const k of TAPER_MAX) {
    const c = [[rM[`UR.${k}`], xM], [rA[`UR.${k}`], 0], [rB[`UR.${k}`], L]].filter(([u]) => Number.isFinite(u)).sort((p, q) => q[0] - p[0]);
    if (!c.length) continue;
    out[`UR.${k}`] = c[0][0];
    at(k, NaN, hAt(c[0][1])); // the worst of the depths, not one location
  }
  // LTB over the real (varying) section: EN 1993-1-1 §6.3.4 with α_cr from finite elements (ltb.ts)
  out.taper = 1;
  applyFeLtb(out, feLtb(out, rA, hAt, loads), at);
  // the three runs as nodes over depth, for values at the local depth h(x)
  const nodes = [[hA, rA], [hAt(xM), rM], [hB, rB], ...rP.map((r) => [r.h_a, r])] as [number, Results][];
  nodes.sort((p, q) => p[0] - q[0]);
  const hs = nodes.map(([h]) => h);
  const local = (get: (r: Results) => number, h: number) => interp(hs, nodes.map(([, r]) => get(r)), h);
  // web under the point loads (EN 1993-1-5 §6 (6.14), §7.2 (7.2)) at the depth h(a_i) of each load:
  // F_Rd,a, M_Rd,P and M_el,Rd at the local depth; F_loc and M_P (load effects) from the run at x_M
  const aP = rM.vectors.aP ?? [], Floc = rM.vectors.Floc ?? [], MP = rM.vectors.MP ?? [];
  const n0 = aP.length;
  if (n0 && Floc.length === n0 && MP.length === n0 && nodes.every(([, r]) => r.vectors.MRdP?.length === n0)) {
    const c = rM.cFP, best: Record<string, [number, number]> = {};
    aP.forEach((a, i) => {
      const h = hAt(a), FRd = local((r) => r.FRda, h);
      const eta2 = Math.abs(Floc[i]) / FRd;
      const u: Record<string, number> = {
        'F.P': c * eta2,
        FM: (c * (eta2 + (0.8 * Math.abs(MP[i])) / local((r) => r.vectors.MRdP[i], h))) / 1.4,
        'FM.nc': (c * (eta2 + (0.8 * Math.abs(MP[i])) / local((r) => r.MelRd, h))) / 1.4,
      };
      for (const k of TAPER_LOAD) if (Number.isFinite(u[k]) && (!best[k] || u[k] > best[k][0])) best[k] = [u[k], a];
    });
    for (const k of TAPER_LOAD) if (best[k] && Number.isFinite(rM[`UR.${k}`])) { out[`UR.${k}`] = best[k][0]; at(k, best[k][1]); }
  }
  // bending along the span: M(x) against M_Rd,x at the local depth
  const xs = rM.vectors.x ?? [], Ms = rM.vectors.M ?? [];
  if (xs.length && rA.vectors.MRdx?.length === xs.length && rB.vectors.MRdx?.length === xs.length) {
    let worst = 0, xw = xM;
    const mrd = xs.map((x, i) => local((r) => r.vectors.MRdx[i], hAt(x)));
    xs.forEach((x, i) => { const u = mrd[i] > 0 ? Math.abs(Ms[i]) / mrd[i] : 0; if (u > worst) { worst = u; xw = x; } });
    out[`UR.M.x`] = worst;
    out.vectors.MRdx = mrd;
    at('M.x', xw);
  }
  // deflections: δ = ∫ M m / EI dx, M ∝ x(L − x) and m ∝ min(x, L − x); a run at depth h gives δ(h) ∝ 1 / I(h)
  const n = 60, w: number[] = [], hx: number[] = [];
  for (let i = 0; i < n; i++) { const x = ((i + 0.5) * L) / n; w.push(x * (L - x) * Math.min(x, L - x)); hx.push(hAt(x)); }
  const W = w.reduce((a, b) => a + b, 0);
  const span = (get: (r: Results) => number) => w.reduce((a, wi, i) => a + wi * local(get, hx[i]), 0) / W;
  const scale = (key: string, vec: string, k: string) => {
    const f = rM[`UR.${k}`] > 0 ? out[`UR.${k}`] / rM[`UR.${k}`] : 1;
    out[key] = rM[key] * f;
    if (out.vectors[vec]) out.vectors[vec] = out.vectors[vec].map((d) => d * f);
  };
  for (const k of TAPER_SPAN) { if (Number.isFinite(rM[`UR.${k}`])) { out[`UR.${k}`] = span((r) => r[`UR.${k}`]); at(k, NaN); } }
  // UR_fn = f_lim / f_1 ∝ √δ
  for (const k of TAPER_FREQ) { if (Number.isFinite(rM[`UR.${k}`])) { out[`UR.${k}`] = Math.sqrt(span((r) => r[`UR.${k}`] ** 2)); at(k, NaN); } }
  scale('d1', 'd1v', 'd.1'); scale('dq', 'dq', 'd.q');
  const fx = rM['UR.d.x'] > 0 ? out['UR.d.x'] / rM['UR.d.x'] : 1;
  out.dmax = rM.dmax * fx;
  out.vectors.d = (rM.vectors.d ?? []).map((d) => d * fx);
  out.dnc = rM.dnc * (rM['UR.d.nc'] > 0 ? out['UR.d.nc'] / rM['UR.d.nc'] : 1);
  out.f1 = rM.f1 * (out['UR.fn'] > 0 ? rM['UR.fn'] / out['UR.fn'] : 1);
  out.f1nc = rM.f1nc * (out['UR.fn.nc'] > 0 ? rM['UR.fn.nc'] / out['UR.fn.nc'] : 1);
  // composite action needs M_Ed ≤ M_Rd,x everywhere, as in the sheet
  out.comp = rM.comp >= 1 && out['UR.M.x'] <= 1 ? 1 : 0;
  out['UR.des'] = urDes(out);
  out.taper = 1;
  return out;
}

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
  ['sf.c', 'Slab transverse bars, surface c-c', 'EN 1994-1-1 §6.6.6.4', 'c'],
  ['L.c', 'Slab concrete strut, surface c-c', 'EN 1992-1-1 §6.2.4', 'c'],
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
const SLAB_BAR_CHECKS = ['sf', 'sf.b', 'sf.c']; // the only checks a larger transverse bar can cure
const SLAB_CHECKS = ['sf', 'L', 'sf.b', 'L.b', 'sf.c', 'L.c']; // get worse with more studs: no reason to reject a section at its densest layout

/** Camber from the rules: a share of the self-weight deflection, rounded down to the increment, dropped if small. */
export function camberFor(c: DesignCriteria['camber'], spanM: number, dgMax: number): number {
  if (!c || spanM < c.minSpan - 1e-9 || !(dgMax > 0)) return 0;
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
  if (c.camber) { camber = camberFor(c.camber, p.L, p.dgmax); for (const m of models) set(m, 'w_{c.0}', camber); }
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
  ['aP', 'a_P', 'm'], ['Floc', 'F_{loc}', 'kN'], ['MP', 'M_P', 'kN m'], ['MRdP', 'M_{Rd.P}', 'kN m'],
];

const DEF = /^(.*?)\\coloneq\s*(-?\d+(?:\.\d+)?)(?:\\,\\mathrm\{([^}]*)\})?$/;
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

/**
 * The page's default case (mCompositeBeamDesign opens with it; the worksheet template keeps its own
 * reference example): UB 406x140x46 tapered to 300 mm at A, L = 5.2 m at 2 m centres, 200 mm solid slab,
 * SDL 3 kPa + LL 1.5 kPa and a 60 kN SDL point load 1 m from A.
 */
export const PAGE_DEFAULTS = {
  section: 'UB 406x140x46',
  inputs: { L: 5.2, s_b: 2, h_c: 200, 'c_{tap}': 1, 'h_{A.in}': 300, 'h_{B.in}': 0 } as Record<string, number>,
  tables: [[['G', '0', '5.2', '3', '1.35'], ['Q', '0', '5.2', '1.5', '1.5']], [['G', '1', '60', '1.35']]],
};

/** The worksheet with the page defaults written in, as a .mCCV string. */
export function withPageDefaults(raw: string, d = PAGE_DEFAULTS): string {
  const doc = JSON.parse(raw) as { shapes: Shape[] };
  const id = sections.find((x) => x.name === d.section)?.id;
  let ti = 0;
  for (const s of [...doc.shapes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (s.type === 'table' && (s as TableShape).props.input) {
      const t = s as TableShape, rows = d.tables[ti++];
      if (!rows) continue;
      const cells = [t.props.cells[0], t.props.cells[1], ...rows.map((r) => r.map((value) => ({ value })))];
      t.props = { ...t.props, cells, rows: cells.length };
    }
    if (s.type !== 'math') continue;
    const m = s as MathShape, def = DEF.exec(m.props.latex.trim());
    if (!def) continue;
    if (def[1] === '\\mathrm{Section}' && id !== undefined) m.props = { ...m.props, latex: `\\mathrm{Section}\\coloneq${id}` };
    else if (def[1] in d.inputs) m.props = { ...m.props, latex: `${def[1]}\\coloneq ${d.inputs[def[1]]}${def[3] ? `\\,\\mathrm{${def[3]}}` : ''}` };
  }
  return JSON.stringify(doc);
}

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
      [...CHECKS.map(([k]) => [k]), ...EXTRA_UR.map((k) => [k])].forEach(([key], i) => e.setRegion(`probe:UR.${key}`, { latex: `\\mathrm{UR}_{${key}}=`, order: [1e9, 500 + i] as never, displayUnit: null, precision: null }));
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

  /**
   * The results of the current inputs. A tapered beam (c_tap = 1, h_A ≠ h_B) runs the sheet at the depth of
   * each critical section (d_use) and combines the checks by location (combineTaper).
   */
  results(): Results {
    const r = this.run();
    const loads = this.feLoads(r);
    if (!(r.ctap >= 1) || !(Math.abs(r.hA - r.hB) > 0.5)) {
      // uniform beam: LTB by finite elements too (M_cr directly), then the summary again
      const lt = feLtb(r, r, () => r.h_a, loads);
      applyFeLtb(r, lt, (k, x) => { r[`at.${k}`] = x; r[`hat.${k}`] = r.h_a; });
      if (lt.nc) r['UR.des'] = urDes(r);
      this.lastLtb = r;
      return r;
    }
    const use = this.inputs.find((f) => f.name === 'd_{use}');
    if (!use) return r;
    const at = (h: number) => { this.e.setDefinitionOverride(use.id, { value: h, unit: null } as never); return this.run(); };
    const hM = r.hA + ((r.hB - r.hA) * r.xM) / r.L;
    const mid = (r.hA + r.hB) / 2;
    const rM = Math.abs(hM - mid) < 0.05 ? r : at(hM);
    const rA = at(r.hA), rB = at(r.hB);
    // a run at the depth of each point-load position (web checks F.P, FM there), unless a run is already at it
    const done = [r.hA, hM, r.hB];
    const rP: Results[] = [];
    for (const a of rM.vectors.aP ?? []) {
      const h = r.hA + ((r.hB - r.hA) * a) / r.L;
      if (!Number.isFinite(h) || done.some((d) => Math.abs(d - h) < 0.05)) continue;
      done.push(h);
      rP.push(at(h));
    }
    this.e.setDefinitionOverride(use.id, { value: 0, unit: null } as never);
    this.lastLtb = null; // the report runs the sheet at one depth: its LTB is the sheet's own
    return combineTaper(rM, rA, rB, rP, loads);
  }

  /** Last uniform-beam result with finite-element LTB, written into the report (M_cr.FE). */
  private lastLtb: Results | null = null;

  /**
   * ULS loads of the composite stage on the steel beam alone for the in-plane FE, N/mm, N, mm: γ_G,sw g_0 over the
   * span and the rows of the load tables (p_k s_b γ_F over x_1…x_2; F_k γ_F at a).
   */
  feLoads(r: Results): FeLoads | null {
    const L = r.L * 1000, sbField = this.inputs.find((f) => f.name === 's_b');
    if (!(L > 0) || !sbField || !Number.isFinite(r.g0)) return null;
    const sb = this.inputValue(sbField.id);
    // Singapore NA: the governing (6.10a)/(6.10b) factors of the sheet on G and Q; else each row's γ_F
    const na = r.cNA >= 1 && Number.isFinite(r.kGM) && Number.isFinite(r.kQM);
    const factor = (row: string[], g: number) => (na ? (String(row[0]).trim().toUpperCase().startsWith('Q') ? r.kQM : r.kGM) : g);
    const dist: DistLoad[] = [{ x1: 0, x2: L, q1: r.g0 * (na ? r.kGM : Number.isFinite(r.gsw) ? r.gsw : 1.35) }];
    const point: { x: number; P: number }[] = [];
    const num = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
    const [area, pt] = this.tables;
    for (const row of area?.rows ?? []) {
      const x1 = num(row[1]) * 1000, x2 = num(row[2]) * 1000, p = num(row[3]), g = num(row[4]);
      if ([x1, x2, p].every(Number.isFinite) && (na || Number.isFinite(g)) && x2 > x1 && p !== 0) dist.push({ x1: Math.max(0, x1), x2: Math.min(L, x2), q1: p * sb * factor(row, g) });
    }
    for (const row of pt?.rows ?? []) {
      const a = num(row[1]) * 1000, F = num(row[2]), g = num(row[3]);
      if ([a, F].every(Number.isFinite) && (na || Number.isFinite(g)) && a >= 0 && a <= L && F !== 0) point.push({ x: a, P: F * factor(row, g) * 1000 });
    }
    return { dist, point };
  }

  private run(): Results {
    const out = { vectors: {}, errors: [] as string[] } as unknown as Results;
    for (const [key] of SCALARS) {
      const r = this.e.getResult(`probe:${key}`);
      out[key] = r?.status === 'valid' ? r.value!.number : NaN;
    }
    for (const key of [...CHECKS.map(([k]) => k), ...EXTRA_UR]) {
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
    // uniform beam: the finite-element M_cr the page used, written into the sheet (0 = its SN003b value)
    const fe = this.lastLtb, feCr: [string, number][] = [['M_{cr.FE}', fe?.['Mcr.LT'] ?? NaN], ['M_{cr.nc.FE}', fe?.['Mcr.LT.nc'] ?? NaN]];
    const feC1 = fe?.['C1.LT'] ?? NaN;
    const shapes = this.doc.shapes.map((s) => {
      const fcr = s.type === 'math' ? feCr.find(([n]) => (s as MathShape).props.latex.startsWith(`${n}\\coloneq`)) : undefined;
      if (s.type === 'math' && Number.isFinite(feC1) && (s as MathShape).props.latex.startsWith('C_{1.FE}\\coloneq')) return { ...s, props: { ...(s as MathShape).props, latex: `C_{1.FE}\\coloneq${feC1.toFixed(4)}` } };
      if (fcr && Number.isFinite(fcr[1])) return { ...s, props: { ...(s as MathShape).props, latex: `${fcr[0]}\\coloneq ${fcr[1].toFixed(3)}\\,\\mathrm{kN}\\cdot\\mathrm{m}` } };
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
