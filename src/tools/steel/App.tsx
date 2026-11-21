/**
 * mSteelBeamColumn – steel cross-section designer (EN 1993-1-1 §5.5, §6.2) for beam-columns.
 * Every number on this page is read from an mCalcCanvas worksheet (Steel_Section_{I,RHS,CHS}_EC3),
 * calculated in a worker once per load combination; the report is that worksheet at the governing
 * combination, with all combinations in its Input & Results table. Same drawing-sheet look as
 * mCompositeBeamDesign (its stylesheet is shared).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { sectionById } from '../../engineering/steel/sections';
import { fmt } from '../composite/format';
import { Rich } from '../composite/rich';
import { CHECKS, DEFAULT_MEMBER, type SummaryGroup, governing, isMemberCheck, type Combo, type ComboResult, type Member, type SteelState } from './model';
import { hollowName, hollowSections, I_FAMILIES, iSections, type Shape } from './sections';
import { MathRenderer } from '../../math/MathRenderer';
import { OptimiseDialog, type OptimiseRun } from './OptimiseDialog';
import { SectionDrawing } from './charts';
import { MomentDiagramButton } from './MomentDiagram';
import { CmButton } from './CmDialog';
import { cmValues } from './cm';
import { choiceLabel } from './ltbCases';
import type { FromWorker, Pick, ToWorker } from './worker';
import { parseCombos } from './paste';

const HANDOFF_KEY = 'calccanvas.handoff'; // read once by mCalcCanvas (?open=handoff)
const STORE_KEY = 'msteelbeamcolumn.v2';
const NUMBER = /^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;
const GRADES: [string, number][] = [['S235', 235], ['S275', 275], ['S355', 355], ['S420', 420], ['S460', 460]];
const COLS: [keyof Combo, string, string][] = [['N', 'N_Ed', 'kN'], ['My', 'M_y,Ed', 'kN m'], ['Mz', 'M_z,Ed', 'kN m'], ['Vz', 'V_z,Ed', 'kN'], ['Vy', 'V_y,Ed', 'kN']];
const tone = (v: number) => (!Number.isFinite(v) ? 'fail' : v > 1 ? 'fail' : v > 0.9 ? 'warn' : 'pass');

interface Page {
  shape: Shape; family: string; sectionId: number; hollowFamily: 'SHS' | 'RHS';
  rhs: { h: number; b: number; t: number }; chs: { d: number; t: number }; cf: 0 | 1;
  fyNom: number; fyBasis: 0 | 1; gammaM0: number; eta: number; member: Member; combos: Combo[];
}
const DEFAULT: Page = {
  shape: 'I', family: 'UC', sectionId: iSections('UC').find((s) => s.name === 'UC 305x305x97')?.id ?? iSections('UC')[0].id, hollowFamily: 'SHS',
  rhs: { h: 200, b: 200, t: 10 }, chs: { d: 219.1, t: 10 }, cf: 0, fyNom: 355, fyBasis: 1, gammaM0: 1, eta: 1.2, member: DEFAULT_MEMBER,
  combos: [
    { name: 'ULS1 1.35G+1.5Q', N: 2200, My: 180, Mz: 25, Vz: 90, Vy: 10 },
    { name: 'ULS2 1.35G+1.5W+0.75Q', N: 1400, My: 260, Mz: 60, Vz: 150, Vy: 35 },
    { name: 'ULS3 1.0G+1.5W (uplift)', N: -350, My: 140, Mz: 10, Vz: 80, Vy: 5 },
  ],
};
function load(): Page {
  try {
    const p = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Page | null;
    if (p && Array.isArray(p.combos) && ['I', 'RHS', 'CHS'].includes(p.shape)) { sectionById(p.sectionId); const mem: Member = { ...DEFAULT_MEMBER, ...p.member }; return { ...DEFAULT, ...p, member: { ...mem, ...cmValues(mem.cmDef?.calc ? mem.cmDef : undefined), cmDef: mem.cmDef?.calc ? mem.cmDef : undefined } }; }
  } catch { /* stored state from another version: start from the default */ }
  return DEFAULT;
}
const toState = (p: Page): SteelState => ({
  shape: p.shape, sectionId: p.sectionId, fyNom: p.fyNom, fyBasis: p.fyBasis, gammaM0: p.gammaM0, eta: p.eta, member: p.member, combos: p.combos,
  hollow: { h: p.rhs.h, b: p.rhs.b, t: p.shape === 'CHS' ? p.chs.t : p.rhs.t, d: p.chs.d, cf: p.cf },
});

/** A number field, validated after interaction. */
function NumberField({ id, label, value, onCommit, className }: { id: string; label: string; value: number; onCommit: (n: number) => void; className?: string }) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  const [invalid, setInvalid] = useState(false);
  if (prev !== value) { setPrev(value); setText(String(value)); }
  return (
    <span className="field-wrap">
      <input id={id} aria-label={label} data-input={label} type="text" inputMode="decimal" autoComplete="off" aria-invalid={invalid}
        className={`num-input ${className ?? ''}`} value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => { const ok = NUMBER.test(text); setInvalid(!ok); if (ok && Number(text) !== value) onCommit(Number(text)); }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      {invalid && <span className="field-error">Error: enter a number</span>}
    </span>
  );
}

export function App() {
  const worker = useMemo(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), []);
  const [page, setPage] = useState<Page>(load);
  const [results, setResults] = useState<ComboResult[] | null>(null);
  const [resultsKey, setResultsKey] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [design, setDesign] = useState<{ running: boolean; msg: string; picks: Pick[] | null }>({ running: false, msg: '', picks: null });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [sheet, setSheet] = useState<SummaryGroup[] | null>(null);
  const sheetRequest = useRef(0);
  const request = useRef(0), designToken = useRef(0), reportCb = useRef<((doc: unknown) => void) | null>(null);
  const pasteRef = useRef<HTMLDialogElement>(null);
  const state = useMemo(() => toState(page), [page]);

  const stateKey = useMemo(() => JSON.stringify(state), [state]);
  const busy = resultsKey !== stateKey;
  useEffect(() => {
    const onMessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      if (m.kind === 'results' && m.request === request.current) { setResults(m.results); setResultsKey(m.key); }
      if (m.kind === 'report' && m.request === request.current) reportCb.current?.(m.doc);
      if (m.kind === 'sheet' && m.request === sheetRequest.current) setSheet(m.groups);
      if (m.kind === 'progress' && m.token === designToken.current) setDesign((d) => ({ ...d, msg: `Checking ${m.name} (${m.i} of ${m.n})…` }));
      if (m.kind === 'designed' && m.token === designToken.current) {
        setDesign({ running: false, picks: m.picks, msg: m.picks.length ? `${m.picks.length} passing, lightest first (${m.tried} tried, ${fmt(m.seconds, 1)} s).` : `Nothing passes every combination (${m.tried} tried).` });
      }
    };
    worker.addEventListener('message', onMessage);
    return () => worker.removeEventListener('message', onMessage);
  }, [worker]);
  useEffect(() => {
    worker.postMessage({ kind: 'run', request: ++request.current, state, key: stateKey } satisfies ToWorker);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(page)); } catch { /* private mode */ }
  }, [worker, state, stateKey, page]);

  const set = (p: Partial<Page>) => setPage((x) => ({ ...x, ...p }));
  const setMember = (m: Partial<Member>) => setPage((x) => ({ ...x, member: { ...x.member, ...m } }));
  const setCombo = (i: number, c: Partial<Combo>) => set({ combos: page.combos.map((x, k) => (k === i ? { ...x, ...c } : x)) });
  const withReport = (fn: (doc: unknown) => void) => { reportCb.current = fn; worker.postMessage({ kind: 'report', request: ++request.current, state } satisfies ToWorker); };
  const fileName = () => `Steel_Section_${page.shape}_EC3.mCCV`;
  const download = () => withReport((doc) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(doc)], { type: 'application/json' }));
    a.download = fileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const report = () => withReport((doc) => {
    try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(doc)); window.open('../?open=handoff', '_blank', 'noopener'); } catch { download(); }
  });

  const shape = page.shape, checks = CHECKS[shape];
  const ok = results && results.length === page.combos.length && resultsKey.includes(`"shape":"${page.shape}"`) ? results : null;
  const gov = ok && ok.length ? governing(ok, shape) : null;
  const shown = selected !== null && ok?.[selected] ? selected : gov?.combo ?? 0;
  const r = ok?.[shown], v = ok?.[0]?.v ?? {};
  const overall = gov?.ur ?? NaN, pass = Number.isFinite(overall) && overall <= 1;
  const sectionLabel = shape === 'I' ? sectionById(page.sectionId).name : hollowName(shape === 'RHS' ? { kind: 'RHS', ...page.rhs, cf: page.cf } : { kind: 'CHS', ...page.chs });
  // cross-section (§6.2) against member (§6.3) for the shown combination
  const sectionUR = Math.max(...checks.filter(([k]) => !isMemberCheck(k)).map(([k]) => r?.ur[k] ?? NaN));
  const memberUR = Math.max(...checks.filter(([k]) => isMemberCheck(k)).map(([k]) => r?.ur[k] ?? NaN));
  const checkLabel = (k: string) => (k === 'class' ? 'Class 4 section (not covered)' : checks.find(([c]) => c === k)?.[1] ?? k);
  const errors = ok?.flatMap((x) => x.errors).slice(0, 3) ?? [];
  // the read-only worksheet follows the shown combination (selected row, else the governing one)
  useEffect(() => {
    if (!ok) return;
    worker.postMessage({ kind: 'sheet', request: ++sheetRequest.current, state, combo: shown } satisfies ToWorker);
  }, [worker, state, shown, ok]);

  const props: [string, string, number, number][] = shape === 'CHS'
    ? [['A', 'cm²', v.A / 100, 2], ['I', 'cm⁴', v.I / 1e4, 0], ['W_el', 'cm³', v.Wel / 1e3, 0], ['W_pl', 'cm³', v.Wpl / 1e3, 0]]
    : [['A', 'cm²', v.A / 100, 2], ['I_y', 'cm⁴', v.Iy / 1e4, 0], ['I_z', 'cm⁴', v.Iz / 1e4, 0], ['W_pl,y', 'cm³', v.Wply / 1e3, 0], ['W_pl,z', 'cm³', v.Wplz / 1e3, 0], ['W_el,y', 'cm³', v.Wely / 1e3, 0], ['W_el,z', 'cm³', v.Welz / 1e3, 0]];
  const mass = (v.A ?? NaN) * 7.85e-3;

  const runDesign = (r: OptimiseRun) => {
    setDesign({ running: true, picks: null, msg: 'Starting…' });
    worker.postMessage({ kind: 'design', token: ++designToken.current, state, ...r } satisfies ToWorker);
  };
  const usePick = (p: Pick) => {
    const x = p.patch;
    setPage((pg) => {
      const next: Page = { ...pg, ...(x.fyNom ? { fyNom: x.fyNom } : {}) };
      if (pg.shape === 'I' && x.sectionId) return { ...next, sectionId: x.sectionId, family: sectionById(x.sectionId).family };
      if (pg.shape === 'RHS' && x.hollow) return { ...next, rhs: { h: x.hollow.h!, b: x.hollow.b!, t: x.hollow.t! }, hollowFamily: x.hollow.h === x.hollow.b ? 'SHS' : 'RHS' };
      if (pg.shape === 'CHS' && x.hollow) return { ...next, chs: { d: x.hollow.d!, t: x.hollow.t! } };
      return next;
    });
  };

  const hollowList = shape === 'CHS' ? hollowSections('CHS', page.cf) : shape === 'RHS' ? hollowSections(page.hollowFamily, page.cf) : [];
  const hollowCurrent = hollowList.find((s) => (shape === 'CHS' ? s.dims.d === page.chs.d && s.dims.t === page.chs.t : s.dims.h === page.rhs.h && s.dims.b === page.rhs.b && s.dims.t === page.rhs.t));
  const [pasteText, setPasteText] = useState('');
  const [pasteFormat, setPasteFormat] = useState<'page' | 'etabs'>('page');
  const pasted = parseCombos(pasteText, pasteFormat);

  return (
    <>
      <a href="#verdict" className="skip">Skip to results</a>
      <header className="titlebar">
        <h1>mSteel <span>BeamColumn</span></h1>
        <span className="hint">Beam-column design · EN 1993-1-1 §6.2 section, §6.3 member · I/H, RHS/SHS, CHS · mCalcCanvas engine</span>
        <span className={`status ${busy ? 'busy' : ''}`} aria-hidden="true">{busy ? 'Calculating…' : 'Up to date'}</span>
        <div className="exports" role="group" aria-label="Report">
          <button type="button" onClick={download} className="btn export" title="Download the worksheet at the governing combination; it reopens in mCalcCanvas">.mCCV</button>
          <button type="button" onClick={report} data-testid="open-report" className="btn primary">Open full report</button>
        </div>
      </header>
      <nav className="phone-bar" aria-label="Page sections">
        <a href="#verdict" className={`phone-ur ${pass ? 'pass' : 'fail'}`}>UR {fmt(overall, 3)} {pass ? 'PASS' : 'FAIL'}</a>
        <a href="#design-inputs">Inputs</a><a href="#combos">Combinations</a><a href="#verdict">Checks</a><a href="#diagrams">Section</a>
      </nav>
      <main>
        <div className="workspace steel">
          {/* ── Inputs ── */}
          <form className="panel inputs rows" id="design-inputs" aria-label="Design inputs" onSubmit={(e) => e.preventDefault()} noValidate>
            <section aria-labelledby="h-section">
              <h2 id="h-section">Section</h2>
              <Row desc="Section type">
                <div className="seg" role="radiogroup" aria-label="Section type">
                  {(['I', 'RHS', 'CHS'] as const).map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={shape === s} className={shape === s ? 'on' : ''} data-testid={`shape-${s}`}
                      onClick={() => { set({ shape: s }); setSelected(null); setDesign({ running: false, msg: '', picks: null }); }}>
                      {s === 'I' ? 'I/H' : s === 'RHS' ? 'RHS' : 'CHS'}
                    </button>
                  ))}
                </div>
              </Row>
              {shape === 'I' && <>
                <Row desc="Section family">
                  <select aria-label="Family" value={page.family} onChange={(e) => set({ family: e.target.value, sectionId: iSections(e.target.value)[0].id })}>{I_FAMILIES.map((f) => <option key={f}>{f}</option>)}</select>
                </Row>
                <Row desc="Section size" note={`${sectionById(page.sectionId).standard} · ${fmt(sectionById(page.sectionId).values.mass, 1)} kg/m`}>
                  <select aria-label="Size" data-testid="section-select" value={page.sectionId} onChange={(e) => set({ sectionId: Number(e.target.value) })}>
                    {iSections(page.family).slice().sort((a, b) => a.values.h - b.values.h || a.values.mass - b.values.mass).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Row>
              </>}
              {shape !== 'I' && <>
                <Row desc="Manufacturing process">
                  <select aria-label="Process" value={page.cf} onChange={(e) => set({ cf: Number(e.target.value) as 0 | 1 })}>
                    <option value={0}>Hot-finished</option><option value={1}>Cold-formed</option>
                  </select>
                </Row>
                {shape === 'RHS' && <Row desc="Section family">
                  <select aria-label="Family" value={page.hollowFamily} onChange={(e) => { const fam = e.target.value as 'SHS' | 'RHS'; const first = hollowSections(fam, page.cf)[0].dims; set({ hollowFamily: fam, rhs: { h: first.h!, b: first.b!, t: first.t } }); }}>
                    <option>SHS</option><option>RHS</option>
                  </select>
                </Row>}
                <Row desc="Section size">
                  <select aria-label="Size" data-testid="hollow-select" value={hollowCurrent?.name ?? ''} onChange={(e) => {
                    const s = hollowList.find((x) => x.name === e.target.value);
                    if (s) set(shape === 'CHS' ? { chs: { d: s.dims.d!, t: s.dims.t } } : { rhs: { h: s.dims.h!, b: s.dims.b!, t: s.dims.t } });
                  }}>
                    {!hollowCurrent && <option value="">Custom</option>}
                    {hollowList.slice().sort((a, b) => (a.dims.h ?? a.dims.d!) - (b.dims.h ?? b.dims.d!) || (a.dims.b ?? 0) - (b.dims.b ?? 0) || a.dims.t - b.dims.t).map((s) => <option key={s.name}>{s.name}</option>)}
                  </select>
                </Row>
                {shape === 'RHS' ? ([['h', 'Depth, along z'], ['b', 'Width, along y'], ['t', 'Wall thickness']] as const).map(([k, d]) => (
                  <Row key={k} desc={d} sym={k} unit="mm"><NumberField id={`in-${k}`} label={k} value={page.rhs[k]} onCommit={(n) => set({ rhs: { ...page.rhs, [k]: n } })} /></Row>
                )) : ([['d', 'Outside diameter'], ['t', 'Wall thickness']] as const).map(([k, d]) => (
                  <Row key={k} desc={d} sym={k} unit="mm"><NumberField id={`in-${k}`} label={k} value={page.chs[k]} onCommit={(n) => set({ chs: { ...page.chs, [k]: n } })} /></Row>
                ))}
                <p className="hint">{fmt(mass, 1)} kg/m · properties calculated in the sheet with {page.cf ? 'EN 10219-2' : 'EN 10210-2'} corner radii.</p>
              </>}
            </section>
            <section aria-labelledby="h-mat">
              <h2 id="h-mat">Material and factors</h2>
              <Row desc="Steel grade">
                <select aria-label="Grade" data-testid="grade" value={page.fyNom} onChange={(e) => set({ fyNom: Number(e.target.value) })}>
                  {GRADES.map(([g, f]) => <option key={g} value={f}>{g}</option>)}
                  {!GRADES.some(([, f]) => f === page.fyNom) && <option value={page.fyNom}>f_y = {page.fyNom}</option>}
                </select>
              </Row>
              <Row desc="Yield strength by thickness" note="Product standard (Singapore / UK NA) or EN 1993-1-1 Table 3.1">
                <select aria-label="f_y basis" data-testid="fy-basis" value={page.fyBasis} onChange={(e) => set({ fyBasis: Number(e.target.value) as 0 | 1 })}>
                  <option value={1}>Product std</option><option value={0}>Table 3.1</option>
                </select>
              </Row>
              <Row desc="Yield strength used" sym="f_y" unit="MPa"><output className="num-input out">{fmt(v.fy, 0)}</output></Row>
              <Row desc="Partial factor, cross-section resistance" sym="γ_M0"><NumberField id="in-gm0" label="gamma_M0" value={page.gammaM0} onCommit={(n) => set({ gammaM0: n })} /></Row>
              {shape !== 'CHS' && <Row desc="Shear area factor (EN 1993-1-5)" sym="η"><NumberField id="in-eta" label="eta" value={page.eta} onCommit={(n) => set({ eta: n })} /></Row>}
            </section>
            <section aria-labelledby="h-member">
              <h2 id="h-member">Member (§6.3)</h2>
              {([['Ly', 'System length, buckling about y-y', 'L_y', 'm'], ['ky', 'Effective length factor', 'k_y', ''], ['Lz', 'System length, buckling about z-z', 'L_z', 'm'], ['kz', 'Effective length factor', 'k_z', '']] as const).map(([k, d, sym, u]) => (
                <Row key={k} desc={d} sym={sym} unit={u}><NumberField id={`in-${k}`} label={sym} value={page.member[k]} onCommit={(n) => setMember({ [k]: n })} /></Row>
              ))}
              {shape !== 'CHS' && <Row desc="Unrestrained length for LTB (0 = restrained)" sym="L_LT" unit="m"><NumberField id="in-Llt" label="L_LT" value={page.member.Llt} onCommit={(n) => setMember({ Llt: n })} /></Row>}
              {shape !== 'CHS' && <>
                <Row desc="Moment diagram between lateral restraints" note={choiceLabel(page.member).split(' · ')[0]}>
                  <MomentDiagramButton value={page.member} withC2={shape === 'I'} onChange={(c) => setMember({ nLT: c.nLT, C1: c.C1, C2: c.C2, psi: c.psi })} />
                </Row>
                <div className="row sub">
                  <span className="row-desc">Factors from the diagram</span>
                  <span className="factors"><span>C<sub>1</sub> = <b data-testid="c1-shown">{fmt(page.member.C1, 3)}</b></span>{shape === 'I' && <span>C<sub>2</sub> = <b data-testid="c2-shown">{fmt(page.member.C2, 3)}</b></span>}</span>
                </div>
              </>}
              {shape === 'I' && <Row desc="Load position" sym="z_g">
                <select aria-label="Load position" value={Math.sign(page.member.zg)} onChange={(e) => setMember({ zg: Number(e.target.value) * (v.h ?? 0) / 2 })}>
                  <option value={0}>Shear centre</option><option value={1}>Top flange</option><option value={-1}>Bottom flange</option>
                </select>
              </Row>}
              {shape !== 'CHS' && <Row desc="LTB method">
                <select aria-label="LTB method" data-testid="ltb-method" value={page.member.cNA} onChange={(e) => setMember({ cNA: Number(e.target.value) as 0 | 1 })}>
                  <option value={1}>§6.3.2.3 NA</option><option value={0}>§6.3.2.2</option>
                </select>
              </Row>}
              <Row desc="Equivalent uniform moment factors" note="EN 1993-1-1 Table B.3">
                <CmButton member={page.member} withLT={shape === 'I'} onApply={setMember} />
              </Row>
              <div className="row sub">
                <span className="row-desc">{page.member.cmDef?.calc ? 'Calculated from moment diagrams' : 'Conservative default'}</span>
                <span className="factors">
                  <span>C<sub>my</sub> = <b data-testid="cmy-shown">{fmt(page.member.Cmy, 3)}</b></span>
                  <span>C<sub>mz</sub> = <b data-testid="cmz-shown">{fmt(page.member.Cmz, 3)}</b></span>
                  {shape === 'I' && <span>C<sub>mLT</sub> = <b data-testid="cmlt-shown">{fmt(page.member.CmLT, 3)}</b></span>}
                </span>
              </div>
              <Row desc="Partial factor, member buckling" sym="γ_M1"><NumberField id="in-gm1" label="gamma_M1" value={page.member.gammaM1} onCommit={(n) => setMember({ gammaM1: n })} /></Row>
              <p className="hint">L<sub>cr</sub> = k L. LTB: §6.3.2.3 with the Singapore / UK NA (f with k<sub>c</sub> = 1/√C<sub>1</sub>) or §6.3.2.2. Same member data for every combination. <Rich text={shape === 'I' ? 'M_cr from SN003b, fork ends; torsional buckling with L_cr,T = L_cr,z.' : shape === 'RHS' ? 'M_cr without warping; buckling curve a (hot-finished) or c (cold-formed).' : 'No LTB; buckling curve a (hot-finished) or c (cold-formed).'} /></p>
            </section>
          </form>

          {/* ── Combinations ── */}
          <section className="panel stage" id="combos" aria-labelledby="h-combos">
            <div className="charthead"><h2 id="h-combos">Load combinations (ULS)</h2><span className="hint">N + compression · magnitudes of M and V are used · {page.combos.length} rows</span></div>
            <div className="combo-scroll">
              <table className="load-table combos" data-testid="combos">
                <colgroup><col className="c-name" />{COLS.map(([k]) => <col key={k} />)}<col className="c-cls" /><col className="c-ur" /><col className="c-del" /></colgroup>
                <thead><tr>
                  <th scope="col">Combination</th>
                  {COLS.map(([k, l, u]) => <th key={k} scope="col"><Rich text={l} /><span className="th-note"> {u}</span></th>)}
                  <th scope="col">Class</th><th scope="col">UR</th><th><span className="sr-only">Delete</span></th>
                </tr></thead>
                <tbody>
                  {page.combos.map((c, i) => {
                    const res = ok?.[i], u = res?.v.UR ?? NaN;
                    return (
                      <tr key={`${i}-${page.combos.length}`} className={`${gov?.combo === i ? 'gov' : ''} ${shown === i ? 'sel' : ''}`} onClick={() => setSelected(i)}>
                        <td><input className="name-input" aria-label={`Name, row ${i + 1}`} value={c.name} onChange={(e) => setCombo(i, { name: e.target.value })} /></td>
                        {COLS.map(([k, l]) => <td key={k}><NumberField id={`c${i}-${k}`} label={`${l} row ${i + 1}`} value={c[k] as number} onCommit={(n) => setCombo(i, { [k]: n })} /></td>)}
                        <td className="num">{fmt(res?.v.Class ?? NaN, 0)}</td>
                        <td className={`num ${tone(u)}`} data-testid={`ur-${i}`}>{fmt(u, 3)}</td>
                        <td><button type="button" aria-label={`Delete row ${i + 1}`} className="rowbtn" disabled={page.combos.length === 1} onClick={(e) => { e.stopPropagation(); set({ combos: page.combos.filter((_, k) => k !== i) }); setSelected(null); }}>−</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="tablefoot">
              <button type="button" className="btn" onClick={() => set({ combos: [...page.combos, { name: `ULS${page.combos.length + 1}`, N: 0, My: 0, Mz: 0, Vz: 0, Vy: 0 }] })}>+ Add combination</button>
              <button type="button" className="btn" data-testid="paste-open" onClick={() => { setPasteOpen(true); pasteRef.current?.showModal(); }}>Paste from Excel / ETABS…</button>
            </div>
            <p className="hint table-note">Click a row for its checks. The page runs the worksheet once per combination; the governing row (amber) is the one written into the report.</p>
            <div className="xs" id="diagrams">
              <div><h2 id="h-xs">Cross-section</h2><SectionDrawing shape={shape} v={v} /></div>
              <table className="props" aria-labelledby="h-xs"><tbody>
                {props.map(([l, u, x, d]) => <tr key={l}><td><Rich text={l} /></td><td className="num">{fmt(x, d)}</td><td>{u}</td></tr>)}
                <tr><td>Mass</td><td className="num">{fmt(mass, 1)}</td><td>kg/m</td></tr>
              </tbody></table>
            </div>
            <div className="sheet-head">
              <h2 id="h-sheet">Calculation – {page.combos[shown]?.name}</h2>
              <span className="hint">Main formulas from the worksheet, numbered as the report; every step is in the full report. Click a row to change the combination.</span>
            </div>
            <Formulas groups={sheet} />
          </section>

          {/* ── Verdict ── */}
          <section className="panel verdict-panel" id="verdict" aria-labelledby="h-verdict" aria-live="polite">
            <section aria-labelledby="h-design" className="optimize">
              <div className="opt-line">
                <h3 id="h-design">Optimise section</h3>
                <OptimiseDialog shape={shape} cf={page.cf} fyNom={page.fyNom} running={design.running} progress={design.msg} picks={design.picks} onRun={runDesign} onUse={usePick} />
              </div>
              {design.picks?.[0] && <p className="hint">Lightest passing: <b>{design.picks[0].name}</b> ({fmt(design.picks[0].mass, 1)} kg/m, UR {fmt(design.picks[0].ur, 3)})</p>}
            </section>
            <h2 id="h-verdict">{sectionLabel}</h2>
            <div className="verdict">
              <span className={`ratio ${pass ? 'pass' : 'fail'}`} data-testid="overall-ur">{fmt(overall, 3)}</span>
              <span className={`tag ${pass ? 'pass' : 'fail'}`}>{pass ? 'PASS' : 'FAIL'}</span>
              <span className="what">{gov ? <>Governing: <b>{page.combos[gov.combo]?.name}</b><br /><Rich text={checkLabel(gov.key)} /></> : '…'}</span>
            </div>
            {errors.length > 0 && <p className="error" role="alert">{errors.join(' · ')}</p>}
            <p className="basis">Checks for <b>{page.combos[shown]?.name}</b> · Class <b>{fmt(r?.v.Class ?? NaN, 0)}</b> ({(r?.v.Class ?? 9) <= 2 ? 'plastic' : (r?.v.Class ?? 9) <= 3 ? 'elastic' : 'not covered'}) · ρ = {fmt(r?.v.rho ?? NaN, 3)} · n = {fmt(r?.v.n ?? NaN, 3)}</p>
            <table className="ur" data-testid="checks">
              <tbody>
                {[false, true].map((member) => [
                  <tr key={`h${member}`} className={`group ${(member ? memberUR : sectionUR) >= (member ? sectionUR : memberUR) ? 'governs' : ''}`}>
                    <td>{member ? 'Member (§6.3)' : 'Cross-section (§6.2)'}{(member ? memberUR : sectionUR) >= (member ? sectionUR : memberUR) && <span className="governs-tag">governs</span>}</td>
                    <td className={tone(member ? memberUR : sectionUR)} data-testid={member ? 'member-ur' : 'section-ur'}>{fmt(member ? memberUR : sectionUR, 3)}</td>
                  </tr>,
                  ...checks.filter(([k]) => isMemberCheck(k) === member).map(([k, label, clause]) => {
                    const u = r?.ur[k] ?? NaN, g = gov?.combo === shown && gov.key === k;
                    return <tr key={k} className={g ? 'gov' : ''}><td><Rich text={label} /><span className="clause">EN 1993-1-1 §{clause}</span></td><td className={tone(u)} data-testid={`check-${k}`}>{fmt(u, 3)}</td></tr>;
                  }),
                ])}
              </tbody>
              <tfoot><tr><td colSpan={2} className="gov-note">{Number.isFinite(sectionUR) && Number.isFinite(memberUR) ? (memberUR >= sectionUR
                ? `Member governs: buckling reduces the resistance (χ_y ${fmt(r?.v.chiy ?? NaN, 2)}, χ_z ${fmt(r?.v.chiz ?? NaN, 2)}${shape !== 'CHS' ? `, χ_LT ${fmt(r?.v.chiLT ?? NaN, 2)}` : ''}) and k factors amplify the moments more than the cross-section interaction does.`
                : `Cross-section governs: the member is stocky or braced (χ near 1) and/or C_m < 1 lowers the equivalent moments in (6.61)/(6.62), so the peak-moment section check (§6.2, γ_M0) is larger.`) : ''}</td></tr>
                <tr><td>Combination UR</td><td className={tone(r?.v.UR ?? NaN)}>{fmt(r?.v.UR ?? NaN, 3)}</td></tr></tfoot>
            </table>
          </section>
        </div>

        <div className="results steel-notes"><section><h2>Scope</h2><Scope /></section></div>
      </main>

      <dialog ref={pasteRef} className="opt-dialog wide" aria-label="Paste load combinations" onClose={() => setPasteOpen(false)}>
        {pasteOpen && <div className="opt-form">
          <div className="opt-head"><h2>Paste load combinations</h2><button type="button" className="btn" onClick={() => pasteRef.current?.close()}>Close</button></div>
          <label className="f wide"><span>Columns</span>
            <select value={pasteFormat} onChange={(e) => setPasteFormat(e.target.value as 'page' | 'etabs')} data-testid="paste-format">
              <option value="page">Name, N, M_y, M_z, V_z, V_y (as this table; N + compression)</option>
              <option value="etabs">ETABS frame forces: … P, V2, V3, T, M2, M3 (last six numbers; P + tension)</option>
            </select>
          </label>
          <textarea data-testid="paste-text" rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={pasteFormat === 'etabs' ? 'Story\tColumn\tUnique\tOutput Case\tCase Type\tStation\tP\tV2\tV3\tT\tM2\tM3' : 'ULS1\t2200\t180\t25\t90\t10'} />
          <p className="hint">{pasted.length} row{pasted.length === 1 ? '' : 's'} read. {pasteFormat === 'etabs' ? 'N = −P, M_y = M3, M_z = M2, V_z = V2, V_y = V3 (column local axes: 2 along the web). Text cells form the name.' : 'Text cells form the name; missing numbers are 0.'}</p>
          <div className="tablefoot">
            <button type="button" className="btn primary" data-testid="paste-replace" disabled={!pasted.length} onClick={() => { set({ combos: pasted }); setSelected(null); pasteRef.current?.close(); setPasteText(''); }}>Replace</button>
            <button type="button" className="btn" disabled={!pasted.length} onClick={() => { set({ combos: [...page.combos, ...pasted] }); pasteRef.current?.close(); setPasteText(''); }}>Append</button>
          </div>
        </div>}
      </dialog>
    </>
  );
}

/** One input row: description (with symbol and unit) on the left, a single control on the right; block: control below. */
function Row({ desc, sym, unit, note, block, children }: { desc: string; sym?: string; unit?: string; note?: string; block?: boolean; children: React.ReactNode }) {
  const Tag = block ? 'div' : 'label';
  return (
    <Tag className={`row ${block ? 'block' : ''}`}>
      <span className="row-desc"><Rich text={desc} />{sym ? <> <span className="row-sym"><Rich text={sym} />{unit ? ` (${unit})` : ''}</span></> : unit ? <span className="row-sym"> ({unit})</span> : null}{note ? <small>{note}</small> : null}</span>
      <span className="row-ctl">{children}</span>
    </Tag>
  );
}

function Formulas({ groups }: { groups: SummaryGroup[] | null }) {
  if (!groups) return null;
  return (
    <div className="formulas" data-testid="sheet">
      {groups.map((g) => (
        <section key={g.title}>
          <h3>{g.title}</h3>
          <table><tbody>
            {g.lines.map((l, i) => (
              <tr key={i} className={l.ur !== undefined ? 'ur-line' : ''}>
                <td className="f-label">{l.label}</td>
                <td className={`f-math ${l.error ? 'err' : ''}`} title={l.error}><MathRenderer latex={l.latex} />{l.basis && <div className="f-basis">{l.basis.split(/;\s+|:\s+/).map((part, k) => <div key={k}><Rich text={part} /></div>)}</div>}</td>
                <td className="f-tag">{l.ur !== undefined && <span className={`tag ${tone(l.ur)}`}>{l.ur <= 1 ? 'OK' : 'NG'}</span>}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
      ))}
    </div>
  );
}

function Scope() {
  return (
    <ul className="hint scope">
      <li>Cross-section §6.2 and member §6.3 (flexural, torsional (I/H) and lateral-torsional buckling; (6.61), (6.62) with Annex B Method 2). Uniform member, same lengths and C<sub>m</sub> for every combination; tension: no buckling, N = 0 in the interaction.</li>
            <li>Shear above 0.5V<sub>pl</sub> reduces f<sub>y</sub> on the whole section (conservative). Class 4, torsion, holes, shear buckling: not covered.</li>
      <li>CHS: M<sub>N,Rd</sub> = M<sub>pl,Rd</sub>(1 − n<sup>1.7</sup>), SCI P363 (Blue Book); RHS (6.39)–(6.41); I/H (6.33)–(6.41).</li>
    </ul>
  );
}
