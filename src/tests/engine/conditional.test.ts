import { describe, expect, it } from 'vitest';
import { CalculationEngine, parseLatex } from '../../engine';

function setup(regions: Record<string, string>) {
  const engine = new CalculationEngine();
  engine.batch(() => {
    for (const [id, latex] of Object.entries(regions)) engine.setRegion(id, { latex });
  });
  return engine;
}

const num = (engine: CalculationEngine, id: string) => engine.getResult(id)?.value?.number;
const err = (engine: CalculationEngine, id: string) => engine.getResult(id)?.error;
const res = (engine: CalculationEngine, id: string) => engine.getResult(id)!;

/** cotθ for a pile: 1.0 in axial tension, the optimised value otherwise. */
const pile = (n: string) =>
  setup({
    n: `N_{Ed}\\coloneq${n}\\,\\mathrm{kN}`,
    o: '\\mathrm{cot}_{\\theta.opt}\\coloneq2.5',
    c: '\\mathrm{cot}_{\\theta}\\coloneq\\mathrm{if}\\left(N_{Ed}>0\\,\\mathrm{kN},1,\\mathrm{cot}_{\\theta.opt}\\right)',
  });

describe('if(condition, value if true, value if false)', () => {
  it('parses letters, \\mathrm{if} and \\operatorname{if}', () => {
    for (const latex of ['x\\coloneq if(a>1,2,3)', 'x\\coloneq\\mathrm{if}\\left(a>1,2,3\\right)', 'x\\coloneq\\operatorname{if}(a\\le1,2,3)']) {
      const st = parseLatex(latex);
      expect(st).toMatchObject({ kind: 'definition', expr: { type: 'if', cond: { left: { type: 'ident', name: 'a' } } } });
    }
  });

  it('chooses the branch from the condition, with units', () => {
    expect(num(pile('2000'), 'c')).toBe(1);
    expect(num(pile('-2000'), 'c')).toBe(2.5);
    expect(num(pile('0'), 'c')).toBe(2.5);
  });

  it('recalculates when an input changes', () => {
    const e = pile('2000');
    e.setRegion('n', { latex: 'N_{Ed}\\coloneq-500\\,\\mathrm{kN}' });
    expect(num(e, 'c')).toBe(2.5);
  });

  it('supports nesting in either branch', () => {
    const e = setup({
      x: 'x\\coloneq5',
      y: 'y\\coloneq\\mathrm{if}\\left(x<0,-1,\\mathrm{if}\\left(x=0,0,1\\right)\\right)',
      z: 'z\\coloneq\\mathrm{if}\\left(x\\ge10,\\mathrm{if}\\left(x\\ge20,3,2\\right),1\\right)',
    });
    expect(num(e, 'y')).toBe(1);
    expect(num(e, 'z')).toBe(1);
  });

  it('evaluates only the chosen branch', () => {
    const e = setup({ a: 'a\\coloneq3', r: 'r\\coloneq\\mathrm{if}\\left(a^2-4\\ge0,\\sqrt{a^2-4},0\\right)', b: 'b\\coloneq1', s: 's\\coloneq\\mathrm{if}\\left(b^2-4\\ge0,\\sqrt{b^2-4},0\\right)' });
    expect(num(e, 'r')).toBeCloseTo(Math.sqrt(5), 12);
    expect(num(e, 's')).toBe(0);
  });

  it('branches may have different units', () => {
    const e = setup({ k: 'k\\coloneq1', v: 'v\\coloneq\\mathrm{if}\\left(k=1,2\\,\\mathrm{kN},3\\,\\mathrm{m}\\right)' });
    expect(e.getResult('v')?.value?.text).toBe('2 kN');
  });

  it('compares strictly like a check region (no tolerance on ≤)', () => {
    const e = setup({ a: 'a\\coloneq1.0000000001', r: 'r\\coloneq\\mathrm{if}\\left(a\\le1,1,0\\right)' });
    expect(num(e, 'r')).toBe(0);
  });

  it('reports a dependency on names used in the condition and both branches', () => {
    const e = setup({ a: 'a\\coloneq1', b: 'b\\coloneq2', c: 'c\\coloneq3', r: 'r\\coloneq\\mathrm{if}\\left(a>0,b,c\\right)' });
    expect(new Set(e.getResult('r')?.references)).toEqual(new Set(['a', 'b', 'c']));
    e.setRegion('b', { latex: 'b\\coloneq7' });
    expect(num(e, 'r')).toBe(7);
  });

  it('prints an if back as a Mathcad-style block (value if condition / otherwise) that parses again', () => {
    const e = pile('2000');
    const latex = e.getResult('c')?.expressionLatex ?? '';
    expect(latex).toMatch(/^\\begin\{array\}\{\|ll\}.*& \\mathrm\{if\}\\ .*>.*\\\\.*& \\mathrm\{otherwise\}\\end\{array\}$/);
    const f = setup({ a: 'a\\coloneq2', g: 'g\\left(x\\right)\\coloneq\\mathrm{if}\\left(x>a,x^2,\\mathrm{if}\\left(x=a,0,-1\\right)\\right)' });
    const printed = f.getResult('g')?.expressionLatex ?? '';
    expect(printed.match(/\\mathrm\{if\}/g)).toHaveLength(2);
    expect(parseLatex(`y\\coloneq${printed.replace(/x/g, '3')}`)).toMatchObject({ kind: 'definition', expr: { type: 'if' } });
  });

  it('if blocks: rows tried top to bottom, last row "otherwise"; \\begin{cases} and \\text{if} work too', () => {
    const block = (x: string) =>
      `y\\coloneq\\begin{array}{|ll}-1 & \\mathrm{if}\\ ${x}<0\\\\0 & \\mathrm{if}\\ ${x}=0\\\\\\displaystyle\\frac{1}{2} & \\mathrm{otherwise}\\end{array}`;
    for (const [x, want] of [['-3', -1], ['0', 0], ['4', 0.5]] as const) {
      const e = setup({ y: block(x) });
      expect(res(e, 'y').value?.number).toBe(want);
    }
    const e = setup({ a: 'a\\coloneq2', z: 'z\\coloneq\\begin{cases}a^2 & \\text{if } a>1\\\\0 & \\text{otherwise}\\end{cases}' });
    expect(res(e, 'z').value?.number).toBe(4);
    expect(() => parseLatex('y\\coloneq\\begin{array}{|ll}1 & \\mathrm{if}\\ a>0\\\\2 & \\mathrm{if}\\ a<0\\end{array}')).toThrow(/last row/);
    expect(() => parseLatex('y\\coloneq\\begin{array}{|ll}1 & \\mathrm{otherwise}\\\\2 & \\mathrm{if}\\ a<0\\end{array}')).toThrow(/otherwise/);
    expect(() => parseLatex('y\\coloneq\\begin{matrix}1\\end{matrix}')).toThrow(/environment/);
  });

  it('a vector condition is decided entry by entry (EC2 parabola-rectangle as an if block)', () => {
    const e = setup({
      u: 'u\\coloneq\\mathrm{stack}\\left(-0.001,0.001,0.002,0.003\\right)',
      s: 's\\coloneq\\begin{array}{|ll}0\\,\\mathrm{MPa} & \\mathrm{if}\\ u\\le0\\\\20\\,\\mathrm{MPa}\\left(1-\\left(1-\\frac{u}{0.002}\\right)^2\\right) & \\mathrm{if}\\ u<0.002\\\\20\\,\\mathrm{MPa} & \\mathrm{otherwise}\\end{array}',
      k: 'k\\coloneq\\mathrm{if}\\left(u>0,1,0\\right)+\\mathrm{stack}\\left(1,2\\right)',
    });
    const v = res(e, 's').value!.items!;
    expect([v[0], v[1] / v[3], v[2] / v[3]]).toEqual([0, 0.75, 1]);
    expect(res(e, 'k').error?.message).toMatch(/different lengths/);
  });

  it('gives clear errors', () => {
    expect(() => parseLatex('x\\coloneq\\mathrm{if}\\left(a>1,2\\right)')).toThrow(/three arguments/);
    expect(() => parseLatex('x\\coloneq\\mathrm{if}\\left(a,2,3\\right)')).toThrow(/must be a comparison/);
    expect(() => parseLatex('x\\coloneq\\mathrm{if}\\left(a>,2,3\\right)')).toThrow(/Incomplete condition/);
    const e = setup({ n: 'N\\coloneq5\\,\\mathrm{kN}', r: 'r\\coloneq\\mathrm{if}\\left(N>0\\,\\mathrm{m},1,2\\right)' });
    expect(err(e, 'r')?.code).toBe('unit-mismatch');
  });

  it('treats "if" without parentheses as an ordinary letter run', () => {
    expect(parseLatex('x\\coloneq if')).toMatchObject({ kind: 'definition', expr: { type: 'ident', name: 'if', splittable: true } });
  });
});
