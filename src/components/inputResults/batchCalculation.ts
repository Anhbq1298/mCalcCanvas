import { calcKey } from '../../canvas/engineBridge';
import type { MathShape, Shape } from '../../canvas/model/types';
import type { InputResultConfig } from '../../documents/DocumentTypes';
import type { BatchJob, BatchResults } from '../../engine/batch';
import { runBatch, type BatchHandle, type BatchOptions } from '../../store/batchClient';

export type { BatchResults, BatchRowResult } from '../../engine/batch';

export interface AvailableField {
  regionId: string;
  label: string;
  definitionLatex: string;
  unit: string;
  kind: 'input' | 'result' | 'check';
  inputValue: number | null;
}

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

/** The worksheet regions and per-row overrides of a run (pure; the engine runs it in a worker). */
export function buildBatchJob(config: InputResultConfig, fields: Map<string, AvailableField>, shapes: Record<string, Shape>): BatchJob {
  const mathShapes = Object.values(shapes).filter((shape): shape is MathShape => shape.type === 'math');
  return {
    regions: mathShapes.map((shape) => ({
      id: shape.id,
      input: {
        latex: shape.props.latex,
        displayUnit: shape.props.displayUnit || null,
        precision: shape.props.precision >= 0 ? shape.props.precision : null,
        // Same order as the worksheet (annex blocks are calculated at their link).
        order: calcKey(shape, shapes),
      },
    })),
    inputIds: config.inputs.filter((column) => fields.get(column.regionId)?.kind === 'input').map((column) => column.regionId),
    rows: config.rows.map((row) => ({
      id: row.id,
      overrides: config.inputs.flatMap((column) => {
        const source = fields.get(column.regionId);
        const value = row.values[column.id];
        return source?.kind === 'input' && value !== null && value !== undefined ? [{ regionId: column.regionId, value, unit: source.unit }] : [];
      }),
    })),
    outputs: config.outputs.map((column) => ({ columnId: column.id, regionId: column.regionId })),
  };
}

/** Every case calculated off the UI thread (one worksheet set-up per worker). */
export function startBatch(
  config: InputResultConfig,
  fields: Map<string, AvailableField>,
  shapes: Record<string, Shape>,
  settings: { unitSystem: 'SI' | 'Imperial'; precision: number },
  opts: BatchOptions = {},
): BatchHandle {
  return runBatch(buildBatchJob(config, fields, shapes), settings, opts);
}

/** startBatch, awaited. */
export function calculateBatch(
  config: InputResultConfig,
  fields: Map<string, AvailableField>,
  shapes: Record<string, Shape>,
  settings: { unitSystem: 'SI' | 'Imperial'; precision: number },
  opts: BatchOptions = {},
): Promise<BatchResults> {
  return startBatch(config, fields, shapes, settings, opts).done;
}
