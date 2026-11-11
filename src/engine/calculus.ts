/** Bounded real numerical calculus. Inputs/outputs retain physical dimensions. */
import { CalculationError } from './CalculationErrors';
import { isAbsoluteTemperature, isUnit, math, normalize, sameDimension, siValue, type Quantity } from './UnitSystem';
import { withSi } from './Vector';

const fail = (message: string): never => { throw new CalculationError('domain', message); };
const at = (prototype: Quantity, value: number): Quantity => isUnit(prototype) ? withSi(prototype, value) : value;
const one = (q: Quantity): Quantity => isUnit(q) ? withSi(q, 1) : 1;
const scale = (q: Quantity): number => Math.max(Math.abs(siValue(q)), isUnit(q) ? Math.abs(siValue(math.unit(1, q.formatUnits()))) : 1);
const coordinate = (q: Quantity) => {
  if (isAbsoluteTemperature(q)) fail('Calculus coordinates must use a linear scale, e.g. K instead of °C.');
  if (!Number.isFinite(siValue(q))) fail('Calculus needs finite coordinates.');
  if (Math.abs(siValue(q)) > 1e100) throw new CalculationError('limit-exceeded', 'Numerical calculus coordinates are limited to |SI value| ≤ 10^100; improper integral bounds are not supported.');
};

export function numericalDerivative(f: (x: Quantity) => Quantity, point: Quantity): Quantity {
  coordinate(point);
  const x = siValue(point);
  const center = f(point);
  if (isAbsoluteTemperature(center)) fail('Differentiate a temperature difference in K, not an absolute °C value.');
  let prototype: Quantity | undefined = center;
  const sample = (v: number) => {
    if (v === x) fail('The derivative step is below floating-point resolution at this coordinate.');
    const q = f(at(point, v));
    if (isAbsoluteTemperature(q)) fail('Differentiate a temperature difference in K, not an absolute °C value.');
    if (prototype !== undefined && !sameDimension(prototype, q)) fail('The derivative expression changes physical dimension.');
    prototype = q;
    return siValue(q);
  };
  let previous: number | undefined, previousGap = Infinity;
  for (let k = 0; k < 12; k++) {
    const h = scale(point) * 0.01 / 2 ** k;
    const a = sample(x - 2 * h), b = sample(x - h), c = sample(x + h), d = sample(x + 2 * h);
    const result = (a - 8 * b + 8 * c - d) / (12 * h);
    const gap = Math.abs((c - siValue(center)) / h - (siValue(center) - b) / h);
    const reference = Math.max(Math.abs(result), Math.abs(previous ?? result), 1e-14);
    if (previous !== undefined && Math.abs(result - previous) <= 1e-7 * reference && (gap < 1e-4 * reference || gap < previousGap * 0.75)) {
      return normalize(math.divide(at(prototype!, result) as never, one(point) as never) as Quantity);
    }
    previous = result;
    previousGap = gap;
  }
  return fail('The derivative did not converge; check smoothness and the evaluation point.');
}

/** Adaptive Simpson quadrature, with an evaluation cap and explicit convergence failure. */
export function numericalIntegral(f: (x: Quantity) => Quantity, lower: Quantity, upper: Quantity): Quantity {
  coordinate(lower); coordinate(upper);
  if (!sameDimension(lower, upper)) fail('Integral bounds must have matching physical dimensions.');
  let samples = 0;
  const a = siValue(lower), b = siValue(upper);
  let prototype: Quantity | undefined;
  const sample = (x: number) => {
    if (++samples > 8192) throw new CalculationError('limit-exceeded', 'Integral exceeds 8192 evaluations; split the interval.');
    const q = f(at(lower, x));
    if (isAbsoluteTemperature(q)) fail('Integrate a temperature difference in K, not an absolute °C value.');
    if (prototype !== undefined && !sameDimension(prototype, q)) fail('The integrand changes physical dimension.');
    prototype = q;
    return siValue(q);
  };
  const fa = sample(a), fb = sample(b), fm = sample((a + b) / 2);
  const simpson = (x: number, y: number, fx: number, fy: number, mid: number) => (y - x) * (fx + 4 * mid + fy) / 6;
  const initial = simpson(a, b, fa, fb, fm);
  const tolerance = Math.max(Math.abs(initial), Math.abs(b - a) * Math.max(Math.abs(fa), Math.abs(fb), Math.abs(fm)), Number.MIN_VALUE) * 1e-9;
  const integrate = (x: number, y: number, fx: number, fy: number, mid: number, whole: number, tol: number, depth: number): number => {
    const m = (x + y) / 2;
    const fl = sample((x + m) / 2), fr = sample((m + y) / 2);
    const left = simpson(x, m, fx, mid, fl), right = simpson(m, y, mid, fy, fr);
    const delta = left + right - whole;
    if (Math.abs(delta) <= 15 * tol) return left + right + delta / 15;
    if (depth === 0) fail('The integral did not converge; split the interval or check for a singularity.');
    return integrate(x, m, fx, mid, fl, left, tol / 2, depth - 1) + integrate(m, y, mid, fy, fr, right, tol / 2, depth - 1);
  };
  const value = a === b ? 0 : integrate(a, b, fa, fb, fm, initial, tolerance, 18);
  return normalize(math.multiply(at(prototype!, value) as never, one(lower) as never) as unknown as Quantity);
}

/** Finite two/one-sided limits; infinities and non-convergence are errors, never large guesses. */
export function numericalLimit(f: (x: Quantity) => Quantity, point: Quantity, direction = 0, infinity = 0): Quantity {
  coordinate(point);
  if (![-1, 0, 1].includes(direction)) fail('Limit direction is -1 (left), 0 (two-sided), or 1 (right).');
  const x = siValue(point);
  let prototype: Quantity | undefined, previous: number | undefined, initialScale = 0;
  for (let k = 0; k < 40; k++) {
    const h = scale(point) * 0.1 / 2 ** k;
    const sample = (sign: number) => {
      if (x + sign * h === x) fail('The limit cannot be resolved at this floating-point coordinate.');
      const q = f(at(point, infinity ? infinity / h : x + sign * h));
      if (prototype !== undefined && !sameDimension(prototype, q)) fail('The limit expression changes physical dimension.');
      prototype = q;
      return siValue(q);
    };
    const left = sample(direction || -1), right = direction ? left : sample(1);
    const current = (left + right) / 2;
    if (k === 0) initialScale = Math.max(Math.abs(left), Math.abs(right), 1e-30);
    const tolerance = 1e-8 * Math.max(Math.abs(current), initialScale * 0.01);
    if (previous !== undefined && k >= 4 && Math.abs(current - previous) <= tolerance && Math.abs(left - right) <= tolerance) return at(prototype!, current);
    previous = current;
  }
  return fail('The limit did not converge to a finite value.');
}
