import { describe, expect, it } from 'vitest';
import { CalculationEngine, parseLatex } from '../../engine';
import { step } from '../step';

const mat = (rows: string[][]) => `\\begin{bmatrix}${rows.map((r) => r.join('&')).join('\\\\')}\\end{bmatrix}`;
const call = (fn: string, ...args: string[]) => `\\operatorname{${fn}}(${args.join(',')})`;
function setup(expressions: Record<string, string>) {
  const e = new CalculationEngine();
  e.batch(() => Object.entries(expressions).forEach(([id, latex]) => e.setRegion(id, { latex })));
  return e;
}
const result = (e: CalculationEngine, id: string) => {
  const r = e.getResult(id)!;
  expect(r.error, `${id}: ${r.error?.message}`).toBeUndefined();
  return r.value!;
};
const a = mat([['4', '1'], ['2', '3']]);

describe('matrix calculation and worksheet propagation', () => {
  it('evaluates the complete matrix operator path', () => {
    step('literal parsing, shape, transpose, determinants and matrix powers', () => {
      const e = setup({ a: `A\\coloneq${a}`, t: 'A^{T}=', d: '\\det(A)=', abs: '|A|=', p: 'A^2=', inv: 'A^{-1}=', i: 'A^0=', product: 'A\\cdot A^{-1}=' });
      expect(result(e, 'a')).toMatchObject({ rows: 2, cols: 2, items: [4, 1, 2, 3] });
      expect(result(e, 't').items).toEqual([4, 2, 1, 3]);
      expect(result(e, 'd').number).toBeCloseTo(10);
      expect(result(e, 'abs').number).toBeCloseTo(10);
      expect(result(e, 'p').items).toEqual([18, 7, 14, 11]);
      result(e, 'inv').items!.forEach((v, i) => expect(v).toBeCloseTo([0.3, -0.1, -0.2, 0.4][i]));
      for (const id of ['i', 'product']) result(e, id).items!.forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0, 1][i]));
      expect(result(e, 'a').latex).toBe(a);
      expect(parseLatex(a.replaceAll('bmatrix', 'pmatrix'))).toMatchObject({ expr: { type: 'matrix' } });
      expect(result(setup({ x: a.replaceAll('bmatrix', 'vmatrix') + '=' }), 'x').number).toBeCloseTo(10);
    });
    step('constructors, indices, rows, columns, diagonal, slicing and joins', () => {
      const e = setup({ a: `A\\coloneq${a}`, v: 'v\\coloneq1..4', m: call('matrix', '2', '2', 'v')+'=', z: call('zeros', '2', '3')+'=', o: call('ones', '1', '2')+'=', i: call('identity', '2')+'=', at: call('at', 'A', '1', '0')+'=', va: call('at', 'v', '0')+'=', r: call('row', 'A', '1')+'=', c: call('col', 'A', '0')+'=', diag: call('diag', 'A')+'=', dv: call('diag', call('seq', '1', '2'))+'=', sub: call('submatrix', 'A', '0', '1', '1', '1')+'=', aug: call('augment', 'A', 'A')+'=', stack: call('stack', 'A', 'A')+'=', rows: call('rows', 'A')+'=', cols: call('cols', 'A')+'=' });
      expect(result(e, 'm').items).toEqual([1, 2, 3, 4]);
      expect(result(e, 'z')).toMatchObject({ rows: 2, cols: 3, items: [0, 0, 0, 0, 0, 0] });
      expect(result(e, 'o').items).toEqual([1, 1]);
      expect(result(e, 'i').items).toEqual([1, 0, 0, 1]);
      expect(result(e, 'at').number).toBe(2);
      expect(result(e, 'va').number).toBe(1);
      expect(result(e, 'r').items).toEqual([2, 3]);
      expect(result(e, 'c').items).toEqual([4, 2]);
      expect(result(e, 'diag').items).toEqual([4, 3]);
      expect(result(e, 'dv').items).toEqual([1, 0, 0, 2]);
      expect(result(e, 'sub')).toMatchObject({ rows: 2, cols: 1, items: [1, 3] });
      expect(result(e, 'aug')).toMatchObject({ rows: 2, cols: 4, items: [4, 1, 4, 1, 2, 3, 2, 3] });
      expect(result(e, 'stack')).toMatchObject({ rows: 4, cols: 2, items: [4, 1, 2, 3, 4, 1, 2, 3] });
      expect(result(e, 'rows').number).toBe(2);
      expect(result(e, 'cols').number).toBe(2);
    });
    step('element-wise arithmetic retains shape; vectorized product differs from matrix product', () => {
      const e = setup({ a: `A\\coloneq${a}`, add: 'A+A=', neg: '-A=', scale: '2A=', div: 'A/2=', v: '\\overrightarrow{A\\cdot A}=', vec: '\\operatorname{vec}(A^2)=', h: call('hadamard', 'A', 'A')+'=', ed: call('divideElements', 'A', 'A')+'=', ep: call('powerElements', 'A', '2')+'=' });
      expect(result(e, 'add')).toMatchObject({ rows: 2, cols: 2, items: [8, 2, 4, 6] });
      expect(result(e, 'neg').items).toEqual([-4, -1, -2, -3]);
      expect(result(e, 'scale').items).toEqual([8, 2, 4, 6]);
      expect(result(e, 'div').items).toEqual([2, 0.5, 1, 1.5]);
      for (const id of ['v', 'vec', 'h', 'ep']) expect(result(e, id)).toMatchObject({ rows: 2, cols: 2, items: [16, 1, 4, 9] });
      expect(result(e, 'ed').items).toEqual([1, 1, 1, 1]);
    });
    step('linear solve, trace, rank and row reduction have independently known results', () => {
      const e = setup({ a: `A\\coloneq${a}`, b: `b\\coloneq${mat([['6'], ['8']])}`, x: call('lsolve', 'A', 'b')+'=', trace: call('trace', 'A')+'=', rank: call('rank', mat([['1', '2'], ['2', '4']]))+'=', rref: call('rref', mat([['1', '2', '3'], ['2', '4', '6']]))+'=', vt: call('lsolve', 'A', call('stack', '6', '8'))+'=' });
      expect(result(e, 'x')).toMatchObject({ rows: 2, cols: 1, items: [1, 2] });
      expect(result(e, 'vt').items).toEqual([1, 2]);
      expect(result(e, 'trace').number).toBe(7);
      expect(result(e, 'rank').number).toBe(1);
      expect(result(e, 'rref').items).toEqual([1, 2, 3, 0, 0, 0]);
    });
    step('vector operators, norm bars and scalar times retain valid meanings', () => {
      const e = setup({ v: 'v\\coloneq1..3', w: 'w\\coloneq3..1', d: call('dot', 'v', 'w')+'=', c: 'v\\times w=', n: '\\left\\lVert v\\right\\rVert=', f: call('norm', a)+'=', times: '2\\times3=', elementCross: '\\overrightarrow{v\\times w}=' });
      expect(result(e, 'd').number).toBe(10);
      expect(result(e, 'c').items).toEqual([-4, 8, -4]);
      expect(result(e, 'n').number).toBeCloseTo(Math.sqrt(14));
      expect(result(e, 'f').number).toBeCloseTo(Math.sqrt(30));
      expect(result(e, 'times').number).toBe(6);
      expect(result(e, 'elementCross').items).toEqual([3, 4, 3]);
    });
    step('units propagate through stiffness, inverse and determinant', () => {
      const e = setup({ k: `K\\coloneq${a}\\mathrm{kN}/\\mathrm{m}`, f: `F\\coloneq${mat([['6'], ['8']])}\\mathrm{kN}`, x: call('lsolve', 'K', 'F')+'=', i: 'K^{-1}=', d: '\\det(K)=', n: call('norm', 'F')+'=' });
      e.setRegion('x', { latex: call('lsolve', 'K', 'F')+'=', displayUnit: 'm' });
      expect(result(e, 'x')).toMatchObject({ rows: 2, cols: 1, items: [1, 2], unitText: 'm' });
      e.setRegion('i', { latex: 'K^{-1}=', displayUnit: 'm/kN' });
      result(e, 'i').items!.forEach((v, i) => expect(v).toBeCloseTo([0.3, -0.1, -0.2, 0.4][i]));
      e.setRegion('d', { latex: '\\det(K)=', displayUnit: 'kN^2/m^2' });
      expect(result(e, 'd').number).toBeCloseTo(10);
      expect(result(e, 'n').unitText).toBe('kN');
    });
    step('dependency walking and formatting work inside literals and vectorization', () => {
      const e = setup({ k: 'k\\coloneq2', a: `A\\coloneq${mat([['k', '1'], ['0', 'k']])}`, d: '\\det(A)=', v: '\\overrightarrow{A A}=' });
      expect(result(e, 'd').number).toBe(4);
      e.setRegion('k', { latex: 'k\\coloneq3' });
      expect(result(e, 'd').number).toBe(9);
      expect(result(e, 'v').items).toEqual([9, 1, 0, 9]);
      expect(e.getResult('a')!.references).toContain('k');
      const long = setup({ a: call('ones', '15', '15')+'=' });
      expect(result(long, 'a')).toMatchObject({ rows: 15, cols: 15, truncated: true });
      expect(result(long, 'a').latex).toContain('vec-more');
    });
    step('implicit products, user functions, map and scalar branches preserve matrix shape', () => {
      const e = setup({
        a: `A\\coloneq${a}`, b: `B\\coloneq${a}`,
        product: 'AB=', f: 'f(x)\\coloneq x', power: 'f(A)^2=', transpose: 'f(A)^{T}=',
        scalar: 'h(x)\\coloneq x+1', mapped: call('map', 'h', 'A')+'=',
        choice: `\\begin{cases}${a}&\\text{if}\\ 1>0\\\\${a}&\\text{otherwise}\\end{cases}=`,
      });
      for (const id of ['product', 'power']) expect(result(e, id)).toMatchObject({ rows: 2, cols: 2, items: [18, 7, 14, 11] });
      expect(result(e, 'transpose').items).toEqual([4, 2, 1, 3]);
      expect(result(e, 'mapped')).toMatchObject({ rows: 2, cols: 2, items: [5, 2, 3, 4] });
      expect(result(e, 'choice').items).toEqual([4, 1, 2, 3]);
    });
    step('invalid dimensions, bounds, units, singularity and limits give explicit errors', () => {
      const expressions = [
        call('inv', mat([['1', '2'], ['2', '4']])),
        call('lsolve', a, mat([['1'], ['2'], ['3']])),
        call('at', a, '2', '0'), call('at', a, '-1', '0'), call('at', a, '0.5', '0'),
        call('zeros', '101', '100'), call('matrix', '2', '2', call('seq', '1', '3')),
        `${a}\\cdot${mat([['1', '2', '3']])}`, `${a}+${mat([['1', '2', '3', '4']])}`,
        `${a}/ ${a}`, `${a}^{0.5}`, call('det', mat([['1', '2', '3']])),
        call('cross', call('seq', '1', '2'), call('seq', '1', '2')),
        call('det', mat([['1\\mathrm{m}', '1\\mathrm{s}'], ['1\\mathrm{m}', '1\\mathrm{m}']])),
      ];
      for (const expression of expressions) expect(setup({ x: expression+'=' }).getResult('x')!.status, expression).toBe('error');
      expect(() => parseLatex('\\begin{bmatrix}1&2\\\\3\\end{bmatrix}')).toThrow(/equal/);
    });
  });
});
