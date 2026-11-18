import { useEffect, useRef, useState } from 'react';
import { taperLengths, type TaperProfile, type TaperSegment } from './model';
import { fmt } from './format';

/**
 * Tapered (nonprismatic) section, ETABS-style: the depth h_A at support A, then segments, each with a length
 * (absolute in m, or proportional: a share of what the absolute lengths leave of the span) and its end depth;
 * the last segment ends at support B (h_B). Depths are limited to the library depth.
 */
export function TaperDialog({ L, hA, hB, hLib, sectionName, profile, onSave, onClose }: {
  L: number; hA: number; hB: number; hLib: number; sectionName: string; profile: TaperProfile;
  onSave: (hA: number, hB: number, p: TaperProfile) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [start, setStart] = useState(hA);
  // one segment (linear A to B) when there is no profile yet; the last end depth is h_B
  const [segs, setSegs] = useState<TaperSegment[]>(() => (profile.segments.length
    ? profile.segments.map((g, i, a) => ({ ...g, h: i === a.length - 1 ? hB : g.h }))
    : [{ type: 'prop', length: 1, h: hB }]));
  const [sel, setSel] = useState(segs.length - 1);
  useEffect(() => { ref.current?.showModal(); }, []);

  const lens = taperLengths({ segments: segs }, L);
  const error = typeof lens === 'string' ? lens
    : start > hLib + 1e-9 || segs.some((g) => g.h > hLib + 1e-9) ? `Depths above the library depth (${fmt(hLib, 1)} mm) are limited to it.` : null;
  const blocking = typeof lens === 'string' || !(start > 0);
  const xs = typeof lens === 'string' ? null : lens.reduce<number[]>((a, l) => [...a, a[a.length - 1] + l], [0]);
  const hs = [start, ...segs.map((g) => g.h)].map((h) => Math.min(h, hLib));

  const set = (i: number, g: Partial<TaperSegment>) => setSegs(segs.map((s, j) => (j === i ? { ...s, ...g } : s)));
  const insert = (i: number, g: TaperSegment) => { const next = [...segs]; next.splice(i, 0, g); setSegs(next); setSel(i); };
  const remove = (i: number) => { if (segs.length < 2) return; const next = segs.filter((_, j) => j !== i); if (i === segs.length - 1) next[next.length - 1] = { ...next[next.length - 1], h: segs[i].h }; setSegs(next); setSel(Math.min(i, next.length - 1)); };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= segs.length) return;
    const next = [...segs];
    [next[i], next[j]] = [next[j], next[i]];
    // the profile still ends at h_B: end depths stay with their row positions' meaning only for lengths and types
    const last = segs[segs.length - 1].h;
    next[next.length - 1] = { ...next[next.length - 1], h: last };
    setSegs(next); setSel(j);
  };
  // split the selected segment in two: same type, half its length each, a vertex at its mid depth
  const split = (i: number) => {
    const g = segs[i], h0 = i === 0 ? start : segs[i - 1].h;
    insert(i, { type: g.type, length: g.length / 2, h: Math.round((h0 + g.h) / 2) });
    setSegs((s) => s.map((x, j) => (j === i + 1 ? { ...x, length: g.length / 2 } : x)));
  };

  // elevation preview (1-2 axes, as ETABS): depth to scale, span compressed to the box
  const W = 640, H = 170, pad = 34, top = 30;
  const dMax = Math.max(...hs, 1), ky = (H - top - 40) / dMax;
  const X = (x: number) => pad + ((W - 2 * pad) * x) / L;
  const poly = xs ? xs.map((x, i) => [X(x), top + hs[i] * ky] as const) : [];

  return <dialog ref={ref} className="opt-dialog wide taper-dialog" aria-labelledby="taper-title" onCancel={onClose} data-testid="taper-dialog">
    <div className="opt-form">
      <div className="opt-head"><h2 id="taper-title">Tapered section — nonprismatic segments</h2>
        <button type="button" className="rowbtn" aria-label="Close" onClick={onClose}>×</button></div>
      <div className="fields">
        <label className="f"><span>Section</span><input value={sectionName} readOnly aria-label="Library section" /></label>
        <label className="f"><span>Library depth (mm)</span><input value={fmt(hLib, 1)} readOnly aria-label="Library depth" /></label>
        <label className="f"><span>Span L (m)</span><input value={fmt(L, 3)} readOnly aria-label="Span" /></label>
        <label className="f"><span>Depth at support A, h<sub>A</sub> (mm)</span>
          <input className="num-input" type="number" step="any" aria-label="Start depth" data-testid="taper-start" value={Number.isFinite(start) ? start : ''} onChange={(e) => setStart(e.target.valueAsNumber)} /></label>
      </div>

      <svg className="taper-preview" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Elevation of the depth profile" data-testid="taper-preview">
        <line x1={X(0)} x2={X(L)} y1={top} y2={top} className="tp-flange" />
        {poly.length > 1 && <polyline points={poly.map(([x, y]) => `${x},${y}`).join(' ')} className="tp-flange" fill="none" />}
        {poly.length > 1 && <polygon points={[[X(0), top] as const, ...poly, [X(L), top] as const].map(([x, y]) => `${x},${y}`).join(' ')} className="tp-web" />}
        {xs?.slice(1).map((x, i) => {
          const x0 = X(xs[i]), x1 = X(x);
          return <rect key={i} x={x0} y={top - 8} width={x1 - x0} height={H - top - 24} className={`tp-seg ${sel === i ? 'on' : ''}`} onClick={() => setSel(i)} />;
        })}
        {xs?.map((x, i) => <g key={i}>
          <line x1={X(x)} x2={X(x)} y1={top - 6} y2={top + hs[i] * ky} className="tp-vertex" />
          <text x={X(x)} y={top + hs[i] * ky + 14} textAnchor={i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle'} className="tp-label">{fmt(hs[i], 0)}</text>
          <text x={X(x)} y={H - 4} textAnchor={i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle'} className="tp-dim">{fmt(x, 2)}</text>
        </g>)}
        <text x={X(0)} y={14} className="tp-dim">A</text><text x={X(L)} y={14} textAnchor="end" className="tp-dim">B</text>
      </svg>

      <table className="load-table taper-table" data-testid="taper-table">
        <colgroup>{[6, 17, 17, 20, 15, 15, 10].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <thead><tr><th>#</th><th>Start depth (mm)</th><th>End depth (mm)</th><th>Length type</th><th>Length</th><th>x end (m)</th><th /></tr></thead>
        <tbody>{segs.map((g, i) => {
          const last = i === segs.length - 1;
          return <tr key={i} className={sel === i ? 'sel' : ''} onClick={() => setSel(i)}>
            <td>{i + 1}</td>
            <td className="ro">{fmt(i === 0 ? start : segs[i - 1].h, 1)}</td>
            <td><input className="num-input" type="number" step="any" aria-label={`Segment ${i + 1} end depth`} value={Number.isFinite(g.h) ? g.h : ''} onChange={(e) => set(i, { h: e.target.valueAsNumber })} />{last && <small className="hint"> = h<sub>B</sub></small>}</td>
            <td><select aria-label={`Segment ${i + 1} length type`} value={g.type} onChange={(e) => set(i, { type: e.target.value === 'abs' ? 'abs' : 'prop' })}>
              <option value="abs">Absolute (m)</option><option value="prop">Proportional</option></select></td>
            <td><input className="num-input" type="number" step="any" aria-label={`Segment ${i + 1} length`} value={Number.isFinite(g.length) ? g.length : ''} onChange={(e) => set(i, { length: e.target.valueAsNumber })} /></td>
            <td className="ro">{xs ? fmt(xs[i + 1], 3) : '—'}</td>
            <td><button type="button" className="rowbtn" aria-label={`Delete segment ${i + 1}`} disabled={segs.length < 2} onClick={(e) => { e.stopPropagation(); remove(i); }}>&times;</button></td>
          </tr>;
        })}</tbody>
      </table>
      <div className="taper-tools">
        <button type="button" className="btn" data-testid="taper-split" onClick={() => split(sel)}>Split selected segment</button>
        <button type="button" className="btn" onClick={() => insert(segs.length, { ...segs[sel] })}>Copy row and append</button>
        <button type="button" className="btn" aria-label="Move up" disabled={sel === 0} onClick={() => move(sel, -1)}>▲</button>
        <button type="button" className="btn" aria-label="Move down" disabled={sel === segs.length - 1} onClick={() => move(sel, 1)}>▼</button>
      </div>
      <p className="hint">Each segment varies linearly from its start depth to its end depth (the web; flanges and web thickness stay as the library section). Absolute lengths are in metres; proportional lengths share what the absolute ones leave of the span. The last segment ends at support B.</p>
      {error && <p role="alert" className={blocking ? 'fail' : 'hint'}>{error}</p>}
      <div className="opt-buttons">
        <button type="button" className="btn primary" data-testid="taper-save" disabled={blocking} onClick={() => { onSave(start, segs[segs.length - 1].h, { segments: segs.length < 2 ? [] : segs }); onClose(); }}>OK</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn" onClick={() => { setSegs([{ type: 'prop', length: 1, h: segs[segs.length - 1].h }]); setSel(0); }}>Linear A to B</button>
      </div>
    </div>
  </dialog>;
}
