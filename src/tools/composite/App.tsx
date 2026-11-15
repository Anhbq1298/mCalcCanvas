/**
 * mCompositeBeamDesign – a design front end for the EC4 composite beam worksheet.
 * Every number on this page is read from the worksheet, calculated by the CalcCanvas
 * engine in a worker (worker.ts, model.ts); the report is that worksheet with these inputs.
 * Look: MBColumnLite (drawing-sheet layout, hairline rules, title block) set in Roboto;
 * behaviour follows Chrome's modern-web guidance (work off the main thread, validation
 * after interaction, one polite live region, rem sizing).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { sections } from '../../engineering/steel/sections';
import { CHECKS, governingCheck, type InputField, type LoadTable, type Results } from './model';
import type { OptimizeResult, ToWorker } from './worker';
import { Legend, LineChart, PointDrawing, SectionDrawing, ShearSurface3D, UdlDrawing, type AreaLoad, type PointLoad } from './charts';
import { headerParts } from '../../canvas/inputTable';
import { C, fmt } from './format';
import { optimizeParallel, warmOptimizer } from './optimizer';
import { Rich } from './rich';

const HANDOFF_KEY = 'calccanvas.handoff'; // read once by mCalcCanvas (?open=handoff)
const GREEK: Record<string, string> = { gamma: 'γ', psi: 'ψ', varphi: 'φ', varepsilon: 'ε', alpha: 'α', rho: 'ρ', eta: 'η', delta: 'δ', theta: 'θ', kappa: 'κ', chi: 'χ', lambda: 'λ' };
const NUMBER = /^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;
const FAMILIES = ['UB', 'UC', 'IPE', 'HEA', 'HEB', 'HEM', 'W'];
const unit = (u: string) => u.replace('^2', '²').replace('^3', '³').replace('^4', '⁴').replace('^-1', '⁻¹');

/** s_{sc.A} → s<sub>sc.A</sub>; \gamma_{M0} → γ<sub>M0</sub>. */
function Sym({ latex }: { latex: string }) {
  const m = /^\\?([A-Za-z]+)(?:_\{?([^}]*)\}?)?$/.exec(latex.replace(/\\mathrm\{([^}]*)\}/, '$1'));
  if (!m) return <i>{latex}</i>;
  const base = latex.startsWith('\\') ? (GREEK[m[1]] ?? m[1]) : m[1];
  return (
    <span className="sym">
      <i>{base}</i>
      {m[2] && <sub>{m[2].replace(/\\?([a-z]{3,})/g, (w, g: string) => GREEK[g] ?? w)}</sub>}
    </span>
  );
}


const tone = (v: number) => (!Number.isFinite(v) ? '' : v > 1 ? 'fail' : v > 0.9 ? 'warn' : 'pass');

/** A number field, validated after interaction; its error text is linked only while shown. */
function NumberField({ id, label, value, onCommit }: { id: string; label: string; value: string; onCommit: (n: number) => void }) {
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  const err = `${id}-error`;
  return (
    <span className="field-wrap">
      <input
        id={id}
        aria-label={label}
        data-input={label}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid}
        aria-describedby={invalid ? err : undefined}
        className="num-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const ok = NUMBER.test(text);
          setInvalid(!ok);
          if (ok && Number(text) !== Number(value)) onCommit(Number(text));
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {invalid && (
        <span id={err} className="field-error">
          Error: enter a number, e.g. 2.5
        </span>
      )}
    </span>
  );
}

interface State {
  inputs: InputField[];
  tables: LoadTable[];
  sectionId: number;
  results: Results;
  defaults: { tables: LoadTable[]; sectionId: number };
}

export function App() {
  const worker = useMemo(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), []);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, number>>({});
  const [family, setFamily] = useState('UB');
  const [hMax, setHMax] = useState('');
  const [opt, setOpt] = useState<{ running: boolean; i?: number; n?: number; name?: string; result?: OptimizeResult; seconds?: number } | null>(null);
  const reportReq = useRef(0);
  const reportCb = useRef<((doc: unknown) => void) | null>(null);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.kind === 'init') {
        // build the optimiser's worker models in the background, after the page is up
        setTimeout(() => warmOptimizer({ values: {}, tables: m.tables.map((t: LoadTable) => ({ id: t.id, rows: t.rows })) }), 2500);
        setState({ inputs: m.inputs, tables: m.tables, sectionId: m.sectionId, results: m.results, defaults: { tables: m.tables, sectionId: m.sectionId } });
        setFamily(sections.find((s) => s.id === m.sectionId)?.family ?? 'UB');
      } else if (m.kind === 'results') {
        setState((s) => (s ? { ...s, results: m.results, tables: m.tables, sectionId: m.sectionId } : s));
        setBusy(false);
      } else if (m.kind === 'report' && m.request === reportReq.current) reportCb.current?.(m.doc);
      else if (m.kind === 'opt-progress') setOpt({ running: true, i: m.i, n: m.n, name: m.name });
      else if (m.kind === 'opt-done') setOpt({ running: false, result: m.result });
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ kind: 'hello' } satisfies ToWorker); // asked for once listening, so the first results cannot be missed
    return () => worker.removeEventListener('message', onMessage);
  }, [worker]);

  const send = (msg: ToWorker) => {
    if (msg.kind !== 'report') setBusy(true);
    worker.postMessage(msg);
  };
  const withReport = (fn: (doc: unknown) => void) => {
    reportCb.current = fn;
    send({ kind: 'report', request: ++reportReq.current });
  };

  if (!state) {
    return (
      <div className="loading" role="status">
        <span className="dot" aria-hidden="true" /> Loading the composite beam worksheet…
      </div>
    );
  }

  const { inputs, tables, results: res } = state;
  const value = (f: InputField) => values[f.id] ?? f.value;
  const gammaOf = (q: boolean) => { const f = inputs.find((x) => x.name === (q ? '\\gamma_Q' : '\\gamma_G')); return f ? value(f) : q ? 1.5 : 1.35; };
  const factorCol = (t: LoadTable) => t.headers.findIndex((h) => /gamma_\{?F/.test(h));
  const groups = [...inputs.reduce((g, f) => g.set(f.group, [...(g.get(f.group) ?? []), f]), new Map<string, InputField[]>()).entries()];
  const sb = value(inputs.find((f) => f.name === 's_b')!);
  const [areaT, pointT] = tables;
  const filled = (r: string[]) => r.slice(1).some((x) => x.trim());
  const area: AreaLoad[] = areaT.rows.filter(filled).map((r) => ({ q: r[0].trim().toUpperCase() === 'Q', x1: Number(r[1]), x2: Number(r[2]), p: Number(r[3]), gF: Number(r[4]) }));
  const points: PointLoad[] = pointT.rows.filter(filled).map((r) => ({ q: r[0].trim().toUpperCase() === 'Q', a: Number(r[1]), F: Number(r[2]), gF: Number(r[3]) }));
  const v = res.vectors;
  const composite = res.comp >= 1;
  const shown = CHECKS.filter(([key, , , basis]) => key !== 'des' && (!basis || (basis === 'c') === composite));
  const gov = governingCheck(res);
  const overall = gov.ur;
  const governing = shown.find(([key]) => key === gov.key) ?? shown[0];
  const section = sections.find((s) => s.id === state.sectionId);
  const pass = overall <= 1;

  const setInput = (f: InputField, n: number) => {
    setValues((vs) => ({ ...vs, [f.id]: n }));
    send({ kind: 'input', id: f.id, value: n });
  };
  const setRows = (t: LoadTable, rows: string[][]) => {
    setState((s) => s && { ...s, tables: s.tables.map((x) => (x.id === t.id ? { ...x, rows } : x)) });
    send({ kind: 'table', id: t.id, rows });
  };
  const download = () =>
    withReport((doc) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(doc)], { type: 'application/json' }));
      a.download = 'Composite_Beam_EC4.mCCV';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  const report = () =>
    withReport((doc) => {
      try {
        localStorage.setItem(HANDOFF_KEY, JSON.stringify(doc));
        window.open('../?open=handoff', '_blank', 'noopener');
      } catch {
        download();
      }
    });

  const changed = (f: InputField) => f.id in values && values[f.id] !== f.value;
  const nChanged = inputs.filter(changed).length + (state.sectionId !== state.defaults.sectionId || JSON.stringify(tables) !== JSON.stringify(state.defaults.tables) ? 1 : 0);
  const reset = () => {
    const d = state.defaults;
    inputs.filter(changed).forEach((f) => send({ kind: 'input', id: f.id, value: f.value }));
    setValues({});
    d.tables.forEach((t) => setRows(t, t.rows));
    if (state.sectionId !== d.sectionId) {
      send({ kind: 'section', id: d.sectionId });
      setFamily(sections.find((x) => x.id === d.sectionId)?.family ?? 'UB');
    }
  };
  const urDes = res['UR.des'];
  const dMax = composite ? res.dmax : res.dnc;
  const rows = CHECKS.filter(([key, , , basis]) => key !== 'des' && (!basis || (basis === 'c') === composite));
  const nFail = shown.filter(([key]) => res[`UR.${key}`] > 1).length;

  const sectionProps: [string, string, string, number][] = [
    ['h_a', 'h_a', 'mm', 1], ['b_a', 'b_a', 'mm', 1], ['t_f', 't_f', 'mm', 1], ['t_w', 't_w', 'mm', 1], ['r', 'r', 'mm', 1], ['A_a', 'A_a', 'cm²', 2],
    ['I_a', 'I_a', 'cm⁴', 0], ['W_{pl}', 'W_pl', 'cm³', 1], ['m_a', 'm_a', 'kg/m', 1], ['b_{eff}', 'b_eff', 'mm', 0], ['I_0', 'I_0', 'cm⁴', 0], ['I_L', 'I_L', 'cm⁴', 0],
    ['M_{a.Rd}', 'MaRd', 'kNm', 1], ['M_{pl.Rd}', 'MplRd', 'kNm', 1], ['V_{pl.Rd}', 'VplRd', 'kN', 1],
  ];
  const loadTable = (t: LoadTable, ti: number) => (
    <section aria-labelledby={`h-table-${ti}`} key={t.id}>
      <h2 id={`h-table-${ti}`}>{ti === 0 ? 'Distributed loads' : 'Point loads'}</h2>
      <table className="load-table">
        <colgroup><col className="c-case" />{t.headers.slice(1).map((_, j) => <col key={j} />)}<col className="c-del" /></colgroup>
        <thead>
          <tr>
            {t.headers.map((h, j) => (
              <th key={j} scope="col" title={headerParts(h).caption || undefined}>{j === 0 ? 'Case' : <><Sym latex={(headerParts(h).variable ?? h).replace(/_([^{\s]+)$/, '_{$1}').replace(/\.[ij]\}$/, '}')} />{j === factorCol(t) ? <span className="th-note"> ULS</span> : null} {t.units[j] ? `(${unit(t.units[j])})` : ''}</>}</th>
            ))}
            <th><span className="sr-only">Delete</span></th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, i) => (
            <tr key={`${t.id}-${i}-${t.rows.length}`}>
              {row.map((cell, j) => (
                <td key={j}>
                  {j === 0 ? (
                    <select aria-label={`Load pattern, row ${i + 1}`} className={cell.trim().toUpperCase() === 'Q' ? 'case-q' : 'case-g'} value={cell.trim().toUpperCase() === 'Q' ? 'Q' : 'G'} onChange={(e) => {
                      const fi = factorCol(t), q = e.target.value === 'Q';
                      setRows(t, t.rows.map((r, k) => (k !== i ? r : r.map((c, m) => (m === 0 ? e.target.value : m === fi && (!c.trim() || Number(c) === gammaOf(!q)) ? String(gammaOf(q)) : c)))));
                    }}>
                      <option value="G">G</option>
                      <option value="Q">Q</option>
                    </select>
                  ) : (
                    <NumberField id={`t${ti}r${i}c${j}`} label={`${t.headers[j]} row ${i + 1}`} value={cell} onCommit={(n) => setRows(t, t.rows.map((r, k) => (k === i ? r.map((c, m) => (m === j ? String(n) : c)) : r)))} />
                  )}
                </td>
              ))}
              <td>
                <button type="button" aria-label={`Delete row ${i + 1}`} className="rowbtn" onClick={() => setRows(t, t.rows.filter((_, k) => k !== i))}>−</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tablefoot">
        <button type="button" className="btn" onClick={() => setRows(t, [...t.rows, t.headers.map((_, j) => (j === 0 ? 'G' : j === factorCol(t) ? String(gammaOf(false)) : '0'))])}>+ Add load</button>
        <span className="count">{t.rows.length} row{t.rows.length === 1 ? '' : 's'}</span>
      </div>
      <p className="hint table-note">
        {ti === 0 ? (
          <>Enter area loads p<sub>k</sub> in kPa: the line load p<sub>k</sub>·s<sub>b</sub> (s<sub>b</sub> = {fmt(sb, 2)} m) and its ULS value γ<sub>F</sub>·p<sub>k</sub>·s<sub>b</sub> are calculated. </>
        ) : (
          <>Point loads F<sub>k</sub> in kN at a from support A; ULS value γ<sub>F</sub>·F<sub>k</sub>. </>
        )}
        Case G/Q sets the SLS combination; γ<sub>F</sub> is the ULS factor of the row (blank = γ<sub>G</sub> {fmt(gammaOf(false), 2)} / γ<sub>Q</sub> {fmt(gammaOf(true), 2)}).
        {ti === 0 && <> Self-weight g<sub>0</sub> (steel + slab) is added automatically with a fixed ULS factor γ<sub>G,sw</sub> = {fmt(res.gsw, 2)} (not editable).</>}
      </p>
    </section>
  );

  return (
    <>
      <a href="#verdict" className="skip">Skip to results</a>
      <header className="titlebar">
        <h1>mComposite <span>BeamDesign</span></h1>
        <span className="hint">Simply supported composite beam · EN 1994-1-1 · solid slab · mCalcCanvas engine</span>
        <span className={`status ${busy ? 'busy' : ''}`} aria-hidden="true">{busy ? 'Calculating…' : 'Up to date'}</span>
        <div className="exports" role="group" aria-label="Report">
          <button type="button" onClick={reset} disabled={!nChanged} className="btn export" title="Back to the worksheet's default inputs">Reset{nChanged ? ` (${nChanged})` : ''}</button>
          <button type="button" onClick={download} className="btn export" title="Download the worksheet with these inputs; it reopens in mCalcCanvas">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" strokeWidth="1.3" strokeLinejoin="round" /><path d="M9.5 1.5V5H13" fill="none" strokeWidth="1.3" strokeLinejoin="round" /><path d="M8.5 7.5v4.5M6.5 10l2 2 2-2" fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            .mCCV
          </button>
          <button type="button" onClick={report} data-testid="open-report" className="btn primary">Open full report</button>
        </div>
      </header>

      <main>
        <div className="workspace">
          {/* ── Inputs ── */}
          <form className="panel inputs" aria-label="Design inputs" onSubmit={(e) => e.preventDefault()} noValidate>
            <section aria-labelledby="h-section">
              <h2 id="h-section">Steel section</h2>
              <div className="fields">
                <label className="f"><span>Family</span>
                  <select id="family" value={family} onChange={(e) => setFamily(e.target.value)}>
                    {FAMILIES.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </label>
                <label className="f"><span>Section</span>
                  <select id="section" data-testid="section-select" value={section?.family === family ? state.sectionId : ''} onChange={(e) => send({ kind: 'section', id: Number(e.target.value) })}>
                    {section?.family !== family && <option value="">Choose…</option>}
                    {sections.filter((x) => x.family === family).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
                <p className="hint wide">{section ? `${section.name} · ${section.standard} · ${fmt(section.values.mass, 1)} kg/m` : ''}</p>
                <div className="wide optimize">
                  <div className="optimize-row">
                  <label className="f" htmlFor="hmax">
                    <span>Max depth h<sub>max</sub> (mm), blank = no limit</span>
                    <input
                      id="hmax"
                      data-testid="hmax"
                      className="num-input"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="no limit"
                      aria-invalid={hMax.trim() !== '' && !(Number(hMax) > 0)}
                      aria-describedby={hMax.trim() !== '' && !(Number(hMax) > 0) ? 'hmax-error' : undefined}
                      value={hMax}
                      onChange={(e) => setHMax(e.target.value)}
                    />
                    {hMax.trim() !== '' && !(Number(hMax) > 0) && <span id="hmax-error" className="field-error">Error: enter a depth in mm, e.g. 350</span>}
                  </label>
                  <button
                    type="button"
                    className="btn"
                    data-testid="optimize"
                    disabled={opt?.running || (hMax.trim() !== '' && !(Number(hMax) > 0))}
                    onClick={async () => {
                      const maxDepth = hMax.trim() ? Number(hMax) : null;
                      const cands = sections
                        .filter((x) => x.family === family && Number.isFinite(x.values.mass) && (maxDepth === null || x.values.h <= maxDepth + 1e-9))
                        .sort((a, b) => a.values.mass - b.values.mass);
                      setOpt({ running: true });
                      const t0 = performance.now();
                      const result = await optimizeParallel(family, cands, maxDepth, { values, tables: state.tables.map((t) => ({ id: t.id, rows: t.rows })) }, (i, n, name) => setOpt({ running: true, i, n, name }));
                      setOpt({ running: false, result, seconds: (performance.now() - t0) / 1000 });
                      if (result.best) send({ kind: 'section', id: result.best.id });
                    }}
                    title={`Try every ${family} section from the lightest up and keep the first that passes all checks`}
                  >
                    {opt?.running ? 'Optimizing…' : `Optimize: lightest ${family}`}
                  </button>
                  </div>
                  <p className="hint" role="status" data-testid="optimize-status">
                    {opt?.running && opt.n ? <>Checked {opt.i} of {opt.n}: {opt.name}</> : null}
                    {!opt?.running && opt?.result ? (
                      opt.result.best ? (
                        <>Lightest {opt.result.family}{opt.result.maxDepth !== null ? <> with h ≤ {fmt(opt.result.maxDepth, 0)} mm</> : null} passing all checks: <b>{opt.result.best.name}</b> ({fmt(opt.result.best.mass, 1)} kg/m, h = {fmt(sections.find((x) => x.id === opt.result!.best!.id)?.values.h ?? NaN, 1)} mm), governing UR {fmt(opt.result.best.ur, 3)} (<Rich text={opt.result.best.label} />). Checked {opt.result.tried} of {opt.result.total}, lightest first{opt.seconds !== undefined ? `, ${fmt(opt.seconds, 1)} s` : ''}.</>
                      ) : (
                        <span className="error">No {opt.result.family} section{opt.result.maxDepth !== null ? <> with h ≤ {fmt(opt.result.maxDepth, 0)} mm</> : null} passes all checks with these inputs ({opt.result.total} tried); the section is unchanged.</span>
                      )
                    ) : null}
                  </p>
                </div>
              </div>
            </section>
            {loadTable(areaT, 0)}
            {loadTable(pointT, 1)}
            {groups.map(([g, fields], gi) => (
              <section key={g} aria-labelledby={`h-group-${gi}`}>
                <h2 id={`h-group-${gi}`}>{g}</h2>
                <div className="fields">
                  {fields.map((f) => (
                    <label key={f.id} className={`f ${changed(f) ? 'changed' : ''}`} htmlFor={`in-${f.id}`}>
                      <span><Sym latex={f.name} />{f.unit ? ` (${unit(f.unit)})` : ''} <em><Rich text={f.label} /></em></span>
                      <NumberField id={`in-${f.id}`} label={f.name} value={String(value(f))} onCommit={(nv) => setInput(f, nv)} />
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </form>

          {/* ── Loading sheet ── */}
          <section className="stage" aria-labelledby="h-loading">
            <div className="stagebar">
              <h2 id="h-loading">Loading</h2>
              <span className="hint">span L = {fmt(res.L, 2)} m · beam spacing s<sub>b</sub> = {fmt(sb, 2)} m · self-weight g<sub>0</sub> = {fmt(res.g0, 2)} kN/m</span>
              <span className="layers"><i className="lg" /> G permanent <i className="lq" /> Q variable</span>
            </div>
            <div className="sheet">
              <h3>Uniformly distributed loads</h3>
              <UdlDrawing L={res.L} area={area} sb={sb} sw={{ ga: res.ga, gc: res.gc, gF: res.gsw }} />
              <h3>Point loads</h3>
              <PointDrawing L={res.L} points={points} />
            </div>
            <table className="stage-table">
              <caption className="sr-only">Load effects</caption>
              <thead>
                <tr><th scope="col">Load effect</th><th scope="col">ULS</th><th scope="col">Construction</th></tr>
              </thead>
              <tbody>
                <tr><td>Reaction R<sub>A</sub> / R<sub>B</sub> (kN)</td><td>{fmt(v.V[0], 1)} / {fmt(-(v.V[v.V.length - 1] ?? NaN), 1)}</td><td>–</td></tr>
                <tr><td>M<sub>Ed</sub> max (kNm)</td><td>{fmt(res.M2, 1)} at {fmt(res.xM, 2)} m</td><td>{fmt(res.M1, 1)}</td></tr>
                <tr><td>Line load w<sub>Ed</sub> (kN/m)</td><td>–</td><td>{fmt(res.w1, 2)} over {fmt(res.L1, 2)} m</td></tr>
              </tbody>
            </table>
            <section className="sheet-sec" aria-labelledby="h-forces">
              <div className="sec-head"><h2 id="h-forces">Internal forces, ULS</h2><span className="hint">hover or ← → on a chart to read values</span></div>
                        <h3>Shear V<sub>Ed</sub>, max {fmt(res.V2, 1)} kN</h3>
            <LineChart series={[{ x: v.x, y: v.V, color: C.blue, label: 'V', fill: true }]} height={130} yUnit="kN" label={`Shear force diagram, ${fmt(res.V2, 1)} kN at the support`} />
            <h3>Moment M<sub>Ed</sub> and resistance M<sub>Rd</sub>(x) from the studs</h3>
            <LineChart series={[{ x: v.x, y: v.M, color: C.red, label: 'M_Ed', fill: true }, ...(composite ? [{ x: v.x, y: v.MRdx, color: C.blue, label: 'M_Rd' }] : [])]} height={160} invertY yUnit="kNm" labels={[{ x: res.xM, y: res.M2, text: fmt(res.M2, 1), color: C.red }]} label={`Bending moment diagram, maximum ${fmt(res.M2, 1)} kNm at ${fmt(res.xM, 2)} m`} />
            <Legend items={[{ color: C.red, label: 'M_Ed(x)' }, ...(composite ? [{ color: C.blue, label: 'M_Rd(x), studs provided' }] : [])]} />
          </section>

            <section className="sheet-sec" aria-labelledby="h-pna-d">
              <div className="sec-head"><h2 id="h-pna-d">Plastic stress block at x<sub>M</sub></h2><span className="hint">PNA {['in the slab', 'in the top flange', 'in the fillet', 'in the web'][res.kM] ?? '–'}</span></div>
              <SectionDrawing r={res} showPna />
            </section>
            <section className="sheet-sec" aria-labelledby="h-shear3d">
              <div className="sec-head"><h2 id="h-shear3d">Longitudinal shear surfaces a-a and b-b</h2><span className="hint">EN 1994-1-1 §6.6.6.1, Figure 6.15; both surfaces run the whole length of the beam</span></div>
              <div className="surfaces">
                <figure>
                  <ShearSurface3D r={res} which="a" />
                  <figcaption><b className="c-a">a-a</b>: two vertical planes through h<sub>c</sub> = {fmt(res.h_c, 0)} mm at the flange edges; v<sub>f</sub>/2 on each; crossed by top and bottom bars, A<sub>t</sub> + A<sub>b</sub> = {fmt(res.asf, 0)} mm²/m; v<sub>Ed</sub> = {fmt(res.vLEd, 2)} MPa.</figcaption>
                </figure>
                <figure>
                  <ShearSurface3D r={res} which="b" />
                  <figcaption><b className="c-b">b-b</b>: around the studs, l<sub>b</sub> = 2h<sub>sc</sub> + d<sub>head</sub> + b<sub>0</sub> = {fmt(res.lb, 0)} mm; the whole v<sub>f</sub>; crossed by the bottom bars twice, 2A<sub>b</sub> = {fmt(res.asb, 0)} mm²/m; v<sub>Ed</sub> = {fmt(res.vbEd, 2)} MPa.</figcaption>
                </figure>
              </div>
              <p className="hint">Front face = cross-section to scale; the length along the span is not. Bars counted must be anchored past each surface (EC2 §8.4). v<sub>f</sub> = P<sub>Rd</sub>/s<sub>min</sub> = {fmt(res.vf, 0)} kN/m pulls the slab outstand along the beam.</p>
            </section>
            <section className="sheet-sec" aria-labelledby="h-defl1">
              <div className="sec-head"><h2 id="h-defl1">Deflection, construction stage (steel alone)</h2><span className="hint">w<sub>1,k</sub> = g<sub>0</sub> + (g<sub>form</sub> + q<sub>con</sub>)·s<sub>b</sub> = {fmt(res.w1k, 2)} kN/m over L<sub>1</sub> = {fmt(res.L1, 2)} m</span></div>
              <LineChart
                series={[
                  { x: v.x1v, y: v.d1v, color: C.blue, label: 'δ_1' },
                  { x: [v.x1v[0] ?? 0, v.x1v[v.x1v.length - 1] ?? 1], y: [res.dlim, res.dlim], color: C.red, label: 'limit', dash: true, width: 1.2 },
                ]}
                height={170}
                invertY
                yUnit="mm"
                label={`Construction deflection, maximum ${fmt(res.d1, 1)} mm against a limit of ${fmt(res.dlim, 1)} mm`}
              />
              <Legend items={[{ color: C.blue, label: `δ_1(x), steel alone, max ${fmt(res.d1, 1)} mm` }, { color: C.red, label: `limit L/r = ${fmt(res.dlim, 1)} mm`, dash: true }]} />
            </section>
            <section className="sheet-sec" aria-labelledby="h-defl">
              <div className="sec-head"><h2 id="h-defl">Deflection, permanent stage, {composite ? 'composite (partial interaction)' : 'bare steel'}</h2><span className="hint">1.0 DL + 1.0 LL, permanent stage</span></div>
            <LineChart
              series={[
                { x: v.x, y: v.d, color: C.blue, label: 'DL+LL' },
                { x: v.x, y: v.dq, color: C.green, label: 'LL', width: 1.4 },
                { x: [v.x[0] ?? 0, v.x[v.x.length - 1] ?? 1], y: [res.dlim, res.dlim], color: C.red, label: 'limit', dash: true, width: 1.2 },
              ]}
              height={190}
              invertY
              yUnit="mm"
              label={`Deflection, maximum ${fmt(dMax, 1)} mm against a limit of ${fmt(res.dlim, 1)} mm`}
            />
            <Legend items={[{ color: C.blue, label: `1.0 DL + 1.0 LL, max ${fmt(dMax, 1)} mm` }, { color: C.green, label: `LL, max ${fmt(Math.max(...v.dq), 1)} mm` }, { color: C.red, label: `limit L/r = ${fmt(res.dlim, 1)} mm`, dash: true }]} />
            </section>
          </section>

          {/* ── Verdict ── */}
          <section className="verdict-panel" id="verdict" tabIndex={-1} aria-labelledby="h-verdict">
            <div className="pin panel">
            <h2 id="h-verdict">Check</h2>
            <div data-testid="verdict" aria-live="polite" aria-atomic="true">
              <div className="verdict">
                <span className={`ratio ${pass ? 'pass' : 'fail'}`} data-testid="ur-max">{fmt(overall, 3)}</span>
                <span className="what">governing UR<br /><Rich text={governing[1]} /></span>
                <span className={`tag ${pass ? 'pass' : 'fail'}`}>{pass ? 'PASS' : 'FAIL'}</span>
              </div>
              <p className="basis">
                Design basis <b className={composite ? 'basis-c' : 'basis-n'}>{composite ? 'Composite' : 'Bare steel (not composite)'}</b>
                <br />Permanent stage UR <b className={`num ${tone(urDes)}`}>{fmt(urDes, 3)}</b>{nFail ? ` · ${nFail} check${nFail > 1 ? 's' : ''} over 1.0` : ''}
              </p>
            </div>
            {!composite && (
              <p className="basis-note" data-testid="basis-note" role="note">
                <b>Not designed as composite.</b> The studs that fit cannot give composite action (η = {fmt(res.eta, 3)}, η<sub>min</sub> = {fmt(res.etaMin, 3)}, or M<sub>Rd</sub>(x) &lt; M<sub>Ed</sub>(x)). Designed as <b>bare steel</b> to EN 1993-1-1 / 1-5 with L<sub>LT</sub> = stud spacing ({fmt(res.LLTnc, 0)} mm, EN 1994-1-1 §6.4.1(1)); the UR uses the steel-alone deflection.
              </p>
            )}
            {res.errors.length > 0 && <p className="error" role="alert">Worksheet errors: {res.errors.slice(0, 3).join(' · ')}</p>}
            <table className="ur" data-testid="ur-table">
              <caption className="sr-only">Utilisation ratios by check and clause</caption>
              <thead>
                <tr><th scope="col">Check</th><th scope="col">UR</th></tr>
              </thead>
              <tbody>
                {rows.map(([key, label, clause]) => {
                  const u = res[`UR.${key}`];
                  return (
                    <tr key={key} className={key === governing[0] ? 'gov' : ''}>
                      <td><Rich text={label} /><span className="clause">{clause}</span></td>
                      <td className={tone(u)}>
                        {fmt(u, 3)}
                        {u > 1 && <span className="sr-only"> (fails)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td>Permanent stage, design basis used</td><td className={tone(urDes)} data-testid="ur-des">{fmt(urDes, 3)}</td></tr>
              </tfoot>
            </table>
            <p className="caption">Construction-stage checks apply to both bases; {composite ? 'bare-steel' : 'composite'} checks are in the full report. Amber bar: governing check.</p>
            </div>
          </section>
        </div>

        {/* ── Results ── */}
        <div className={`results ${busy ? 'is-busy' : ''}`} aria-busy={busy}>
          <section aria-labelledby="h-props">
            <h2 id="h-props">Section properties</h2>
            <table className="props">
              <caption className="sr-only">Section properties</caption>
              <tbody>
                {sectionProps.map(([n, k, u, d]) => (
                  <tr key={k}><td><Sym latex={n} /></td><td>{fmt(res[k], d)}</td><td>{u}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="h-pna">
            <h2 id="h-pna">Plastic neutral axis, shear connection</h2>
            <table className="props">
              <caption className="sr-only">Plastic resistance and shear connection</caption>
              <tbody>
                <tr><td>PNA at x<sub>M</sub></td><td colSpan={2}>{['in the slab', 'in the top flange', 'in the fillet', 'in the web'][res.kM] ?? '–'}</td></tr>
                <tr><td>M<sub>Rd</sub> (6.3) / rigid-plastic</td><td>{fmt(res.MRd, 1)} / {fmt(res.MRdpl, 1)}</td><td>kNm</td></tr>
                <tr><td>N<sub>c</sub> = η N<sub>c,f</sub></td><td>{fmt(res.Nc, 0)}</td><td>kN</td></tr>
                <tr><td>η / η<sub>min</sub></td><td className={res.eta < res.etaMin ? 'fail' : ''}>{fmt(res.eta, 3)} / {fmt(res.etaMin, 3)}</td><td></td></tr>
                <tr><td>Studs needed / provided</td><td className={res.nreq > res.nh ? 'fail' : ''}>{fmt(res.nreq, 0)} / {fmt(res.nh, 0)}</td><td>per span</td></tr>
                <tr><td>Studs A→x<sub>M</sub> / x<sub>M</sub>→B</td><td>{fmt(res.nA, 0)} / {fmt(res.nB, 0)}</td><td></td></tr>
                <tr><td>P<sub>Rd</sub> per stud</td><td>{fmt(res.PRd, 2)}</td><td>kN</td></tr>
              </tbody>
            </table>
          </section>
          <section aria-labelledby="h-long">
            <h2 id="h-long">Longitudinal shear in the slab</h2>
            <p className="hint">EN 1994-1-1 §6.6.6 with EN 1992-1-1 §6.2.4. v<sub>f</sub> = P<sub>Rd</sub>/s<sub>min</sub> = {fmt(res.vf, 1)} kN/m; f<sub>sd</sub> = {fmt(res.fsd, 1)} MPa; ν f<sub>cd</sub> = {fmt(res.vmax, 2)} MPa. cot θ<sub>f</sub> is chosen per surface: the largest value in 1.0–2.0 (EC2 §6.2.4(4)) that keeps the strut within ν f<sub>cd</sub>, which needs the least steel.</p>
            <table className="props shear-table">
              <caption className="sr-only">Longitudinal shear on surfaces a-a and b-b</caption>
              <thead>
                <tr><th scope="col"></th><th scope="col">a-a</th><th scope="col">b-b</th><th scope="col"></th></tr>
              </thead>
              <tbody>
                <tr><td>Surface length</td><td>2 × {fmt(res.h_c, 0)}</td><td>{fmt(res.lb, 0)}</td><td>mm</td></tr>
                <tr><td>Flow on the surface</td><td>v<sub>f</sub>/2 each</td><td>v<sub>f</sub></td><td></td></tr>
                <tr><td>Shear stress v<sub>Ed</sub></td><td>{fmt(res.vLEd, 3)}</td><td>{fmt(res.vbEd, 3)}</td><td>MPa</td></tr>
                <tr><td>Strut angle cot θ<sub>f</sub> (auto)</td><td>{fmt(res.cta, 3)}</td><td>{fmt(res.ctb, 3)}</td><td></td></tr>
                <tr><td>Required a<sub>sf</sub>, (6.21)</td><td>{fmt(res.asfReq, 0)}</td><td>{fmt(res.asbReq, 0)}</td><td>mm²/m</td></tr>
                <tr><td>Bars counted</td><td>A<sub>t</sub> + A<sub>b</sub></td><td>2A<sub>b</sub></td><td></td></tr>
                <tr><td>Provided a<sub>sf</sub></td><td>{fmt(res.asf, 0)}</td><td>{fmt(res.asb, 0)}</td><td>mm²/m</td></tr>
                <tr><td>Transverse bars UR</td><td className={tone(res['UR.sf'])}>{fmt(res['UR.sf'], 3)}</td><td className={tone(res['UR.sf.b'])}>{fmt(res['UR.sf.b'], 3)}</td><td></td></tr>
                <tr><td>Strut resistance v<sub>Rd</sub>, (6.22)</td><td>{fmt(res.vLRd, 2)}</td><td>{fmt(res.vbRd, 2)}</td><td>MPa</td></tr>
                <tr><td>Strut UR v<sub>Ed</sub>/v<sub>Rd</sub></td><td className={tone(res['UR.L'])}>{fmt(res['UR.L'], 3)}</td><td className={tone(res['UR.L.b'])}>{fmt(res['UR.L.b'], 3)}</td><td></td></tr>
              </tbody>
            </table>
            <p className="hint">Bars: top A<sub>t</sub> Ø{fmt(res.dst, 0)} at {fmt(res.sft, 0)} = {fmt(res.at, 0)} mm²/m, bottom A<sub>b</sub> Ø{fmt(res.dsb, 0)} at {fmt(res.sfb, 0)} = {fmt(res.ab, 0)} mm²/m, anchored past each surface (EC2 §8.4). Not checked: c-c/d-d, splitting at edge beams (§6.6.5.3), minimum reinforcement.</p>
          </section>

        </div>
      </main>
      <p className="note">Review draft. Results come from the mCalcCanvas composite beam worksheet to EC4 (verified against SCI P364, SBE Part 4 and an independent reference); confirm National Annex values before use.</p>
    </>
  );
}
