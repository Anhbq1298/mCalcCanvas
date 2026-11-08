import { describe, expect, it } from 'vitest';
import { CalculationEngine, parseLatex } from '../../engine';

function setup(regions: Record<string, string>, extra: Record<string, { displayUnit?: string; precision?: number }> = {}) {
  const engine = new CalculationEngine();
  engine.batch(() => {
    for (const [id, latex] of Object.entries(regions)) engine.setRegion(id, { latex, ...extra[id] });
  });
  return engine;
}
const res = (e: CalculationEngine, id: string) => e.getResult(id)!;
const items = (e: CalculationEngine, id: string) => res(e, id).value?.items;

describe('ranges', () => {
  it('parses a..b and a, a+Δ..b in a definition', () => {
    expect(parseLatex('i\\coloneq0..5')).toMatchObject({ kind: 'definition', expr: { type: 'range', next: null } });
    expect(parseLatex('t\\coloneq0,0.5..2')).toMatchObject({ kind: 'definition', expr: { type: 'range', next: { type: 'num' } } });
    expect(parseLatex('i\\coloneq1\\ldots n')).toMatchObject({ kind: 'definition', expr: { type: 'range' } });
  });

  it('a decimal before .. stays a number', () => {
    const e = setup({ t: 't\\coloneq0.5..2.5' });
    expect(items(e, 't')).toEqual([0.5, 1.5, 2.5]);
  });

  it('counts integers up or down, end included', () => {
    const e = setup({ n: 'n\\coloneq4', i: 'i\\coloneq0..n-1', j: 'j\\coloneq3..1' });
    expect(items(e, 'i')).toEqual([0, 1, 2, 3]);
    expect(items(e, 'j')).toEqual([3, 2, 1]);
    expect(res(e, 'i').value?.length).toBe(4);
  });

  it('uses the step from the second value, tolerant to rounding', () => {
    const e = setup({ t: 't\\coloneq0,0.1..1' });
    expect(items(e, 't')).toHaveLength(11);
    expect(items(e, 't')![10]).toBeCloseTo(1, 12);
  });

  it('supports units when a step is given', () => {
    const e = setup({ x: 'x\\coloneq0\\,\\mathrm{m},0.5\\,\\mathrm{m}..2\\,\\mathrm{m}' }, { x: { displayUnit: 'mm' } });
    expect(items(e, 'x')).toEqual([0, 500, 1000, 1500, 2000]);
    expect(res(e, 'x').value?.unitText).toBe('mm');
  });

  it('gives clear errors', () => {
    expect(res(setup({ x: 'x\\coloneq0\\,\\mathrm{m}..2\\,\\mathrm{m}' }), 'x').error?.message).toMatch(/needs a step/);
    expect(res(setup({ x: 'x\\coloneq0,0..2' }), 'x').error?.code).toBe('domain');
    expect(res(setup({ x: 'x\\coloneq0,-1..2' }), 'x').error?.message).toMatch(/towards the end/);
    expect(res(setup({ x: 'x\\coloneq0..20000' }), 'x').error?.code).toBe('limit-exceeded');
    expect(res(setup({ x: 'x\\coloneq0\\,\\mathrm{m},1\\,\\mathrm{m}..2\\,\\mathrm{s}' }), 'x').error?.code).toBe('unit-mismatch');
    expect(() => parseLatex('x\\coloneq0..')).toThrow(/Incomplete range/);
  });
});

describe('seq()', () => {
  it('builds the same vectors as a range, anywhere in an expression', () => {
    const e = setup({
      n: 'n\\coloneq4',
      a: 'a\\coloneq\\mathrm{seq}\\left(0,n-1\\right)',
      b: 'b\\coloneq\\mathrm{seq}\\left(1,2,0.25\\right)',
      c: 'c\\coloneq2\\cdot\\mathrm{seq}\\left(1,3\\right)+1',
      x: 'x\\coloneq\\mathrm{seq}\\left(0\\,\\mathrm{m},1\\,\\mathrm{m},0.5\\,\\mathrm{m}\\right)',
    }, { x: { displayUnit: 'mm' } });
    expect(items(e, 'a')).toEqual([0, 1, 2, 3]);
    expect(items(e, 'b')).toEqual([1, 1.25, 1.5, 1.75, 2]);
    expect(items(e, 'c')).toEqual([3, 5, 7]);
    expect(items(e, 'x')).toEqual([0, 500, 1000]);
  });

  it('checks its arguments', () => {
    expect(res(setup({ a: 'a\\coloneq\\mathrm{seq}\\left(1\\right)' }), 'a').error?.message).toMatch(/2 or 3 arguments/);
    expect(res(setup({ a: 'a\\coloneq\\mathrm{seq}\\left(0\\,\\mathrm{m},1\\,\\mathrm{m}\\right)' }), 'a').error?.message).toMatch(/needs a step/);
    expect(res(setup({ v: 'v\\coloneq1..3', a: 'a\\coloneq\\mathrm{seq}\\left(v,5\\right)' }), 'a').error?.code).toBe('vector');
  });
});

describe('vector arithmetic', () => {
  it('broadcasts scalars and functions entry by entry (bar coordinates)', () => {
    const e = setup(
      {
        n: 'n\\coloneq4',
        r: 'r\\coloneq500\\,\\mathrm{mm}',
        i: 'i\\coloneq0..n-1',
        x: 'x\\coloneq r\\cdot\\cos\\left(\\frac{2\\pi i}{n}\\right)',
        y: 'y\\coloneq r\\cdot\\sin\\left(\\frac{2\\pi i}{n}\\right)',
      },
      { x: { displayUnit: 'mm' }, y: { displayUnit: 'mm' } },
    );
    const x = items(e, 'x')!;
    const y = items(e, 'y')!;
    expect(x.map((v) => Math.round(v) || 0)).toEqual([500, 0, -500, 0]);
    expect(y.map((v) => Math.round(v) || 0)).toEqual([0, 500, 0, -500]);
  });

  it('combines vectors of equal length and rejects different lengths', () => {
    const e = setup({ a: 'a\\coloneq1..3', b: 'b\\coloneq4..6', c: 'c\\coloneq a+b', d: 'd\\coloneq1..2', f: 'f\\coloneq a\\cdot d' });
    expect(items(e, 'c')).toEqual([5, 7, 9]);
    expect(res(e, 'f').error?.code).toBe('vector');
  });

  it('powers, negation and letter runs broadcast', () => {
    const e = setup({ a: 'a\\coloneq1..3', p: 'p\\coloneq-a^2', k: 'k\\coloneq2', q: 'q\\coloneq ka' });
    expect(items(e, 'p')).toEqual([-1, -4, -9]);
    expect(items(e, 'q')).toEqual([2, 4, 6]);
  });

  it('aggregates: min, max, sum, len', () => {
    const e = setup({
      a: 'a\\coloneq0,2..8',
      mn: 'm_{1}\\coloneq\\min\\left(a\\right)',
      mx: 'm_{2}\\coloneq\\max\\left(a,9\\right)',
      s: 's\\coloneq\\mathrm{sum}\\left(a\\right)',
      l: 'l\\coloneq\\mathrm{len}\\left(a\\right)',
    });
    expect(res(e, 'mn').value?.number).toBe(0);
    expect(res(e, 'mx').value?.number).toBe(9);
    expect(res(e, 's').value?.number).toBe(20);
    expect(res(e, 'l').value?.number).toBe(5);
  });

  it('sum keeps units', () => {
    const e = setup({ f: 'F\\coloneq1\\,\\mathrm{kN},2\\,\\mathrm{kN}..3\\,\\mathrm{kN}', s: 'S\\coloneq\\mathrm{sum}\\left(F\\right)' }, { s: { displayUnit: 'kN' } });
    expect(res(e, 's').value?.text).toBe('6 kN');
  });

  it('shows the first 5 and last 5 entries (pandas style) with the length', () => {
    const e = setup({ a: 'a\\coloneq0..21' });
    expect(res(e, 'a').value?.text).toBe('[0, 1, 2, 3, 4, …, 17, 18, 19, 20, 21] (22)');
    expect(res(e, 'a').value?.latex).toContain('\\class{vec-more}{\\ldots}');
    expect(res(e, 'a').value?.truncated).toBe(true);
    // Exactly 10 entries: all shown.
    const ten = setup({ a: 'a\\coloneq1..10' });
    expect(res(ten, 'a').value?.truncated).toBe(false);
    const short = setup({ a: 'a\\coloneq1..3' });
    expect(res(short, 'a').value?.text).toBe('[1, 2, 3]');
  });

  it('the limit is a setting; an expanded region shows every entry', () => {
    const e = setup({ a: 'a\\coloneq1..30' });
    e.setSettings({ vectorLimit: 6 });
    expect(res(e, 'a').value?.text).toBe('[1, 2, 3, …, 28, 29, 30] (30)');
    e.setSettings({ vectorLimit: 0 });
    expect(res(e, 'a').value?.truncated).toBe(false);
    e.setSettings({ vectorLimit: 10 });
    e.setRegion('a', { latex: 'a\\coloneq1..30', vectorExpanded: true });
    expect(res(e, 'a').value?.items).toHaveLength(30);
    expect(res(e, 'a').value?.truncated).toBe(false);
    expect(res(e, 'a').value?.text).not.toContain('…');
    e.setRegion('a', { latex: 'a\\coloneq1..30' });
    expect(res(e, 'a').value?.truncated).toBe(true);
  });

  it('column layout: first 5, ⋮, last 5', () => {
    const e = setup({ a: 'a\\coloneq1..4', b: 'b\\coloneq1..70' });
    e.setRegion('a', { latex: 'a\\coloneq1..4', vectorLayout: 'column' });
    e.setRegion('b', { latex: 'b\\coloneq1..70', vectorLayout: 'column' });
    expect(res(e, 'a').value?.latex).toBe('\\begin{bmatrix}1\\\\2\\\\3\\\\4\\end{bmatrix}');
    const b = res(e, 'b').value!.latex;
    expect(b.split('\\\\')).toHaveLength(11); // 5 + ⋮ + 5
    expect(b).toContain('\\vdots');
    // Switching back is a display-only change.
    e.setRegion('a', { latex: 'a\\coloneq1..4' });
    expect(res(e, 'a').value?.latex).toContain('\\left[');
  });

  it('round-off next to large entries shows as 0', () => {
    const e = setup({ n: 'n\\coloneq4', i: 'i\\coloneq0..n-1', x: 'x\\coloneq500\\cos\\left(\\frac{2\\pi i}{n}\\right)' });
    e.setRegion('x', { latex: 'x\\coloneq500\\cos\\left(\\frac{2\\pi i}{n}\\right)', precision: 0, vectorLayout: 'column' });
    expect(res(e, 'x').value?.latex).toBe('\\begin{bmatrix}500\\\\0\\\\-500\\\\0\\end{bmatrix}');
  });

  it('column layout keeps one unit after the matrix', () => {
    const e = new CalculationEngine();
    e.setRegion('x', { latex: 'x\\coloneq0\\,\\mathrm{m},0.5\\,\\mathrm{m}..1\\,\\mathrm{m}', displayUnit: 'mm', vectorLayout: 'column' });
    expect(res(e, 'x').value?.latex).toMatch(/^\\begin\{bmatrix\}0\\\\500\\\\1000\\end\{bmatrix\}\\,/);
  });

  it('checks and if-conditions require a single value', () => {
    const e = setup({ a: 'a\\coloneq1..3', c: 'a\\le5', f: 'f\\coloneq\\mathrm{if}\\left(a>1,1,0\\right)' });
    expect(res(e, 'c').error?.code).toBe('vector');
    expect(res(e, 'f').error?.code).toBe('vector');
  });

  it('if may return a vector, and a vector shows by name in the substituted line', () => {
    const e = setup({ a: 'a\\coloneq1..3', k: 'k\\coloneq2', f: 'f\\coloneq\\mathrm{if}\\left(k>1,2a,a\\right)' });
    expect(items(e, 'f')).toEqual([2, 4, 6]);
    expect(res(e, 'f').substitutionLatex).toContain('a');
  });

  it('recalculates dependants when the range changes', () => {
    const e = setup({ n: 'n\\coloneq3', i: 'i\\coloneq1..n', s: 's\\coloneq\\mathrm{sum}\\left(i\\right)' });
    expect(res(e, 's').value?.number).toBe(6);
    e.setRegion('n', { latex: 'n\\coloneq4' });
    expect(res(e, 's').value?.number).toBe(10);
  });
});

describe('let()', () => {
  it('binds local names (Excel LET) without creating worksheet variables', () => {
    const e = setup({
      n: 'n\\coloneq4',
      r: 'r\\coloneq500\\,\\mathrm{mm}',
      x: 'x\\coloneq\\mathrm{let}\\left(i,\\mathrm{seq}\\left(0,n-1\\right),r\\cos\\left(\\frac{2\\pi i}{n}\\right)\\right)',
      q: 'q\\coloneq i',
    }, { x: { displayUnit: 'mm' } });
    expect(items(e, 'x')!.map((v) => Math.round(v) || 0)).toEqual([500, 0, -500, 0]);
    expect(res(e, 'x').references.sort()).toEqual(['n', 'r']);
    expect(res(e, 'q').error?.message).toMatch(/not been defined/);
  });

  it('later bindings see earlier ones; locals shadow worksheet variables', () => {
    const e = setup({
      a: 'a\\coloneq100',
      y: 'y\\coloneq\\mathrm{let}\\left(a,2,b,a+1,a\\cdot b\\right)',
      z: 'z\\coloneq a+\\mathrm{let}\\left(a,1,a\\right)',
    });
    expect(res(e, 'y').value?.number).toBe(6);
    expect(res(e, 'z').value?.number).toBe(101);
  });

  it('shows locals by name in the substituted line', () => {
    const e = new CalculationEngine();
    e.batch(() => {
      e.setRegion('a', { latex: 'a\\coloneq100' });
      e.setRegion('z', { latex: 'z\\coloneq a+\\mathrm{let}\\left(a,1,2a\\right)' });
    });
    const sub = res(e, 'z').substitutionLatex ?? '';
    expect(sub).toContain('100');
    expect(sub).toMatch(/\\mathrm\{let\}\\left\(a,1,2/);
  });

  it('gives clear errors', () => {
    expect(() => parseLatex('x\\coloneq\\mathrm{let}\\left(i,1\\right)')).toThrow(/name, value pairs/);
    expect(() => parseLatex('x\\coloneq\\mathrm{let}\\left(2,1,3\\right)')).toThrow(/single variable name/);
  });
});
