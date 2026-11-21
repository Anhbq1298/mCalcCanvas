/**
 * Form for the equivalent uniform moment factors C_my, C_mz, C_mLT (EN 1993-1-1 Annex B Table B.3):
 * per axis the user picks the diagram type and enters the end and span moments over that buckling
 * length; C_m and the Table B.3 row used are shown live.
 */
import { useRef, useState } from 'react';
import { fmt } from '../composite/format';
import { CM_KINDS, cmOf, type CmDef, type CmKind } from './cm';
import type { Member } from './model';

type Axis = 'y' | 'z' | 'LT';
type Draft = { kind: CmKind; MA: string; MB: string; Ms: string; value: string };
const AXES: [Axis, string, string][] = [
  ['y', 'bending about y-y, over the y-y buckling length L_y', 'y'],
  ['z', 'bending about z-z, over the z-z buckling length L_z', 'z'],
  ['LT', 'bending about y-y, between lateral restraints L_LT', 'y'],
];
/** text with x_ab subscripts */
const Sub = ({ t }: { t: string }) => <>{t.split(/_(\w+)/).map((p, i) => (i % 2 ? <sub key={i}>{p}</sub> : p))}</>;
const num = (s: string) => (/^\s*-?(\d+\.?\d*|\.\d+)\s*$/.test(s) ? Number(s) : NaN);
const draftOf = (d: CmDef | undefined, v: number): Draft => d && d.kind !== 'diagram'
  ? { kind: d.kind, MA: String(d.MA ?? ''), MB: String(d.MB ?? ''), Ms: String(d.Ms ?? ''), value: String(d.value ?? v) }
  : { kind: v === 1 ? 'one' : 'user', MA: '', MB: '', Ms: '', value: String(v) };
const defOf = (d: Draft): CmDef => (d.kind === 'user' ? { kind: 'user', value: num(d.value) }
  : d.kind === 'linear' || d.kind === 'udl' || d.kind === 'point' ? { kind: d.kind, MA: num(d.MA) || 0, MB: num(d.MB) || 0, ...(d.kind !== 'linear' ? { Ms: num(d.Ms) || 0 } : {}) }
    : { kind: d.kind });
const bad = (d: Draft) => (d.kind === 'user' ? !(num(d.value) > 0)
  : (d.kind === 'linear' || d.kind === 'udl' || d.kind === 'point') && [d.MA, d.MB, ...(d.kind !== 'linear' ? [d.Ms] : [])].some((s) => s.trim() !== '' && !Number.isFinite(num(s))));

export function CmButton({ member, withLT, onApply }: { member: Member; withLT: boolean; onApply: (m: Partial<Member>) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const init = () => ({
    y: draftOf(member.cmDef?.y, member.Cmy), z: draftOf(member.cmDef?.z, member.Cmz),
    LT: draftOf(member.cmDef?.LT === 'y' ? undefined : member.cmDef?.LT, member.CmLT),
  });
  const [d, setD] = useState<Record<Axis, Draft>>(init);
  const [ltSame, setLtSame] = useState(member.cmDef?.LT === 'y');
  const set = (a: Axis, p: Partial<Draft>) => setD((x) => ({ ...x, [a]: { ...x[a], ...p } }));
  const axes = AXES.filter(([a]) => withLT || a !== 'LT');
  const res = (a: Axis) => cmOf(defOf(d[a === 'LT' && ltSame ? 'y' : a]));
  const invalid = axes.some(([a]) => !(a === 'LT' && ltSame) && (bad(d[a]) || !(res(a).cm > 0)));
  const apply = () => {
    const y = defOf(d.y), z = defOf(d.z), lt = ltSame ? 'y' as const : defOf(d.LT);
    onApply({ Cmy: +res('y').cm.toFixed(4), Cmz: +res('z').cm.toFixed(4), ...(withLT ? { CmLT: +res('LT').cm.toFixed(4) } : {}), cmDef: { y, z, ...(withLT ? { LT: lt } : {}) } });
    ref.current?.close();
  };
  return (
    <>
      <button type="button" className="btn browse" data-testid="cm-open" onClick={() => { setD(init()); setLtSame(member.cmDef?.LT === 'y'); ref.current?.showModal(); }}>Define…</button>
      <dialog ref={ref} className="opt-dialog wide" aria-labelledby="cm-title">
        {/* the member panel is itself a form: no nested form here */}
        <div className="opt-form" role="group" aria-labelledby="cm-title">
          <header className="opt-head">
            <h2 id="cm-title">Equivalent uniform moment factors C<sub>m</sub></h2>
            <button type="button" className="rowbtn" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
          </header>
          <p className="hint">EN 1993-1-1 Annex B, Table B.3 (Method 2). Enter the moments over the relevant buckling length with one sign convention (e.g. sagging +): M<sub>A</sub>, M<sub>B</sub> at the ends, M<sub>s</sub> in the span. Only the ratios matter, so unit loads or any kN·m are fine.</p>
          {axes.map(([a, title, m]) => {
            const x = d[a], r = res(a), same = a === 'LT' && ltSame, moments = x.kind === 'linear' || x.kind === 'udl' || x.kind === 'point';
            return (
              <fieldset key={a} className="crit" data-testid={`cm-${a}`}>
                <legend>C<sub>m{a}</sub>: <Sub t={title} /></legend>
                {a === 'LT' && <label className="check-row"><input type="checkbox" data-testid="cm-lt-same" checked={ltSame} onChange={(e) => setLtSame(e.target.checked)} /> Same as C<sub>my</sub> (L<sub>LT</sub> = L<sub>y</sub> segment)</label>}
                {!same && <div className="cm-grid">
                  <label className="f"><span>Moment diagram</span>
                    <select data-testid={`cm-${a}-kind`} value={x.kind} onChange={(e) => set(a, { kind: e.target.value as CmKind })}>{CM_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  </label>
                  {moments && <label className="f"><span>M<sub>{m},A</sub> end (kN·m)</span><input className="num-input" data-testid={`cm-${a}-MA`} inputMode="decimal" value={x.MA} aria-invalid={x.MA.trim() !== '' && !Number.isFinite(num(x.MA))} onChange={(e) => set(a, { MA: e.target.value })} placeholder="0" /></label>}
                  {moments && <label className="f"><span>M<sub>{m},B</sub> end (kN·m)</span><input className="num-input" data-testid={`cm-${a}-MB`} inputMode="decimal" value={x.MB} aria-invalid={x.MB.trim() !== '' && !Number.isFinite(num(x.MB))} onChange={(e) => set(a, { MB: e.target.value })} placeholder="0" /></label>}
                  {moments && x.kind !== 'linear' && <label className="f"><span>M<sub>{m},s</sub> span (kN·m)</span><input className="num-input" data-testid={`cm-${a}-Ms`} inputMode="decimal" value={x.Ms} aria-invalid={x.Ms.trim() !== '' && !Number.isFinite(num(x.Ms))} onChange={(e) => set(a, { Ms: e.target.value })} placeholder="0" /></label>}
                  {x.kind === 'user' && <label className="f"><span>C<sub>m</sub></span><input className="num-input" data-testid={`cm-${a}-value`} inputMode="decimal" value={x.value} aria-invalid={!(num(x.value) > 0)} onChange={(e) => set(a, { value: e.target.value })} /></label>}
                </div>}
                <p className="cm-out"><b data-testid={`cm-${a}-result`}>C<sub>m</sub> = {fmt(r.cm, 3)}</b> <span className="hint"><Sub t={same ? 'same as C_my' : r.basis} /></span></p>
              </fieldset>
            );
          })}
          <div className="opt-run">
            <span className="hint">The values are written to the worksheet; the basis goes into the report member line.</span>
            <button type="button" className="btn primary" data-testid="cm-apply" disabled={invalid} onClick={apply}>Apply</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
