import { describe, expect, it } from 'vitest';
import { chiLT, ltbCriticalFactor } from '../../tools/composite/ltb';

// UB 406x140x46-like section, N and mm
const E = 210000, G = 81000, Iz = 538e4, It = 19e4, Iw = 207e9, L = 5200;
const uniform = () => ({ EIz: E * Iz, GIt: G * It, EIw: E * Iw });
const Mcr0 = (Lc: number) => (Math.PI / Lc) * Math.sqrt(E * Iz * G * It * (1 + (Math.PI ** 2 * E * Iw) / (Lc ** 2 * G * It)));

/** Independent Rayleigh–Ritz (sine series in v and φ, fork ends, uniform section): λ_cr by bisection on the inertia of K − λB. */
function ritz(Lr: number, p: { EIz: number; GIt: number; EIw: number }, M: (x: number) => number, qzg: number, P?: { x: number; Fzg: number }): number {
  const N = 20, n = 2 * N, k = (i: number) => (i * Math.PI) / Lr;
  const K = Array.from({ length: n }, () => new Array<number>(n).fill(0)), B = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 1; i <= N; i++) { K[i - 1][i - 1] = (p.EIz * k(i) ** 4 * Lr) / 2; K[N + i - 1][N + i - 1] = ((p.GIt * k(i) ** 2 + p.EIw * k(i) ** 4) * Lr) / 2; }
  for (let g = 0, ng = 2000; g < ng; g++) {
    const x = ((g + 0.5) * Lr) / ng, w = Lr / ng, m = M(x);
    for (let i = 1; i <= N; i++) for (let j = 1; j <= N; j++) {
      const t = w * m * k(i) ** 2 * Math.sin(k(i) * x) * Math.sin(k(j) * x);
      B[i - 1][N + j - 1] += t; B[N + j - 1][i - 1] += t;
      B[N + i - 1][N + j - 1] += w * qzg * Math.sin(k(i) * x) * Math.sin(k(j) * x);
    }
  }
  if (P) for (let i = 1; i <= N; i++) for (let j = 1; j <= N; j++) B[N + i - 1][N + j - 1] += P.Fzg * Math.sin(k(i) * P.x) * Math.sin(k(j) * P.x);
  const neg = (lam: number) => { const A = K.map((r, i) => r.map((v, j) => v - lam * B[i][j])); let c = 0;
    for (let q = 0; q < n; q++) { const d = A[q][q]; if (d < 0) c++; for (let r = q + 1; r < n; r++) { const f = A[r][q] / d; for (let t = q; t < n; t++) A[r][t] -= f * A[q][t]; } } return c; };
  let lo = 0, hi = 1; while (neg(hi) === 0) hi *= 2;
  for (let it = 0; it < 100; it++) { const mid = (lo + hi) / 2; if (neg(mid) === 0) lo = mid; else hi = mid; }
  return lo;
}

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
    // published: Raftoyiannis & Adamakos, Open Constr. Build. Technol. J. 4 (2010) 105–112, Fig. 18: IPE 300 tapered
    // h1 → h2 = 3 h1 (mean 300 mm), L = 10 h0, fork ends, end moments M1 (at h1) and ψ M1, their J (11), C_w (12):
    // "as the taper ratio increases from 1.0 to 3.0 … a significant drop of M_cr with maximum value 12 % for ψ = −0.5,
    // while for ψ = 1 the drop is only 4 %" (three-term sine Rayleigh–Ritz)
    {
      const b = 150, tf = 10.7, tw = 7.1, Es = 210000, Gs = 80770, l = 3000;
      const pr = (h: number) => ({ EIz: Es * ((2 * tf * b ** 3) / 12 + (h * tw ** 3) / 12), GIt: (Gs * (2 * b * tf ** 3 + h * tw ** 3)) / 3, EIw: (Es * b ** 3 * h ** 2 * tf) / 24 });
      const mcr = (h1: number, h2: number, psi: number) => ltbCriticalFactor({ L: l, props: (x) => pr(h1 + ((h2 - h1) * x) / l), M: (x) => 1 + ((psi - 1) * x) / l });
      const drop = (psi: number) => 1 - mcr(150, 450, psi) / mcr(300, 300, psi);
      const d = [1, 0.5, 0, -0.5, -1].map(drop);
      expect(d[0]).toBeGreaterThan(0.035); expect(d[0]).toBeLessThan(0.045); // 0.039
      expect(d[3]).toBeGreaterThan(0.115); expect(d[3]).toBeLessThan(0.13); // 0.127
      expect(Math.max(...d)).toBe(d[3]); // the largest drop at ψ = −0.5
    }
  });

  it('SN003b Tables 3.1 and 3.2 (μ = 0): C1 by moment diagram, C2 by load height; stabilising loads against Ritz', () => {
    // SN003b (NCCI, Elastic critical moment for LTB), k = kw = 1, tabulated with μ = EI_w / (G I_t L²) = 0: I_w = 0 here
    const p0 = () => ({ EIz: E * Iz, GIt: G * It, EIw: 0 });
    const Ncr = (Math.PI ** 2 * E * Iz) / L ** 2, M00 = Math.sqrt((G * It) / Ncr) * Ncr; // M_cr for C1 = 1, z_g = 0
    const C1 = (M: (x: number) => number, Mmax: number) => (ltbCriticalFactor({ L, props: p0, M }) * Mmax) / M00;
    // Table 3.1: end moments M and ψ M
    const t31: [number, number][] = [[1, 1], [0.75, 1.14], [0.5, 1.31], [0.25, 1.52], [0, 1.77], [-0.25, 2.05], [-0.5, 2.33], [-0.75, 2.57], [-1, 2.55]];
    for (const [psi, c] of t31) expect(Math.abs(C1((x) => 1 + ((psi - 1) * x) / L, 1) - c)).toBeLessThan(0.006);
    // Table 3.2: UDL and mid-span point load, in-plane simply supported and fixed; C1 for the largest moment
    const cases: [string, (x: number) => number, number, number, number, 'q' | 'P'][] = [
      ['UDL, simple', (x) => (x * (L - x)) / 2, (L * L) / 8, 1.127, 0.454, 'q'],
      ['UDL, fixed', (x) => (6 * x * L - 6 * x * x - L * L) / 12, (L * L) / 12, 2.578, 1.554, 'q'],
      ['P, simple', (x) => Math.min(x, L - x) / 2, L / 4, 1.348, 0.63, 'P'],
      ['P, fixed', (x) => Math.min(x, L - x) / 2 - L / 8, L / 8, 1.683, 1.645, 'P'],
    ];
    for (const [, M, Mmax, c1, c2, kind] of cases) {
      expect(Math.abs(C1(M, Mmax) - c1)).toBeLessThan(0.003);
      // load on the top flange (destabilising), z_g = 200 mm: SN003b (2) within 2 %
      const zg = 200, load = kind === 'q' ? { qzg: () => zg } : { points: [{ x: L / 2, Fzg: zg }] };
      const fe = ltbCriticalFactor({ L, props: p0, M, ...load }) * Mmax;
      expect(Math.abs(fe / (c1 * Ncr * (Math.sqrt((G * It) / Ncr + (c2 * zg) ** 2) - c2 * zg)) - 1)).toBeLessThan(0.02);
    }
    // stabilising load (bottom flange, z_g = −200 mm), real I_w: the FE equals an independent Ritz solution; (2) with the
    // tabulated C2 overestimates M_cr here (P, simple: FE / (2) = 0.96), so (2) is not used for bottom-flange loads
    const pw = uniform(), Mp = cases[2][1];
    const fe = ltbCriticalFactor({ L, props: uniform, M: Mp, points: [{ x: L / 2, Fzg: -200 }] });
    expect(fe / ritz(L, pw, Mp, 0, { x: L / 2, Fzg: -200 })).toBeCloseTo(1, 2);
    const Mu = cases[0][1];
    expect(ltbCriticalFactor({ L, props: uniform, M: Mu, qzg: () => -200 }) / ritz(L, pw, Mu, -200)).toBeCloseTo(1, 3);
  });

  it('χ_LT, (6.56)', () => {
    expect(chiLT(0.2, 0.34)).toBe(1);
    expect(chiLT(1, 0.34)).toBeCloseTo(0.5970, 4); // Φ = 1.136
  });
});
