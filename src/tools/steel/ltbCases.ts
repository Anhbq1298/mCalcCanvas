/** SCI NCCI SN003b Tables 3.1 / 3.2 cases (as the worksheet annex) with the EN 1993-1-1 Table B.3 C_m of each diagram. */
import { fmt } from '../composite/format';

export interface LtbCase { n: number; kind: 'end' | 'udl-simple' | 'udl-fixed' | 'point-simple' | 'point-fixed'; psi?: number; c1: number; c2: number; label: string; cm: number }

const END: [number, number][] = [[1, 1.0], [0.75, 1.14], [0.5, 1.31], [0.25, 1.52], [0, 1.77], [-0.25, 2.05], [-0.5, 2.33], [-0.75, 2.57], [-1, 2.55]];
/** Table B.3: end moments ψ: Cm = 0.6 + 0.4ψ ≥ 0.4; uniform load 0.95 + 0.05α_h; concentrated 0.90 + 0.10α_h (α_h = M_s/M_h for the fixed cases). */
export const LTB_CASES: LtbCase[] = [
  ...END.map(([psi, c1], i): LtbCase => ({ n: i + 1, kind: 'end', psi, c1, c2: 0, label: `End moments, ψ = ${psi > 0 ? '+' : ''}${psi}`, cm: Math.max(0.4, 0.6 + 0.4 * psi) })),
  { n: 10, kind: 'udl-simple', c1: 1.127, c2: 0.454, label: 'UDL, simply supported', cm: 0.95 },
  { n: 11, kind: 'udl-fixed', c1: 2.578, c2: 1.554, label: 'UDL, fixed ends', cm: 0.925 },
  { n: 12, kind: 'point-simple', c1: 1.348, c2: 0.63, label: 'Mid-point load, simply supported', cm: 0.9 },
  { n: 13, kind: 'point-fixed', c1: 1.683, c2: 1.645, label: 'Mid-point load, fixed ends', cm: 0.8 },
];

/** C1 for end moments with ratio ψ (−1 … 1), linear in SN003b Table 3.1. */
export function c1OfPsi(psi: number): number {
  const p = Math.max(-1, Math.min(1, psi));
  for (let i = 0; i < END.length - 1; i++) {
    const [a, ca] = END[i], [b, cb] = END[i + 1];
    if (p <= a && p >= b) return ca + ((p - a) / (b - a)) * (cb - ca);
  }
  return 1;
}

export interface DiagramChoice { nLT: number; C1: number; C2: number; psi?: number }

/** The current choice as a short label. */
export function choiceLabel(m: DiagramChoice): string {
  const c = LTB_CASES.find((x) => x.n === m.nLT);
  if (c) return `${c.label} · C1 ${fmt(c.c1, 3)}, C2 ${fmt(c.c2, 3)}`;
  return m.psi !== undefined ? `End moments, ψ = ${m.psi} · C1 ${fmt(m.C1, 3)}` : `User · C1 ${fmt(m.C1, 3)}, C2 ${fmt(m.C2, 3)}`;
}

