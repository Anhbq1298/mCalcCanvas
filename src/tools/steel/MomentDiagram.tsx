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

/** Beam with supports and load on top; the moment diagram below on its own base line, drawn as in the code
 * figures (end moments: M above the line; transverse loads: sagging below, hogging above). */
export function DiagramIcon({ c, w = 132, h = 64 }: { c: Pick<LtbCase, 'kind' | 'psi'>; w?: number; h?: number }) {
  const f = shape(c), x0 = 16, x1 = w - 18, beam = 9, base = 24 + (h - 24) / 2, amp = (h - 24) / 2 - 3;
  // end moments: M drawn above the line as in SN003b Table 3.1 / EN 1993-1-1 Table B.3; transverse loads: sagging below
  const sgn = c.kind === 'end' ? -1 : 1, y = (t: number) => base + sgn * f(t) * amp;
  const pts = Array.from({ length: 41 }, (_, i) => { const t = i / 40; return [x0 + t * (x1 - x0), y(t)]; });
  const fixed = c.kind === 'udl-fixed' || c.kind === 'point-fixed';
  const load = c.kind === 'udl-simple' || c.kind === 'udl-fixed' ? Array.from({ length: 7 }, (_, i) => x0 + 6 + (i * (x1 - x0 - 12)) / 6) : c.kind.startsWith('point') ? [(x0 + x1) / 2] : [];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <line x1={x0} y1={beam} x2={x1} y2={beam} stroke={C.ink} strokeWidth={1.6} />
      {[x0, x1].map((x) => (fixed
        ? <line key={x} x1={x} y1={beam - 6} x2={x} y2={beam + 6} stroke={C.ink} strokeWidth={3} />
        : <path key={x} d={`M${x},${beam + 1} l-4,6 h8 z`} fill="white" stroke={C.ink} strokeWidth={1} />))}
      {load.map((x) => <path key={x} d={`M${x},1 V${beam - 2} m-2.5,-3 l2.5,3 l2.5,-3`} fill="none" stroke={C.red} strokeWidth={1} />)}
      <path d={`M${x0},${base} ${pts.map(([x, yy]) => `L${x.toFixed(1)},${yy.toFixed(1)}`).join(' ')} L${x1},${base} Z`} fill="color-mix(in srgb, #2B3A8C 14%, transparent)" stroke={C.navy} strokeWidth={1.2} />
      <line x1={x0} y1={base} x2={x1} y2={base} stroke={C.grey} strokeWidth={0.8} />
      {c.kind === 'end' && <><text x={1} y={y(0) + 3} fontSize={8} fill={C.grey}>M</text><text x={x1 + 2} y={y(1) + 3} fontSize={8} fill={C.grey}>ψM</text></>}
    </svg>
  );
}

export function MomentDiagramButton({ value, onChange, withC2 }: {
  value: DiagramChoice; onChange: (c: DiagramChoice) => void; withC2: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [psi, setPsi] = useState(String(value.psi ?? 0));
  const [c1, setC1] = useState(String(value.C1));
  const [c2, setC2] = useState(String(value.C2));
  const [calc, setCalc] = useState(!value.c1Default);
  const pick = (c: LtbCase) => { onChange({ nLT: c.n, C1: c.c1, C2: c.c2 }); ref.current?.close(); };
  const num = (s: string) => (/^\s*-?(\d+\.?\d*|\.\d+)\s*$/.test(s) ? Number(s) : NaN);
  const p = num(psi), u1 = num(c1), u2 = num(c2);
  return (
    <>
      <button type="button" className="btn browse" data-testid="ltb-diagram" title={choiceLabel(value)} onClick={() => { setCalc(!value.c1Default); setC1(String(value.C1)); setC2(String(value.C2)); ref.current?.showModal(); }}>
        Browse…
      </button>
      <dialog ref={ref} className="opt-dialog wide" aria-label="Moment diagram for lateral-torsional buckling">
        <div className="opt-form">
          <div className="opt-head"><h2>Moment diagram (C<sub>1</sub>, C<sub>2</sub>)</h2><button type="button" className="rowbtn" aria-label="Close" onClick={() => ref.current?.close()}>×</button></div>
          <div className="cm-mode" role="group" aria-label="How C1, C2 are obtained">
            <label className="check-row cm-toggle"><input type="checkbox" data-testid="ltb-default" checked={!calc} onChange={(e) => setCalc(!e.target.checked)} /> <span>Use default (conservative): C<sub>1</sub> = 1.000, C<sub>2</sub> = 0 (uniform moment)</span></label>
            <label className="check-row cm-toggle"><input type="checkbox" data-testid="ltb-calc" checked={calc} onChange={(e) => setCalc(e.target.checked)} /> <span>Select from moment diagrams (SCI NCCI SN003b) or enter</span></label>
          </div>
          {calc && <>
          <p className="hint">SCI NCCI SN003b Tables 3.1 and 3.2: fork supports, k = k<sub>w</sub> = 1, the diagram between lateral restraints of the compression flange. C<sub>2</sub> acts with the load height z<sub>g</sub> (transverse load cases only).</p>
          <div className="sn-tables">
            <figure className="b3 sn">
              <figcaption>SN003b Table 3.1: end moments (C<sub>2</sub> = 0)</figcaption>
              <table>
                <thead><tr><th>Case</th><th>Moment diagram</th><th>ψ</th><th>C<sub>1</sub></th><th /></tr></thead>
                <tbody>{LTB_CASES.filter((c) => c.kind === 'end').map((c) => {
                  const on = c.n === value.nLT && !value.c1Default;
                  return (
                    <tr key={c.n} className={on ? 'on' : ''} onClick={() => pick(c)}>
                      <td>{c.n}</td><td className="b3-d"><DiagramIcon c={c} w={120} h={66} /></td>
                      <td className="b3-f">{c.psi! > 0 ? '+' : ''}{c.psi}</td><td className="b3-f">{c.c1.toFixed(3)}</td>
                      <td><button type="button" className="btn" data-testid={`ltb-case-${c.n}`} aria-pressed={on} onClick={(e) => { e.stopPropagation(); pick(c); }}>{on ? 'In use' : 'Use'}</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </figure>
            <figure className="b3 sn">
              <figcaption>SN003b Table 3.2: transverse loading</figcaption>
              <table>
                <thead><tr><th>Case</th><th>Moment diagram</th><th>Loading and support</th><th>C<sub>1</sub></th><th>C<sub>2</sub></th><th /></tr></thead>
                <tbody>{LTB_CASES.filter((c) => c.kind !== 'end').map((c) => {
                  const on = c.n === value.nLT && !value.c1Default;
                  return (
                    <tr key={c.n} className={on ? 'on' : ''} onClick={() => pick(c)}>
                      <td>{c.n}</td><td className="b3-d"><DiagramIcon c={c} w={120} h={66} /></td>
                      <td>{c.label}</td><td className="b3-f">{c.c1.toFixed(3)}</td><td className="b3-f">{c.c2.toFixed(3)}</td>
                      <td><button type="button" className="btn" data-testid={`ltb-case-${c.n}`} aria-pressed={on} onClick={(e) => { e.stopPropagation(); pick(c); }}>{on ? 'In use' : 'Use'}</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <p className="hint">M<sub>cr</sub> = C<sub>1</sub> π²EI<sub>z</sub>/L² · [√(I<sub>w</sub>/I<sub>z</sub> + L²GI<sub>t</sub>/(π²EI<sub>z</sub>) + (C<sub>2</sub>z<sub>g</sub>)²) − C<sub>2</sub>z<sub>g</sub>]. C<sub>1</sub> raises M<sub>cr</sub> for a non-uniform diagram; C<sub>2</sub> acts with the load height z<sub>g</sub> (top flange +, destabilising).</p>
            </figure>
          </div>
          <h3>Custom</h3>
          <div className="custom-row">
            <DiagramIcon c={{ kind: 'end', psi: Number.isFinite(p) ? Math.max(-1, Math.min(1, p)) : 0 }} w={110} h={66} />
            <label className="f"><span>End moments ψ = M<sub>2</sub>/M<sub>1</sub> (−1 … 1)</span><input className="num-input" data-testid="ltb-psi" value={psi} onChange={(e) => setPsi(e.target.value)} /></label>
            <span className="hint">C<sub>1</sub> = {fmt(Number.isFinite(p) ? c1OfPsi(p) : NaN, 3)} (Table 3.1, interpolated), C<sub>2</sub> = 0</span>
            <button type="button" className="btn" data-testid="ltb-psi-use" disabled={!Number.isFinite(p) || p < -1 || p > 1} onClick={() => { onChange({ nLT: 0, C1: +c1OfPsi(p).toFixed(4), C2: 0, psi: p }); ref.current?.close(); }}>Use</button>
          </div>
          <div className="custom-row">
            <span className="hint" style={{ width: 96 }}>Other diagram (LTBeam, SN003a…)</span>
            <label className="f"><span>C<sub>1</sub></span><input className="num-input" data-testid="ltb-c1" value={c1} onChange={(e) => setC1(e.target.value)} /></label>
            {withC2 && <label className="f"><span>C<sub>2</sub></span><input className="num-input" data-testid="ltb-c2" value={c2} onChange={(e) => setC2(e.target.value)} /></label>}
            <button type="button" className="btn" data-testid="ltb-user-use" disabled={!(u1 > 0) || (withC2 && !Number.isFinite(u2))} onClick={() => { onChange({ nLT: 0, C1: u1, C2: withC2 ? u2 : 0 }); ref.current?.close(); }}>Use</button>
          </div>
          <p className="hint">C<sub>1</sub>, C<sub>2</sub> only. C<sub>my</sub>, C<sub>mz</sub>, C<sub>mLT</sub> are set separately (Equivalent uniform moment factors, default 1.0).</p>
          </>}
          <div className="opt-run">
            <span className="hint">{calc ? 'Click a diagram, or Use on a custom row, to apply.' : <>Applies C<sub>1</sub> = 1.000, C<sub>2</sub> = 0.</>}</span>
            {!calc && <button type="button" className="btn primary" data-testid="ltb-apply" onClick={() => { onChange({ nLT: 0, C1: 1, C2: 0, c1Default: true }); ref.current?.close(); }}>Apply</button>}
          </div>
        </div>
      </dialog>
    </>
  );
}
