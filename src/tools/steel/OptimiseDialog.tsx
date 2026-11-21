/**
 * Optimise form (like mCompositeBeamDesign): which sections and grades may be tried, geometric limits,
 * targets for the cross-section and the member checks, class limit; the lightest passing candidates
 * come back as a list to choose from. The search runs in the worker over every load combination.
 */
import { useRef, useState } from 'react';
import { fmt } from '../composite/format';
import { hollowSections, I_FAMILIES, iSections, type Shape } from './sections';
import type { Candidate, Pick } from './worker';

const GRADES: [string, number][] = [['S235', 235], ['S275', 275], ['S355', 355], ['S420', 420], ['S460', 460]];
const okNum = (s: string) => s.trim() === '' || /^\s*\d+(\.\d+)?\s*$/.test(s);
const num = (s: string) => (s.trim() === '' ? null : Number(s));

export interface OptimiseRun { candidates: Candidate[]; tSection: number; tMember: number; maxClass: number; keep: number }

export function OptimiseDialog({ shape, cf, fyNom, running, progress, picks, onRun, onUse }: {
  shape: Shape; cf: 0 | 1; fyNom: number; running: boolean; progress: string; picks: Pick[] | null;
  onRun: (r: OptimiseRun) => void; onUse: (p: Pick) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fams = shape === 'I' ? [...I_FAMILIES] : shape === 'RHS' ? ['SHS', 'RHS'] : ['CHS'];
  const [chosen, setChosen] = useState<Record<Shape, string[]>>({ I: ['UB', 'UC'], RHS: ['SHS', 'RHS'], CHS: ['CHS'] });
  const [grades, setGrades] = useState<number[]>([fyNom]);
  const [lim, setLim] = useState({ hMin: '', hMax: '', bMin: '', bMax: '', tMin: '', mMax: '' });
  const [tS, setTS] = useState('1.00');
  const [tM, setTM] = useState('1.00');
  const [plastic, setPlastic] = useState(false);
  const [keep, setKeep] = useState('5');
  const families = chosen[shape].filter((f) => fams.includes(f));
  const famKey = families.join(','), gradeKey = grades.join(',');
  const valid = Object.values(lim).every(okNum) && okNum(tS) && okNum(tM) && Number(tS) > 0 && Number(tM) > 0 && /^\d+$/.test(keep.trim()) && families.length > 0 && grades.length > 0;
  // a few hundred entries at most: built on each render
  const candidates = ((): Candidate[] => {
    if (!valid) return [];
    const [hMin, hMax, bMin, bMax, tMin, mMax] = [lim.hMin, lim.hMax, lim.bMin, lim.bMax, lim.tMin, lim.mMax].map(num);
    const inside = (h: number, b: number, t: number, m: number) => (hMin === null || h >= hMin) && (hMax === null || h <= hMax) && (bMin === null || b >= bMin) && (bMax === null || b <= bMax) && (tMin === null || t >= tMin) && (mMax === null || m <= mMax);
    const base: Candidate[] = [];
    const fl = famKey.split(','), gl = gradeKey.split(',').map(Number);
    if (shape === 'I') {
      for (const f of fl) for (const s of iSections(f)) if (inside(s.values.h, s.values.b, s.values.tf, s.values.mass)) base.push({ name: s.name, mass: s.values.mass, patch: { sectionId: s.id } });
    } else {
      for (const f of fl) for (const s of hollowSections(f as 'SHS' | 'RHS' | 'CHS', cf)) {
        const h = s.dims.h ?? s.dims.d!, b = s.dims.b ?? s.dims.d!;
        if (inside(h, b, s.dims.t, s.mass)) base.push({ name: s.name, mass: s.mass, patch: { hollow: { ...s.dims } } });
      }
    }
    const out: Candidate[] = [];
    for (const c of base) for (const g of gl) out.push({ name: gl.length > 1 ? `${c.name} ${GRADES.find(([, f]) => f === g)?.[0] ?? g}` : c.name, mass: c.mass, patch: { ...c.patch, fyNom: g } });
    return out.sort((a, b) => a.mass - b.mass || (a.patch.fyNom ?? 0) - (b.patch.fyNom ?? 0));
  })();
  const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));
  const field = (key: keyof typeof lim, label: string) => (
    <label className="f"><span>{label}</span>
      <input data-testid={`opt-${key}`} className="num-input" inputMode="decimal" placeholder="no limit" value={lim[key]} aria-invalid={!okNum(lim[key])} onChange={(e) => setLim((v) => ({ ...v, [key]: e.target.value }))} />
    </label>
  );
  return (
    <>
      <button type="button" className="btn primary" data-testid="design-open" onClick={() => { setGrades((g) => (g.length ? g : [fyNom])); ref.current?.showModal(); }}>Optimise…</button>
      <dialog ref={ref} className="opt-dialog wide" aria-labelledby="opt-title">
        <form method="dialog" className="opt-form" onSubmit={(e) => e.preventDefault()} noValidate>
          <header className="opt-head">
            <h2 id="opt-title">Optimise section</h2>
            <button type="button" className="rowbtn" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
          </header>
          <p className="hint">Tries every allowed section and grade, lightest first, against every load combination with the member data of the page; lists the lightest that pass.</p>
          <fieldset className="crit">
            <legend>Sections ({shape === 'I' ? 'I/H' : shape === 'RHS' ? 'RHS/SHS' : 'CHS'}{shape !== 'I' ? `, ${cf ? 'cold-formed' : 'hot-finished'}` : ''})</legend>
            <div className="fams" role="group" aria-label="Families">
              {fams.map((f) => <label key={f} className="fam"><input type="checkbox" data-testid={`opt-fam-${f}`} checked={families.includes(f)} onChange={(e) => setChosen((c) => ({ ...c, [shape]: toggle(c[shape], f, e.target.checked) }))} /> {f}</label>)}
            </div>
            <div className="fields three">
              {field('hMin', shape === 'CHS' ? 'Min diameter d (mm)' : 'Min depth h (mm)')}
              {field('hMax', shape === 'CHS' ? 'Max diameter d (mm)' : 'Max depth h (mm)')}
              {field('mMax', 'Max mass (kg/m)')}
              {shape !== 'CHS' && field('bMin', shape === 'I' ? 'Min flange width b (mm)' : 'Min width b (mm)')}
              {shape !== 'CHS' && field('bMax', shape === 'I' ? 'Max flange width b (mm)' : 'Max width b (mm)')}
              {field('tMin', shape === 'I' ? 'Min flange thickness t_f (mm)' : 'Min wall thickness t (mm)')}
            </div>
          </fieldset>
          <fieldset className="crit">
            <legend>Steel grades</legend>
            <div className="fams" role="group" aria-label="Grades">
              {GRADES.map(([g, f]) => <label key={g} className="fam"><input type="checkbox" data-testid={`opt-grade-${g}`} checked={grades.includes(f)} onChange={(e) => setGrades((v) => toggle(v, f, e.target.checked))} /> {g}</label>)}
            </div>
            <p className="hint">f<sub>y</sub> by thickness as set on the page. Same mass, lower grade first.</p>
          </fieldset>
          <fieldset className="crit">
            <legend>Criteria</legend>
            <div className="fields three">
              <label className="f"><span>Max UR, cross-section (§6.2)</span><input data-testid="opt-ts" className="num-input" inputMode="decimal" value={tS} aria-invalid={!okNum(tS)} onChange={(e) => setTS(e.target.value)} /></label>
              <label className="f"><span>Max UR, member (§6.3)</span><input data-testid="opt-tm" className="num-input" inputMode="decimal" value={tM} aria-invalid={!okNum(tM)} onChange={(e) => setTM(e.target.value)} /></label>
              <label className="f"><span>Results to list</span><input data-testid="opt-keep" className="num-input" inputMode="numeric" value={keep} onChange={(e) => setKeep(e.target.value)} /></label>
            </div>
            <label className="fam"><input type="checkbox" data-testid="opt-plastic" checked={plastic} onChange={(e) => setPlastic(e.target.checked)} /> Class 1 or 2 only (plastic resistance); otherwise Class 3 is allowed</label>
          </fieldset>
          <div className="opt-run">
            <span className="hint" data-testid="opt-count">{valid ? `${candidates.length} candidates.` : 'Check the highlighted fields; choose at least one family and grade.'}</span>
            <button type="button" className="btn primary" data-testid="design-run" disabled={!valid || running || !candidates.length}
              onClick={() => onRun({ candidates, tSection: Number(tS), tMember: Number(tM), maxClass: plastic ? 2 : 3, keep: Math.max(1, Number(keep)) })}>{running ? 'Searching…' : 'Find lightest'}</button>
          </div>
          <p className="hint" role="status" data-testid="design-msg">{progress}</p>
          {picks && picks.length > 0 && (
            <table className="opt-results" data-testid="opt-results">
              <thead><tr><th>Section</th><th>kg/m</th><th>Class</th><th>UR §6.2</th><th>UR §6.3</th><th>Governing</th><th /></tr></thead>
              <tbody>{picks.map((p, i) => (
                <tr key={`${p.name}-${i}`}>
                  <td>{p.name}</td><td className="num">{fmt(p.mass, 1)}</td><td className="num">{p.cls}</td><td className="num">{fmt(p.section, 3)}</td><td className="num">{fmt(p.member, 3)}</td>
                  <td>{p.combo}, {p.check}</td>
                  <td><button type="button" className="btn" data-testid={`design-use-${i}`} onClick={() => { onUse(p); ref.current?.close(); }}>Use</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </form>
      </dialog>
    </>
  );
}
