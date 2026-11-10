import {
  AlertTriangle,
  Calculator,
  Check,
  Columns3,
  ExternalLink,
  Plus,
  Printer,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { revealShape } from '../../canvas/canvasActions';
import { readingKey, worksheetRegions } from '../../canvas/engineBridge';
import { compareOrderKeys, type OrderKey } from '../../engine/light';
import { select, updateShapes, useCanvasStore } from '../../canvas/model/canvasStore';
import type { MathShape } from '../../canvas/model/types';
import type { CalculationResult } from '../../engine';
import type { InputResultColumn, InputResultConfig, InputResultRow } from '../../documents/DocumentTypes';
import { useAppStore } from '../../store/appStore';
import { useCalculationStore } from '../../store/calculationStore';
import { canRunBatch, startBatch, withInputValue, type AvailableField, type BatchResults } from './batchCalculation';
import { CancelledError, type BatchHandle } from '../../store/batchClient';
import { printCaseReports } from '../../export/caseReports';

type RunState = 'not-run' | 'current' | 'stale' | 'running';

const ASSIGN = /\\coloneq\s*|:=\s*/;

function splitInput(latex: string): { number: number; unit: string } | null {
  const assignment = ASSIGN.exec(latex);
  if (!assignment) return null;
  const rhs = latex.slice(assignment.index + assignment[0].length);
  const match = /^(-?\d+(?:\.\d+)?(?:\{,\}\d+)?)/.exec(rhs);
  if (!match) return null;
  const number = Number(match[1].replace('{,}', '.'));
  if (!Number.isFinite(number)) return null;
  return { number, unit: latexUnitLabel(rhs.slice(match[1].length)) };
}

function latexUnitLabel(latex: string): string {
  return latex
    .replace(/=\s*$/, '')
    .replace(/\\(unit|mathrm|text)\{([^}]*)\}/g, '$2')
    .replace(/\\cdot/g, '·')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
    .replace(/\\degree/g, '°')
    .replace(/\^\{?2\}?/g, '²')
    .replace(/\^\{?3\}?/g, '³')
    .replace(/\^\{?4\}?/g, '⁴')
    .replace(/\\[,;:! ]/g, '')
    .replace(/[{}\\]/g, '')
    .trim();
}

function useAvailableFields(): AvailableField[] {
  const shapes = useCanvasStore((s) => s.shapes);
  const results = useCalculationStore((s) => s.results);
  return useMemo(() => {
    const maths = Object.values(shapes).filter((shape): shape is MathShape => shape.type === 'math');
    maths.sort((a, b) => {
      const ak = readingKey(a);
      const bk = readingKey(b);
      for (let i = 0; i < Math.min(ak.length, bk.length); i++) {
        if (ak[i] === bk[i]) continue;
        return ak[i]! < bk[i]! ? -1 : 1;
      }
      return ak.length - bk.length;
    });
    return maths.flatMap((shape, index) => {
      const result = results[shape.id];
      if (!result || (result.kind !== 'definition' && result.kind !== 'check')) return [];
      const parsedInput = result.kind === 'definition' && result.references.length === 0 ? splitInput(shape.props.latex) : null;
      const label = result.defines ?? (result.kind === 'check' ? `Check ${index + 1}` : `Result ${index + 1}`);
      const unit = parsedInput?.unit || result.value?.unitText || result.check?.leftValue.unitText || '';
      return [{
        regionId: shape.id,
        label,
        definitionLatex: result.definesLatex ?? label,
        unit,
        kind: parsedInput ? 'input' : result.kind === 'check' ? 'check' : 'result',
        inputValue: parsedInput?.number ?? null,
      } satisfies AvailableField];
    });
  }, [shapes, results]);
}

function NumericCell({ value, label, onCommit, fallback }: { value: number | null; label: string; onCommit(value: number | null): void; fallback?:number|null }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const normalized = draft.trim().replace(',', '.');
    const next = normalized === '' ? null : Number(normalized);
    if (next === null || Number.isFinite(next)) onCommit(next);
    setDraft(null);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      placeholder={fallback!=null ? String(fallback) : '—'}
      title={fallback!=null ? `Blank inherits worksheet value ${fallback}` : undefined}
      value={draft ?? (value ?? '')}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
      className="ir-number-input"
    />
  );
}

function fieldByRegion(fields: AvailableField[]): Map<string, AvailableField> {
  return new Map(fields.map((field) => [field.regionId, field]));
}

function nextRow(config: InputResultConfig, fields: Map<string, AvailableField>): InputResultRow {
  const previous = config.rows.at(-1);
  const values: Record<string, number | null> = {};
  for (const column of config.inputs) {
    values[column.id] = previous?.values[column.id] ?? fields.get(column.regionId)?.inputValue ?? null;
  }
  const index = config.rows.length + 1;
  return { id: `case-${Date.now().toString(36)}-${index}`, name: `Case ${index}`, values };
}

function outputText(result: CalculationResult | undefined, labels?: Record<string,string>): { text: string; status: 'normal' | 'pass' | 'fail' | 'error' } {
  if (!result) return { text: '—', status: 'normal' };
  if (result.status === 'error') return { text: 'Error', status: 'error' };
  if (result.check) return { text: result.check.pass ? 'PASS' : 'FAIL', status: result.check.pass ? 'pass' : 'fail' };
  const label=result.value && labels?.[String(result.value.number)];
  if(label) return {text:label,status:label==='PASS'?'pass':label==='FAIL'?'fail':'normal'};
  const value = result.value;
  if (!value) return { text: '—', status: 'normal' };
  const suffix = value.unitText === '°' ? '°' : value.unitText ? ` ${value.unitText}` : '';
  return { text: suffix && value.text.endsWith(suffix) ? value.text.slice(0, -suffix.length) : value.text, status: 'normal' };
}

function ColumnPicker({ fields, config, onClose, onSave }: { fields: AvailableField[]; config: InputResultConfig; onClose(): void; onSave(next: InputResultConfig): void }) {
  const [inputs, setInputs] = useState<InputResultColumn[]>(config.inputs);
  const [outputs, setOutputs] = useState<InputResultColumn[]>(config.outputs);
  const inputCandidates = fields.filter((field) => field.kind === 'input');
  const outputCandidates = fields;

  const toggle = (field: AvailableField, kind: 'input' | 'output') => {
    const columns = kind === 'input' ? inputs : outputs;
    const setColumns = kind === 'input' ? setInputs : setOutputs;
    const exists = columns.some((column) => column.regionId === field.regionId);
    setColumns(exists
      ? columns.filter((column) => column.regionId !== field.regionId)
      : [...columns, { id: `${kind}-${field.regionId}`, regionId: field.regionId, label: field.label }]);
  };

  const rename = (kind: 'input' | 'output', regionId: string, label: string) => {
    const columns = kind === 'input' ? inputs : outputs;
    const setColumns = kind === 'input' ? setInputs : setOutputs;
    setColumns(columns.map((column) => column.regionId === regionId ? { ...column, label } : column));
  };

  const panel = (title: string, kind: 'input' | 'output', candidates: AvailableField[], columns: InputResultColumn[]) => (
    <fieldset className="min-h-0 rounded-lg border border-border bg-card">
      <legend className="mx-3 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-primary">{title}</legend>
      <div className="max-h-[52vh] overflow-y-auto p-2">
        {candidates.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">No eligible worksheet regions.</p>
        ) : candidates.map((field) => {
          const selected = columns.find((column) => column.regionId === field.regionId);
          return (
            <label key={field.regionId} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted">
              <input type="checkbox" checked={!!selected} onChange={() => toggle(field, kind)} className="h-4 w-4 accent-docs-blue" />
              <span className="w-24 shrink-0 truncate text-[13px] font-medium text-foreground" title={field.label}>{field.label}</span>
              {selected ? (
                <input
                  aria-label={`Display label for ${field.label}`}
                  value={selected.label}
                  onClick={(event) => event.preventDefault()}
                  onChange={(event) => rename(kind, field.regionId, event.target.value)}
                  className="h-7 min-w-0 flex-1 rounded border border-border bg-white px-2 text-[12px] focus:border-docs-blue focus:outline-none"
                />
              ) : <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">Select to include</span>}
              <span className="w-16 shrink-0 truncate text-right text-[11px] text-docs-blue" title={field.unit}>{field.unit || '—'}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="column-picker-title" className="flex max-h-[82vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-background shadow-xl">
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <Columns3 size={18} className="text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="column-picker-title" className="text-[15px] font-semibold text-foreground">Configure Table In&Out columns</h2>
            <p className="text-[12px] text-muted-foreground">Units are inherited from the worksheet. Batch cells contain numbers only.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close column settings" className="docs-tb-btn"><X size={17} aria-hidden /></button>
        </header>
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-4 md:grid-cols-2">
          {panel('Inputs · editable', 'input', inputCandidates, inputs)}
          {panel('Outputs · read only', 'output', outputCandidates, outputs)}
        </div>
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="ir-secondary-button">Cancel</button>
          <button type="button" onClick={() => onSave({ ...config, inputs, outputs })} className="ir-primary-button">Apply columns</button>
        </footer>
      </section>
    </div>
  );
}

export function InputResultsPage() {
  const config = useAppStore((s) => s.inputResult);
  const settings = useAppStore((s) => s.settings);
  const updateConfig = useAppStore((s) => s.updateInputResult);
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const shapes = useCanvasStore((s) => s.shapes);
  const fields = useAvailableFields();
  const fieldsMap = useMemo(() => fieldByRegion(fields), [fields]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResults>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Results belong to the exact worksheet and table they were calculated from:
  // any later change (inputs, columns, formulas, settings) makes them outdated.
  const documentId = useAppStore((s) => s.documentId);
  // Only what the calculation depends on: each region's formula, units and
  // precision in reading order. Measuring, moving without reordering, or just
  // switching tabs does not make results outdated.
  const worksheetSignature = useMemo(() => JSON.stringify(worksheetRegions(shapes).sort((a, b) => compareOrderKeys((a.input.order ?? []) as OrderKey, (b.input.order ?? []) as OrderKey)).map((r) => [r.id, r.input.latex, r.input.displayUnit, r.input.precision])), [shapes]);
  const revision = useMemo(
    () => JSON.stringify([documentId, worksheetSignature, settings.unitSystem, settings.precision, config.inputs, config.outputs, config.rows.map((r) => [r.id, r.values])]),
    [documentId, worksheetSignature, settings.unitSystem, settings.precision, config.inputs, config.outputs, config.rows],
  );
  const [resultRevision, setResultRevision] = useState<string | null>(null);
  const runState: RunState = running ? 'running' : resultRevision === null ? 'not-run' : resultRevision === revision ? 'current' : 'stale';
  const job = useRef<BatchHandle | null>(null);
  useEffect(() => () => job.current?.cancel(), []);

  const changeConfig = (next: InputResultConfig) => updateConfig(next);

  const setInput = (rowId: string, columnId: string, value: number | null) => {
    changeConfig({
      ...config,
      rows: config.rows.map((row) => row.id === rowId ? { ...row, values: { ...row.values, [columnId]: value } } : row),
    });
  };

  const runAll = async () => {
    job.current?.cancel();
    const startedFrom = revision;
    setRunning(true);
    setBatchResults({});
    setProgress({ done: 0, total: config.rows.length });
    const handle = startBatch(config, fieldsMap, shapes, settings, {
      onRow: (rowId, result) => {
        if (job.current !== handle) return;
        setBatchResults((prev) => ({ ...prev, [rowId]: result }));
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      },
    });
    job.current = handle;
    try {
      const all = await handle.done;
      if (job.current !== handle) return;
      setBatchResults(all);
      // Marked for the inputs it was started with: edits made meanwhile show as outdated.
      setResultRevision(startedFrom);
    } catch (e) {
      if (e instanceof CancelledError || job.current !== handle) return;
      useAppStore.getState().showToast('error', `Batch calculation failed: ${(e as Error).message}`);
      setResultRevision(null);
    } finally {
      if (job.current === handle) {
        job.current = null;
        setRunning(false);
      }
    }
  };

  // Reports: every region of the chosen cases is calculated now (detail), printed, then dropped.
  const [printing, setPrinting] = useState(false);
  const printReports = async (rowIds?: string[]) => {
    const rows = rowIds ? config.rows.filter((row) => rowIds.includes(row.id)) : config.rows;
    if (!rows.length) return;
    setPrinting(true);
    try {
      const results = await startBatch(config, fieldsMap, shapes, settings, { detail: true, rowIds: rows.map((row) => row.id) }).done;
      await printCaseReports(config, fieldsMap, rows, results);
    } catch (e) {
      useAppStore.getState().showToast('error', `Report failed: ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  };

  const openSource = (regionId: string) => {
    setWorkspace('calculation');
    requestAnimationFrame(() => revealShape(regionId));
  };

  // Row selection and its right-click menu.
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ rowId: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && (e.target as Element | null)?.closest('[data-testid=row-menu]')) return;
      setMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  /** Back to the calculation sheet with this case's values in the bound inputs (one undo step). */
  const showCaseOnSheet = (rowId: string) => {
    const row = config.rows.find((r) => r.id === rowId);
    if (!row) return;
    const { shapes: current } = useCanvasStore.getState();
    const patches: Record<string, { props: { latex: string } }> = {};
    for (const column of config.inputs) {
      const value = row.values[column.id];
      const shape = current[column.regionId];
      if (value === null || value === undefined || shape?.type !== 'math' || fieldsMap.get(column.regionId)?.kind !== 'input') continue;
      const latex = withInputValue(shape.props.latex, value);
      if (latex !== shape.props.latex) patches[shape.id] = { props: { latex } };
    }
    if (Object.keys(patches).length) updateShapes(patches);
    setWorkspace('calculation');
    const ids = config.inputs.map((c) => c.regionId).filter((id) => current[id]);
    requestAnimationFrame(() => {
      if (ids[0]) revealShape(ids[0]);
      select(ids);
    });
    useAppStore.getState().showToast('info', `${row.name}: its input values are now on the worksheet (Ctrl+Z to undo).`);
  };

  const canCalculate = canRunBatch(config,fieldsMap);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="input-results-page">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2.5">
        <div className="min-w-[220px] flex-1">
          <input
            aria-label="Input and results table title"
            value={config.title}
            onChange={(event) => updateConfig({ ...config, title: event.target.value })}
            className="h-8 max-w-[420px] rounded border border-transparent bg-transparent px-2 text-[15px] font-semibold text-foreground hover:border-border focus:border-docs-blue focus:outline-none"
          />
          <p className="px-2 text-[11px] text-muted-foreground">Blank cells inherit worksheet inputs. Edit values, then run the table.</p>
        </div>
        <div className="flex items-center gap-2">
          {runState === 'stale' && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-warning"><AlertTriangle size={14} aria-hidden /> Results outdated</span>}
          <button type="button" onClick={() => setPickerOpen(true)} className="ir-secondary-button"><Settings2 size={15} aria-hidden /> Columns</button>
          <button
            type="button"
            onClick={() => changeConfig({ ...config, rows: [...config.rows, nextRow(config, fieldsMap)] })}
            disabled={config.inputs.length === 0}
            className="ir-secondary-button"
          >
            <Plus size={15} aria-hidden /> Add row
          </button>
          <button type="button" onClick={() => void printReports()} disabled={!canCalculate || printing} className="ir-secondary-button" data-testid="print-reports" title="Summary of all cases, then the full worksheet for each case (PDF / print)">
            <Printer size={15} aria-hidden /> {printing ? 'Preparing…' : 'Print reports'}
          </button>
          <button type="button" onClick={() => void runAll()} disabled={!canCalculate || runState === 'running'} className="ir-primary-button" data-testid="calculate-all-batch">
            <Calculator size={16} aria-hidden /> {runState === 'running' ? `Calculating ${progress.done}/${progress.total}…` : 'Calculate All'}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4" role="region" aria-label="Batch calculation table" tabIndex={0}>
        {config.inputs.length === 0 && config.outputs.length === 0 ? (
          <div className="mx-auto mt-16 max-w-lg rounded-xl border border-dashed border-border-strong bg-card px-8 py-10 text-center">
            <Columns3 size={28} className="mx-auto text-primary" aria-hidden />
            <h2 className="mt-3 text-[16px] font-semibold text-foreground">Build the batch table from this worksheet</h2>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">Choose existing definitions as Inputs and existing calculations or checks as Results. Units are inherited automatically.</p>
            <button type="button" onClick={() => setPickerOpen(true)} className="ir-primary-button mt-5"><Settings2 size={16} aria-hidden /> Configure columns</button>
          </div>
        ) : (
          <div className="inline-block overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <table
              className="ir-data-table"
              data-testid="input-results-table"
              style={{ width: `${284 + (config.inputs.length + config.outputs.length) * 104}px` }}
            >
              <colgroup>
                <col style={{ width: 112 }} />
                {config.inputs.map((column) => <col key={`input-width-${column.id}`} style={{ width: 104 }} />)}
                {config.outputs.map((column) => <col key={`output-width-${column.id}`} style={{ width: 104 }} />)}
                <col style={{ width: 104 }} />
                <col style={{ width: 68 }} />
              </colgroup>
              <thead>
                <tr className="ir-group-row">
                  <th rowSpan={2} className="ir-case-column">Case</th>
                  <th colSpan={Math.max(1, config.inputs.length)} className="ir-input-group">Inputs</th>
                  <th colSpan={Math.max(1, config.outputs.length)} className="ir-output-group">Results</th>
                  <th rowSpan={2} className="ir-status-column">Status</th>
                  <th rowSpan={2} className="ir-action-column"><span className="sr-only">Actions</span></th>
                </tr>
                <tr className="ir-column-row">
                  {config.inputs.length ? config.inputs.map((column) => {
                    const field = fieldsMap.get(column.regionId);
                    return <th key={column.id} className="ir-data-column ir-input-column"><button type="button" onClick={() => openSource(column.regionId)} title="Open source definition"><span>{column.label}</span><small>{field?.unit || '—'}</small></button></th>;
                  }) : <th className="ir-data-column">—</th>}
                  {config.outputs.length ? config.outputs.map((column) => {
                    const field = fieldsMap.get(column.regionId);
                    return <th key={column.id} className="ir-data-column ir-output-column"><button type="button" onClick={() => openSource(column.regionId)} title="Open source calculation"><span>{column.label}</span><small>{field?.unit || (field?.kind === 'check' ? 'PASS / FAIL' : '—')}</small><ExternalLink size={11} aria-hidden /></button></th>;
                  }) : <th className="ir-data-column">—</th>}
                </tr>
              </thead>
              <tbody>
                {config.rows.length === 0 ? (
                  <tr><td colSpan={config.inputs.length + config.outputs.length + 3} className="px-4 py-12 text-center text-[13px] text-muted-foreground">Add a row to enter the first case.</td></tr>
                ) : config.rows.map((row) => {
                  const rowResults = batchResults[row.id]?.outputs ?? {};
                  const rowDone = runState === 'running' && !!batchResults[row.id];
                  const hasError = (runState === 'current' || rowDone) && config.outputs.some((column) => rowResults[column.id]?.status === 'error');
                  return (
                    <tr
                      key={row.id}
                      data-testid="case-row"
                      aria-selected={selectedRow === row.id}
                      className={selectedRow === row.id ? 'is-selected' : undefined}
                      onPointerDown={() => setSelectedRow(row.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setSelectedRow(row.id);
                        setMenu({ rowId: row.id, x: event.clientX, y: event.clientY });
                      }}
                    >
                      <td className="ir-case-cell">
                        <input
                          aria-label={`Name of ${row.name}`}
                          value={row.name}
                          onChange={(event) => updateConfig({ ...config, rows: config.rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item) })}
                          className="ir-case-input"
                        />
                      </td>
                      {config.inputs.map((column) => <td key={column.id} className="ir-input-cell"><NumericCell value={row.values[column.id] ?? null} fallback={fieldsMap.get(column.regionId)?.inputValue} label={`${row.name}, ${column.label}`} onCommit={(value) => setInput(row.id, column.id, value)} /></td>)}
                      {config.outputs.map((column) => {
                        const result = outputText(rowResults[column.id],column.valueLabels);
                        const outdated = runState === 'stale';
                        return <td key={column.id} className={`ir-output-cell ${outdated ? 'is-outdated' : ''}`} title={rowResults[column.id]?.error?.message}><span className={`ir-result ir-result--${result.status}`}>{runState === 'not-run' ? '—' : result.text}</span></td>;
                      })}
                      <td className="ir-status-cell">
                        {runState === 'not-run' && <span className="ir-status">Not calculated</span>}
                        {runState === 'stale' && <span className="ir-status ir-status--warning"><AlertTriangle size={12} aria-hidden /> Outdated</span>}
                        {runState === 'running' && !rowDone && <span className="ir-status">Queued</span>}
                        {(runState === 'current' || rowDone) && (hasError
                          ? <span className="ir-status ir-status--error"><X size={12} aria-hidden /> Error</span>
                          : <span className="ir-status ir-status--current"><Check size={12} aria-hidden /> Current</span>)}
                      </td>
                      <td className="ir-action-cell"><button type="button" aria-label={`Report for ${row.name}`} title="Print the worksheet for this case" data-testid="print-case" disabled={!canCalculate || printing} onClick={() => void printReports([row.id])} className="docs-tb-btn"><Printer size={14} aria-hidden /></button><button type="button" aria-label={`Delete ${row.name}`} onClick={() => changeConfig({ ...config, rows: config.rows.filter((item) => item.id !== row.id) })} className="docs-tb-btn"><Trash2 size={14} aria-hidden /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {menu && (() => {
        const row = config.rows.find((r) => r.id === menu.rowId);
        if (!row) return null;
        const item = (label: string, onSelect: () => void, disabled = false) => (
          <button type="button" role="menuitem" disabled={disabled} className="ir-menu-item" onClick={() => { setMenu(null); onSelect(); }}>{label}</button>
        );
        return (
          <div role="menu" aria-label={`${row.name} actions`} data-testid="row-menu" className="ir-menu" style={{ left: Math.min(menu.x, window.innerWidth - 260), top: Math.min(menu.y, window.innerHeight - 160) }}>
            {item(`Show ${row.name} in CalcCanvas`, () => showCaseOnSheet(row.id), config.inputs.some((c) => row.values[c.id] === null))}
            {item('Go to CalcCanvas', () => setWorkspace('calculation'))}
            <div className="ir-menu-sep" role="separator" />
            {item(`Print report for ${row.name}`, () => void printReports([row.id]), !canCalculate || printing)}
            {item(`Delete ${row.name}`, () => changeConfig({ ...config, rows: config.rows.filter((r) => r.id !== row.id) }))}
          </div>
        );
      })()}

      {pickerOpen && <ColumnPicker fields={fields} config={config} onClose={() => setPickerOpen(false)} onSave={(next) => {
        const nextFieldMap = fieldByRegion(fields);
        const rows = (next.rows.length ? next.rows : [nextRow(next, nextFieldMap)]).map((row) => ({
          ...row,
          values: Object.fromEntries(next.inputs.map((column) => [column.id, row.values[column.id] ?? nextFieldMap.get(column.regionId)?.inputValue ?? null])),
        }));
        changeConfig({ ...next, rows });
        setPickerOpen(false);
      }} />}
    </div>
  );
}
