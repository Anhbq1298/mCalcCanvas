import { useEffect, useRef, useState } from 'react';
import { SLAB_ZONE_MIN, validateSlabZones, zoneStudHeight, type SlabZone, type SlabZones } from './model';
import { fmt } from './format';

/**
 * Sunken slab: zones of the span (x from / to support A) where the slab is thinner, with the overall slab
 * thickness there. Studs in a zone with a slab of 100 mm or less are 75 mm high.
 */
export function SlabZoneDialog({ L, hc, hsc, dsc, zones, onSave, onClose }: {
  L: number; hc: number; hsc: number; dsc: number; zones: SlabZones;
  onSave: (z: SlabZones) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<SlabZone[]>(() => zones.zones.map((z) => ({ ...z })));
  useEffect(() => { ref.current?.showModal(); }, []);
  const error = validateSlabZones({ zones: rows }, L, hc);
  const set = (i: number, g: Partial<SlabZone>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...g } : r)));
  const add = () => {
    // a new zone in the middle of the longest free stretch, 1 m long (or what fits)
    const s = [...rows].sort((a, b) => a.x1 - b.x1);
    let best = [0, L], at = 0;
    for (const z of s) { if (z.x1 - at > best[1] - best[0]) best = [at, z.x1]; at = Math.max(at, z.x2); }
    if (L - at > best[1] - best[0]) best = [at, L];
    const len = Math.min(1, best[1] - best[0]), mid = (best[0] + best[1]) / 2;
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    setRows([...rows, { x1: r3(mid - len / 2), x2: r3(mid + len / 2), hc: Math.max(SLAB_ZONE_MIN, hc - 50) }]);
  };

  // plan strip and elevation: the slab over the span with the zones sunken
  const W = 640, H = 92, pad = 30, top = 20, k = 46 / Math.max(hc, 1);
  const X = (x: number) => pad + ((W - 2 * pad) * x) / L;
  const ok = rows.filter((z) => Number.isFinite(z.x1) && Number.isFinite(z.x2) && z.x2 > z.x1 && z.hc > 0);

  return <dialog ref={ref} className="opt-dialog wide taper-dialog" aria-labelledby="slabzone-title" onCancel={onClose} data-testid="slabzone-dialog">
    <div className="opt-form">
      <div className="opt-head"><h2 id="slabzone-title">Sunken slab zones</h2>
        <button type="button" className="rowbtn" aria-label="Close" onClick={onClose}>×</button></div>
      <p className="hint">Where the slab top is sunken, give the stretch (x from support A) and the slab thickness there (at least {SLAB_ZONE_MIN} mm; full slab h<sub>c</sub> = {fmt(hc, 0)} mm, L = {fmt(L, 3)} m). Studs where the slab is {SLAB_ZONE_MIN} mm or less are {zoneStudHeight(SLAB_ZONE_MIN, hsc)} mm high. Each zone is checked at its critical section (largest M<sub>Ed</sub> in it).</p>
      <svg className="taper-preview" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Slab over the span with the sunken zones" data-testid="slabzone-preview">
        <path d={`M${X(0)},${top + hc * k} L${X(L)},${top + hc * k}`} className="tp-flange" />
        <path d={['M', X(0), top, ...[...ok].sort((a, b) => a.x1 - b.x1).flatMap((z) => ['L', X(z.x1), top, 'L', X(z.x1), top + (hc - z.hc) * k, 'L', X(z.x2), top + (hc - z.hc) * k, 'L', X(z.x2), top]), 'L', X(L), top].join(' ')} className="tp-flange" fill="none" />
        {ok.map((z, i) => <g key={i}>
          <rect x={X(z.x1)} y={top + (hc - z.hc) * k} width={X(z.x2) - X(z.x1)} height={z.hc * k} className="tp-web" />
          <text x={(X(z.x1) + X(z.x2)) / 2} y={top + (hc - z.hc) * k - 4} textAnchor="middle" className="tp-label">{fmt(z.hc, 0)}</text>
          <text x={X(z.x1)} y={H - 4} textAnchor="middle" className="tp-dim">{fmt(z.x1, 2)}</text>
          <text x={X(z.x2)} y={H - 4} textAnchor="middle" className="tp-dim">{fmt(z.x2, 2)}</text>
        </g>)}
        <text x={X(0)} y={12} className="tp-dim">A</text><text x={X(L)} y={12} textAnchor="end" className="tp-dim">B</text>
      </svg>
      <table className="load-table taper-table" data-testid="slabzone-table">
        <colgroup>{[14, 20, 20, 22, 16, 8].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <thead><tr><th>Zone</th><th>x from (m)</th><th>x to (m)</th><th>Slab thickness (mm)</th><th>Studs h<sub>sc</sub> (mm)</th><th /></tr></thead>
        <tbody>{rows.map((z, i) => {
          const h = zoneStudHeight(z.hc, hsc);
          return <tr key={i}>
            <td>{i + 1}</td>
            <td><input className="num-input" type="number" step="any" aria-label={`Zone ${i + 1} x from`} value={Number.isFinite(z.x1) ? z.x1 : ''} onChange={(e) => set(i, { x1: e.target.valueAsNumber })} /></td>
            <td><input className="num-input" type="number" step="any" aria-label={`Zone ${i + 1} x to`} value={Number.isFinite(z.x2) ? z.x2 : ''} onChange={(e) => set(i, { x2: e.target.valueAsNumber })} /></td>
            <td><input className="num-input" type="number" step="any" aria-label={`Zone ${i + 1} slab thickness`} value={Number.isFinite(z.hc) ? z.hc : ''} onChange={(e) => set(i, { hc: e.target.valueAsNumber })} /></td>
            <td className="ro">{fmt(h, 0)}{h < 4 * dsc - 1e-9 && <small className="fail" title={`h_sc < 4 d = ${fmt(4 * dsc, 0)} mm: not ductile (EN 1994-1-1 §6.6.1.2); the zone is checked as the steel section alone`}> &lt; 4d</small>}</td>
            <td><button type="button" className="rowbtn" aria-label={`Delete zone ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>&times;</button></td>
          </tr>;
        })}
        {!rows.length && <tr><td colSpan={6} className="hint">No sunken zone: the slab is h<sub>c</sub> over the whole span.</td></tr>}</tbody>
      </table>
      <div className="taper-tools"><button type="button" className="btn" data-testid="slabzone-add" onClick={add}>+ Add zone</button></div>
      {rows.some((z) => zoneStudHeight(z.hc, hsc) < 4 * dsc - 1e-9) && <p className="hint">Studs of {zoneStudHeight(SLAB_ZONE_MIN, hsc)} mm are shorter than 4d = {fmt(4 * dsc, 0)} mm, so they are not ductile (EN 1994-1-1 §6.6.1.2): the zone is checked as the steel section alone. Studs of d = 16 mm (4d = 64 mm) keep the composite resistance there.</p>}
      {error && <p role="alert" className="fail">{error}</p>}
      <div className="opt-buttons">
        <button type="button" className="btn primary" data-testid="slabzone-save" disabled={!!error} onClick={() => { onSave({ zones: [...rows].sort((a, b) => a.x1 - b.x1) }); onClose(); }}>OK</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  </dialog>;
}
