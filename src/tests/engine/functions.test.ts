import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { CalculationEngine, parseLatex } from '../../engine';

function setup(regions: Record<string, string>, extra: Record<string, { displayUnit?: string; precision?: number }> = {}) {
  const engine = new CalculationEngine();
  engine.batch(() => {
    for (const [id, latex] of Object.entries(regions)) engine.setRegion(id, { latex, ...extra[id] });
  });
  return engine;
}
const res = (e: CalculationEngine, id: string) => e.getResult(id)!;
const num = (e: CalculationEngine, id: string) => res(e, id).value?.number;
const items = (e: CalculationEngine, id: string) => res(e, id).value?.items;

describe('user functions', () => {
  it('user functions', () => {
    step('parses f(x, y) := body as a function definition', () => {
      expect(parseLatex('f\\left(x,y\\right)\\coloneq x+y')).toMatchObject({ kind: 'definition', name: 'f', params: ['x', 'y'] });
      expect(parseLatex('N_{R}\\left(c\\right)\\coloneq2c')).toMatchObject({ kind: 'definition', name: 'N_R', params: ['c'] });
      expect(() => parseLatex('f\\left(2\\right)\\coloneq1')).toThrow(/parameters/);
      expect(() => parseLatex('f\\left(x\\right)\\coloneq x=')).toThrow(/function definition/);
    });
    step('calls a function; parameters shadow worksheet names; free names come from above', () => {
      const e = setup({ a: 'a\\coloneq10', x: 'x\\coloneq100', f: 'f\\left(x\\right)\\coloneq a\\cdot x+1', r: 'f\\left(2\\right)=' });
      expect(res(e, 'f').status).toBe('valid');
      expect(num(e, 'r')).toBe(21);
      expect(res(e, 'r').references).toContain('f');
      expect(res(e, 'f').references).toEqual(['a']);
    });
    step('recalculates callers when a free variable of the function changes', () => {
      const e = setup({ a: 'a\\coloneq10', f: 'f\\left(x\\right)\\coloneq a x', r: 'f\\left(3\\right)=' });
      expect(num(e, 'r')).toBe(30);
      e.setRegion('a', { latex: 'a\\coloneq2' });
      expect(num(e, 'r')).toBe(6);
    });
    step('cached calls (scalar arguments) never outlive a change upstream, also through nested functions', () => {
      const e = setup({ a: 'a\\coloneq10', g: 'g\\left(x\\right)\\coloneq a x', f: 'f\\left(x\\right)\\coloneq2g\\left(x\\right)', r: 'f\\left(3\\right)+f\\left(3\\right)=', s: 's\\coloneq f\\left(3\\,\\mathrm{m}\\right)', t: 't\\coloneq f\\left(3000\\,\\mathrm{mm}\\right)' });
      expect(num(e, 'r')).toBe(120);
      expect(res(e, 's').value?.text).toBe(res(e, 't').value?.text);
      e.setRegion('a', { latex: 'a\\coloneq2' });
      expect(num(e, 'r')).toBe(24);
      e.setRegion('g', { latex: 'g\\left(x\\right)\\coloneq a+x' });
      expect(num(e, 'r')).toBe(20);
    });
    step('several parameters, units, nested calls', () => {
      const e = setup({
        g: 'g_{1}\\left(u\\right)\\coloneq u^2',
        h: 'h\\left(b,t\\right)\\coloneq g_{1}\\left(b\\right)t',
        r: 'h\\left(2\\,\\mathrm{m},3\\,\\mathrm{m}\\right)=',
      }, { r: { displayUnit: 'm^3' } });
      expect(num(e, 'r')).toBe(12);
    });
    step('a vector argument broadcasts through the body', () => {
      const e = setup({ f: 'f\\left(x\\right)\\coloneq2x+1', v: 'v\\coloneq\\mathrm{seq}\\left(0,3\\right)', r: 'f\\left(v\\right)=' });
      expect(items(e, 'r')).toEqual([1, 3, 5, 7]);
    });
    step('a name that is not a function keeps the product reading', () => {
      const e = setup({ x: 'x\\coloneq3', r: 'x\\left(1+1\\right)=', s: '2x\\left(4\\right)=' });
      expect(num(e, 'r')).toBe(6);
      expect(num(e, 's')).toBe(24);
      expect(res(e, 's').expressionLatex).toBe('2x\\left(4\\right)');
    });
    step('x(a)^2 is still x·a²', () => {
      const e = setup({ x: 'x\\coloneq3', r: 'x\\left(2\\right)^2=' });
      expect(num(e, 'r')).toBe(12);
    });
    step('using a function without arguments, or with the wrong count, is an error', () => {
      const e = setup({ f: 'f\\left(x\\right)\\coloneq x', r: 'f+1=', s: 'f\\left(1,2\\right)=' });
      expect(res(e, 'r').error?.message).toMatch(/is a function/);
      expect(res(e, 's').error?.message).toMatch(/takes 1 argument/);
    });
    step('runaway recursion stops with an error', () => {
      const e = setup({ f: 'f\\left(x\\right)\\coloneq f\\left(x\\right)+1', r: 'f\\left(1\\right)=' });
      // f is used in its own body before it is defined: not resolvable.
      expect(res(e, 'r').status).toBe('error');
    });
  });
});

describe('map, linterp, stack', () => {
  it('map, linterp, stack', () => {
    step('map calls the function once per entry (sum inside stays per call)', () => {
      const e = setup({
        j: 'j\\coloneq\\mathrm{seq}\\left(1,3\\right)',
        f: 'f\\left(c\\right)\\coloneq\\mathrm{sum}\\left(c\\cdot j\\right)',
        v: 'v\\coloneq\\mathrm{seq}\\left(1,2\\right)',
        r: '\\mathrm{map}\\left(f,v\\right)=',
      });
      expect(items(e, 'r')).toEqual([6, 12]);
    });
    step('map with a scalar and a vector argument', () => {
      const e = setup({ f: 'f\\left(a,b\\right)\\coloneq a-b', r: '\\mathrm{map}\\left(f,10,\\mathrm{seq}\\left(1,3\\right)\\right)=' });
      expect(items(e, 'r')).toEqual([9, 8, 7]);
    });
    step('map rejects a non-function', () => {
      const e = setup({ a: 'a\\coloneq1', r: '\\mathrm{map}\\left(a,2\\right)=' });
      expect(res(e, 'r').error?.message).toMatch(/user function/);
    });
    step('linterp interpolates on ascending or descending data, with units', () => {
      const e = setup({
        x: 'x_{d}\\coloneq\\mathrm{stack}\\left(0,10,20\\right)\\mathrm{kN}',
        y: 'y_{d}\\coloneq\\mathrm{stack}\\left(0,100,0\\right)\\mathrm{kN}\\cdot\\mathrm{m}',
        r: '\\mathrm{linterp}\\left(x_{d},y_{d},15\\,\\mathrm{kN}\\right)=',
        xr: 'x_{r}\\coloneq\\mathrm{stack}\\left(20,10,0\\right)',
        yr: 'y_{r}\\coloneq\\mathrm{stack}\\left(2,1,0\\right)',
        s: '\\mathrm{linterp}\\left(x_{r},y_{r},5\\right)=',
        out: '\\mathrm{linterp}\\left(x_{r},y_{r},25\\right)=',
      }, { r: { displayUnit: 'kN m' } });
      expect(num(e, 'r')).toBeCloseTo(50, 10);
      expect(num(e, 's')).toBeCloseTo(0.5, 12);
      // Outside the data: the line through the last two points is extended (as Mathcad): 25 → 2.5.
      expect(num(e, 'out')).toBeCloseTo(2.5, 12);
    });
    step('linterp on x data that turns back uses the first segment containing x', () => {
      const e = setup({
        x: 'x_{w}\\coloneq\\mathrm{stack}\\left(0,10,9,20\\right)',
        y: 'y_{w}\\coloneq\\mathrm{stack}\\left(0,100,90,200\\right)',
        a: '\\mathrm{linterp}\\left(x_{w},y_{w},5\\right)=',
        b: '\\mathrm{linterp}\\left(x_{w},y_{w},15\\right)=',
        c: '\\mathrm{linterp}\\left(x_{w},y_{w},30\\right)=',
      });
      expect(num(e, 'a')).toBeCloseTo(50, 12);
      expect(num(e, 'b')).toBeCloseTo(150, 12);
      expect(res(e, 'c').error?.message).toMatch(/not in increasing or decreasing order/);
    });
    step('stack joins scalars and vectors', () => {
      const e = setup({ r: '\\mathrm{stack}\\left(\\mathrm{seq}\\left(1,2\\right),5,\\mathrm{seq}\\left(7,8\\right)\\right)=' });
      expect(items(e, 'r')).toEqual([1, 2, 5, 7, 8]);
    });
    step('angle(x, y) gives the full-circle direction and needs matching units', () => {
      const e = setup({
        a: '\\mathrm{angle}\\left(-3\\,\\mathrm{kN},-2\\,\\mathrm{kN}\\right)=',
        b: '\\mathrm{angle}\\left(0,1\\right)=',
        c: '\\mathrm{angle}\\left(1\\,\\mathrm{m},1\\right)=',
      }, { a: { displayUnit: 'deg' }, b: { displayUnit: 'deg' } });
      expect(num(e, 'a')).toBeCloseTo(213.69, 2);
      expect(num(e, 'b')).toBeCloseTo(90, 10);
      expect(res(e, 'c').error?.message).toMatch(/same unit/);
    });
    step('a check names a computed limit; a typed limit stays a number', () => {
      const e = setup({ a: 'N_{Rd}\\coloneq20\\,\\mathrm{kN}', b: 'N_{Ed}\\coloneq8\\,\\mathrm{kN}', c: 'N_{Ed}\\le N_{Rd}', d: 'N_{Ed}\\le10\\,\\mathrm{kN}' });
      expect(res(e, 'c').check?.rightLatex).toBe('N_{\\mathrm{Rd}}');
      expect(res(e, 'd').check?.rightLatex).toBeUndefined();
    });
    step('floor and ceil round plain numbers (round-off tolerant) and reject units', () => {
      const e = setup({
        a: '\\mathrm{floor}\\left(2.7\\right)=',
        b: '\\mathrm{ceil}\\left(2.1\\right)=',
        c: '\\mathrm{ceil}\\left(0.1\\cdot30\\right)=',
        d: '\\mathrm{floor}\\left(\\frac{150\\,\\mathrm{mm}}{100\\,\\mathrm{mm}}\\right)=',
        u: '\\mathrm{floor}\\left(2\\,\\mathrm{m}\\right)=',
      });
      expect(num(e, 'a')).toBe(2);
      expect(num(e, 'b')).toBe(3);
      expect(num(e, 'c')).toBe(3);
      expect(num(e, 'd')).toBe(1);
      expect(res(e, 'u').error?.message).toMatch(/dimensionless/);
    });
  });
});

describe('engine fixes: upright functions, f(x)^n, ΔT names', () => {
  it('engine fixes: upright functions, f(x)^n, ΔT names', () => {
    step('reads built-in functions written upright (\\mathrm{atan}(x), \\operatorname{asin}(x))', () => {
      const e = setup({
        a: '\\mathrm{atan}\\left(1\\right)=',
        b: '\\operatorname{asin}\\left(0.5\\right)=',
        c: '\\mathrm{max}\\left(2,7,3\\right)=',
      });
      // angles are shown in degrees
      expect(num(e, 'a')).toBeCloseTo(45, 10);
      expect(num(e, 'b')).toBeCloseTo(30, 10);
      expect(num(e, 'c')).toBe(7);
    });
    step('f(x)^n is the power of the call; for a plain variable it stays a·(x)^n', () => {
      const e = setup({
        f: 'f\\left(x\\right)\\coloneq2x',
        p: 'f\\left(3\\right)^2=',
        q: 'f\\left(3\\right)^{2}+1=',
        a: 'a\\coloneq2',
        r: 'a\\left(3\\right)^2=',
        u: 'L\\left(x\\right)\\coloneq x\\cdot1\\,\\mathrm{m}',
        v: 'L\\left(3\\right)^2=',
      });
      expect(num(e, 'p')).toBe(36);
      expect(num(e, 'q')).toBe(37);
      expect(num(e, 'r')).toBe(18);
      expect(res(e, 'v').status).toBe('valid');
      expect(num(e, 'v')).toBeCloseTo(9, 12);
    });
    step('Δ or δ followed by letters is one name; Δ alone still works', () => {
      const e = setup({
        t: '\\Delta T\\coloneq5',
        r: '\\Delta T\\cdot2=',
        d: '\\Delta\\coloneq3',
        s: '2\\Delta=',
        x: '\\delta x\\coloneq0.5',
        y: '\\delta x+1=',
      });
      expect(num(e, 'r')).toBe(10);
      expect(num(e, 's')).toBe(6);
      expect(num(e, 'y')).toBe(1.5);
      expect(res(e, 't').status).toBe('valid');
    });
  });
});
