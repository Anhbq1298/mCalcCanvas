/**
 * Equivalent uniform moment factor C_m, EN 1993-1-1 Annex B Table B.3, from the moments over the
 * buckling length: end moments M_A, M_B and the span moment M_s, one sign convention (e.g. sagging +).
 */
export type CmKind = 'linear' | 'udl' | 'point' | 'sway' | 'one';
export interface CmDef { kind: CmKind; MA?: number; MB?: number; Ms?: number }
/** calc false (or absent): every C_m = 1.0. LT 'y': C_mLT = C_my. */
export interface CmDefs { calc: boolean; y?: CmDef; z?: CmDef; LT?: CmDef | 'y' }
/** row: Table B.3 row (lin, s1–s3: M_h governs, h1–h3: M_s governs); col u = uniform, c = concentrated */
export interface CmResult { cm: number; basis: string; row?: string; col?: 'u' | 'c' }

const r3 = (x: number) => +x.toFixed(3);

export function cmOf(d: CmDef): CmResult {
  if (d.kind === 'one') return { cm: 1, basis: 'default 1.0 (no moment-gradient benefit)' };
  if (d.kind === 'sway') return { cm: 0.9, basis: 'sway buckling: 0.9 (Table B.3)' };
  const a = d.MA ?? 0, b = d.MB ?? 0;
  // M_h: the end moment of larger magnitude; ψ = the other / M_h
  const [h, o] = Math.abs(a) >= Math.abs(b) ? [a, b] : [b, a];
  const psi = h === 0 ? 1 : Math.max(-1, Math.min(1, o / h));
  if (d.kind === 'linear') {
    if (h === 0) return { cm: 1, basis: 'no end moments: 1.0' };
    const cm = Math.max(0.4, 0.6 + 0.4 * psi);
    return { cm, basis: `linear, ψ = ${r3(psi)}: 0.6 + 0.4ψ ≥ 0.4`, row: 'lin' };
  }
  const s = d.Ms ?? 0, udl = d.kind === 'udl', col = udl ? 'u' as const : 'c' as const;
  if (Math.abs(h) >= Math.abs(s) && h !== 0) {
    const as = s / h;
    if (as >= 0) return { cm: Math.max(0.4, 0.2 + 0.8 * as), basis: `|M_h| ≥ |M_s|, α_s = M_s/M_h = ${r3(as)} ≥ 0: 0.2 + 0.8α_s ≥ 0.4`, row: 's1', col };
    if (psi >= 0) return udl
      ? { cm: Math.max(0.4, 0.1 - 0.8 * as), basis: `α_s = ${r3(as)} < 0, ψ = ${r3(psi)} ≥ 0, uniform load: 0.1 − 0.8α_s ≥ 0.4`, row: 's2', col }
      : { cm: Math.max(0.4, -0.8 * as), basis: `α_s = ${r3(as)} < 0, ψ = ${r3(psi)} ≥ 0, concentrated load: −0.8α_s ≥ 0.4`, row: 's2', col };
    return udl
      ? { cm: Math.max(0.4, 0.1 * (1 - psi) - 0.8 * as), basis: `α_s = ${r3(as)} < 0, ψ = ${r3(psi)} < 0, uniform load: 0.1(1 − ψ) − 0.8α_s ≥ 0.4`, row: 's3', col }
      : { cm: Math.max(0.4, 0.2 * -psi - 0.8 * as), basis: `α_s = ${r3(as)} < 0, ψ = ${r3(psi)} < 0, concentrated load: 0.2(−ψ) − 0.8α_s ≥ 0.4`, row: 's3', col };
  }
  if (s === 0) return { cm: 1, basis: 'no moments: 1.0' };
  const ah = h / s, k = ah < 0 && psi < 0 ? 1 + 2 * psi : 1;
  // concentrated load, α_h < 0, ψ < 0: 0.90 + 0.10α_h(1 + 2ψ) as EN 1993-1-1:2022 Table 8.9 (and IS 800 Table 18); some
  // EN 1993-1-1:2005 prints "−", which breaks continuity with the ψ ≥ 0 row at ψ = 0
  const h3 = k !== 1, cm = udl ? 0.95 + 0.05 * ah * k : 0.9 + 0.1 * ah * k;
  return { cm, basis: `|M_s| > |M_h|, α_h = M_h/M_s = ${r3(ah)}${h3 ? `, ψ = ${r3(psi)} < 0` : ''}, ${udl ? 'uniform' : 'concentrated'} load: ${udl ? '0.95 + 0.05' : '0.90 + 0.10'}α_h${h3 ? '(1 + 2ψ)' : ''}`, row: ah >= 0 ? 'h1' : psi >= 0 ? 'h2' : 'h3', col };
}

export const CM_KINDS: [CmKind, string][] = [
  ['one', 'Keep 1.0'], ['linear', 'Linear (end moments)'], ['udl', 'Uniform load (max in span)'], ['point', 'Concentrated load (max in span)'], ['sway', 'Sway buckling'],
];

/** The applied factors for a definition (calc off → all 1.0). */
export function cmValues(d: CmDefs | undefined): { Cmy: number; Cmz: number; CmLT: number } {
  if (!d?.calc) return { Cmy: 1, Cmz: 1, CmLT: 1 };
  const y = cmOf(d.y ?? { kind: 'one' }).cm, z = cmOf(d.z ?? { kind: 'one' }).cm;
  const lt = d.LT === 'y' ? y : cmOf(d.LT ?? { kind: 'one' }).cm;
  const r = (x: number) => +x.toFixed(4);
  return { Cmy: r(y), Cmz: r(z), CmLT: r(lt) };
}
