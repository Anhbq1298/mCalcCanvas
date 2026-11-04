/**
 * Left "Parameters" panel: every variable defined on the worksheet, in
 * reading order, with its current value. Inputs (plain numbers with a unit)
 * can be edited here; clicking a row jumps to its region.
 */
import { AlertCircle, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { revealShape } from '../../canvas/canvasActions';
import { updateShape, useCanvasStore } from '../../canvas/model/canvasStore';
import type { MathShape } from '../../canvas/model/types';
import type { CalculationResult } from '../../engine';
import { MathRenderer } from '../../math/MathRenderer';
import { useCalculationStore } from '../../store/calculationStore';

type Filter = 'all' | 'inputs' | 'results' | 'issues';

interface Row {
  id: string;
  shape: MathShape;
  result: CalculationResult | undefined;
  /** For editable inputs: the number at the start of the right-hand side. */
  input: { number: string; before: string; after: string } | null;
  kind: 'input' | 'result' | 'check' | 'issue';
}

const ASSIGN = /\\coloneq\s*|:=\s*/;

/** "L\coloneq8.5\,\mathrm{m}" → number "8.5" plus the text around it, if the RHS starts with a number. */
function splitInput(latex: string): Row['input'] {
  const m = ASSIGN.exec(latex);
  if (!m) return null;
  const head = latex.slice(0, m.index + m[0].length);
  const rhs = latex.slice(m.index + m[0].length);
  const n = /^(-?\d+(?:\.\d+)?(?:\{,\}\d+)?)/.exec(rhs);
  if (!n) return null;
  return { number: n[1].replace('{,}', '.'), before: head, after: rhs.slice(n[1].length) };
}

function useRows(): Row[] {
  const shapes = useCanvasStore((s) => s.shapes);
  const results = useCalculationStore((s) => s.results);
  return useMemo(() => {
    const maths = Object.values(shapes).filter((s): s is MathShape => s.type === 'math' && s.props.latex.trim() !== '');
    maths.sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: Row[] = [];
    for (const shape of maths) {
      const result = results[shape.id];
      const isDef = result?.kind === 'definition';
      const isCheck = result?.kind === 'check';
      const hasIssue = result?.status === 'error';
      if (!isDef && !isCheck && !hasIssue) continue;
      const input = isDef && result && result.references.length === 0 ? splitInput(shape.props.latex) : null;
      rows.push({ id: shape.id, shape, result, input, kind: hasIssue ? 'issue' : isCheck ? 'check' : input ? 'input' : 'result' });
    }
    return rows;
  }, [shapes, results]);
}

function InputValue({ row }: { row: Row }) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = row.input!;
  const commit = () => {
    if (draft === null) return;
    const v = draft.trim().replace(',', '.');
    if (/^-?\d+(\.\d+)?$/.test(v) && v !== input.number) {
      updateShape(row.id, { props: { latex: `${input.before}${v}${input.after}` } });
    }
    setDraft(null);
  };
  const unit = row.result?.value?.unitText ?? '';
  return (
    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        aria-label={`Value of ${row.result?.defines ?? 'parameter'}`}
        data-testid={`param-input-${row.result?.defines}`}
        value={draft ?? input.number}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(null);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        inputMode="decimal"
        className="h-6 w-[72px] rounded border border-docs-border bg-white px-1.5 text-right text-[13px] tabular-nums text-docs-ink hover:border-docs-sep focus:border-docs-blue focus:outline-none"
      />
      <span className="min-w-0 truncate text-[12px] text-docs-muted" title={unit}>
        {inputUnitLabel(row)}
      </span>
    </span>
  );
}

/** Unit as typed in the input (after the number), shown plainly. */
function inputUnitLabel(row: Row): string {
  const after = row.input?.after ?? '';
  const plain = after
    .replace(/=\s*$/, '')
    .replace(/\\(unit|mathrm|text)\{([^}]*)\}/g, '$2')
    .replace(/\\cdot/g, '·')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
    .replace(/\\degree/g, '°')
    .replace(/\^\{?2\}?/g, '²')
    .replace(/\^\{?3\}?/g, '³')
    .replace(/\\[,;:! ]/g, '')
    .replace(/[{}\\]/g, '')
    .trim();
  return plain;
}

export function ParametersView() {
  const rows = useRows();
  const selection = useCanvasStore((s) => s.selection);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const counts = {
    all: rows.length,
    inputs: rows.filter((r) => r.kind === 'input').length,
    results: rows.filter((r) => r.kind === 'result' || r.kind === 'check').length,
    issues: rows.filter((r) => r.kind === 'issue').length,
  };
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (filter === 'inputs' && r.kind !== 'input') return false;
    if (filter === 'results' && r.kind !== 'result' && r.kind !== 'check') return false;
    if (filter === 'issues' && r.kind !== 'issue') return false;
    if (!q) return true;
    const name = (r.result?.defines ?? '').toLowerCase().replace('_', '');
    return name.includes(q.replace('_', '')) || r.shape.props.latex.toLowerCase().includes(q);
  });

  const chip = (f: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(f)}
      aria-pressed={filter === f}
      className={
        'h-6 cursor-pointer rounded-full border px-2.5 text-[12px] transition-colors duration-150 ' +
        (filter === f ? 'border-transparent bg-docs-active text-docs-blue' : 'border-docs-border text-docs-muted hover:bg-docs-hover') +
        (f === 'issues' && counts.issues > 0 && filter !== f ? ' text-destructive' : '')
      }
    >
      {label} {counts[f] > 0 && <span className="tabular-nums">{counts[f]}</span>}
    </button>
  );

  return (
    <div data-testid="parameters-panel" className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2">
        <label className="flex h-8 items-center gap-2 rounded-full bg-docs-toolbar px-3 focus-within:bg-white focus-within:ring-1 focus-within:ring-docs-blue">
          <Search size={15} className="shrink-0 text-docs-muted" aria-hidden />
          <input
            aria-label="Search parameters"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-docs-ink placeholder:text-docs-muted focus:outline-none"
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-1">
          {chip('all', 'All')}
          {chip('inputs', 'Inputs')}
          {chip('results', 'Results')}
          {chip('issues', 'Issues')}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-docs-muted">
            {rows.length === 0 ? 'Variables you define on the page (for example L := 8.5 m) appear here.' : 'Nothing matches.'}
          </p>
        ) : (
          <ul className="space-y-px" data-testid="param-list">
            {visible.map((r) => {
              const selected = selection.includes(r.id);
              const label = r.result?.definesLatex ?? (r.result?.check ? r.result.check.leftLatex : '');
              return (
                <li key={r.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="param-row"
                    data-name={r.result?.defines ?? ''}
                    onClick={() => revealShape(r.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && revealShape(r.id)}
                    className={
                      'group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-150 ' +
                      (selected ? 'bg-docs-active' : 'hover:bg-docs-hover') +
                      (r.result?.redefines ? ' shadow-[inset_2px_0_0_var(--color-redefine)]' : '')
                    }
                    title={r.result?.redefines ? `Redefines ${r.result.redefines.name}` : undefined}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-docs-ink [&_.ML__latex]:text-[15px]">
                      {r.kind === 'issue' && <AlertCircle size={13} className="shrink-0 text-destructive" aria-label={r.result?.error?.message} />}
                      {label ? <MathRenderer latex={label} /> : <span className="truncate text-docs-muted">{r.result?.error?.message ?? 'Expression'}</span>}
                    </span>
                    <span className="flex min-w-0 items-center justify-end">
                      {r.kind === 'input' ? (
                        <InputValue row={r} />
                      ) : r.kind === 'check' && r.result?.check ? (
                        <span
                          className={'rounded-sm px-1.5 py-px text-[11px] font-semibold text-white ' + (r.result.check.pass ? 'bg-success' : 'bg-destructive')}
                        >
                          {r.result.check.leftValue.text} {r.result.check.pass ? 'PASS' : 'FAIL'}
                        </span>
                      ) : r.kind === 'issue' ? (
                        <span className="truncate text-[12px] text-destructive" title={r.result?.error?.message}>
                          error
                        </span>
                      ) : (
                        <span className="truncate text-[13px] tabular-nums text-docs-ink" data-testid="param-value" title={r.result?.value?.dimension}>
                          {r.result?.value?.text}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
