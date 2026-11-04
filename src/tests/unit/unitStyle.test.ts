import { describe, expect, it } from 'vitest';
import { styleUnits, UNIT_COLOR } from '../../math/unitStyle';

const C = `\\textcolor{${UNIT_COLOR}}`;

describe('unit styling (display only)', () => {
  it('separates value and unit with a dot and colours the unit', () => {
    expect(styleUnits('L\\coloneq8.5\\,\\mathrm{m}')).toBe(`L\\coloneq8.5\\cdot ${C}{\\mathrm{m}}`);
    expect(styleUnits('g_{k}\\coloneq25\\,\\frac{\\mathrm{kN}}{\\mathrm{m}}')).toBe(`g_{k}\\coloneq25\\cdot \\frac{${C}{\\mathrm{kN}}}{${C}{\\mathrm{m}}}`);
    expect(styleUnits('257.39\\,\\mathrm{kN}\\cdot\\mathrm{m}')).toBe(`257.39\\cdot ${C}{\\mathrm{kN}}\\cdot${C}{\\mathrm{m}}`);
    expect(styleUnits('1788\\,\\mathrm{mm}^{2}')).toBe(`1788\\cdot ${C}{\\mathrm{mm}^{2}}`);
    expect(styleUnits('5\\unit{kPa}')).toBe(`5\\cdot ${C}{\\unit{kPa}}`);
  });

  it('leaves degrees, variables and plain maths alone', () => {
    expect(styleUnits('20\\,\\mathrm{\\degree C}')).toBe(`20\\,${C}{\\mathrm{\\degree C}}`);
    expect(styleUnits('\\mathrm{span}\\coloneq2')).toBe('\\mathrm{span}\\coloneq2');
    expect(styleUnits('x\\coloneq\\frac{a}{2}')).toBe('x\\coloneq\\frac{a}{2}');
    expect(styleUnits('\\eta_{M}=0.858')).toBe('\\eta_{M}=0.858');
  });
});
