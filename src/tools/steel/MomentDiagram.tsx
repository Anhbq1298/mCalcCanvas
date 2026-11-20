/**
 * Moment diagram picker for lateral-torsional buckling: the 13 cases of SCI NCCI SN003b Tables 3.1 and 3.2
 * (the same table as the worksheet annex, fork supports, k = kw = 1) drawn as diagrams, plus custom input:
 * end-moment ratio ψ (C1 interpolated in Table 3.1, C2 = 0) or C1, C2 directly. Optionally the equivalent
 * uniform moment factors of EN 1993-1-1 Table B.3 for the same diagram.
 */
import { useRef, useState } from 'react';
import { C, fmt } from '../composite/format';
import { c1OfPsi, choiceLabel, LTB_CASES, type DiagramChoice, type LtbCase } from './ltbCases';

/** Normalised moment along the span (sagging positive, max |M| = 1). */
function shape(c: Pick<LtbCase, 'kind' | 'psi'>): (x: number) => number {
  switch (c.kind) {
    case 'end': return (x) => 1 + ((c.psi ?? 1) - 1) * x;
    case 'udl-simple': return (x) => 4 * x * (1 - x);
    case 'udl-fixed': return (x) => (6 * x * (1 - x) - 1) / 1; // −1 at the ends, +0.5 at mid-span (wL²/12, wL²/24)
    case 'point-simple': return (x) => (x <= 0.5 ? 2 * x : 2 * (1 - x));
    case 'point-fixed': return (x) => (x <= 0.5 ? -1 + 4 * x : 3 - 4 * x);
  }
}

export function DiagramIcon({ c, w = 132, h = 64 }: { c: Pick<LtbCase, 'kind' | 'psi'>; w?: number; h?: number }) {
  const f = shape(c), x0 = 12, x1 = w - 12, mid = h / 2 + 4, amp = h / 2 - 12;
  const pts = Array.from({ length: 41 }, (_, i) => { const t = i / 40; return [x0 + t * (x1 - x0), mid - f(t) * amp]; });
  const fixed = c.kind === 'udl-fixed' || c.kind === 'point-fixed';
  const load = c.kind === 'udl-simple' || c.kind === 'udl-fixed' ? Array.from({ length: 7 }, (_, i) => x0 + 6 + (i * (x1 - x0 - 12)) / 6) : c.kind.startsWith('point') ? [(x0 + x1) / 2] : [];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={`M${x0},${mid} ${pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${x1},${mid} Z`} fill="color-mix(in srgb, #2B3A8C 14%, transparent)" stroke={C.navy} strokeWidth={1.2} />
      <line x1={x0} y1={mid} x2={x1} y2={mid} stroke={C.ink} strokeWidth={1.6} />
      {[x0, x1].map((x) => (fixed
        ? <line key={x} x1={x} y1={mid - 9} x2={x} y2={mid + 9} stroke={C.ink} strokeWidth={3} />
        : <path key={x} d={`M${x},${mid + 1} l-5,8 h10 z`} fill="white" stroke={C.ink} strokeWidth={1} />))}
      {load.map((x) => <path key={x} d={`M${x},4 V${mid - amp - 3} m-3,-4 l3,4 l3,-4`} fill="none" stroke={C.red} strokeWidth={1} />)}
      {c.kind === 'end' && <><text x={x0 - 2} y={10} fontSize={9} fill={C.grey}>M</text><text x={x1 - 14} y={10} fontSize={9} fill={C.grey}>ψM</text></>}
    </svg>
  );
}

export function MomentDiagramButton({ value, onChange, onCm, withC2 }: {
  value: DiagramChoice; onChange: (c: DiagramChoice) => void; onCm: (cm: number) => void; withC2: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [psi, setPsi] = useState(String(value.psi ?? 0));
  const [c1, setC1] = useState(String(value.C1));
  const [c2, setC2] = useState(String(value.C2));
  const [cm, setCm] = useState(true);
  const current = LTB_CASES.find((x) => x.n === value.nLT);
  const pick = (c: LtbCase) => { onChange({ nLT: c.n, C1: c.c1, C2: c.c2 }); if (cm) onCm(c.cm); ref.current?.close(); };
  const num = (s: string) => (/^\s*-?(\d+\.?\d*|\.\d+)\s*$/.test(s) ? Number(s) : NaN);
  const p = num(psi), u1 = num(c1), u2 = num(c2);
  return (
    <>
      <button type="button" className="diagram-btn" data-testid="ltb-diagram" onClick={() => { setC1(String(value.C1)); setC2(String(value.C2)); ref.current?.showModal(); }}>
        <DiagramIcon c={current ?? { kind: 'end', psi: value.psi ?? 1 }} w={96} h={46} />
        <span>{choiceLabel(value)}<em>Change…</em></span>
      </button>
      <dialog ref={ref} className="opt-dialog wide" aria-label="Moment diagram for lateral-torsional buckling">
        <div className="opt-form">
          <div className="opt-head"><h2>Moment diagram (C<sub>1</sub>, C<sub>2</sub>)</h2><button type="button" className="btn" onClick={() => ref.current?.close()}>Close</button></div>
          <p className="hint">SCI NCCI SN003b Tables 3.1 and 3.2: fork supports, k = k<sub>w</sub> = 1, the diagram between lateral restraints of the compression flange. C<sub>2</sub> acts with the load height z<sub>g</sub> (transverse load cases only).</p>
          <label className="check-row"><input type="checkbox" checked={cm} onChange={(e) => setCm(e.target.checked)} /> Also set C<sub>my</sub> and C<sub>mLT</sub> from EN 1993-1-1 Table B.3 for this diagram</label>
          <div className="diagram-grid" role="listbox" aria-label="Moment diagrams">
            {LTB_CASES.map((c) => (
              <button key={c.n} type="button" role="option" aria-selected={c.n === value.nLT} className={`diagram-card ${c.n === value.nLT ? 'on' : ''}`} data-testid={`ltb-case-${c.n}`} onClick={() => pick(c)}>
                <DiagramIcon c={c} />
                <span className="dc-label">{c.n}. {c.label}</span>
                <span className="dc-val">C<sub>1</sub> {c.c1.toFixed(3)} · C<sub>2</sub> {c.c2.toFixed(3)} · C<sub>m</sub> {c.cm.toFixed(2)}</span>
              </button>
            ))}
          </div>
          <h3>Custom</h3>
          <div className="custom-row">
            <DiagramIcon c={{ kind: 'end', psi: Number.isFinite(p) ? Math.max(-1, Math.min(1, p)) : 0 }} w={96} h={46} />
            <label className="f"><span>End moments ψ = M<sub>2</sub>/M<sub>1</sub> (−1 … 1)</span><input className="num-input" data-testid="ltb-psi" value={psi} onChange={(e) => setPsi(e.target.value)} /></label>
            <span className="hint">C<sub>1</sub> = {fmt(Number.isFinite(p) ? c1OfPsi(p) : NaN, 3)} (Table 3.1, interpolated), C<sub>2</sub> = 0, C<sub>m</sub> = {fmt(Number.isFinite(p) ? Math.max(0.4, 0.6 + 0.4 * p) : NaN, 2)}</span>
            <button type="button" className="btn" data-testid="ltb-psi-use" disabled={!Number.isFinite(p) || p < -1 || p > 1} onClick={() => { onChange({ nLT: 0, C1: +c1OfPsi(p).toFixed(4), C2: 0, psi: p }); if (cm) onCm(Math.max(0.4, 0.6 + 0.4 * p)); ref.current?.close(); }}>Use</button>
          </div>
          <div className="custom-row">
            <span className="hint" style={{ width: 96 }}>Other diagram (LTBeam, SN003a…)</span>
            <label className="f"><span>C<sub>1</sub></span><input className="num-input" data-testid="ltb-c1" value={c1} onChange={(e) => setC1(e.target.value)} /></label>
            {withC2 && <label className="f"><span>C<sub>2</sub></span><input className="num-input" data-testid="ltb-c2" value={c2} onChange={(e) => setC2(e.target.value)} /></label>}
            <button type="button" className="btn" data-testid="ltb-user-use" disabled={!(u1 > 0) || (withC2 && !Number.isFinite(u2))} onClick={() => { onChange({ nLT: 0, C1: u1, C2: withC2 ? u2 : 0 }); ref.current?.close(); }}>Use</button>
          </div>
          <p className="hint">C<sub>m</sub> is not changed by the custom C<sub>1</sub>, C<sub>2</sub> entry: set it in the member panel (Table B.3).</p>
        </div>
      </dialog>
    </>
  );
}
