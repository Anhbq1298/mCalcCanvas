/**
 * Input & Results batch runs. The worksheet is registered once per engine and
 * each row only changes the bound inputs (definition overrides, the LaTeX is
 * never touched), so only what depends on them is recalculated. Every bound
 * input is set or cleared for every row: no value can leak from one case into
 * the next. Runs in calculation workers (see store/batchClient.ts).
 */
import { CalculationEngine, type CalculationResult, type EngineSettings, type RegionInput } from './CalculationEngine';

export interface BatchJob {
  regions: { id: string; input: RegionInput }[];
  /** Every input region bound to a column (cleared when a row gives no value). */
  inputIds: string[];
  rows: { id: string; overrides: { regionId: string; value: number; unit: string }[] }[];
  outputs: { columnId: string; regionId: string }[];
}

export interface BatchRowResult {
  /** Results selected as visible table columns, keyed by column id. */
  outputs: Record<string, CalculationResult | undefined>;
  /** Every region result of the case: only when asked for (reports), it is large. */
  regions?: Record<string, CalculationResult>;
}

export type BatchResults = Record<string, BatchRowResult>;

export interface BatchRunOptions {
  /** Keep every region result of each case (detailed reports). */
  detail?: boolean;
  /** Called as each case finishes. */
  onRow?(rowId: string, result: BatchRowResult): void;
}

export function runBatchJob(job: BatchJob, settings: Partial<EngineSettings>, opts: BatchRunOptions = {}): BatchResults {
  const e = new CalculationEngine(settings);
  e.batch(() => {
    for (const r of job.regions) e.setRegion(r.id, r.input);
  });
  const out: BatchResults = {};
  for (const row of job.rows) {
    const given = new Map(row.overrides.map((o) => [o.regionId, o] as const));
    e.batch(() => {
      for (const id of new Set([...job.inputIds, ...given.keys()])) {
        const o = given.get(id);
        e.setDefinitionOverride(id, o ? { value: o.value, unit: o.unit } : null);
      }
    });
    const result: BatchRowResult = {
      outputs: Object.fromEntries(job.outputs.map((c) => [c.columnId, e.getResult(c.regionId)])),
      ...(opts.detail ? { regions: e.getResultsSnapshot() } : {}),
    };
    out[row.id] = result;
    opts.onRow?.(row.id, result);
  }
  return out;
}
