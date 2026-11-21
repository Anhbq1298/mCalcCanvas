/**
 * Equivalent uniform moment factors C_my, C_mz, C_mLT (EN 1993-1-1 Annex B Table B.3).
 * Default: all 1.0 (conservative), nothing to enter. "Calculate from moment diagrams" opens the
 * per-factor input: keep 1.0, linear (M_A, M_B), span maximum under uniform / concentrated load
 * (M_A, M_B, M_s), sway buckling 0.9 (C_my, C_mz); C_mLT may follow C_my. Apply is locked while a
 * required moment is missing.
 */
import { useRef, useState } from 'react';
import { fmt } from '../composite/format';
import { CM_KINDS, cmOf, cmValues, type CmDef, type CmDefs, type CmKind } from './cm';
import type { Member } from './model';

type Axis = 'y' | 'z' | 'LT';
type Kind = CmKind | 'same';
type Draft = { kind: Kind; MA: string; MB: string; Ms: string };
const AXES: [Axis, string, string][] = [
  ['y', 'bending about y-y over the buckling length L_y', 'y'],
  ['z', 'bending about z-z over the buckling length L_z', 'z'],
  ['LT', 'M_y between lateral restraints, length L_LT', 'y'],
];
/** text with x_ab subscripts */
const Sub = ({ t }: { t: string }) => <>{t.split(/_(\w+)/).map((p, i) => (i % 2 ? <sub key={i}>{p}</sub> : p))}</>;
const num = (s: string) => (/^\s*-?(\d+\.?\d*|\.\d+)\s*$/.test(s) ? Number(s) : NaN);
const str = (x: number | undefined) => (x === undefined ? '' : String(x));
const draftOf = (d: CmDef | 'y' | undefined): Draft => (d === 'y' ? { kind: 'same', MA: '', MB: '', Ms: '' } : { kind: d?.kind ?? 'one', MA: str(d?.MA), MB: str(d?.MB), Ms: str(d?.Ms) });
const needs = (k: Kind): ('MA' | 'MB' | 'Ms')[] => (k === 'linear' ? ['MA', 'MB'] : k === 'udl' || k === 'point' ? ['MA', 'MB', 'Ms'] : []);
const defOf = (d: Draft): CmDef => ({ kind: d.kind === 'same' ? 'one' : d.kind, ...Object.fromEntries(needs(d.kind).map((f) => [f, num(d[f])])) });
/** what is missing, or '' */
function missing(d: Draft): string {
  const f = needs(d.kind);
  const gap = f.filter((k) => !Number.isFinite(num(d[k])));
  if (gap.length) return `Enter ${gap.map((k) => k.replace('M', 'M_')).join(', ')}`;
  if (d.kind === 'linear' && num(d.MA) === 0 && num(d.MB) === 0) return 'At least one end moment must be non-zero';
  if (d.kind !== 'linear' && f.length && f.every((k) => num(d[k]) === 0)) return 'At least one moment must be non-zero';
  return '';
}

export function CmButton({ member, withLT, onApply }: { member: Member; withLT: boolean; onApply: (m: Partial<Member>) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const init = () => ({ y: draftOf(member.cmDef?.y), z: draftOf(member.cmDef?.z), LT: draftOf(member.cmDef?.LT) });
  const [calc, setCalc] = useState(!!member.cmDef?.calc);
  const [d, setD] = useState<Record<Axis, Draft>>(init);
  const set = (a: Axis, p: Partial<Draft>) => setD((x) => ({ ...x, [a]: { ...x[a], ...p } }));
  const axes = AXES.filter(([a]) => withLT || a !== 'LT');
  const defs: CmDefs = calc
    ? { calc: true, y: defOf(d.y), z: defOf(d.z), ...(withLT ? { LT: d.LT.kind === 'same' ? 'y' as const : defOf(d.LT) } : {}) }
    : { calc: false };
  const blocked = calc && axes.some(([a]) => missing(d[a]) !== '');
  const values = cmValues(defs);
  const apply = () => {
    if (blocked) return;
    onApply({ ...values, ...(withLT ? {} : { CmLT: 1 }), cmDef: calc ? defs : undefined });
    ref.current?.close();
  };
  const open = () => { setCalc(!!member.cmDef?.calc); setD(init()); ref.current?.showModal(); };
  return (
    <>
      <button type="button" className="btn browse" data-testid="cm-open" onClick={open}>Define…</button>
      <dialog ref={ref} className="opt-dialog wide" aria-labelledby="cm-title">
        {/* the member panel is itself a form: no nested form here */}
        <div className="opt-form" role="group" aria-labelledby="cm-title">
          <header className="opt-head">
            <h2 id="cm-title">Equivalent uniform moment factors C<sub>m</sub></h2>
            <button type="button" className="rowbtn" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
          </header>
          <label className="check-row cm-toggle"><input type="checkbox" data-testid="cm-calc" checked={calc} onChange={(e) => setCalc(e.target.checked)} /> Calculate from moment diagrams (EN 1993-1-1 Annex B, Table B.3)</label>
          {!calc && <p className="cm-default" data-testid="cm-default">Conservative default · All C<sub>m</sub> = 1.000</p>}
          {calc && <>
            <p className="hint">Moments over the length of each factor, one sign convention (e.g. sagging +). Only the ratios matter. Keep 1.0 where no diagram is at hand.</p>
            {axes.map(([a, title, m]) => {
              const x = d[a], f = needs(x.kind), miss = missing(x);
              const r = x.kind === 'same' ? { cm: values.Cmy, basis: 'same as C_my' } : cmOf(defOf(x));
              const kinds: [Kind, string][] = a === 'LT' ? [...CM_KINDS.filter(([k]) => k !== 'sway'), ['same', 'Same as C_my']] : CM_KINDS;
              return (
                <fieldset key={a} className="crit" data-testid={`cm-${a}`}>
                  <legend>C<sub>m{a}</sub>: <Sub t={title} /></legend>
                  <div className="cm-grid">
                    <label className="f"><span>Moment diagram</span>
                      <select data-testid={`cm-${a}-kind`} value={x.kind} onChange={(e) => set(a, { kind: e.target.value as Kind })}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    </label>
                    {f.map((k) => (
                      <label key={k} className="f"><span>M<sub>{m},{k.slice(1)}</sub> {k === 'Ms' ? 'span' : 'end'} (kN·m)</span>
                        <input className="num-input" data-testid={`cm-${a}-${k}`} inputMode="decimal" value={x[k]} aria-invalid={x[k].trim() !== '' && !Number.isFinite(num(x[k]))} onChange={(e) => set(a, { [k]: e.target.value })} /></label>
                    ))}
                  </div>
                  <p className="cm-out" data-testid={`cm-${a}-result`}>
                    {miss ? <span className="cm-miss"><Sub t={miss} /></span>
                      : x.kind === 'sway' ? <b>Sway buckling · C<sub>m</sub> = 0.900</b>
                        : <><b>C<sub>m</sub> = {fmt(r.cm, 3)}</b> <span className="hint"><Sub t={r.basis} /></span></>}
                  </p>
                </fieldset>
              );
            })}
          </>}
          <div className="opt-run">
            <span className="hint" data-testid="cm-preview">Applies C<sub>my</sub> = {fmt(values.Cmy, 3)}, C<sub>mz</sub> = {fmt(values.Cmz, 3)}{withLT && <>, C<sub>mLT</sub> = {fmt(values.CmLT, 3)}</>}{blocked && ' (missing data)'}</span>
            <button type="button" className="btn primary" data-testid="cm-apply" disabled={blocked} onClick={apply}>Apply</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
