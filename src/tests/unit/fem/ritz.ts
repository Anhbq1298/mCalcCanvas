/**
 * Independent reference for the LTB finite elements: Rayleigh–Ritz with sine series v, φ = Σ sin(nπx/L)
 * (fork supports at both ends), Simpson integration, eigenvalue by Jacobi on the diagonally scaled problem.
 * Shares no code with src/engineering/fem except the Jacobi routine (itself checked on the closed form).
 */
import { jacobiEigenvalues } from '../../../engineering/fem';

export function ritzMcrFactor(o: {
  L: number; props: (x: number) => { EIz: number; GIt: number; EIw: number }; M: (x: number) => number;
  qzg?: (x: number) => number; point?: { x: number; Pzg: number }[]; terms?: number;
}): number {
  const { L } = o, N = o.terms ?? 15, S = 2000, dx = L / S, n2 = 2 * N;
  const K = Array.from({ length: n2 }, () => new Array<number>(n2).fill(0)), B = K.map((r) => r.map(() => 0));
  const k = (n: number) => (n * Math.PI) / L;
  for (let s = 0; s <= S; s++) {
    const x = s * dx, w = ((s === 0 || s === S ? 1 : s % 2 ? 4 : 2) * dx) / 3, p = o.props(x), M = o.M(x), qz = o.qzg?.(x) ?? 0;
    const sn = (n: number) => Math.sin(k(n) * x), cs = (n: number) => k(n) * Math.cos(k(n) * x), dd = (n: number) => -(k(n) ** 2) * sn(n);
    for (let i = 1; i <= N; i++) for (let j = 1; j <= N; j++) {
      K[i - 1][j - 1] += w * p.EIz * dd(i) * dd(j);
      K[N + i - 1][N + j - 1] += w * (p.GIt * cs(i) * cs(j) + p.EIw * dd(i) * dd(j));
      const t = w * M * dd(i) * sn(j);
      B[i - 1][N + j - 1] -= t; B[N + j - 1][i - 1] -= t;
      B[N + i - 1][N + j - 1] += w * qz * sn(i) * sn(j);
    }
  }
  for (const p of o.point ?? []) for (let i = 1; i <= N; i++) for (let j = 1; j <= N; j++) B[N + i - 1][N + j - 1] += p.Pzg * Math.sin(k(i) * p.x) * Math.sin(k(j) * p.x);
  // K is diagonal for a uniform member; for a varying one use its Cholesky-free symmetric scaling + full solve
  const d = K.map((r, i) => Math.sqrt(r[i]));
  const Ks = K.map((r, i) => r.map((v, j) => v / (d[i] * d[j]))), Bs = B.map((r, i) => r.map((v, j) => v / (d[i] * d[j])));
  // generalized problem Ks y = λ Bs y with Ks ≈ I: reduce by Cholesky of Ks
  const n = n2, Lc = Ks.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = Ks[i][j]; for (let t = 0; t < j; t++) s -= Lc[i][t] * Lc[j][t]; Lc[i][j] = i === j ? Math.sqrt(s) : s / Lc[j][j]; }
  const solveL = (c: number[]) => { const y = new Array<number>(n); for (let i = 0; i < n; i++) { let s = c[i]; for (let t = 0; t < i; t++) s -= Lc[i][t] * y[t]; y[i] = s / Lc[i][i]; } return y; };
  const Y = Array.from({ length: n }, (_, j) => solveL(Bs.map((r) => r[j])));
  const C = Array.from({ length: n }, (_, j) => solveL(Y.map((c) => c[j])));
  return 1 / Math.max(...jacobiEigenvalues(C.map((r, i) => r.map((v, j) => (v + C[j][i]) / 2))));
}
