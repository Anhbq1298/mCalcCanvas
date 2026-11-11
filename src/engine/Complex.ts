/** Explicit dimensionless complex values; real engineering comparisons never coerce these. */
import { CalculationError } from './CalculationErrors';
export class QComplex {
  readonly re: number;
  readonly im: number;
  constructor(re: number, im: number) { this.re = re; this.im = im; }
}
export const isComplex = (q: unknown): q is QComplex => q instanceof QComplex;
export const complex = (re: number, im: number): number | QComplex => im === 0 ? re : new QComplex(re, im);
export function complexBinary(a: number | QComplex, b: number | QComplex, op: '+' | '-' | '*' | '/' | '^'): number | QComplex {
  const x = typeof a === 'number' ? new QComplex(a, 0) : a;
  const y = typeof b === 'number' ? new QComplex(b, 0) : b;
  if (op === '+') return complex(x.re + y.re, x.im + y.im);
  if (op === '-') return complex(x.re - y.re, x.im - y.im);
  if (op === '*') return complex(x.re * y.re - x.im * y.im, x.re * y.im + x.im * y.re);
  if (op === '/') {
    if (y.re === 0 && y.im === 0) throw new CalculationError('division-by-zero', 'Complex division by zero.');
    if (Math.abs(y.re) >= Math.abs(y.im)) { const r = y.im / y.re, d = 1 + r * r; return complex((x.re / y.re + x.im / y.re * r) / d, (x.im / y.re - x.re / y.re * r) / d); }
    const r = y.re / y.im, d = 1 + r * r;
    return complex((x.re / y.im * r + x.im / y.im) / d, (x.im / y.im * r - x.re / y.im) / d);
  }
  if (y.im === 0 && Number.isInteger(y.re) && Math.abs(y.re) <= 1000) {
    let n = Math.abs(y.re), result: number | QComplex = 1, base: number | QComplex = x;
    while (n) { if (n % 2) result = complexBinary(result, base, '*'); n = Math.floor(n / 2); if (n) base = complexBinary(base, base, '*'); }
    return y.re < 0 ? complexBinary(1, result, '/') : result;
  }
  if (x.re === 0 && x.im === 0) {
    if (y.im !== 0 || y.re < 0) throw new CalculationError('domain', 'This power of complex zero is undefined.');
    return y.re === 0 ? 1 : 0;
  }
  const logarithm = Math.log(Math.hypot(x.re, x.im)), argument = Math.atan2(x.im, x.re);
  const magnitude = Math.exp(y.re * logarithm - y.im * argument), angle = y.im * logarithm + y.re * argument;
  return complex(magnitude * Math.cos(angle), magnitude * Math.sin(angle));
}
