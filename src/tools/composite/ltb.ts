/**
 * Elastic critical load of lateral-torsional buckling for a beam whose section varies along its length
 * (tapered web). Vlasov thin-walled beam, doubly symmetric section, fork supports (v = φ = 0, free to
 * rotate and warp) at the ends and at any interior restraint; the derivatives of the section along x
 * (taper slope effects) are neglected, which is the usual assumption for mild tapers (as LTBeamN).
 *
 *   Π = ½ ∫ (EI_z v''² + GI_t φ'² + EI_w φ''²) dx + λ ∫ M v'' φ dx − λ ½ ∫ q z_g φ² dx
 *
 * Cubic Hermite elements in v and φ (4 DOF per node: v, v', φ, φ'), 4-point Gauss integration so the
 * properties may vary inside an element. λ_cr is the smallest positive root of det(K − λ B) = 0, from the
 * symmetric standard problem L⁻¹ B L⁻ᵀ (K = L Lᵀ) solved by Jacobi rotations.
 *
 * Units: N and mm (EI in N mm², EI_w in N mm⁴, M in N mm, q in N/mm, z_g in mm, positive above the shear
 * centre, destabilising for a gravity load).
 */
export interface LtbInput {
  L: number;
  /** stiffnesses at x */
  props: (x: number) => { EIz: number; GIt: number; EIw: number };
  /** reference moment at x (any sign convention, one sign over the span for a sagging beam) */
  M: (x: number) => number;
  /** distributed load times its height above the shear centre, at x (N); 0 = load at the shear centre */
  qzg?: (x: number) => number;
  /** concentrated loads times their height above the shear centre (N mm), at x (mm): the term P z_g φ(x)² */
  pointLoads?: { x: number; Pzg: number }[];
  /** interior lateral and torsional restraints (fork), x in mm */
  restraints?: number[];
  elements?: number;
}

const GAUSS = [[-0.861136311594053, 0.347854845137454], [-0.339981043584856, 0.652145154862546], [0.339981043584856, 0.652145154862546], [0.861136311594053, 0.347854845137454]];

/** Hermite shape functions on [0, l] at ξ ∈ [0, 1]: values, first and second derivatives with respect to x. */
function hermite(xi: number, l: number) {
  const N = [1 - 3 * xi ** 2 + 2 * xi ** 3, l * (xi - 2 * xi ** 2 + xi ** 3), 3 * xi ** 2 - 2 * xi ** 3, l * (-(xi ** 2) + xi ** 3)];
  const d1 = [(-6 * xi + 6 * xi ** 2) / l, 1 - 4 * xi + 3 * xi ** 2, (6 * xi - 6 * xi ** 2) / l, -2 * xi + 3 * xi ** 2];
  const d2 = [(-6 + 12 * xi) / l ** 2, (-4 + 6 * xi) / l, (6 - 12 * xi) / l ** 2, (-2 + 6 * xi) / l];
  return { N, d1, d2 };
}

/** Smallest positive critical load factor λ_cr (Infinity if the beam cannot buckle under this loading). */
export function ltbCriticalFactor(inp: LtbInput): number {
  const { L } = inp;
  const qzg = inp.qzg ?? (() => 0);
  // mesh: element boundaries at the restraints, ~elements in total
  const rest = (inp.restraints ?? []).filter((x) => x > 1e-6 && x < L - 1e-6);
  // point loads become element boundaries too, so their load-height term sits on a node (φ at a node is a DOF)
  const cuts = [...new Set([0, ...rest, ...(inp.pointLoads ?? []).map((p) => p.x).filter((x) => x > 1e-6 && x < L - 1e-6), L])].sort((a, b) => a - b);
  const ne = inp.elements ?? 24;
  const xs: number[] = [0];
  for (let s = 1; s < cuts.length; s++) {
    const a = cuts[s - 1], b = cuts[s], k = Math.max(4, Math.round((ne * (b - a)) / L));
    for (let i = 1; i <= k; i++) xs.push(a + ((b - a) * i) / k);
  }
  const nn = xs.length, n = 4 * nn;
  const K = Array.from({ length: n }, () => new Float64Array(n));
  const B = Array.from({ length: n }, () => new Float64Array(n));
  for (let e = 0; e < nn - 1; e++) {
    const x0 = xs[e], l = xs[e + 1] - x0;
    // element DOF: v at nodes (0,1 | 4,5), φ at nodes (2,3 | 6,7)
    const vd = [4 * e, 4 * e + 1, 4 * e + 4, 4 * e + 5], pd = [4 * e + 2, 4 * e + 3, 4 * e + 6, 4 * e + 7];
    for (const [g, w] of GAUSS) {
      const xi = (g + 1) / 2, x = x0 + xi * l, wl = (w * l) / 2;
      const { N, d1, d2 } = hermite(xi, l);
      const p = inp.props(x), m = inp.M(x), qz = qzg(x);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        K[vd[i]][vd[j]] += wl * p.EIz * d2[i] * d2[j];
        K[pd[i]][pd[j]] += wl * (p.GIt * d1[i] * d1[j] + p.EIw * d2[i] * d2[j]);
        // λ B: −(second variation of the load terms); the sign of M only flips the buckled shape
        B[vd[i]][pd[j]] -= wl * m * d2[i] * N[j];
        B[pd[j]][vd[i]] -= wl * m * d2[i] * N[j];
        B[pd[i]][pd[j]] += wl * qz * N[i] * N[j];
      }
    }
  }
  for (const p of inp.pointLoads ?? []) {
    const i = xs.findIndex((x) => Math.abs(x - p.x) < 1e-6);
    if (i >= 0) B[4 * i + 2][4 * i + 2] += p.Pzg;
  }
  // fork supports at the ends and at the restraints: v = φ = 0
  const fixed = new Set<number>();
  const forks = [0, ...rest, L];
  xs.forEach((x, i) => { if (forks.some((c) => Math.abs(c - x) < 1e-6)) { fixed.add(4 * i); fixed.add(4 * i + 2); } });
  const free = [...Array(n).keys()].filter((i) => !fixed.has(i));
  const m = free.length;
  const k = free.map((i) => free.map((j) => K[i][j]));
  const b = free.map((i) => free.map((j) => B[i][j]));
  // Cholesky K = L Lᵀ
  const Lc = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < m; i++) for (let j = 0; j <= i; j++) {
    let s = k[i][j];
    for (let t = 0; t < j; t++) s -= Lc[i][t] * Lc[j][t];
    if (i === j) { if (s <= 0) return NaN; Lc[i][i] = Math.sqrt(s); } else Lc[i][j] = s / Lc[j][j];
  }
  // C = L⁻¹ B L⁻ᵀ: Y = L⁻¹ B, then C = (L⁻¹ Yᵀ)ᵀ
  const solveL = (col: number[]) => { const y = new Array<number>(m); for (let i = 0; i < m; i++) { let s = col[i]; for (let t = 0; t < i; t++) s -= Lc[i][t] * y[t]; y[i] = s / Lc[i][i]; } return y; };
  const Y = Array.from({ length: m }, (_, j) => solveL(b.map((r) => r[j]))); // columns of L⁻¹ B
  const C = Array.from({ length: m }, (_, j) => solveL(Y.map((col) => col[j]))); // C[j] = L⁻¹ (row j of (L⁻¹B))ᵀ
  const mu = jacobiEigenvalues(C.map((r, i) => r.map((v, j) => (v + C[j][i]) / 2)));
  const top = Math.max(...mu);
  return top > 1e-15 ? 1 / top : Infinity;
}

/** Eigenvalues of a symmetric matrix by cyclic Jacobi rotations. */
export function jacobiEigenvalues(A0: number[][]): number[] {
  const n = A0.length, A = A0.map((r) => Float64Array.from(r));
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
    }
  }
  return A.map((r, i) => r[i]);
}

/** χ_LT, EN 1993-1-1 (6.56), general case, for a relative slenderness and imperfection factor. */
export function chiLT(lambda: number, alpha: number): number {
  const phi = 0.5 * (1 + alpha * (lambda - 0.2) + lambda ** 2);
  return Math.min(1, 1 / (phi + Math.sqrt(Math.max(phi ** 2 - lambda ** 2, 0))));
}
