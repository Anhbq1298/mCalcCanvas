/**
 * Input & Results batch runs: every row is calculated in its own engine with
 * numeric overrides of the chosen inputs (the worksheet LaTeX is never changed).
 * Runs in the calculation worker (see store/batchClient.ts).
 */
import { CalculationEngine, type CalculationResult, type EngineSettings, type RegionInput } from './CalculationEngine';

export interface BatchJob {
  regions: { id: string; input: RegionInput }[];
  rows: { id: string; overrides: { regionId: string; value: number; unit: string }[] }[];
  outputs: { columnId: string; regionId: string }[];
}

export interface BatchRowResult {
  /** Results selected as visible table columns, keyed by column id. */
  outputs: Record<string, CalculationResult | undefined>;
  /** Complete isolated worksheet result set for transparent detailed reports. */
  regions: Record<string, CalculationResult>;
}

export type BatchResults = Record<string, BatchRowResult>;

export function runBatchJob(job: BatchJob, settings: Partial<EngineSettings>): BatchResults {
  const out: BatchResults = {};
  for (const row of job.rows) {
    const e = new CalculationEngine(settings);
    e.batch(() => {
      for (const r of job.regions) e.setRegion(r.id, r.input);
      for (const o of row.overrides) e.setDefinitionOverride(o.regionId, { value: o.value, unit: o.unit });
    });
    out[row.id] = {
      outputs: Object.fromEntries(job.outputs.map((c) => [c.columnId, e.getResult(c.regionId)])),
      regions: e.getResultsSnapshot(),
    };
  }
  return out;
}
