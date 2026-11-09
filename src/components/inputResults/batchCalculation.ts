import { worksheetRegions } from '../../canvas/engineBridge';
import type { Shape } from '../../canvas/model/types';
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
export function buildBatchJob(config: InputResultConfig, fields: Map<string, AvailableField>, shapes: Record<string, Shape>, rowIds?: string[]): BatchJob {
  const rows = rowIds ? config.rows.filter((row) => rowIds.includes(row.id)) : config.rows;
  return {
    // Math regions and graph series, ordered as on the worksheet (annex blocks at their link).
    regions: worksheetRegions(shapes),
    inputIds: config.inputs.filter((column) => fields.get(column.regionId)?.kind === 'input').map((column) => column.regionId),
    rows: rows.map((row) => ({
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
  opts: BatchOptions & { rowIds?: string[] } = {},
): BatchHandle {
  return runBatch(buildBatchJob(config, fields, shapes, opts.rowIds), settings, opts);
}

/** startBatch, awaited. */
export function calculateBatch(
  config: InputResultConfig,
  fields: Map<string, AvailableField>,
  shapes: Record<string, Shape>,
  settings: { unitSystem: 'SI' | 'Imperial'; precision: number },
  opts: BatchOptions & { rowIds?: string[] } = {},
): Promise<BatchResults> {
  return startBatch(config, fields, shapes, settings, opts).done;
}

/** Input LaTeX shown with a case's value ("N_{Ed}\\coloneq3000\\,\\mathrm{kN}" → 6000): the number after := is replaced. */
export function withInputValue(latex: string, value: number): string {
  return latex.replace(/(\\coloneq\s*|:=\s*)-?\d+(?:\.\d+)?(?:\{,\}\d+)?(?:[eE][+-]?\d+)?/, (_, op: string) => `${op}${String(value)}`);
}

/** The worksheet as it reads for one case: bound inputs show the case's values. */
export function caseShapes(config: InputResultConfig, row: InputResultConfig['rows'][number], shapes: Shape[]): Shape[] {
  const values = new Map(config.inputs.flatMap((c) => (row.values[c.id] === null || row.values[c.id] === undefined ? [] : [[c.regionId, row.values[c.id]!] as const])));
  return shapes.map((s) => (s.type === 'math' && values.has(s.id) ? { ...s, props: { ...s.props, latex: withInputValue(s.props.latex, values.get(s.id)!) } } : s));
}
