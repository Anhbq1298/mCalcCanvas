import { readingKey } from '../../canvas/engineBridge';
import type { MathShape, Shape } from '../../canvas/model/types';
import { CalculationEngine, type CalculationResult } from '../../engine';
import type { InputResultConfig } from '../../documents/DocumentTypes';

export interface AvailableField {
  regionId: string;
  label: string;
  definitionLatex: string;
  unit: string;
  kind: 'input' | 'result' | 'check';
  inputValue: number | null;
}

export interface BatchRowResult {
  /** Results selected as visible table columns, keyed by column id. */
  outputs: Record<string, CalculationResult | undefined>;
  /** Complete isolated worksheet result set for transparent detailed reports. */
  regions: Record<string, CalculationResult>;
}

export type BatchResults = Record<string, BatchRowResult>;

export function unitToLatex(unit: string): string {
  if (!unit) return '';
  const converted = unit
    .replace(/°C/g, 'degC')
    .replace(/°/g, 'deg')
    .replace(/²/g, '^{2}')
    .replace(/³/g, '^{3}')
    .replace(/⁴/g, '^{4}')
    .replace(/[·⋅]/g, '¤')
    .replace(/[A-Za-z]+/g, (word) => `\\mathrm{${word}}`)
    .replace(/¤/g, '\\cdot ');
  return `\\,${converted}`;
}

export function calculateBatch(
  config: InputResultConfig,
  fields: Map<string, AvailableField>,
  shapes: Record<string, Shape>,
  settings: { unitSystem: 'SI' | 'Imperial'; precision: number },
): BatchResults {
  const mathShapes = Object.values(shapes).filter((shape): shape is MathShape => shape.type === 'math');
  const inputByRegion = new Map(config.inputs.map((column) => [column.regionId, column]));
  const allResults: BatchResults = {};
  for (const row of config.rows) {
    const isolated = new CalculationEngine(settings);
    isolated.batch(() => {
      for (const shape of mathShapes) {
        isolated.setRegion(shape.id, {
          latex: shape.props.latex,
          displayUnit: shape.props.displayUnit || null,
          precision: shape.props.precision >= 0 ? shape.props.precision : null,
          order: readingKey(shape),
        });
      }
      for (const [regionId, input] of inputByRegion) {
        const source = fields.get(regionId);
        const value = row.values[input.id];
        if (source?.kind === 'input' && value !== null && value !== undefined) {
          isolated.setDefinitionOverride(regionId, { value, unit: source.unit });
        }
      }
    });
    allResults[row.id] = {
      outputs: Object.fromEntries(config.outputs.map((column) => [column.id, isolated.getResult(column.regionId)])),
      regions: isolated.getResultsSnapshot(),
    };
  }
  return allResults;
}
