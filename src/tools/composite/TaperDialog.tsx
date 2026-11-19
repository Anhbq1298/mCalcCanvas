import { useEffect, useRef, useState } from 'react';
import { taperStations, type TaperProfile } from './model';
import { fmt } from './format';

interface Pt { x: number; h: number }

/**
 * Tapered beam depth profile as points: the depth h at a distance x from support A. Support A (x = 0) and
 * support B (x = L) are always points; the depth is linear between neighbouring points. Stored as segments with
 * absolute lengths and a last proportional one, so the interior points keep their distances from A when L changes.
 */
export function TaperDialog({ L, hA, hB, hLib, sectionName, profile, onSave, onClose }: {
  L: number; hA: number; hB: number; hLib: number; sectionName: string; profile: TaperProfile;
  onSave: (hA: number, hB: number, p: TaperProfile) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pts, setPts] = useState<Pt[]>(() => {
    const st = taperStations(profile, L, hA, hB);
    return st.x.map((x, i) => ({ x, h: st.h[i] }));
  });
  useEffect(() => { ref.current?.showModal(); }, []);

  const last = pts.length - 1;
  const interior = pts.slice(1, -1);
  const xs = interior.map((p) => p.x);
  const error = pts.some((p) => !(p.h > 0)) ? 'Every depth must be positive.'
    : interior.some((p) => !(p.x > 0 && p.x < L)) ? `Each point must lie between the supports: 0 < x < ${fmt(L, 3)} m.`
      : new Set(xs.map((x) => x.toFixed(6))).size < xs.length ? 'Two points are at the same x.' : null;
  const note = !error && pts.some((p) => p.h > hLib + 1e-9) ? `Depths above the library depth (${fmt(hLib, 1)} mm) are limited to it.` : null;

  const set = (i: number, g: Partial<Pt>) => setPts(pts.map((p, j) => (j === i ? { ...p, ...g } : p)));
  // a new point in the middle of the longest gap, at the depth of the straight line there
  const add = () => {
    const s = [...pts].sort((a, b) => a.x - b.x);
    let k = 0;
    for (let i = 1; i < s.length - 1; i++) if (s[i + 1].x - s[i].x > s[k + 1].x - s[k].x) k = i;
    const x = Math.round(((s[k].x + s[k + 1].x) / 2) * 1000) / 1000;
    setPts([...s.slice(0, k + 1), { x, h: Math.round((s[k].h + s[k + 1].h) / 2) }, ...s.slice(k + 1)]);
  };
  const remove = (i: number) => setPts(pts.filter((_, j) => j !== i));
  const save = () => {
    const s = [...pts].sort((a, b) => a.x - b.x);
    // interior points: absolute lengths from point to point; the last segment proportional (to support B)
    const segments = s.length < 3 ? [] : s.slice(1).map((p, i) => (i === s.length - 2
      ? { type: 'prop' as const, length: 1, h: p.h }
      : { type: 'abs' as const, length: p.x - s[i].x, h: p.h }));
    onSave(s[0].h, s[s.length - 1].h, { segments });
    onClose();
  };

  // elevation preview: depth to scale, span to the box
  const W = 640, H = 170, pad = 34, top = 30;
  const sorted = [...pts].filter((p) => p.x >= 0 && p.x <= L && p.h > 0).sort((a, b) => a.x - b.x);
  const hs = sorted.map((p) => Math.min(p.h, hLib));
  const ky = (H - top - 40) / Math.max(...hs, 1);
  const X = (x: number) => pad + ((W - 2 * pad) * x) / L;
  const poly = sorted.map((p, i) => [X(p.x), top + hs[i] * ky] as const);

  return <dialog ref={ref} className="opt-dialog wide taper-dialog" aria-labelledby="taper-title" onCancel={onClose} data-testid="taper-dialog">
    <div className="opt-form">
      <div className="opt-head"><h2 id="taper-title">Tapered beam — depth profile</h2>
        <button type="button" className="rowbtn" aria-label="Close" onClick={onClose}>×</button></div>
      <p className="hint">Give the depth h at each distance x from support A. The depth is linear between points; flanges and web thickness stay as {sectionName || 'the library section'} (library depth {fmt(hLib, 1)} mm, L = {fmt(L, 3)} m).</p>

      <svg className="taper-preview" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Elevation of the depth profile" data-testid="taper-preview">
        <line x1={X(0)} x2={X(L)} y1={top} y2={top} className="tp-flange" />
        {poly.length > 1 && <polygon points={[[X(0), top] as const, ...poly, [X(L), top] as const].map(([x, y]) => `${x},${y}`).join(' ')} className="tp-web" />}
        {poly.length > 1 && <polyline points={poly.map(([x, y]) => `${x},${y}`).join(' ')} className="tp-flange" fill="none" />}
        {sorted.map((p, i) => <g key={i}>
          <line x1={X(p.x)} x2={X(p.x)} y1={top - 6} y2={top + hs[i] * ky} className="tp-vertex" />
          <text x={X(p.x)} y={top + hs[i] * ky + 14} textAnchor={i === 0 ? 'start' : i === sorted.length - 1 ? 'end' : 'middle'} className="tp-label">{fmt(hs[i], 0)}</text>
          <text x={X(p.x)} y={H - 4} textAnchor={i === 0 ? 'start' : i === sorted.length - 1 ? 'end' : 'middle'} className="tp-dim">{fmt(p.x, 2)}</text>
        </g>)}
        <text x={X(0)} y={14} className="tp-dim">A</text><text x={X(L)} y={14} textAnchor="end" className="tp-dim">B</text>
      </svg>

      <table className="load-table taper-table" data-testid="taper-table">
        <colgroup>{[30, 32, 30, 8].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <thead><tr><th>Point</th><th>x from A (m)</th><th>h (mm)</th><th /></tr></thead>
        <tbody>{pts.map((p, i) => {
          const end = i === 0 || i === last;
          return <tr key={i}>
            <td>{i === 0 ? 'Support A' : i === last ? 'Support B' : `Point ${i}`}</td>
            <td>{end ? <span className="ro">{fmt(i === 0 ? 0 : L, 3)}</span>
              : <input className="num-input" type="number" step="any" aria-label={`Point ${i} x`} value={Number.isFinite(p.x) ? p.x : ''} onChange={(e) => set(i, { x: e.target.valueAsNumber })} />}</td>
            <td><input className="num-input" type="number" step="any" aria-label={i === 0 ? 'Depth at A' : i === last ? 'Depth at B' : `Point ${i} h`} value={Number.isFinite(p.h) ? p.h : ''} onChange={(e) => set(i, { h: e.target.valueAsNumber })} /></td>
            <td>{!end && <button type="button" className="rowbtn" aria-label={`Delete point ${i}`} onClick={() => remove(i)}>&times;</button>}</td>
          </tr>;
        })}</tbody>
      </table>
      <div className="taper-tools">
        <button type="button" className="btn" data-testid="taper-add" onClick={add}>+ Add point</button>
      </div>
      {(error || note) && <p role="alert" className={error ? 'fail' : 'hint'}>{error ?? note}</p>}
      <div className="opt-buttons">
        <button type="button" className="btn primary" data-testid="taper-save" disabled={!!error} onClick={save}>OK</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  </dialog>;
}
