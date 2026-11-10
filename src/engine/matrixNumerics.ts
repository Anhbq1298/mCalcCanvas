/** Bounded real-valued factorizations. Numbers are scaled before iterative algorithms. */
import { CalculationError } from './CalculationErrors';
import { math } from './UnitSystem';
export type Dense = number[][];
export const eye = (n: number): Dense => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
export const trans = (a: Dense): Dense => a[0].map((_, c) => a.map((r) => r[c]));
export const product = (a: Dense, b: Dense): Dense => a.map((row) => b[0].map((_, c) => row.reduce((s, x, k) => s + x * b[k][c], 0)));
export const numericError = (message: string): never => { throw new CalculationError('domain', message); };
export function bounded(a: Dense): void {
  if (a.length > 100 || a[0].length > 100) throw new CalculationError('limit-exceeded', 'Factorization is limited to 100 × 100 matrices.');
}
/** One-sided Jacobi SVD; avoids squaring the condition number through AᵀA. */
export function singular(a: Dense): { s: number[]; u: Dense; vt: Dense } {
  bounded(a);
  const m = a.length, n = a[0].length;
  if (m < n) {
    const t = singular(trans(a));
    return { s: t.s, u: trans(t.vt), vt: trans(t.u) };
  }
  const scale = Math.max(...a.flat().map(Math.abs));
  const b = a.map((r) => r.map((x) => scale ? x / scale : 0)), v = eye(n);
  let converged = false;
  for (let sweep = 0; sweep < 100; sweep++) {
    let changed = false;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      let alpha = 0, beta = 0, gamma = 0;
      for (let i = 0; i < m; i++) { alpha += b[i][p] ** 2; beta += b[i][q] ** 2; gamma += b[i][p] * b[i][q]; }
      if (gamma === 0 || Math.abs(gamma) <= 8 * Number.EPSILON * Math.sqrt(alpha) * Math.sqrt(beta)) continue;
      changed = true;
      const tau = (beta - alpha) / (2 * gamma);
      const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.hypot(1, tau));
      const c = 1 / Math.hypot(1, t), sn = c * t;
      for (const rows of [b, v]) for (const row of rows) {
        const x = row[p], y = row[q]; row[p] = c * x - sn * y; row[q] = sn * x + c * y;
      }
    }
    if (!changed) { converged = true; break; }
  }
  if (!converged) numericError('SVD did not converge within 100 sweeps.');
  const lengths = Array.from({ length: n }, (_, j) => Math.hypot(...b.map((r) => r[j])));
  const order = lengths.map((_, i) => i).sort((i, j) => lengths[j] - lengths[i]);
  const s = order.map((j) => lengths[j] * scale);
  const u = Array.from({ length: m }, () => Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    const k = order[j];
    if (lengths[k] > Number.EPSILON * (lengths[order[0]] || 1)) {
      for (let i = 0; i < m; i++) u[i][j] = b[i][k] / lengths[k];
    } else {
      // Complete the orthonormal basis for a zero singular value.
      let found = false;
      for (let seed = 0; seed < m && !found; seed++) {
        const col: number[] = Array.from({ length: m }, (_, i) => i === seed ? 1 : 0);
        for (let pass = 0; pass < 2; pass++) for (let k0 = 0; k0 < j; k0++) {
          const d = col.reduce((sum, x, i) => sum + x * u[i][k0], 0);
          for (let i = 0; i < m; i++) col[i] -= d * u[i][k0];
        }
        const norm = Math.hypot(...col);
        if (norm > 1e-10) { for (let i = 0; i < m; i++) u[i][j] = col[i] / norm; found = true; }
      }
      if (!found) numericError('Could not construct the SVD null-space basis.');
    }
  }
  return { s, u, vt: order.map((j) => v.map((row) => row[j])) };
}
export function pseudoInverse(a: Dense): Dense {
  const { s, u, vt } = singular(a);
  const tol = Number.EPSILON * Math.max(a.length, a[0].length) * (s[0] || 1);
  return trans(vt).map((row) => u.map((_, r) => row.reduce((sum, x, k) => sum + (s[k] > tol ? x * u[r][k] / s[k] : 0), 0)));
}
export function lu(a: Dense): { p: Dense; l: Dense; u: Dense } {
  bounded(a);
  const m = a.length, n = a[0].length, kmax = Math.min(m, n);
  const u = a.map((r) => [...r]), p = eye(m), l = Array.from({ length: m }, () => Array<number>(kmax).fill(0));
  for (let k = 0; k < kmax; k++) {
    let pivot = k;
    for (let i = k + 1; i < m; i++) if (Math.abs(u[i][k]) > Math.abs(u[pivot][k])) pivot = i;
    [u[k], u[pivot]] = [u[pivot], u[k]]; [p[k], p[pivot]] = [p[pivot], p[k]];
    for (let j = 0; j < k; j++) [l[k][j], l[pivot][j]] = [l[pivot][j], l[k][j]];
    l[k][k] = 1;
    if (u[k][k] === 0) continue;
    for (let i = k + 1; i < m; i++) {
      l[i][k] = u[i][k] / u[k][k];
      for (let j = k + 1; j < n; j++) u[i][j] -= l[i][k] * u[k][j];
      u[i][k] = 0;
    }
  }
  return { p, l, u: u.slice(0, kmax) };
}
export function qr(a: Dense, pivoting: boolean): { p: Dense; q: Dense; r: Dense } {
  bounded(a);
  const m = a.length, n = a[0].length, r = a.map((row) => [...row]), q = eye(m), p = eye(n);
  for (let k = 0; k < Math.min(m, n); k++) {
    if (pivoting) {
      let col = k, best = -1;
      for (let j = k; j < n; j++) {
        const norm = Math.hypot(...r.slice(k).map((row) => row[j]));
        if (norm > best) { best = norm; col = j; }
      }
      for (const row of [...r, ...p]) [row[k], row[col]] = [row[col], row[k]];
    }
    const v = r.slice(k).map((row) => row[k]), norm = Math.hypot(...v);
    if (!norm) continue;
    // Normalize before adding the reflector's leading value to avoid overflow.
    for (let i = 0; i < v.length; i++) v[i] /= norm;
    v[0] += v[0] >= 0 ? 1 : -1;
    const vn = Math.hypot(...v);
    for (let i = 0; i < v.length; i++) v[i] /= vn;
    for (let j = k; j < n; j++) {
      const dot = v.reduce((sum, x, i) => sum + x * r[k + i][j], 0);
      for (let i = 0; i < v.length; i++) r[k + i][j] -= 2 * v[i] * dot;
    }
    for (let i = 0; i < m; i++) {
      const dot = v.reduce((sum, x, j) => sum + q[i][k + j] * x, 0);
      for (let j = 0; j < v.length; j++) q[i][k + j] -= 2 * dot * v[j];
    }
    for (let i = k + 1; i < m; i++) r[i][k] = 0;
  }
  return { p, q, r };
}
export function cholesky(a: Dense, pivoting: boolean): { p: Dense; l: Dense } {
  bounded(a);
  const n = a.length;
  if (a[0].length !== n) numericError('Cholesky requires a square matrix.');
  const scale = Math.max(...a.flat().map(Math.abs));
  const tol = 32 * Number.EPSILON * scale;
  if (a.some((row, i) => row.some((x, j) => Math.abs(x - a[j][i]) > tol))) numericError('Cholesky requires a symmetric positive definite matrix.');
  const b = a.map((row) => [...row]), l = a.map(() => Array<number>(n).fill(0)), p = eye(n);
  for (let k = 0; k < n; k++) {
    if (pivoting) {
      let i0 = k;
      const residual = (i: number) => b[i][i] - l[i].slice(0, k).reduce((s, x) => s + x * x, 0);
      for (let i = k + 1; i < n; i++) if (residual(i) > residual(i0)) i0 = i;
      [b[k], b[i0]] = [b[i0], b[k]];
      for (const row of b) [row[k], row[i0]] = [row[i0], row[k]];
      for (const row of p) [row[k], row[i0]] = [row[i0], row[k]];
      [l[k], l[i0]] = [l[i0], l[k]];
    }
    const d = b[k][k] - l[k].slice(0, k).reduce((s, x) => s + x * x, 0);
    if (d <= 0) numericError('Cholesky requires a positive definite matrix.');
    l[k][k] = Math.sqrt(d);
    for (let i = k + 1; i < n; i++) l[i][k] = (b[i][k] - l[i].slice(0, k).reduce((s, x, j) => s + x * l[k][j], 0)) / l[k][k];
  }
  return { p, l };
}
export function eigen(a: Dense, vectorsRequired = true): { values: number[]; vectors: Dense } {
  bounded(a);
  if (a.length !== a[0].length) numericError('Eigenvalue calculations require a square matrix.');
  const scale = Math.max(...a.flat().map(Math.abs)) || 1;
  const scaled = a.map((r) => r.map((x) => x / scale));
  const raw = math.eigs(scaled, { precision: 1e-14, eigenvectors: false });
  const vectorResult = vectorsRequired ? math.eigs(scaled, { precision: 1e-14 }) : null;
  const values = raw.values as unknown[];
  if (values.some((x) => typeof x !== 'number')) numericError('This matrix has complex eigenvalues; the worksheet engine currently supports real quantities.');
  if (!vectorsRequired) return { values: (values as number[]).map((x) => x * scale).sort((x, y) => y - x), vectors: [] };
  const pairs = (values as number[]).map((x, index) => {
    const candidate = vectorResult!.eigenvectors[index];
    if (!candidate) numericError('The matrix has no complete eigenvector basis (defective matrix).');
    const v = candidate.vector as unknown[];
    if (v.some((x) => typeof x !== 'number')) numericError('Complex eigenvectors are not supported by the real-valued engine.');
    const norm = Math.hypot(...v as number[]);
    return { value: x * scale, vector: (v as number[]).map((z) => z / norm) };
  }).sort((x, y) => y.value - x.value);
  return { values: pairs.map((p) => p.value), vectors: trans(pairs.map((p) => p.vector)) };
}
