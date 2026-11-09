import { describe, expect, it } from 'vitest';
import type { MathShape } from '../../canvas/model/types';
import { calculateBatch, unitToLatex, type AvailableField } from '../../components/inputResults/batchCalculation';
import type { InputResultConfig } from '../../documents/DocumentTypes';

const math = (id: string, y: number, latex: string): MathShape => ({
  id,
  type: 'math',
  x: 0,
  y,
  props: {
    w: 100,
    h: 32,
    latex,
    displayMode: 'auto',
    displayUnit: '',
    precision: 2,
    autoSize: true,
    fontSize: 18,
    color: '#0f172a',
  },
});

describe('Input & Results batch calculation', () => {
  it('converts inherited display units into safe LaTeX quantities', () => {
    expect(unitToLatex('kN/m')).toBe('\\,\\mathrm{kN}/\\mathrm{m}');
    expect(unitToLatex('kN·m²')).toBe('\\,\\mathrm{kN}\\cdot \\mathrm{m}^{2}');
    expect(unitToLatex('')).toBe('');
  });

  it('calculates every row from numeric overrides without mutating the worksheet shapes', () => {
    const shapes = {
      length: math('length', 0, 'L\\coloneq6\\mathrm{m}'),
      load: math('load', 40, 'w\\coloneq25\\mathrm{kN}/\\mathrm{m}'),
      moment: math('moment', 80, 'M\\coloneq wL^2/8'),
    };
    const original = JSON.stringify(shapes);
    const fields = new Map<string, AvailableField>([
      ['length', { regionId: 'length', label: 'L', definitionLatex: 'L', unit: 'm', kind: 'input', inputValue: 6 }],
      ['load', { regionId: 'load', label: 'w', definitionLatex: 'w', unit: 'kN/m', kind: 'input', inputValue: 25 }],
      ['moment', { regionId: 'moment', label: 'M', definitionLatex: 'M', unit: 'kN·m', kind: 'result', inputValue: null }],
    ]);
    const config: InputResultConfig = {
      title: 'Beam batch',
      inputs: [
        { id: 'span', regionId: 'length', label: 'Span' },
        { id: 'line-load', regionId: 'load', label: 'Line load' },
      ],
      outputs: [{ id: 'moment-result', regionId: 'moment', label: 'Moment' }],
      rows: [
        { id: 'b1', name: 'B1', values: { span: 5, 'line-load': 20 } },
        { id: 'b2', name: 'B2', values: { span: 6, 'line-load': 25 } },
      ],
    };

    const results = calculateBatch(config, fields, shapes, { unitSystem: 'SI', precision: 2 });

    expect(results.b1?.['moment-result']?.value?.number).toBe(62.5);
    expect(results.b1?.['moment-result']?.value?.unitText).toBe('kN·m');
    expect(results.b2?.['moment-result']?.value?.number).toBe(112.5);
    expect(JSON.stringify(shapes)).toBe(original);
  });
});
