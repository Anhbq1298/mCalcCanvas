/** Discrete coefficient cases transcribed from SCI NCCI SN003b, Tables 3.1 and 3.2.
 * All coefficients use k = 1 and fork-end lateral/twist restraint. Do not interpolate.
 */
type LtbDiagramKind = 'end-moments' | 'udl-simple' | 'udl-fixed' | 'point-simple' | 'point-fixed';
interface LtbCoefficientCase {
  id: number;
  name: string;
  c1: number;
  c2: number;
  psi?: number;
  diagram: LtbDiagramKind;
}

export const ltbCoefficientCases: readonly LtbCoefficientCase[] = [
  {id:1,name:'End moments, ψ = +1.00',psi:1,c1:1.00,c2:0,diagram:'end-moments'},
  {id:2,name:'End moments, ψ = +0.75',psi:0.75,c1:1.14,c2:0,diagram:'end-moments'},
  {id:3,name:'End moments, ψ = +0.50',psi:0.5,c1:1.31,c2:0,diagram:'end-moments'},
  {id:4,name:'End moments, ψ = +0.25',psi:0.25,c1:1.52,c2:0,diagram:'end-moments'},
  {id:5,name:'End moments, ψ = 0.00',psi:0,c1:1.77,c2:0,diagram:'end-moments'},
  {id:6,name:'End moments, ψ = −0.25',psi:-0.25,c1:2.05,c2:0,diagram:'end-moments'},
  {id:7,name:'End moments, ψ = −0.50',psi:-0.5,c1:2.33,c2:0,diagram:'end-moments'},
  {id:8,name:'End moments, ψ = −0.75',psi:-0.75,c1:2.57,c2:0,diagram:'end-moments'},
  {id:9,name:'End moments, ψ = −1.00',psi:-1,c1:2.55,c2:0,diagram:'end-moments'},
  {id:10,name:'Simply supported, full-span UDL',c1:1.127,c2:0.454,diagram:'udl-simple'},
  {id:11,name:'Fixed-ended, full-span UDL',c1:2.578,c2:1.554,diagram:'udl-fixed'},
  {id:12,name:'Simply supported, mid-span point load',c1:1.348,c2:0.630,diagram:'point-simple'},
  {id:13,name:'Fixed-ended, mid-span point load',c1:1.683,c2:1.645,diagram:'point-fixed'},
];

/** The calculation kernel uses zero-based loadCase; worksheet selection is 1..13. */
export function ltbCoefficientForIndex(loadCase: number): LtbCoefficientCase | undefined {
  return Number.isInteger(loadCase) ? ltbCoefficientCases[loadCase] : undefined;
}
