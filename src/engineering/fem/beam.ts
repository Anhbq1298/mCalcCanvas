/**
 * In-plane beam finite elements (Euler–Bernoulli, small displacements) for the internal forces of a
 * straight member: bending stiffness EI(x) may vary along x (tapered web), supports at any position with
 * fixed or elastic deflection and rotation, distributed loads (piecewise linear), point loads and point
 * moments. Used as the pre-buckling analysis of the LTB eigenvalue problem (ltb.ts) and verified against
 * closed forms for simply supported, cantilever, propped, fixed-fixed and continuous beams.
 *
 * Sign convention: x along the member, w downward positive, θ = dw/dx, loads downward positive,
 * M sagging positive (M = −EI w''), V = dM/dx. Units: consistent (N and mm in the composite tool).
 */

/** Restraint of one DOF: true = fixed, a number = elastic spring (force / length, or moment / radian). */
export type Restraint = boolean | number;
export interface BeamSupport { x: number; w?: Restraint; theta?: Restraint }
export interface DistLoad { x1: number; x2: number; q1: number; q2?: number }
export interface BeamLoads { dist?: DistLoad[]; point?: { x: number; P: number }[]; moment?: { x: number; M: number }[] }
export interface BeamInput { L: number; EI: (x: number) => number; supports: BeamSupport[]; loads: BeamLoads; elements?: number }
export interface BeamResult {
  /** node positions and nodal displacements */
  nodes: number[]; w: number[]; theta: number[];
  /** support reactions (upward positive force, anticlockwise-in-θ moment), in the order of the supports */
  reactions: { x: number; R: number; M: number }[];
  /** sagging moment, shear and deflection at any x */
  M: (x: number) => number; V: (x: number) => number; deflection: (x: number) => number;
}

const GAUSS = [[-0.906179845938664, 0.236926885056189], [-0.538469310105683, 0.478628670499366], [0, 0.568888888888889], [0.538469310105683, 0.478628670499366], [0.906179845938664, 0.236926885056189]];

export function hermite(xi: number, l: number) {
  const N = [1 - 3 * xi ** 2 + 2 * xi ** 3, l * (xi - 2 * xi ** 2 + xi ** 3), 3 * xi ** 2 - 2 * xi ** 3, l * (-(xi ** 2) + xi ** 3)];
  const d1 = [(-6 * xi + 6 * xi ** 2) / l, 1 - 4 * xi + 3 * xi ** 2, (6 * xi - 6 * xi ** 2) / l, -2 * xi + 3 * xi ** 2];
  const d2 = [(-6 + 12 * xi) / l ** 2, (-4 + 6 * xi) / l, (6 - 12 * xi) / l ** 2, (-2 + 6 * xi) / l];
  return { N, d1, d2 };
}

/** Mesh with nodes at every listed station, about `elements` elements in total (at least `min` per piece). */
export function meshStations(L: number, stations: number[], elements: number, min = 2): number[] {
  const cuts = [...new Set([0, L, ...stations.filter((x) => x > 1e-9 && x < L - 1e-9)])].sort((a, b) => a - b);
  const xs = [0];
  for (let s = 1; s < cuts.length; s++) {
    const a = cuts[s - 1], b = cuts[s], k = Math.max(min, Math.round((elements * (b - a)) / L));
    for (let i = 1; i <= k; i++) xs.push(a + ((b - a) * i) / k);
  }
  return xs;
}

/** Solve a symmetric positive definite system by Cholesky (returns null if not positive definite). */
export function solveSPD(A: number[][], b: number[]): number[] | null {
  const n = b.length, Lc = A.map(() => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j];
    for (let t = 0; t < j; t++) s -= Lc[i][t] * Lc[j][t];
    if (i === j) { if (!(s > 1e-10 * Math.abs(A[i][i]))) return null; Lc[i][i] = Math.sqrt(s); } else Lc[i][j] = s / Lc[j][j];
  }
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let t = 0; t < i; t++) s -= Lc[i][t] * y[t]; y[i] = s / Lc[i][i]; }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let t = i + 1; t < n; t++) s -= Lc[t][i] * x[t]; x[i] = s / Lc[i][i]; }
  return x;
}

const qAt = (d: DistLoad, x: number) => (x < d.x1 - 1e-9 || x > d.x2 + 1e-9 ? 0 : d.q1 + (((d.q2 ?? d.q1) - d.q1) * (x - d.x1)) / Math.max(d.x2 - d.x1, 1e-12));

export function solveBeam(inp: BeamInput): BeamResult {
  const { L, loads } = inp;
  const dist = loads.dist ?? [], point = loads.point ?? [], moment = loads.moment ?? [];
  const xs = meshStations(L, [...inp.supports.map((s) => s.x), ...dist.flatMap((d) => [d.x1, d.x2]), ...point.map((p) => p.x), ...moment.map((m) => m.x)], inp.elements ?? 40);
  const nn = xs.length, n = 2 * nn;
  const K = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const F = new Array<number>(n).fill(0);
  const q = (x: number) => dist.reduce((s, d) => s + qAt(d, x), 0);
  const feq: number[][] = [];
  for (let e = 0; e < nn - 1; e++) {
    const x0 = xs[e], l = xs[e + 1] - x0, dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3], fe = [0, 0, 0, 0];
    for (const [g, wg] of GAUSS) {
      const xi = (g + 1) / 2, x = x0 + xi * l, wl = (wg * l) / 2, { N, d2 } = hermite(xi, l), EI = inp.EI(x), qx = q(x);
      for (let i = 0; i < 4; i++) { fe[i] += wl * N[i] * qx; for (let j = 0; j < 4; j++) K[dof[i]][dof[j]] += wl * EI * d2[i] * d2[j]; }
    }
    feq.push(fe);
    for (let i = 0; i < 4; i++) F[dof[i]] += fe[i];
  }
  const node = (x: number) => xs.findIndex((t) => Math.abs(t - x) < 1e-9);
  for (const p of point) F[2 * node(p.x)] += p.P;
  for (const m of moment) F[2 * node(m.x) + 1] += m.M; // a moment in the sense of +θ (dw/dx, w downward)
  const fixed = new Set<number>();
  for (const s of inp.supports) {
    const i = node(s.x);
    for (const [dof, r] of [[2 * i, s.w], [2 * i + 1, s.theta]] as const) {
      if (r === true) fixed.add(dof);
      else if (typeof r === 'number' && r > 0) K[dof][dof] += r;
    }
  }
  const free = [...Array(n).keys()].filter((i) => !fixed.has(i));
  const sol = solveSPD(free.map((i) => free.map((j) => K[i][j])), free.map((i) => F[i]));
  if (!sol) throw new Error('beam: unstable supports (singular stiffness)');
  const u = new Array<number>(n).fill(0);
  free.forEach((i, k) => (u[i] = sol[k]));
  // element end forces f = k u − f_eq: M(0) = f[1], V(0) = −f[0] (virtual work boundary terms)
  const ends = xs.slice(0, -1).map((x0, e) => {
    const l = xs[e + 1] - x0, dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3], f = [0, 0, 0, 0];
    for (const [g, wg] of GAUSS) {
      const xi = (g + 1) / 2, wl = (wg * l) / 2, { d2 } = hermite(xi, l), EI = inp.EI(x0 + xi * l);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) f[i] += wl * EI * d2[i] * d2[j] * u[dof[j]];
    }
    return { x0, l, M0: f[1] - feq[e][1], V0: -(f[0] - feq[e][0]) };
  });
  const elementAt = (x: number) => Math.min(Math.max(xs.findIndex((t, i) => i > 0 && x <= t + 1e-9) - 1, 0), nn - 2);
  // inside an element the load is linear: M(s) = M0 + V0 s − ∫₀ˢ q(t)(s − t) dt, V(s) = V0 − ∫₀ˢ q dt
  const inner = (x: number) => {
    const e = ends[elementAt(x)], s = Math.min(Math.max(x - e.x0, 0), e.l), qa = q(e.x0 + 1e-9), qb = q(e.x0 + e.l - 1e-9);
    const k = e.l > 0 ? (qb - qa) / e.l : 0;
    return { M: e.M0 + e.V0 * s - (qa * s * s) / 2 - (k * s ** 3) / 6, V: e.V0 - qa * s - (k * s * s) / 2 };
  };
  // reaction (upward / against +θ) of a fixed DOF: −(K u − F) there; of a spring: k u
  const react = (dof: number, r: Restraint | undefined) => {
    if (typeof r === 'number') return r * u[dof];
    if (r !== true) return 0;
    let s = 0;
    for (let j = 0; j < n; j++) s += K[dof][j] * u[j];
    return -(s - F[dof]);
  };
  const reactions = inp.supports.map((s) => { const i = node(s.x); return { x: s.x, R: react(2 * i, s.w), M: react(2 * i + 1, s.theta) }; });
  return {
    nodes: xs, w: xs.map((_, i) => u[2 * i]), theta: xs.map((_, i) => u[2 * i + 1]), reactions,
    M: (x) => inner(x).M, V: (x) => inner(x).V,
    deflection: (x) => { const e = ends[elementAt(x)], i = elementAt(x), { N } = hermite(Math.min(Math.max((x - e.x0) / e.l, 0), 1), e.l); return N[0] * u[2 * i] + N[1] * u[2 * i + 1] + N[2] * u[2 * i + 2] + N[3] * u[2 * i + 3]; },
  };
}
