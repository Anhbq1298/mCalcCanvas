import { describe, expect, it } from 'vitest';
import { chiLT, ltbCriticalFactor } from '../../tools/composite/ltb';

// UB 406x140x46-like section, N and mm
const E = 210000, G = 81000, Iz = 538e4, It = 19e4, Iw = 207e9, L = 5200;
const uniform = () => ({ EIz: E * Iz, GIt: G * It, EIw: E * Iw });
const Mcr0 = (Lc: number) => (Math.PI / Lc) * Math.sqrt(E * Iz * G * It * (1 + (Math.PI ** 2 * E * Iw) / (Lc ** 2 * G * It)));

describe('lateral-torsional buckling, varying section (finite elements)', () => {
  it('constant moment, fork ends: the exact solution', () => {
    expect(ltbCriticalFactor({ L, props: uniform, M: () => 1 }) / Mcr0(L)).toBeCloseTo(1, 4);
  });

  it('UDL at the shear centre: C1 = 1.13; on the top flange: the SN003b value', () => {
    const q = 1; // N/mm
    const M = (x: number) => (q * x * (L - x)) / 2, Mmax = (q * L * L) / 8;
    expect((ltbCriticalFactor({ L, props: uniform, M }) * Mmax) / Mcr0(L)).toBeCloseTo(1.13, 2);
    const zg = 403 / 2, C1 = 1.127, C2 = 0.454, Ncr = (Math.PI ** 2 * E * Iz) / L ** 2;
    const sn003 = C1 * Ncr * (Math.sqrt(Iw / Iz + (G * It) / Ncr + (C2 * zg) ** 2) - C2 * zg);
    const fe = ltbCriticalFactor({ L, props: uniform, M, qzg: () => q * zg }) * Mmax;
    expect(Math.abs(fe / sn003 - 1)).toBeLessThan(0.03);
    expect(fe).toBeLessThan(Mcr0(L) * 1.13); // destabilising
  });

  it('interior restraint at mid-span: each half buckles as a fork-ended beam', () => {
    const r = ltbCriticalFactor({ L, props: uniform, M: () => 1, restraints: [L / 2] });
    expect(r / Mcr0(L / 2)).toBeCloseTo(1, 3);
  });

  it('tapered web: matches an independent Rayleigh–Ritz sine-series solution', () => {
    // web depth 300 → 403 mm, flanges unchanged: I_z, I_t linear in h, I_w ∝ (h − t_f)²
    const tf = 11.2, tw = 6.8, hA = 300, hB = 403.2, h = (x: number) => hA + ((hB - hA) * x) / L;
    const props = (x: number) => ({ EIz: E * (Iz + (tw ** 3 * (h(x) - hB)) / 12), GIt: G * (It + (tw ** 3 * (h(x) - hB)) / 3), EIw: E * Iw * ((h(x) - tf) / (hB - tf)) ** 2 });
    const q = 1, M = (x: number) => (q * x * (L - x)) / 2, qzg = (x: number) => (q * h(x)) / 2;
    const fe = ltbCriticalFactor({ L, props, M, qzg, elements: 40 });
    // Ritz: v = Σ a_n sin(nπx/L), φ = Σ b_n sin(nπx/L), n = 1..N, Simpson integration, eigen by bisection on det
    const N = 8, S = 400, dx = L / S;
    const K = Array.from({ length: 2 * N }, () => new Array<number>(2 * N).fill(0)), B = K.map((r) => r.map(() => 0));
    for (let s = 0; s <= S; s++) {
      const x = s * dx, w = (s === 0 || s === S ? 1 : s % 2 ? 4 : 2) * (dx / 3), p = props(x);
      const sn = (n: number) => Math.sin((n * Math.PI * x) / L), cs = (n: number) => ((n * Math.PI) / L) * Math.cos((n * Math.PI * x) / L), dd = (n: number) => -(((n * Math.PI) / L) ** 2) * sn(n);
      for (let i = 1; i <= N; i++) for (let j = 1; j <= N; j++) {
        K[i - 1][j - 1] += w * p.EIz * dd(i) * dd(j);
        K[N + i - 1][N + j - 1] += w * (p.GIt * cs(i) * cs(j) + p.EIw * dd(i) * dd(j));
        B[i - 1][N + j - 1] -= w * M(x) * dd(i) * sn(j); B[N + j - 1][i - 1] -= w * M(x) * dd(i) * sn(j);
        B[N + i - 1][N + j - 1] += w * qzg(x) * sn(i) * sn(j);
      }
    }
    const det = (lam: number) => { // sign-tracking LU of K − λB
      const A = K.map((r, i) => r.map((v, j) => v - lam * B[i][j])), n = A.length; let neg = 0;
      for (let c = 0; c < n; c++) { let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
        if (piv !== c) { [A[piv], A[c]] = [A[c], A[piv]]; neg ^= 1; } if (A[c][c] < 0) neg ^= 1;
        for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; } }
      return neg; };
    // first sign change of det(K − λB) from λ = 0: scan, then bisect
    let lo = 0, hi = 0;
    for (let lam = 0; lam < 10 * fe; lam += fe / 50) { if (det(lam) !== det(0)) { hi = lam; break; } lo = lam; }
    for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (det(mid) === det(0)) lo = mid; else hi = mid; }
    expect(fe / lo).toBeCloseTo(1, 2);
    // between the uniform shallow and deep beams
    const at = (hh: number) => ltbCriticalFactor({ L, props: () => props(((hh - hA) / (hB - hA)) * L), M, qzg: () => (q * hh) / 2 });
    expect(fe).toBeGreaterThan(at(hA));
    expect(fe).toBeLessThan(at(hB));
  });

  it('point load at mid-span on the top flange: matches a Rayleigh–Ritz solution; SN003b (C1 1.348, C2 0.630) is a few % low', () => {
    const P = 1, zg = 201.6, L3 = 3000, M = (x: number) => (P / 2) * Math.min(x, L3 - x);
    const fe = (ltbCriticalFactor({ L: L3, props: uniform, M, pointLoads: [{ x: L3 / 2, Pzg: P * zg }] }) * P * L3) / 4;
    expect(fe / 1e6).toBeCloseTo(235.2, 0); // independent sine-series Ritz, 9–21 terms: 235.2 kNm
    const Ncr = (Math.PI ** 2 * E * Iz) / L3 ** 2, sn = 1.348 * Ncr * (Math.sqrt(Iw / Iz + (G * It) / Ncr + (0.63 * zg) ** 2) - 0.63 * zg);
    expect(fe / sn).toBeGreaterThan(1.03);
    expect(fe / sn).toBeLessThan(1.1);
    // at the shear centre: C1 = 1.35
    expect((ltbCriticalFactor({ L: L3, props: uniform, M }) * P * L3) / 4 / Mcr0(L3)).toBeCloseTo(1.36, 1);
  });

  it('χ_LT, (6.56)', () => {
    expect(chiLT(0.2, 0.34)).toBe(1);
    expect(chiLT(1, 0.34)).toBeCloseTo(0.5970, 4); // Φ = 1.136
  });
});
