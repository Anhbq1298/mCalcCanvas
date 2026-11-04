/**
 * Regression tests for the reliability audit: reading order, definition-level
 * dependencies, numerical safeguards, temperature handling, error messages
 * and engineering reference values.
 */
import { describe, expect, it } from 'vitest';
import { CalculationEngine, compareOrderKeys, type OrderKey } from '../../engine';
import { compareQuantities, COMPARISON_RELATIVE_TOLERANCE } from '../../engine/ExpressionEvaluator';
import { math } from '../../engine/UnitSystem';

type Reg = [id: string, latex: string, order: number | OrderKey];

function sheet(regs: Reg[]) {
  const e = new CalculationEngine();
  e.batch(() => regs.forEach(([id, latex, order]) => e.setRegion(id, { latex, order })));
  return e;
}
/** Track which regions each change re-evaluates. */
function track(e: CalculationEngine) {
  const evaluated: string[] = [];
  e.subscribe((ids) => evaluated.push(...ids));
  return evaluated;
}
const value = (e: CalculationEngine, id: string) => e.getResult(id)?.value?.number;
const text = (e: CalculationEngine, id: string) => e.getResult(id)?.value?.text;
const err = (e: CalculationEngine, id: string) => e.getResult(id)?.error;
/** Canvas-style key: [page, y, x, id]. */
const at = (page: number, y: number, x: number, id: string): OrderKey => [page, y, x, id];

describe('2. reading order', () => {
  it('compares keys lexicographically: page, y, x, id', () => {
    expect(compareOrderKeys([0, 10, 5, 'a'], [0, 10, 6, 'a'])).toBeLessThan(0);
    expect(compareOrderKeys([0, 11, 0, 'a'], [0, 10, 900, 'a'])).toBeGreaterThan(0);
    expect(compareOrderKeys([1, 0, 0, 'a'], [0, 5000, 0, 'a'])).toBeGreaterThan(0);
    expect(compareOrderKeys([0, 10, 5, 'a'], [0, 10, 5, 'b'])).toBeLessThan(0);
    expect(compareOrderKeys([0, -20, -3, 'a'], [0, -10, -900, 'a'])).toBeLessThan(0);
  });

  it('A: same row – the left definition is visible to the right equation', () => {
    const e = sheet([
      ['x', 'x\\coloneq10', at(0, 100, 100, 'x')],
      ['y', 'y\\coloneq x\\cdot2', at(0, 100, 300, 'y')],
    ]);
    expect(value(e, 'y')).toBe(20);
  });

  it('B: a definition below is reported as "defined below"', () => {
    const e = sheet([
      ['y', 'y\\coloneq x\\cdot2', at(0, 100, 100, 'y')],
      ['x', 'x\\coloneq10', at(0, 200, 100, 'x')],
    ]);
    expect(err(e, 'y')?.code).toBe('defined-later');
    expect(err(e, 'y')?.message).toContain('Variable "x" is defined below this equation');
  });

  it('C: moving a definition above / below its user updates the result', () => {
    const e = sheet([
      ['y', 'y\\coloneq x\\cdot2', at(0, 100, 100, 'y')],
      ['x', 'x\\coloneq10', at(0, 200, 100, 'x')],
    ]);
    e.setRegion('x', { latex: 'x\\coloneq10', order: at(0, 50, 100, 'x') });
    expect(value(e, 'y')).toBe(20);
    e.setRegion('x', { latex: 'x\\coloneq10', order: at(0, 300, 100, 'x') });
    expect(err(e, 'y')?.code).toBe('defined-later');
  });

  it('D: identical coordinates still give a deterministic order (by id)', () => {
    const regs = (first: string): Reg[] => {
      const a: Reg = ['a', 'x\\coloneq1', at(0, 100, 100, 'a')];
      const b: Reg = ['b', 'x\\coloneq2', at(0, 100, 100, 'b')];
      const u: Reg = ['u', 'x=', at(0, 200, 100, 'u')];
      return first === 'a' ? [a, b, u] : [b, a, u];
    };
    // Insertion order does not matter: "b" sorts after "a", so it is the nearest definition.
    expect(value(sheet(regs('a')), 'u')).toBe(2);
    expect(value(sheet(regs('b')), 'u')).toBe(2);
  });

  it('E: very large x coordinates do not overflow into the next row', () => {
    // With the old packed key (y·100000 + x) these two collided / swapped.
    const e = sheet([
      ['far', 'x\\coloneq1', at(0, 100, 250000, 'far')],
      ['next', 'y\\coloneq x+1', at(0, 101, 0, 'next')],
      ['neg', 'z\\coloneq y+1', at(0, 101, 5e9, 'neg')],
    ]);
    expect(value(e, 'next')).toBe(2);
    expect(value(e, 'neg')).toBe(3);
  });

  it('F: definitions on earlier pages are visible on later pages', () => {
    const e = sheet([
      ['use', 'A\\coloneq L\\cdot2', at(1, 1300, 100, 'use')],
      ['def', 'L\\coloneq3', at(0, 900, 600, 'def')],
    ]);
    expect(value(e, 'use')).toBe(6);
  });

  it('accepts plain numeric order (backward compatible API)', () => {
    const e = sheet([
      ['a', 'x\\coloneq4', 1],
      ['b', 'x=', 2],
    ]);
    expect(value(e, 'b')).toBe(4);
  });
});

describe('3. dependencies follow the exact defining region', () => {
  const four = (): CalculationEngine =>
    sheet([
      ['x1', 'x\\coloneq10', 1],
      ['A', 'A\\coloneq x\\cdot2', 2],
      ['x2', 'x\\coloneq20', 3],
      ['B', 'B\\coloneq x\\cdot3', 4],
    ]);

  it('independent definitions: changing the first x updates A only', () => {
    const e = four();
    const seen = track(e);
    e.setRegion('x1', { latex: 'x\\coloneq11', order: 1 });
    expect(value(e, 'A')).toBe(22);
    expect(value(e, 'B')).toBe(60);
    expect(seen.sort()).toEqual(['A', 'x1']);
  });

  it('deleting the first x makes A an error', () => {
    const e = four();
    e.removeRegion('x1');
    expect(err(e, 'A')?.code).toBe('defined-later');
    expect(value(e, 'B')).toBe(60);
  });

  it('inserting a definition between two equations rewires the later one', () => {
    const e = sheet([
      ['x1', 'x\\coloneq10', 1],
      ['A', 'A\\coloneq x\\cdot2', 2],
      ['B', 'B\\coloneq x\\cdot3', 4],
    ]);
    expect(value(e, 'B')).toBe(30);
    const seen = track(e);
    e.setRegion('x2', { latex: 'x\\coloneq20', order: 3 });
    expect(value(e, 'B')).toBe(60);
    expect(value(e, 'A')).toBe(20);
    expect(seen).not.toContain('A');
  });

  it('redefinition x := x + 5 uses the previous x', () => {
    const e = sheet([
      ['a', 'x\\coloneq10', 1],
      ['b', 'x\\coloneq x+5', 2],
      ['c', 'y\\coloneq x\\cdot2', 3],
    ]);
    expect(value(e, 'c')).toBe(30);
    expect(e.getResult('b')?.redefines?.name).toBe('x');
  });

  it('a dependency chain updates end to end', () => {
    const e = sheet([
      ['a', 'a\\coloneq10', 1],
      ['b', 'b\\coloneq a\\cdot2', 2],
      ['c', 'c\\coloneq b+5', 3],
      ['d', 'd\\coloneq c\\cdot3', 4],
      ['u', 'u\\coloneq7', 5],
    ]);
    expect(value(e, 'd')).toBe(75);
    const seen = track(e);
    e.setRegion('a', { latex: 'a\\coloneq1', order: 1 });
    expect([value(e, 'b'), value(e, 'c'), value(e, 'd')]).toEqual([2, 7, 21]);
    // Unrelated calculation is not re-evaluated.
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('renaming a definition re-resolves its users', () => {
    const e = sheet([
      ['a', 'a\\coloneq10', 1],
      ['b', 'b\\coloneq a\\cdot2', 2],
    ]);
    e.setRegion('a', { latex: 'q\\coloneq10', order: 1 });
    expect(err(e, 'b')?.code).toBe('undefined-variable');
    e.setRegion('a', { latex: 'a\\coloneq3', order: 1 });
    expect(value(e, 'b')).toBe(6);
  });

  it('a new multi-letter definition changes how letter runs resolve, in order', () => {
    const e = sheet([
      ['w', 'w\\coloneq2', 1],
      ['L', 'L\\coloneq3', 2],
      ['m', 'm_{1}\\coloneq wL', 4],
    ]);
    expect(value(e, 'm')).toBe(6);
    e.setRegion('wL', { latex: 'wL\\coloneq100', order: 3 });
    expect(value(e, 'm')).toBe(100);
    e.setRegion('wL', { latex: 'wL\\coloneq100', order: 5 });
    expect(value(e, 'm')).toBe(6);
  });

  it('format-only changes do not recalculate dependents', () => {
    const e = sheet([
      ['L', 'L\\coloneq8.5\\,\\mathrm{m}', 1],
      ['A', 'A\\coloneq L^2', 2],
    ]);
    const seen = track(e);
    e.setRegion('L', { latex: 'L\\coloneq8.5\\,\\mathrm{m}', order: 1, displayUnit: 'mm' });
    expect(seen).toEqual(['L']);
    expect(text(e, 'L')).toBe('8500 mm');
  });

  it('no stale results after rapid edits', () => {
    const e = sheet([
      ['a', 'a\\coloneq1', 1],
      ['b', 'b\\coloneq a+1', 2],
    ]);
    for (let i = 0; i < 50; i++) e.setRegion('a', { latex: `a\\coloneq${i}`, order: 1, draft: true });
    e.setRegion('a', { latex: 'a\\coloneq49', order: 1, draft: false });
    expect(value(e, 'b')).toBe(50);
  });

  it('cycles cannot form in reading order, and a self-reference is reported', () => {
    const e = sheet([['a', 'a\\coloneq a+1', 1]]);
    expect(err(e, 'a')?.code).toBe('defined-later');
    expect(err(e, 'a')?.message).toBe('Variable "a" is used in its own definition but has no value above this equation.');
  });
});

describe('5. numerical reliability', () => {
  it('5.1 keeps full precision internally (display rounds only)', () => {
    const e = sheet([
      ['L', 'L\\coloneq8.5\\,\\mathrm{m}', 1],
      ['w', 'w\\coloneq25\\,\\frac{\\mathrm{kN}}{\\mathrm{m}}', 2],
      ['M', 'M\\coloneq\\frac{wL^2}{8}', 3],
    ]);
    expect(value(e, 'M')).toBe(225.78125);
    expect(text(e, 'M')).toBe('225.78 kN·m');
  });

  it('5.2 checks use unrounded values: 1.0000001 ≤ 1 FAILS although it displays as 1', () => {
    const e = sheet([
      ['eta', '\\eta\\coloneq1.0000001', 1],
      ['c', '\\eta\\le1', 2],
    ]);
    expect(e.getResult('c')?.check?.pass).toBe(false);
    expect(e.getResult('c')?.check?.leftValue.text).toBe('1');
  });

  it('5.3 comparison tolerance is representation-level only, with no absolute floor', () => {
    expect(COMPARISON_RELATIVE_TOLERANCE).toBeLessThan(1e-14);
    // Small SI magnitudes are compared strictly (the old absolute 1e-12 floor passed this).
    expect(compareQuantities(math.unit(0.5, 'mm^4') as never, math.unit(0.4, 'mm^4') as never, '<=')).toBe(false);
    // Unit-conversion noise (300 mm → 0.30000000000000004 m) does not cause a false FAIL.
    expect(compareQuantities(math.unit(300, 'mm') as never, math.unit(0.3, 'm') as never, '<=')).toBe(true);
    expect(compareQuantities(1 + 1e-12, 1, '<=')).toBe(false);
    expect(compareQuantities(0.1 + 0.2, 0.3, '==')).toBe(true);
    expect(compareQuantities(1, 1, '<')).toBe(false);
  });

  it.each([
    ['1/0', '\\frac{1}{0}=', 'division-by-zero'],
    ['1/(x-x)', '\\frac{1}{x-x}=', 'division-by-zero'],
    ['0/0', '\\frac{0}{0}=', 'division-by-zero'],
    ['sqrt(-1)', '\\sqrt{-1}=', 'domain'],
    ['log(-10)', '\\log\\left(-10\\right)=', 'domain'],
    ['ln(0)', '\\ln\\left(0\\right)=', 'domain'],
    ['(-2)^0.5', '\\left(-2\\right)^{0.5}=', 'domain'],
    ['asin(2)', '\\arcsin\\left(2\\right)=', 'domain'],
    ['0^-1', '0^{-1}=', 'division-by-zero'],
    ['overflow', '10^{300}\\cdot10^{300}=', 'not-finite'],
    ['tiny denominator', '\\frac{1}{10^{-320}}=', 'not-finite'],
  ])('5.4/5.5 %s gives a controlled error', (_, latex, code) => {
    const e = sheet([
      ['x', 'x\\coloneq3', 1],
      ['r', latex, 2],
    ]);
    expect(e.getResult('r')?.status).toBe('error');
    expect(err(e, 'r')?.code).toBe(code);
  });

  it('5.4 a very small but non-zero denominator is a valid large result', () => {
    const e = sheet([['r', '\\frac{1}{10^{-200}}=', 1]]);
    expect(value(e, 'r')).toBeCloseTo(1e200, -190);
  });

  it('5.6 powers with units', () => {
    const e = sheet([
      ['L', 'L\\coloneq8.5\\,\\mathrm{m}', 1],
      ['A', 'A\\coloneq L^2', 2],
      ['r', 'r\\coloneq\\left(4\\,\\mathrm{m}^2\\right)^{0.5}', 3],
      ['bad', 'b\\coloneq2^{L}', 4],
    ]);
    expect(e.getResult('A')?.value?.dimension).toBe('Area');
    expect(value(e, 'A')).toBeCloseTo(72.25, 12);
    expect(text(e, 'r')).toBe('2 m');
    expect(err(e, 'bad')?.code).toBe('unit-mismatch');
    expect(err(e, 'bad')?.message).toContain('exponent must be a dimensionless number (got Length (m))');
  });

  it('5.7 absolute temperatures (°C) are affine', () => {
    const e = sheet([
      ['T1', 'T_{1}\\coloneq20\\,\\mathrm{degC}', 1],
      ['T2', 'T_{2}\\coloneq35\\,\\mathrm{degC}', 2],
      ['dT', 'T_{d}\\coloneq T_{2}-T_{1}', 3],
      ['T3', 'T_{3}\\coloneq T_{1}+5\\,\\mathrm{K}', 4],
      ['sum', 'T_{1}+T_{2}=', 5],
      ['scale', '2T_{1}=', 6],
      ['frac', '\\frac{T_{1}}{2}=', 7],
      ['strain', '\\varepsilon\\coloneq1.2\\cdot10^{-5}\\cdot\\frac{T_{d}}{\\mathrm{K}}', 8],
      ['neg', 't\\coloneq-5\\,\\mathrm{degC}', 9],
      ['chk', 'T_{1}\\le T_{2}', 10],
    ]);
    expect(text(e, 'T1')).toBe('20 °C');
    expect(text(e, 'dT')).toBe('15 K');
    expect(text(e, 'T3')).toBe('25 °C');
    expect(text(e, 'neg')).toBe('-5 °C');
    expect(err(e, 'sum')?.code).toBe('temperature');
    expect(err(e, 'scale')?.code).toBe('temperature');
    expect(err(e, 'frac')?.code).toBe('temperature');
    expect(value(e, 'strain')).toBeCloseTo(1.8e-4, 15);
    expect(e.getResult('chk')?.check?.pass).toBe(true);
  });

  it('5.8 trigonometry: degrees, radians, and dimensioned arguments rejected', () => {
    const e = sheet([
      ['a', '\\sin\\left(30\\,\\mathrm{deg}\\right)=', 1],
      ['b', '\\sin\\left(\\frac{\\pi}{6}\\right)=', 2],
      ['c', '\\sin\\left(2\\,\\mathrm{m}\\right)=', 3],
      ['d', '\\arcsin\\left(0.5\\right)=', 4],
    ]);
    expect(value(e, 'a')).toBeCloseTo(0.5, 14);
    expect(text(e, 'a')).toBe('0.5');
    expect(value(e, 'b')).toBeCloseTo(0.5, 14);
    expect(err(e, 'c')?.code).toBe('unit-mismatch');
    expect(text(e, 'd')).toBe('30°');
  });
});

describe('6. error handling', () => {
  it('engineer-readable messages', () => {
    const e = sheet([
      ['a', '2\\,\\mathrm{kN}+3\\,\\mathrm{m}=', 1],
      ['b', 'L=', 2],
      ['c', '\\frac{2}{=', 3],
      ['d', 'x\\coloneq1', 4],
      ['f', 'x=', 5],
    ]);
    expect(err(e, 'a')?.message).toBe('Unit mismatch: Length (m) cannot be added to Force (kN).');
    expect(err(e, 'b')?.message).toBe('Variable "L" has not been defined above this equation.');
    expect(e.getResult('c')?.status).toBe('error');
    e.setRegion('f', { latex: 'x=', order: 5, displayUnit: 'kN·m' });
    expect(err(e, 'f')?.code).toBe('display-unit');
    e.setRegion('f', { latex: 'x=', order: 5, displayUnit: 'furlong' });
    expect(err(e, 'f')?.message).toContain('Unknown unit "furlong"');
  });

  it('a dependency error names the variable', () => {
    const e = sheet([
      ['a', 'a\\coloneq\\frac{1}{0}', 1],
      ['b', 'b\\coloneq a+1', 2],
    ]);
    expect(err(e, 'b')?.code).toBe('dependency-error');
    expect(err(e, 'b')?.message).toContain('"a" cannot be evaluated');
  });

  it('an absurd precision does not break formatting', () => {
    const e = new CalculationEngine();
    e.setRegion('a', { latex: 'a\\coloneq1.23456789', precision: 500, order: 1 });
    expect(e.getResult('a')?.status).toBe('valid');
  });
});

describe('11. engineering reference values', () => {
  const beam = (): CalculationEngine =>
    sheet([
      ['L', 'L\\coloneq8.5\\,\\mathrm{m}', 1],
      ['w', 'w\\coloneq25\\,\\frac{\\mathrm{kN}}{\\mathrm{m}}', 2],
      ['M', 'M\\coloneq\\frac{w\\cdot L^2}{8}', 3],
      ['V', 'V\\coloneq\\frac{w\\cdot L}{2}', 4],
    ]);

  it('beam bending: M = 225.78125 kN·m', () => {
    expect(value(beam(), 'M')).toBe(225.78125);
    expect(beam().getResult('M')?.value?.unitText).toBe('kN·m');
  });

  it('beam shear: V = 106.25 kN', () => {
    expect(value(beam(), 'V')).toBe(106.25);
    expect(text(beam(), 'V')).toBe('106.25 kN');
  });

  it('unit conversion: 8500 mm = 8.5 m', () => {
    const e = sheet([['L', 'L\\coloneq8500\\,\\mathrm{mm}', 1], ['r', 'L=', 2]]);
    expect(value(e, 'r')).toBe(8.5);
    expect(text(e, 'r')).toBe('8.5 m');
  });

  it('deflection: δ = 5wL⁴/(384EI) is a Length, checked independently', () => {
    const e = sheet([
      ['E', 'E\\coloneq200\\,\\mathrm{GPa}', 1],
      ['I', 'I\\coloneq450000000\\,\\mathrm{mm}^4', 2],
      ['w', 'w\\coloneq25\\,\\frac{\\mathrm{kN}}{\\mathrm{m}}', 3],
      ['L', 'L\\coloneq8500\\,\\mathrm{mm}', 4],
      ['d', '\\delta\\coloneq\\frac{5\\cdot w\\cdot L^4}{384\\cdot E\\cdot I}', 5],
    ]);
    // Independent SI computation: w = 25000 N/m, L = 8.5 m, E = 2e11 Pa, I = 4.5e-4 m⁴.
    const expected = (5 * 25000 * 8.5 ** 4) / (384 * 2e11 * 4.5e-4); // = 0.0188804… m
    expect(e.getResult('d')?.value?.dimension).toBe('Length');
    expect(value(e, 'd')).toBeCloseTo(expected, 12);
    expect(value(e, 'd')).toBeCloseTo(0.01888043, 8);
    expect(text(e, 'd')).toBe('0.0189 m');
  });

  it('design utilisation: η = 0.9 and η ≤ 1 PASSES', () => {
    const e = sheet([
      ['a', 'M_{Ed}\\coloneq225\\,\\mathrm{kN}\\cdot\\mathrm{m}', 1],
      ['b', 'M_{Rd}\\coloneq250\\,\\mathrm{kN}\\cdot\\mathrm{m}', 2],
      ['c', '\\eta\\coloneq\\frac{M_{Ed}}{M_{Rd}}', 3],
      ['d', '\\eta\\le1', 4],
    ]);
    expect(value(e, 'c')).toBe(0.9);
    expect(e.getResult('d')?.check?.pass).toBe(true);
  });
});
