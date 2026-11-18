/**
 * Elastic lateral-torsional buckling of a straight, doubly symmetric I-member whose section may vary along
 * its length (tapered web): linear eigenvalue (bifurcation) analysis on the Vlasov thin-walled beam.
 *
 *   Π = ½ ∫ (EI_z v''² + GI_t φ'² + EI_w φ''²) dx + λ ∫ M_y v'' φ dx − λ ½ ∫ q z_g φ² dx − λ ½ Σ P z_g φ²
 *
 * - DOF per node: v (lateral), v' (lateral rotation), φ (twist), φ' (warping). For a doubly symmetric section
 *   without axial force the out-of-plane problem uncouples from the in-plane one, so these four DOF are the
 *   LTB part of the 7-DOF thin-walled element.
 * - M_y(x) is the pre-buckling moment (from beam.ts or statics); the coupling term exists with N = 0.
 * - Load height: z_g > 0 above the shear centre (top flange, destabilising), < 0 below. Loads are
 *   conservative (gravity direction fixed); no follower loads.
 * - Supports: each of v, v', φ, φ' fixed or free at any station (fork = v and φ fixed).
 * - Section derivatives along x (taper slope terms) are neglected: mild tapers, as LTBeamN.
 * - Cubic Hermite elements, 4-point Gauss integration (properties vary inside an element). λ_cr is the
 *   smallest positive root of det(K − λB) = 0: Cholesky K = L Lᵀ, symmetric C = L⁻¹ B L⁻ᵀ, Jacobi rotations.
 *
 * Units: N and mm (EI in N mm², EI_w in N mm⁴, M in N mm, q in N/mm, P in N, z_g in mm).
 */
import { hermite, meshStations } from './beam';

export interface LtbSupport { x: number; v?: boolean; vp?: boolean; phi?: boolean; phip?: boolean }
export const FORK = (x: number): LtbSupport => ({ x, v: true, phi: true });

export interface LtbInput {
  L: number;
  /** stiffnesses at x */
  props: (x: number) => { EIz: number; GIt: number; EIw: number };
  /** pre-buckling (reference) moment M_y at x; the eigenvalue multiplies all reference loads */
  M: (x: number) => number;
  /** distributed load times its height above the shear centre, at x (N); 0 / omitted = at the shear centre */
  qzg?: (x: number) => number;
  /** concentrated loads times their height above the shear centre (N mm), at x (mm) */
  pointLoads?: { x: number; Pzg: number }[];
  /** supports by DOF; default: fork supports at both ends */
  supports?: LtbSupport[];
  /** interior fork restraints (shorthand for supports at these x) */
  restraints?: number[];
  /** Lateral restraint at height z above the shear centre: v + z phi = 0 (mm). */
  flangeRestraints?: { x: number; z: number }[];
  elements?: number;
  /** explicit mesh (node positions, mm); overrides `elements` */
  nodes?: number[];
}

export interface LtbResult {
  lambda: number;
  mode: { x: number[]; v: number[]; phi: number[] } | null;
  /**
   * with `matrices`: node positions, fixed DOF (index 4·node + [v, v′, φ, φ′]), flange constraints v + z φ = 0
   * (v DOF index and z, mm) and the element matrices k_e, b_e (8 × 8, local order v₀ v′₀ φ₀ φ′₀ v₁ v′₁ φ₁ φ′₁ =
   * global 4e … 4e + 7)
   */
  system?: { x: number[]; fixed: number[]; coupled: { v: number; z: number }[]; Ke: number[][][]; Be: number[][][] };
}

const GAUSS = [[-0.861136311594053, 0.347854845137454], [-0.339981043584856, 0.652145154862546], [0.339981043584856, 0.652145154862546], [0.861136311594053, 0.347854845137454]];

/** Eigenvalues and (optionally) eigenvectors of a symmetric matrix by cyclic Jacobi rotations. */
export function jacobiEigen(A0: number[][], vectors = false): { values: number[]; vectors: number[][] | null } {
  const n = A0.length, A = A0.map((r) => Float64Array.from(r));
  const V = vectors ? Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; }) : null;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0, diag = 0;
    for (let i = 0; i < n; i++) { diag += A[i][i] ** 2; for (let j = i + 1; j < n; j++) off += A[i][j] ** 2; }
    if (off <= 1e-24 * Math.max(diag, 1e-300)) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p][q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let r = 0; r < n; r++) { const arp = A[r][p], arq = A[r][q]; A[r][p] = c * arp - s * arq; A[r][q] = s * arp + c * arq; }
      for (let r = 0; r < n; r++) { const apr = A[p][r], aqr = A[q][r]; A[p][r] = c * apr - s * aqr; A[q][r] = s * apr + c * aqr; }
      if (V) for (let r = 0; r < n; r++) { const vrp = V[r][p], vrq = V[r][q]; V[r][p] = c * vrp - s * vrq; V[r][q] = s * vrp + c * vrq; }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: V ? V.map((r) => Array.from(r)) : null };
}

/** Back-compatible: eigenvalues only. */
export const jacobiEigenvalues = (A0: number[][]): number[] => jacobiEigen(A0).values;

/** Critical load factor and buckled shape. lambda = Infinity if the loading cannot cause LTB, NaN if the supports leave a mechanism. */
export function ltbAnalysis(inp: LtbInput, withMode = false, matrices = false): LtbResult {
  const { L } = inp;
  const qzg = inp.qzg ?? (() => 0);
  const supports = [...(inp.supports ?? [FORK(0), FORK(L)]), ...(inp.restraints ?? []).map(FORK)];
  const flange = inp.flangeRestraints ?? [];
  if (flange.some(({ x, z }) => !Number.isFinite(x) || !Number.isFinite(z) || x < 0 || x > L)) throw new Error('Invalid flange restraint');
  const xs = inp.nodes ?? meshStations(L, [...supports.map((s) => s.x), ...flange.map((s) => s.x), ...(inp.pointLoads ?? []).map((p) => p.x)], inp.elements ?? 24, 4);
  const nn = xs.length, n = 4 * nn;
  const K = Array.from({ length: n }, () => new Float64Array(n));
  const B = Array.from({ length: n }, () => new Float64Array(n));
  const Ke: number[][][] = [], Be: number[][][] = [];
  for (let e = 0; e < nn - 1; e++) {
    const x0 = xs[e], l = xs[e + 1] - x0;
    // element matrices in the local order v₀ v′₀ φ₀ φ′₀ v₁ v′₁ φ₁ φ′₁ (= global 4e … 4e + 7)
    const ke = Array.from({ length: 8 }, () => new Array<number>(8).fill(0)), be = ke.map((r) => r.map(() => 0));
    const vd = [0, 1, 4, 5], pd = [2, 3, 6, 7];
    for (const [g, w] of GAUSS) {
      const xi = (g + 1) / 2, x = x0 + xi * l, wl = (w * l) / 2;
      const { N, d1, d2 } = hermite(xi, l);
      const p = inp.props(x), m = inp.M(x), qz = qzg(x);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        ke[vd[i]][vd[j]] += wl * p.EIz * d2[i] * d2[j];
        ke[pd[i]][pd[j]] += wl * (p.GIt * d1[i] * d1[j] + p.EIw * d2[i] * d2[j]);
        // λ B = −(second variation of the load potential): M_y coupling and load height
        be[vd[i]][pd[j]] -= wl * m * d2[i] * N[j];
        be[pd[j]][vd[i]] -= wl * m * d2[i] * N[j];
        be[pd[i]][pd[j]] += wl * qz * N[i] * N[j];
      }
    }
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { K[4 * e + i][4 * e + j] += ke[i][j]; B[4 * e + i][4 * e + j] += be[i][j]; }
    if (matrices) { Ke.push(ke); Be.push(be); }
  }
  const nodeAt = (x: number) => xs.findIndex((t) => Math.abs(t - x) < 1e-6);
  for (const p of inp.pointLoads ?? []) { const i = nodeAt(p.x); if (i >= 0) B[4 * i + 2][4 * i + 2] += p.Pzg; }
  const fixed = new Set<number>();
  for (const s of supports) {
    const i = nodeAt(s.x);
    if (i < 0) continue;
    if (s.v) fixed.add(4 * i);
    if (s.vp) fixed.add(4 * i + 1);
    if (s.phi) fixed.add(4 * i + 2);
    if (s.phip) fixed.add(4 * i + 3);
  }
  // Solver twist convention: u_top = v + z*phi (z positive above shear centre).
  // Independent flange-force check for constant sagging M: top compression
  // -M/(2z), bottom tension +M/(2z) give load energy -M*v'*phi'.
  // Integration by parts gives +M*v''*phi, exactly the assembled convention.
  const coupled = new Map<number, number>();
  for (const f of flange) {
    const v = 4 * nodeAt(f.x), phi = v + 2;
    const old = coupled.get(v);
    if (old !== undefined && old !== f.z) { fixed.add(v); fixed.add(phi); }
    coupled.set(v, f.z);
    if (f.z === 0 || fixed.has(phi)) fixed.add(v);
    else if (fixed.has(v)) fixed.add(phi);
  }
  const free = [...Array(n).keys()].filter((i) => !fixed.has(i) && !coupled.has(i));
  const m = free.length, index = new Map(free.map((d, i) => [d, i]));
  // Sparse rows of d = T q. Full congruence preserves all cross contributions.
  const T = Array.from({ length: n }, (_, i) => {
    if (fixed.has(i)) return { j: -1, a: 0 };
    const z = coupled.get(i);
    return z === undefined ? { j: index.get(i) ?? -1, a: 1 } : { j: index.get(i + 2) ?? -1, a: -z };
  });
  const reduce = (A: Float64Array[]) => {
    const R = Array.from({ length: m }, () => new Float64Array(m));
    for (let i = 0; i < n; i++) if (T[i].j >= 0)
      for (let j = 0; j < n; j++) if (T[j].j >= 0) R[T[i].j][T[j].j] += T[i].a * A[i][j] * T[j].a;
    return R;
  };
  const Kr = reduce(K), Br = reduce(B);
  const system = matrices
    ? { x: xs, fixed: [...fixed].sort((a, b) => a - b), coupled: [...coupled].filter(([v]) => !fixed.has(v) && !fixed.has(v + 2)).map(([v, z]) => ({ v, z })), Ke, Be }
    : undefined;
  // Cholesky K = L Lᵀ: a non-positive pivot means a mechanism (rigid-body mode) left by the supports
  const Lc = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < m; i++) for (let j = 0; j <= i; j++) {
    let s = Kr[i][j];
    for (let t = 0; t < j; t++) s -= Lc[i][t] * Lc[j][t];
    if (i === j) { if (s <= 1e-8 * Math.abs(Kr[i][i])) return { lambda: NaN, mode: null, system }; Lc[i][i] = Math.sqrt(s); } else Lc[i][j] = s / Lc[j][j];
  }
  const solveL = (col: number[]) => { const y = new Array<number>(m); for (let i = 0; i < m; i++) { let s = col[i]; for (let t = 0; t < i; t++) s -= Lc[i][t] * y[t]; y[i] = s / Lc[i][i]; } return y; };
  const b = Br.map((r) => Array.from(r));
  const Y = Array.from({ length: m }, (_, j) => solveL(b.map((r) => r[j])));
  const C = Array.from({ length: m }, (_, j) => solveL(Y.map((col) => col[j])));
  const eig = jacobiEigen(C.map((r, i) => r.map((v, j) => (v + C[j][i]) / 2)), withMode);
  // λ = 1/μ: the largest positive μ gives the smallest positive λ; μ ≤ 0 (load reversal or none) ignored
  let k = -1;
  eig.values.forEach((mu, i) => { if (mu > 1e-15 && (k < 0 || mu > eig.values[k])) k = i; });
  if (k < 0) return { lambda: Infinity, mode: null, system };
  let mode: LtbResult['mode'] = null;
  if (withMode && eig.vectors) {
    // d = L⁻ᵀ y
    const y = eig.vectors.map((r) => r[k]), d = new Array<number>(m);
    for (let i = m - 1; i >= 0; i--) { let s = y[i]; for (let t = i + 1; t < m; t++) s -= Lc[t][i] * d[t]; d[i] = s / Lc[i][i]; }
    const full = new Array<number>(n).fill(0);
    T.forEach((t, i) => { if (t.j >= 0) full[i] = t.a * d[t.j]; });
    mode = { x: xs, v: xs.map((_, i) => full[4 * i]), phi: xs.map((_, i) => full[4 * i + 2]) };
  }
  return { lambda: 1 / eig.values[k], mode, system };
}

/** Smallest positive critical load factor λ_cr (Infinity: no LTB under this loading; NaN: mechanism). */
export const ltbCriticalFactor = (inp: LtbInput): number => ltbAnalysis(inp).lambda;

/** χ_LT, EN 1993-1-1 (6.56), general case, for a relative slenderness and imperfection factor. */
export function chiLT(lambda: number, alpha: number): number {
  const phi = 0.5 * (1 + alpha * (lambda - 0.2) + lambda ** 2);
  return Math.min(1, 1 / (phi + Math.sqrt(Math.max(phi ** 2 - lambda ** 2, 0))));
}

/**
 * χ_LT of EN 1993-1-1 §6.3.2.3 (6.57) with the modification (6.58): λ_LT,0, β and k_c from the National Annex
 * (Singapore / UK NA: rolled λ_LT,0 = 0.4, β = 0.75, k_c = 1/√C1; welded 0.2, 1.0). With λ_LT,0 = 0.2, β = 1 and
 * k_c = 1 it is the general case (6.56).
 */
export function chiLTMod(lambda: number, alpha: number, lam0: number, beta: number, kc: number): { chi: number; chi0: number; f: number } {
  const phi = 0.5 * (1 + alpha * (lambda - lam0) + beta * lambda ** 2);
  const cap = lambda > 0 ? 1 / lambda ** 2 : Infinity;
  const chi0 = Math.min(1, cap, 1 / (phi + Math.sqrt(Math.max(phi ** 2 - beta * lambda ** 2, 0))));
  const f = Math.min(1, 1 - 0.5 * (1 - kc) * (1 - 2 * (lambda - 0.8) ** 2));
  return { chi: Math.min(1, cap, chi0 / f), chi0, f };
}
