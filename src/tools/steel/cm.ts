/**
 * Equivalent uniform moment factor C_m, EN 1993-1-1 Annex B Table B.3, from the moments over the
 * buckling length: end moments M_A, M_B and the span moment M_s, one sign convention (e.g. sagging +).
 */
export type CmKind = 'linear' | 'udl' | 'point' | 'sway' | 'one' | 'user' | 'diagram';
export interface CmDef { kind: CmKind; MA?: number; MB?: number; Ms?: number; value?: number }
export interface CmResult { cm: number; basis: string }

const r3 = (x: number) => +x.toFixed(3);

export function cmOf(d: CmDef): CmResult {
  if (d.kind === 'one') return { cm: 1, basis: 'taken as 1.0 (no moment-gradient benefit)' };
  if (d.kind === 'sway') return { cm: 0.9, basis: 'sway buckling mode: 0.9 (Table B.3 note)' };
  if (d.kind === 'user' || d.kind === 'diagram') {
    const v = d.value ?? NaN;
    return { cm: v, basis: d.kind === 'user' ? 'user value' : 'from the moment diagram picker (Table B.3)' };
  }
  const a = d.MA ?? 0, b = d.MB ?? 0;
  // M_h: the end moment of larger magnitude; ψ = the other / M_h
  const [h, o] = Math.abs(a) >= Math.abs(b) ? [a, b] : [b, a];
  const psi = h === 0 ? 1 : Math.max(-1, Math.min(1, o / h));
  if (d.kind === 'linear') {
    if (h === 0) return { cm: 1, basis: 'no end moments: 1.0' };
    const cm = Math.max(0.4, 0.6 + 0.4 * psi);
    return { cm, basis: `linear, ψ = ${r3(psi)}: 0.6 + 0.4ψ ≥ 0.4` };
  }
  const s = d.Ms ?? 0, udl = d.kind === 'udl';
  if (Math.abs(h) >= Math.abs(s) && h !== 0) {
    const as = s / h;
    if (as >= 0) return { cm: Math.max(0.4, 0.2 + 0.8 * as), basis: `|M_h| ≥ |M_s|, α_s = M_s/M_h = ${r3(as)} ≥ 0: 0.2 + 0.8α_s ≥ 0.4` };
    if (psi >= 0) return udl
      ? { cm: Math.max(0.4, 0.1 - 0.8 * as), basis: `α_s = ${r3(as)} < 0, ψ = ${r3(psi)} ≥ 0, uniform load: 0.1 − 0.8α_s ≥ 0.4` }
      : { cm: Math.max(0.4, -0.8 * as), basis: `α_s = ${r3(as)} < 0, ψ = ${r3(psi)} ≥ 0, concentrated load: −0.8α_s ≥ 0.4` };
    return udl
      ? { cm: Math.max(0.4, 0.1 * (1 - psi) - 0.8 * as), basis: `α_s = ${r3(as)} < 0, ψ = ${r3(psi)} < 0, uniform load: 0.1(1 − ψ) − 0.8α_s ≥ 0.4` }
      : { cm: Math.max(0.4, 0.2 * -psi - 0.8 * as), basis: `α_s = ${r3(as)} < 0, ψ = ${r3(psi)} < 0, concentrated load: 0.2(−ψ) − 0.8α_s ≥ 0.4` };
  }
  if (s === 0) return { cm: 1, basis: 'no moments: 1.0' };
  const ah = h / s, k = ah < 0 && psi < 0 ? 1 + 2 * psi : 1;
  const cm = udl ? 0.95 + 0.05 * ah * k : 0.9 + 0.1 * ah * k;
  return { cm, basis: `|M_s| > |M_h|, α_h = M_h/M_s = ${r3(ah)}${k !== 1 ? `, ψ = ${r3(psi)} < 0` : ''}, ${udl ? 'uniform' : 'concentrated'} load: ${udl ? '0.95 + 0.05' : '0.90 + 0.10'}α_h${k !== 1 ? '(1 + 2ψ)' : ''}` };
}

export const CM_KINDS: [CmKind, string][] = [
  ['linear', 'End moments only (linear)'], ['udl', 'End moments + uniform load'], ['point', 'End moments + concentrated load'],
  ['sway', 'Sway buckling mode (0.9)'], ['one', 'Conservative (1.0)'], ['user', 'User value'],
];
