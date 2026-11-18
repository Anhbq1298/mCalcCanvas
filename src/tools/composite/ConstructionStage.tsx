import { useEffect, useRef, useState } from 'react';
import { legacyBracing, validateBracing, type ConstructionBracing, type InputField, type LoadTable, type Results } from './model';
import { ConstructionBraceElevation } from './charts';
import { fmt } from './format';
import type { ToWorker } from './worker';

export function ConstructionStage({ inputs, values, tables, sectionId, bracing, initialResults, onSave, onClose }: {
  inputs: InputField[]; values: Record<string, number>; tables: LoadTable[]; sectionId: number;
  bracing: ConstructionBracing; initialResults: Results; onSave: (v: Record<string, number>, b: ConstructionBracing) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(values);
  const [b, setB] = useState(() => ({ ...bracing, positions: [...bracing.positions] }));
  const [selected, select] = useState<number | null>(null);
  const [summary, setSummary] = useState<Results>(initialResults);
  const request = useRef(0);
  const [pending, setPending] = useState(true);
  const [worker] = useState(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
  const get = (name: string) => { const f = inputs.find((x) => x.name === name); return f ? draft[f.id] ?? f.value : 0; };
  const L = get('L');
  const error = validateBracing(b, L);
  useEffect(() => { ref.current?.showModal(); return () => worker.terminate(); }, [worker]);
  useEffect(() => {
    const revision = ++request.current;
    const listener = (e: MessageEvent<{ kind: string; request: number; results: Results }>) => {
      if (e.data.kind === 'preview' && e.data.request === revision) { setSummary(e.data.results); setPending(false); }
    };
    worker.addEventListener('message', listener);
    const timer = setTimeout(() => {
      setPending(true);
      worker.postMessage({ kind: 'preview', request: revision, sectionId, values: draft, tables: tables.map((t) => ({ id: t.id, rows: t.rows })), bracing: b } satisfies ToWorker);
    }, 180);
    return () => { clearTimeout(timer); worker.removeEventListener('message', listener); };
  }, [worker, draft, b, tables, sectionId]);
  const positions = [...b.positions].sort((a, c) => a - c);
  const spacing = Math.max(...[0, ...positions, L].slice(1).map((x, i) => x - [0, ...positions][i]));
  const update = (i: number, x: number) => {
    const next = b.positions.map((v, j) => j === i ? x : v).sort((a, c) => a - c);
    select(next.indexOf(x)); setB({ ...b, mode: 'explicit', positions: next });
  };
  const hA = summary.hA, hB = summary.hB;
  return <dialog ref={ref} className="opt-dialog wide" aria-labelledby="construction-title" onCancel={onClose}>
    <div className="opt-form"><div className="opt-head"><h2 id="construction-title">Define Construction Stage</h2></div>
    <div className="fields">{inputs.filter((f) => /Construction stage/.test(f.group)).map((f) => <label className="f" key={f.id}>
      <span>{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
      {f.name === 'c_{NA}' ? <select aria-label={f.name} value={(draft[f.id] ?? f.value) >= 1 ? '1' : '0'} onChange={(e) => setDraft({ ...draft, [f.id]: Number(e.target.value) })}>
        <option value="1">Singapore NA</option><option value="0">EN recommended values</option>
      </select> : f.name === 'c_{brace}' ? <input type="checkbox" aria-label={f.name} disabled={b.mode === 'explicit'} checked={(draft[f.id] ?? f.value) >= 1} onChange={(e) => setDraft({ ...draft, [f.id]: e.target.checked ? 1 : 0 })} /> : (
      <input className="num-input" type="number" step="any" disabled={b.mode === 'explicit' && ['c_{brace}', 'k_{LT}'].includes(f.name)} aria-label={f.name} value={draft[f.id] ?? f.value} onChange={(e) => setDraft({ ...draft, [f.id]: e.target.valueAsNumber })} />
      )}
    </label>)}</div>
    <label className="f"><span>Restraint model</span><select aria-label="Restraint model" value={b.mode} onChange={(e) => setB({ ...b, mode: e.target.value === 'legacy' ? 'legacy' : 'explicit' })}>
      <option value="legacy">Legacy kLT fork approximation</option><option value="explicit">Explicit top-flange lateral braces</option>
    </select></label>
    <p className="hint">Legacy c_brace / kLT generates equally spaced forks. Explicit mode uses only the saved top-flange stations; kLT is ignored.</p>
    {b.mode === 'explicit' && <>
      <label><input type="checkbox" checked={b.enabled} onChange={(e) => setB({ ...b, enabled: e.target.checked })} /> Enable temporary lateral bracing</label>
      {!b.enabled && <p className="hint">Stored brace stations are disabled and excluded from the calculation.</p>}
      <ConstructionBraceElevation L={L} hA={hA} hB={hB} positions={b.positions} selected={selected} onSelect={select} />
      <table className="load-table"><colgroup>{[8, 25, 18, 41, 8].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup><thead><tr><th>ID</th><th>Position x (m)</th><th>x/L</th><th>Restraint type</th><th /></tr></thead><tbody>
        {b.positions.map((x, i) => <tr key={i} style={selected === i ? { background: '#e8eefb' } : undefined} onClick={() => select(i)}>
          <td>B{i + 1}</td><td><input className="num-input" aria-label={`B${i + 1} position`} type="number" step="any" value={Number.isFinite(x) ? Number(x.toPrecision(12)) : ''} onChange={(e) => update(i, e.target.valueAsNumber)} /></td>
          <td><input className="num-input" aria-label={`B${i + 1} normalized position`} type="number" step="any" value={Number.isFinite(x) ? Number((x / L).toPrecision(12)) : ''} onChange={(e) => update(i, e.target.valueAsNumber * L)} /></td>
          <td>Top flange lateral</td><td><button type="button" className="rowbtn" aria-label={`Delete B${i + 1}`} onClick={(e) => { e.stopPropagation(); setB({ ...b, positions: b.positions.filter((_, j) => i !== j) }); select(null); }}>&times;</button></td>
        </tr>)}
      </tbody></table>
      <button type="button" className="btn" onClick={() => { const stations = [0, ...positions.filter((x) => Number.isFinite(x) && x > 0 && x < L), L]; let j = 0; for (let i = 1; i < stations.length - 1; i++) if (stations[i + 1] - stations[i] > stations[j + 1] - stations[j]) j = i; setB({ ...b, positions: [...positions, (stations[j] + stations[j + 1]) / 2].sort((a, c) => a - c) }); }}>Add brace</button>
    </>}
    {error && <p role="alert">{error}</p>}
    <p>Span {fmt(L, 3)} m; {b.positions.length} intermediate braces; maximum geometric station spacing {fmt(spacing, 3)} m (not an effective LTB length).</p>
    <p role="status">{pending ? 'Calculating draft...' : <>Draft: Mcr.LT {fmt(summary['Mcr.LT'] ?? summary.McrSheet, 3)} kNm; acr.LT {fmt(summary?.['acr.LT'] ?? NaN, 3)}; UR.LT {fmt(summary?.['UR.LT'] ?? NaN, 3)}.</>}</p>
    {summary && !Number.isFinite(summary['Mcr.LT']) && <p className="hint">Worksheet / continuous deck restraint governs. Discrete braces do not control this result.</p>}
    <p className="hint">Continuous transverse deck restraint takes precedence over discrete temporary braces. Lateral braces provide no vertical support.</p>
    <div className="opt-buttons"><button type="button" className="btn primary" disabled={!!error || Object.values(draft).some((v) => !Number.isFinite(v))} onClick={() => { onSave(draft, b); onClose(); }}>Save</button>
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="button" className="btn" onClick={() => { setDraft({ ...values, ...Object.fromEntries(inputs.filter((f) => /Construction stage/.test(f.group)).map((f) => [f.id, f.value])) }); setB(legacyBracing()); }}>Reset</button></div>
    </div>
  </dialog>;
}
