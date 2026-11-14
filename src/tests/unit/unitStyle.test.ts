import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { styleUnits, UNIT_COLOR } from '../../math/unitStyle';
import { fractionUnitLatex, resultUnitText } from '../../math/resultUnit';

const C = `\\textcolor{${UNIT_COLOR}}`;

describe('unit styling (display only)', () => {
  it('unit styling (display only)', () => {
    step('result-unit fractions use a restricted unit tree and retain powers', () => {
      expect(fractionUnitLatex(String.raw`\mathrm{kN}/\mathrm{m}^2`)).toBe(String.raw`\frac{\mathrm{kN}}{\mathrm{m}^{2}}`);
      expect(fractionUnitLatex(String.raw`\mathrm{s}^{2}/\mathrm{(kg}\cdot\mathrm{m)}`)).toBe(String.raw`\mathrm{s}^{2}/\mathrm{(kg}\cdot\mathrm{m)}`);
      expect(resultUnitText(String.raw`\frac{\unit{kN}\cdot\mathrm{m}}{\mathrm{m}^2}`)).toBe('kN m/m^2');
      expect(resultUnitText(String.raw`\mathrm{m}^{-2}`)).toBe('1/m^2');
      expect(resultUnitText('')).toBe('');
      expect(resultUnitText(String.raw`10\cdot\frac{\mathrm{kN}\cdot\mathrm{m}}{\mathrm{m}^2}`)).toBe('10 kN m/m^2');
      expect(resultUnitText(String.raw`\frac{\mathrm{kN}}{2\cdot\mathrm{m}}`)).toBe('0.5 kN/m');
      expect(resultUnitText(String.raw`(2\mathrm{m})^2`)).toBe('4 m^2');
      expect(resultUnitText(String.raw`0.0000001\mathrm{N}`)).toBe('1e-7 N');
      for (const invalid of [String.raw`\mathrm{kN}+\mathrm{m}`, 'x', String.raw`\sin(m)`, String.raw`m^{0.5}`, '0N', '-10N', String.raw`\frac{N}{0}`, '10^{400}N']) {
        expect(() => resultUnitText(invalid)).toThrow();
      }
    });
    step('separates value and unit with a dot and colours the unit', () => {
      expect(styleUnits('L\\coloneq8.5\\,\\mathrm{m}')).toBe(`L\\coloneq8.5\\cdot ${C}{\\mathrm{m}}`);
      expect(styleUnits('g_{k}\\coloneq25\\,\\frac{\\mathrm{kN}}{\\mathrm{m}}')).toBe(`g_{k}\\coloneq25\\cdot \\frac{${C}{\\mathrm{kN}}}{${C}{\\mathrm{m}}}`);
      expect(styleUnits('257.39\\,\\mathrm{kN}\\cdot\\mathrm{m}')).toBe(`257.39\\cdot ${C}{\\mathrm{kN}}\\cdot${C}{\\mathrm{m}}`);
      expect(styleUnits('1788\\,\\mathrm{mm}^{2}')).toBe(`1788\\cdot ${C}{\\mathrm{mm}^{2}}`);
      expect(styleUnits('5\\unit{kPa}')).toBe(`5\\cdot ${C}{\\unit{kPa}}`);
    });
    step('leaves degrees, variables and plain maths alone', () => {
      expect(styleUnits('20\\,\\mathrm{\\degree C}')).toBe(`20\\,${C}{\\mathrm{\\degree C}}`);
      expect(styleUnits('\\mathrm{span}\\coloneq2')).toBe('\\mathrm{span}\\coloneq2');
      expect(styleUnits('x\\coloneq\\frac{a}{2}')).toBe('x\\coloneq\\frac{a}{2}');
      expect(styleUnits('\\eta_{M}=0.858')).toBe('\\eta_{M}=0.858');
    });
  });
});
