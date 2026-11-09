import { describe, expect, it } from 'vitest';
import { step } from '../step';
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
  it('Input & Results batch calculation', async () => {
    step('converts inherited display units into safe LaTeX quantities', () => {
      expect(unitToLatex('kN/m')).toBe('\\,\\mathrm{kN}/\\mathrm{m}');
      expect(unitToLatex('kN·m²')).toBe('\\,\\mathrm{kN}\\cdot \\mathrm{m}^{2}');
      expect(unitToLatex('')).toBe('');
    });
    await step('calculates every row from numeric overrides without mutating the worksheet shapes', async () => {
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

      const results = await calculateBatch(config, fields, shapes, { unitSystem: 'SI', precision: 2 });

      expect(results.b1?.outputs['moment-result']?.value?.number).toBe(62.5);
      expect(results.b1?.outputs['moment-result']?.value?.unitText).toBe('kN·m');
      expect(results.b2?.outputs['moment-result']?.value?.number).toBe(112.5);
      expect(results.b1?.regions.moment?.value?.number).toBe(62.5);
      expect(JSON.stringify(shapes)).toBe(original);
    });
    await step('varies only selected load-case inputs and keeps all other template values unchanged', async () => {
      const shapes = {
        width: math('width', 0, 'b\\coloneq600\\mathrm{mm}'),
        axial: math('axial', 40, 'N_{Ed}\\coloneq5000\\mathrm{kN}'),
        momentX: math('moment-x', 80, 'M_{Edx}\\coloneq100\\mathrm{kN}\\cdot\\mathrm{m}'),
        momentY: math('moment-y', 120, 'M_{Edy}\\coloneq50\\mathrm{kN}\\cdot\\mathrm{m}'),
        reference: math('reference', 160, 'R\\coloneq\\frac{N_{Ed}}{10000\\mathrm{kN}}+\\frac{M_{Edx}}{1000\\mathrm{kN}\\cdot\\mathrm{m}}+\\frac{M_{Edy}}{1000\\mathrm{kN}\\cdot\\mathrm{m}}+\\frac{b}{600\\mathrm{mm}}-1'),
        check: math('check', 200, 'R\\le1'),
      };
      const fields = new Map<string, AvailableField>([
        ['width', { regionId: 'width', label: 'b', definitionLatex: 'b', unit: 'mm', kind: 'input', inputValue: 600 }],
        ['axial', { regionId: 'axial', label: 'NEd', definitionLatex: 'N_{Ed}', unit: 'kN', kind: 'input', inputValue: 5000 }],
        ['moment-x', { regionId: 'moment-x', label: 'MEd,x', definitionLatex: 'M_{Edx}', unit: 'kN·m', kind: 'input', inputValue: 100 }],
        ['moment-y', { regionId: 'moment-y', label: 'MEd,y', definitionLatex: 'M_{Edy}', unit: 'kN·m', kind: 'input', inputValue: 50 }],
        ['reference', { regionId: 'reference', label: 'D/C', definitionLatex: 'R', unit: '', kind: 'result', inputValue: null }],
        ['check', { regionId: 'check', label: 'Check', definitionLatex: 'R', unit: '', kind: 'check', inputValue: null }],
      ]);
      const config: InputResultConfig = {
        title: 'Column load cases',
        inputs: [
          { id: 'ned', regionId: 'axial', label: 'NEd' },
          { id: 'medx', regionId: 'moment-x', label: 'MEd,x' },
          { id: 'medy', regionId: 'moment-y', label: 'MEd,y' },
        ],
        outputs: [
          { id: 'ratio', regionId: 'reference', label: 'D/C' },
          { id: 'status', regionId: 'check', label: 'Check' },
        ],
        rows: [
          { id: 'lc1', name: 'LC1', values: { ned: 4000, medx: 100, medy: 50 } },
          { id: 'lc2', name: 'LC2', values: { ned: 6000, medx: 200, medy: 100 } },
        ],
      };

      const results = await calculateBatch(config, fields, shapes, { unitSystem: 'SI', precision: 3 });

      expect(results.lc1?.outputs.ratio?.value?.number).toBeCloseTo(0.55, 9);
      expect(results.lc1?.outputs.status?.check?.pass).toBe(true);
      expect(results.lc2?.outputs.ratio?.value?.number).toBeCloseTo(0.9, 9);
      expect(results.lc2?.outputs.status?.check?.pass).toBe(true);
      expect(results.lc2?.regions.width?.value?.number).toBeCloseTo(0.6, 9);
      expect(results.lc2?.regions.width?.value?.unitText).toBe('m');
      expect(results.lc2?.regions.width?.overridden).toBeUndefined();
      expect(results.lc2?.regions.axial?.overridden).toBe(true);
    });
  });
});

describe('Input & Results on a column template', () => {
  it('calculates annex blocks at their link (same order as the worksheet)', async () => {
    const { templateById } = await import('../../documents/templates');
    const shapes = Object.fromEntries(templateById('rc-circular-column')!.shapes().map((s) => [s.id, s]));
    const find = (start: string) => Object.values(shapes).find((s) => s.type === 'math' && s.props.latex.startsWith(start))!;
    const ned = find('N_{Ed}\\coloneq');
    const ur = find('\\mathrm{UR}_{M}\\coloneq');
    const fields = new Map<string, AvailableField>([
      [ned.id, { regionId: ned.id, label: 'NEd', definitionLatex: 'N_{Ed}', unit: 'kN', kind: 'input', inputValue: 8000 }],
      [ur.id, { regionId: ur.id, label: 'UR_M', definitionLatex: 'UR_M', unit: '', kind: 'result', inputValue: null }],
    ]);
    const config: InputResultConfig = {
      title: 'Columns',
      inputs: [{ id: 'n', regionId: ned.id, label: 'NEd' }],
      outputs: [{ id: 'ur', regionId: ur.id, label: 'UR_M' }],
      rows: [
        { id: 'a', name: 'A', values: { n: 8000 } },
        { id: 'b', name: 'B', values: { n: 4000 } },
      ],
    };
    const results = await calculateBatch(config, fields, shapes, { unitSystem: 'SI', precision: 2 });
    const errors = Object.entries(results.a!.regions).filter(([, r]) => r.status === 'error');
    expect(errors).toEqual([]);
    const a = results.a!.outputs.ur!.value!.number;
    const b = results.b!.outputs.ur!.value!.number;
    expect(a).toBeGreaterThan(0);
    expect(b).not.toBeCloseTo(a, 3);
  }, 60000);
});
