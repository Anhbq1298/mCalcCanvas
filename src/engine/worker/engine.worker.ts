/// <reference lib="webworker" />
/** Runs the calculation engine off the UI thread (see engineClient.ts). */
import { CalculationEngine } from '../CalculationEngine';
import type { CalculationResult } from '../CalculationEngine';
import { runBatchJob } from '../batch';
import type { FromWorker, ToWorker } from './protocol';

const engine = new CalculationEngine({ unitSystem: 'SI', precision: 2 });
// Long recalculations (column templates take seconds) show results as they finish.
engine.progressIntervalMs = 100;
const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

engine.subscribe((ids) => {
  const results: Record<string, CalculationResult | null> = {};
  for (const id of ids) results[id] = engine.getResult(id) ?? null;
  post({ type: 'results', results });
});

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.type === 'ops') {
    engine.batch(() => {
      for (const o of m.ops) {
        if (o.op === 'set') engine.setRegion(o.id, o.input);
        else if (o.op === 'remove') engine.removeRegion(o.id);
        else if (o.op === 'clear') engine.clear();
        else engine.setSettings(o.settings);
      }
    });
  } else if (m.type === 'batch') {
    try {
      runBatchJob(m.job, m.settings, { detail: m.detail, onRow: (rowId, result) => post({ type: 'batchRow', jobId: m.jobId, rowId, result }) });
      post({ type: 'batchDone', jobId: m.jobId });
    } catch (e) {
      post({ type: 'batchError', jobId: m.jobId, error: (e as Error).message });
    }
  } else if (m.type === 'ping') {
    post({ type: 'reply', req: m.req, ok: true });
  } else {
    try {
      post({ type: 'reply', req: m.req, ok: true, value: engine.inputInUnit(m.id, m.unit) });
    } catch (e) {
      post({ type: 'reply', req: m.req, ok: false, error: (e as Error).message });
    }
  }
};

post({ type: 'ready' });
