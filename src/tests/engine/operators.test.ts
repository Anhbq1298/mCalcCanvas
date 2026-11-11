import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../../engine';
import { step } from '../step';

describe('extended worksheet operators', () => {
  it('evaluates bounded operators, units and scope through the worksheet engine', () => {
    const evaluate = (latex: string, unit?: string, definitions: string[] = []) => {
      const engine = new CalculationEngine();
      engine.batch(() => {
        definitions.forEach((latex, order) => engine.setRegion(`d${order}`, { latex, order }));
        engine.setRegion('r', { latex, order: definitions.length, displayUnit: unit });
      });
      return engine.getResult('r')!;
    };
    const value = (latex: string, expected: number, unit?: string, definitions?: string[]) => {
      const r = evaluate(latex, unit, definitions);
      expect(r.status, r.error?.message).toBe('valid');
      expect(r.value?.number).toBeCloseTo(expected, 7);
      return r;
    };

    step('factorial and arithmetic equation breaks', () => {
      value('5!=', 120);
      value('0!=', 1);
      for (const expression of ['(-1)!', '2.5!', '171!', '(2\\,\\mathrm{m})!']) expect(evaluate(expression).status).toBe('error');
      value('a\\coloneq\\begin{array}{l}2+\\\\3\\end{array}', 5);
      value('\\begin{array}{l}8\\div\\\\2\\end{array}=', 4);
    });

    step('logical expressions, membership and strict comparisons', () => {
      value('(2>1)\\land(3<4)=', 1);
      value('(2<1)\\lor(3<4)=', 1);
      value('(2>1)\\oplus(3<4)=', 0);
      value('\\neg(2>1)=', 0);
      value('\\mathrm{if}(\\neg(2<1),7,8)=', 7);
      value('\\mathrm{if}((2>1)\\land(3<4),7,8)=', 7);
      value('2\\in\\mathrm{seq}(1,3)=', 1);
      value('4\\in\\mathrm{seq}(1,3)=', 0);
      expect(evaluate('1.000000000001\\le1').check?.pass).toBe(false);
      expect(evaluate('\\neg '.repeat(130) + '1=').error?.code).toBe('limit-exceeded');
    });

    step('derivatives, integrals, limits, sums and products respect dimensions and local indices', () => {
      const r = value('\\operatorname{derivative}(x^2,x,3)=', 6, undefined, ['x\\coloneq999']);
      expect(r.references).not.toContain('x');
      value('\\operatorname{partial}(x^2+y,x,3)=', 6, undefined, ['y\\coloneq5']);
      value('\\operatorname{derivative}(x^2,x,3\\,\\mathrm{mm})=', 0.006, 'm');
      value('\\operatorname{integral}(x^2,x,0,3)=', 9);
      value('\\operatorname{integral}(2\\,\\mathrm{kN}/\\mathrm{m},x,0\\,\\mathrm{m},3\\,\\mathrm{m})=', 6, 'kN');
      value('\\operatorname{limit}(\\sin(x)/x,x,0)=', 1);
      value('\\operatorname{limit}(1/x,x,\\infty)=', 0);
      value('\\operatorname{summation}(i^2,i,1,3)=', 14);
      value('\\operatorname{product}(i,i,1,4)=', 24);
      value('\\sum_{i=1}^{3}\\left(i^2\\right)=', 14);
      value('\\prod_{i=1}^{4}\\left(i\\right)=', 24);
      value('\\int_{0}^{3}\\left(x^2\\right)\\,\\mathrm{d}x=', 9);
      value('\\lim_{x\\to0}\\left(\\sin(x)/x\\right)=', 1);
      value("f^{\\prime}(3)=", 6, undefined, ['f(t)\\coloneq t^2']);
      value('\\operatorname{summation}(i,i,2,1)=', 0);
      value('\\operatorname{product}(i,i,2,1)=', 1);
      const gradient = evaluate('\\operatorname{gradient}(x^2+3y^2,\\begin{bmatrix}x\\\\y\\end{bmatrix},\\begin{bmatrix}2\\\\3\\end{bmatrix})=');
      expect(gradient.status, gradient.error?.message).toBe('valid');
      expect(gradient.value?.text).toMatch(/4.*18/);
      for (const expression of ['\\operatorname{derivative}(|x|,x,0)', '\\operatorname{limit}(1/x,x,0)', '\\operatorname{integral}(x,x,0\\,\\mathrm{m},3\\,\\mathrm{s})', '\\operatorname{integral}(1,x,0,\\infty)', '\\operatorname{product}(i,i,1,10001)']) expect(evaluate(expression).status, expression).toBe('error');
      expect(evaluate('\\operatorname{summation}(\\operatorname{summation}(1,j,1,1000),i,1,1000)=').error?.code).toBe('limit-exceeded');
    });

    step('composition and finite-interval continuous convolution call declared functions', () => {
      const functions = ['f(t)\\coloneq t^2', 'g(t)\\coloneq t+1'];
      value('\\operatorname{compose}(f,g,2)=', 9, undefined, functions);
      value('\\operatorname{convolution}(f,g,2,0,1)=', 0.75, undefined, functions);
    });

    step('global definitions resolve above their position and update, remove and reject duplicates', () => {
      const e = new CalculationEngine();
      e.batch(() => {
        e.setRegion('above', { latex: 'g+1=', order: 0 });
        e.setRegion('global', { latex: '\\operatorname{global}(g,4)', order: 10 });
      });
      expect(e.getResult('above')?.value?.number).toBe(5);
      expect(e.getResult('global')?.globalDefinition).toBe(true);
      e.setRegion('global', { latex: '\\operatorname{global}(g,7)', order: 10 });
      expect(e.getResult('above')?.value?.number).toBe(8);
      e.setRegion('local', { latex: 'g\\coloneq20', order: 3 });
      e.setRegion('after', { latex: 'g=', order: 4 });
      expect(e.getResult('above')?.value?.number).toBe(8);
      expect(e.getResult('after')?.value?.number).toBe(20);
      e.setRegion('duplicate', { latex: '\\operatorname{global}(g,2)', order: 20 });
      expect(e.getResult('global')?.status).toBe('error');
      expect(e.getResult('duplicate')?.status).toBe('error');
      e.removeRegion('duplicate');
      expect(e.getResult('above')?.value?.number).toBe(8);
      e.setRegion('global', { latex: 'g\\coloneq7', order: 10 });
      expect(e.getResult('above')?.status).toBe('error');
      value('f(3)=', 9, undefined, ['\\operatorname{global}(f(x),x^2)']);
      expect(evaluate('\\operatorname{global}(g,a)', undefined, ['a\\coloneq3']).error?.message).toContain('other globals');
      const cycle = new CalculationEngine();
      cycle.batch(() => {
        cycle.setRegion('a', { latex: '\\operatorname{global}(a,b+1)', order: 0 });
        cycle.setRegion('b', { latex: '\\operatorname{global}(b,a+1)', order: 1 });
      });
      expect(cycle.getResult('a')?.status).toBe('error');
      expect(cycle.getResult('b')?.status).toBe('error');
    });

    step('symbolic simplification uses exact fractions and differentiates real expressions', () => {
      const r = evaluate('1/3+1/6\\rightarrow');
      expect(r.status, r.error?.message).toBe('valid');
      expect(r.symbolicLatex).toBe('\\frac{1}{2}');
      expect(evaluate('x+x\\rightarrow').symbolicLatex).toMatch(/2.*x/);
      expect(evaluate('\\operatorname{derivative}(x^3,x)\\rightarrow').symbolicLatex).toMatch(/3.*x.*2/);
      expect(evaluate('\\operatorname{derivative}(x^3,x,2)\\rightarrow').symbolicLatex).toBe('12');
      expect(evaluate('f(x)\\rightarrow', undefined, ['f(t)\\coloneq t^2+1']).symbolicLatex).toMatch(/x.*2.*1/);
      const piecewise = evaluate('f(x)\\rightarrow', undefined, ['f(t)\\coloneq\\mathrm{if}(t>0,t,-t)']);
      expect(piecewise.status, piecewise.error?.message).toBe('valid');
      expect(piecewise.symbolicLatex).toMatch(/x\s*>\s*0/);
      expect(piecewise.symbolicLatex).not.toMatch(/t\s*>\s*0/);
      expect(evaluate('a\\rightarrow', undefined, ['a\\coloneq0.30000000000000004']).symbolicLatex).toContain('30000000000000004');
      expect(evaluate('missing\\rightarrow').status).toBe('valid');
      expect(evaluate('missing=').status).toBe('error');
      expect(evaluate('\\ln(0)\\rightarrow').status).toBe('error');
      expect(evaluate('0*(1/x)\\rightarrow').symbolicLatex).toContain('/');
      expect(evaluate('wL\\rightarrow', undefined, ['w\\coloneq2', 'L\\coloneq3']).symbolicLatex).toBe('6');
      expect(evaluate('f(x)\\rightarrow', undefined, ['f(t)\\coloneq\\operatorname{summation}(t+x,x,1,2)']).symbolicLatex).toContain('local');
    });

    step('complex conjugation, phasors and arithmetic keep components explicit and reject real ordering', () => {
      expect(evaluate('\\operatorname{conj}(3+4i)=').value?.complex).toEqual({ re: 3, im: -4 });
      expect(evaluate('\\overline{3+4i}=').value?.complex).toEqual({ re: 3, im: -4 });
      const phasor = evaluate('\\operatorname{phasor}(2,90^{\\circ})=');
      expect(phasor.status, phasor.error?.message).toBe('valid');
      expect(phasor.value?.complex?.re).toBeCloseTo(0, 12);
      expect(phasor.value?.complex?.im).toBeCloseTo(2, 12);
      expect(evaluate('\\operatorname{phasor}(2,90^{\\circ})\\equiv2i').check?.pass).toBe(true);
      expect(evaluate('(3+4i)/(1-2i)=').value?.complex).toEqual({ re: -1, im: 2 });
      const array = evaluate('\\operatorname{conj}(\\begin{bmatrix}1i&2+3i\\end{bmatrix})=');
      expect(array.status, array.error?.message).toBe('valid');
      expect(array.value?.text).toContain('3i');
      expect(array.value?.latex).not.toContain('NaN');
      expect(array.value?.items).toBeUndefined();
      value('(1i)^2=', -1);
      value('f(1i)=', -1, undefined, ['f(z)\\coloneq z^2']);
      value('\\operatorname{real}(a^2)=', 0, undefined, ['a\\coloneq1+1i']);
      value('\\operatorname{imag}(a^2)=', 2, undefined, ['a\\coloneq1+1i']);
      value('\\imaginaryI^2=', -1, undefined, ['i\\coloneq7']);
      value('i^2=', 49, undefined, ['i\\coloneq7']);
      value('\\operatorname{prod}(\\mathrm{seq}(1,4))=', 24);
      expect(evaluate('i=').status).toBe('error');
      value('2i=', 14, undefined, ['i\\coloneq7']);
      for (const expression of ['(1+1i)\\le2', '1i+1\\,\\mathrm{m}', '\\sqrt{-1}']) expect(evaluate(expression).status).toBe('error');
    });
  });
});
