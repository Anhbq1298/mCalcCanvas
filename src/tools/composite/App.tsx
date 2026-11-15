/**
 * mCompositeBeamDesign – a design front end for the EC4 composite beam worksheet.
 * Every number on this page is read from the worksheet, calculated by the CalcCanvas
 * engine in a worker (worker.ts, model.ts); the report is that worksheet with these inputs.
 * Look: design-system/calccanvas (UI/UX Pro Max, Swiss minimal, navy) with the
 * pages/composite-design-tool.md override; behaviour follows Chrome's modern-web guidance
 * (work off the main thread, validation after interaction, one polite live region, rem sizing).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { sections } from '../../engineering/steel/sections';
import { CHECKS, type InputField, type LoadTable, type Results } from './model';
import type { ToWorker } from './worker';
import { Legend, LineChart, LoadingDiagram, SectionDrawing, type AreaLoad, type PointLoad } from './charts';
import { C, fmt } from './format';

const HANDOFF_KEY = 'calccanvas.handoff'; // read once by mCalcCanvas (?open=handoff)
const GREEK: Record<string, string> = { gamma: 'γ', psi: 'ψ', varphi: 'φ', varepsilon: 'ε', alpha: 'α', rho: 'ρ', eta: 'η', delta: 'δ', theta: 'θ', kappa: 'κ', chi: 'χ', lambda: 'λ' };
const NUMBER = /^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;
const FAMILIES = ['UB', 'UC', 'IPE', 'HEA', 'HEB', 'HEM', 'W'];

/** s_{sc.A} → s<sub>sc.A</sub>; \gamma_{M0} → γ<sub>M0</sub>. */
function Sym({ latex }: { latex: string }) {
  const m = /^\\?([A-Za-z]+)(?:_\{?([^}]*)\}?)?$/.exec(latex.replace(/\\mathrm\{([^}]*)\}/, '$1'));
  if (!m) return <i>{latex}</i>;
  const base = latex.startsWith('\\') ? (GREEK[m[1]] ?? m[1]) : m[1];
  return (
    <span className="whitespace-nowrap">
      <i>{base}</i>
      {m[2] && <sub>{m[2]}</sub>}
    </span>
  );
}

function Card({ title, id, children, right }: { title: string; id: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="card">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="text-[0.9375rem] font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const urClass = (v: number) => (!Number.isFinite(v) ? 'text-slate-500' : v > 1 ? 'text-red-700' : v > 0.9 ? 'text-amber-700' : 'text-emerald-700');
const barClass = (v: number) => (v > 1 ? 'bg-red-600' : v > 0.9 ? 'bg-amber-500' : 'bg-emerald-600');

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
    <span className="block">
      <input
        id={id}
        aria-label={label}
        data-input={label}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid}
        aria-describedby={invalid ? err : undefined}
        className="field w-full text-right"
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
        <span id={err} className="mt-0.5 block text-[0.75rem] text-red-700">
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
}

export function App() {
  const worker = useMemo(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), []);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, number>>({});
  const [family, setFamily] = useState('UB');
  const reportReq = useRef(0);
  const reportCb = useRef<((doc: unknown) => void) | null>(null);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.kind === 'init') {
        setState({ inputs: m.inputs, tables: m.tables, sectionId: m.sectionId, results: m.results });
        setFamily(sections.find((s) => s.id === m.sectionId)?.family ?? 'UB');
      } else if (m.kind === 'results') {
        setState((s) => (s ? { ...s, results: m.results, tables: m.tables, sectionId: m.sectionId } : s));
        setBusy(false);
      } else if (m.kind === 'report' && m.request === reportReq.current) reportCb.current?.(m.doc);
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
      <div className="grid min-h-screen place-items-center text-[--color-muted-foreground]" role="status">
        Loading the composite beam worksheet…
      </div>
    );
  }

  const { inputs, tables, results: res } = state;
  const value = (f: InputField) => values[f.id] ?? f.value;
  const groups = [...inputs.reduce((g, f) => g.set(f.group, [...(g.get(f.group) ?? []), f]), new Map<string, InputField[]>()).entries()];
  const sb = value(inputs.find((f) => f.name === 's_b')!);
  const [areaT, pointT] = tables;
  const filled = (r: string[]) => r.slice(1).some((x) => x.trim());
  const area: AreaLoad[] = areaT.rows.filter(filled).map((r) => ({ q: r[0].trim().toUpperCase() === 'Q', x1: Number(r[1]), x2: Number(r[2]), p: Number(r[3]) }));
  const points: PointLoad[] = pointT.rows.filter(filled).map((r) => ({ q: r[0].trim().toUpperCase() === 'Q', a: Number(r[1]), F: Number(r[2]) }));
  const v = res.vectors;
  const composite = res.comp >= 1;
  const shown = CHECKS.filter(([key, , , basis]) => key !== 'des' && (!basis || (basis === 'c') === composite));
  const overall = Math.max(...shown.map(([key]) => res[`UR.${key}`]).filter(Number.isFinite));
  const governing = shown.reduce((g, c) => (res[`UR.${c[0]}`] > res[`UR.${g[0]}`] ? c : g), shown[0]);
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

  return (
    <div className="min-h-screen">
      <a href="#results" className="skip">Skip to results</a>
      <header className="top-0 z-10 lg:sticky border-b border-[--color-border] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <div className="mr-auto">
            <h1 className="text-[1.1875rem] font-semibold tracking-tight text-[--color-primary]">
              mComposite<span className="font-normal text-[--color-muted-foreground]">BeamDesign</span>
            </h1>
            <p className="text-[0.75rem] text-[--color-muted-foreground]">EN 1994-1-1 · simply supported · solid slab · calculated by the mCalcCanvas worksheet engine</p>
          </div>
          <div className="flex flex-wrap items-center gap-3" data-testid="verdict" aria-live="polite" aria-atomic="true">
            <span className={`badge ${composite ? 'bg-blue-50 text-blue-900' : 'bg-red-50 text-red-900'}`}>{composite ? 'Composite' : 'Bare steel (not composite)'}</span>
            <span className="text-[0.8125rem] text-[--color-muted-foreground]">
              Governing UR{' '}
              <b className={`text-[1.125rem] tabular-nums ${urClass(overall)}`} data-testid="ur-max">{fmt(overall, 3)}</b> <span className="text-[0.75rem]">({governing[1]})</span>
            </span>
            <span className={`badge ${pass ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="mr-1 inline">{pass ? <path d="M2 6.5l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" /> : <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" />}</svg>
              {pass ? 'Pass' : 'Fail'}
            </span>
          </div>
          <span className={`text-[0.75rem] text-[--color-muted-foreground] ${busy ? '' : 'invisible'}`} aria-hidden={!busy}>Calculating…</span>
          <div className="flex gap-2">
            <button type="button" onClick={download} className="btn btn-secondary">Download .mCCV</button>
            <button type="button" onClick={report} data-testid="open-report" className="btn btn-primary">Open full report</button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[90rem] gap-5 px-5 py-5 lg:grid-cols-[25rem_1fr]">
        <form aria-label="Design inputs" className="space-y-4 lg:sticky lg:top-[5rem] lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1" onSubmit={(e) => e.preventDefault()} noValidate>
          <Card title="Steel section" id="h-section">
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="family">Section family</label>
              <select id="family" className="field w-24" value={family} onChange={(e) => setFamily(e.target.value)}>
                {FAMILIES.map((f) => <option key={f}>{f}</option>)}
              </select>
              <label className="sr-only" htmlFor="section">Section</label>
              <select id="section" data-testid="section-select" className="field min-w-0 flex-1" value={section?.family === family ? state.sectionId : ''} onChange={(e) => send({ kind: 'section', id: Number(e.target.value) })}>
                {section?.family !== family && <option value="">Choose a section…</option>}
                {sections.filter((s) => s.family === family).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <p className="mt-1 text-[0.75rem] text-[--color-muted-foreground]">{section ? `${section.name} · ${section.standard}` : ''}</p>
          </Card>

          {[areaT, pointT].map((t, ti) => (
            <Card key={t.id} title={ti === 0 ? 'Area loads (pressure × s_b)' : 'Point loads'} id={`h-table-${ti}`}>
              <table className="w-full table-fixed text-[0.8125rem]">
                <colgroup><col className="w-[4.25rem]" />{t.headers.slice(1).map((_, j) => <col key={j} />)}<col className="w-[2.75rem]" /></colgroup>
                <thead>
                  <tr className="text-left text-[0.75rem] text-[--color-muted-foreground]">
                    {t.headers.map((h, j) => (
                      <th key={j} scope="col" className="pb-1 font-medium">
                        {j === 0 ? 'G / Q' : <Sym latex={h.replace(/_(\S+)$/, '_{$1}')} />} {j > 0 && t.units[j] ? <span className="font-normal">({t.units[j]})</span> : null}
                      </th>
                    ))}
                    <th><span className="sr-only">Delete</span></th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((row, i) => (
                    <tr key={`${t.id}-${i}-${t.rows.length}`}>
                      {row.map((cell, j) => (
                        <td key={j} className="py-0.5 pr-1 align-top">
                          {j === 0 ? (
                            <select aria-label={`Load pattern, row ${i + 1}`} className="field w-full" value={cell.trim().toUpperCase() === 'Q' ? 'Q' : 'G'} onChange={(e) => setRows(t, t.rows.map((r, k) => (k === i ? r.map((c, m) => (m === 0 ? e.target.value : c)) : r)))}>
                              <option value="G">G</option>
                              <option value="Q">Q</option>
                            </select>
                          ) : (
                            <NumberField id={`t${ti}r${i}c${j}`} label={`${t.headers[j]} row ${i + 1}`} value={cell} onCommit={(n) => setRows(t, t.rows.map((r, k) => (k === i ? r.map((c, m) => (m === j ? String(n) : c)) : r)))} />
                          )}
                        </td>
                      ))}
                      <td className="align-top">
                        <button type="button" aria-label={`Delete row ${i + 1}`} className="icon-btn" onClick={() => setRows(t, t.rows.filter((_, k) => k !== i))}>
                          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="btn-link mt-2" onClick={() => setRows(t, [...t.rows, t.headers.map((_, j) => (j === 0 ? 'G' : '0'))])}>+ Add load</button>
            </Card>
          ))}

          {groups.map(([g, fields], gi) => (
            <Card key={g} title={g} id={`h-group-${gi}`}>
              <div className="space-y-1.5">
                {fields.map((f) => (
                  <div key={f.id} className="grid grid-cols-[1fr_6rem_2.75rem] items-start gap-2 text-[0.8125rem]">
                    <label htmlFor={`in-${f.id}`} className="pt-1.5 text-[--color-muted-foreground]">
                      <Sym latex={f.name} /> <span>· {f.label}</span>
                    </label>
                    <NumberField id={`in-${f.id}`} label={f.name} value={String(value(f))} onCommit={(n) => setInput(f, n)} />
                    <span className="pt-1.5 text-[--color-muted-foreground]">{f.unit.replace('^2', '²').replace('^3', '³').replace('^-1', '⁻¹')}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </form>

        <div id="results" tabIndex={-1} className={`space-y-5 transition-opacity motion-reduce:transition-none ${busy ? 'opacity-70' : ''}`} aria-busy={busy}>
          {!composite && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-[0.875rem] text-red-950" data-testid="basis-note" role="note">
              <b>Not designed as composite.</b> The studs that fit cannot give composite action (η = {fmt(res.eta, 3)} against η<sub>min</sub> = {fmt(res.etaMin, 3)}, or M<sub>Rd</sub>(x) &lt; M<sub>Ed</sub>(x), e.g. a large point load close to a support). The beam is designed as <b>bare steel</b> to EN 1993-1-1 and EN 1993-1-5, with the LTB length equal to the stud spacing ({fmt(res.LLTnc, 0)} mm, top flange restrained per EN 1994-1-1 §6.4.1(1)); the UR uses the steel-alone deflection. If it fails, choose a larger section.
            </div>
          )}
          {res.errors.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[0.8125rem] text-amber-950" role="alert">Worksheet errors: {res.errors.slice(0, 3).join(' · ')}</div>}

          <Card title="1. Loading" id="h-loading" right={<span className="text-[0.8125rem] text-[--color-muted-foreground]">M<sub>Ed</sub> = <b className="text-[--color-foreground]">{fmt(res.M2, 1)}</b> kNm at x<sub>M</sub> = {fmt(res.xM, 2)} m · V<sub>Ed</sub> = <b className="text-[--color-foreground]">{fmt(res.V2, 1)}</b> kN</span>}>
            <LoadingDiagram L={res.L} area={area} points={points} sb={sb} />
            <h3 className="chart-title">Shear force V<sub>Ed</sub></h3>
            <LineChart series={[{ x: v.x, y: v.V, color: C.blue, label: 'V', fill: true }]} height={140} yUnit="kN" label={`Shear force diagram, ${fmt(res.V2, 1)} kN at the support`} />
            <h3 className="chart-title">Bending moment M<sub>Ed</sub> (sagging drawn below)</h3>
            <LineChart series={[{ x: v.x, y: v.M, color: C.red, label: 'M', fill: true }]} height={150} invertY yUnit="kNm" labels={[{ x: res.xM, y: res.M2, text: fmt(res.M2, 1), color: C.red }]} label={`Bending moment diagram, maximum ${fmt(res.M2, 1)} kNm at ${fmt(res.xM, 2)} m`} />
            <p className="mt-1 text-[0.75rem] text-[--color-muted-foreground]">Construction stage (steel alone): w<sub>Ed</sub> = {fmt(res.w1, 2)} kN/m over L<sub>1</sub> = {fmt(res.L1, 2)} m, M<sub>Ed</sub> = {fmt(res.M1, 1)} kNm; g<sub>0</sub> = {fmt(res.g0, 2)} kN/m.</p>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="2. Section properties" id="h-props">
              <SectionDrawing r={res} showPna={false} />
              <table className="mt-2 w-full text-[0.8125rem]">
                <caption className="sr-only">Section properties</caption>
                <tbody>
                  {(
                    [
                      ['h_a', 'h_a', 'mm', 1], ['b_a', 'b_a', 'mm', 1], ['t_f', 't_f', 'mm', 1], ['t_w', 't_w', 'mm', 1], ['r', 'r', 'mm', 1], ['A_a', 'A_a', 'cm²', 2],
                      ['I_a', 'I_a', 'cm⁴', 0], ['W_{pl}', 'W_pl', 'cm³', 1], ['m_a', 'm_a', 'kg/m', 2], ['b_{eff}', 'b_eff', 'mm', 0], ['I_0', 'I_0', 'cm⁴', 0], ['I_L', 'I_L', 'cm⁴', 0],
                      ['M_{a.Rd}', 'MaRd', 'kNm', 1], ['M_{pl.Rd}', 'MplRd', 'kNm', 1], ['V_{pl.Rd}', 'VplRd', 'kN', 1],
                    ] as [string, string, string, number][]
                  ).map(([n, k, u, d]) => (
                    <tr key={k} className="border-b border-[--color-muted]">
                      <th scope="row" className="py-0.5 text-left font-normal"><Sym latex={n} /></th>
                      <td className="py-0.5 text-right font-medium tabular-nums">{fmt(res[k], d)}</td>
                      <td className="w-14 py-0.5 pl-2 text-[--color-muted-foreground]">{u}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="3. Plastic neutral axis and shear connection" id="h-pna">
              <SectionDrawing r={res} showPna />
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[0.8125rem]">
                <dt>PNA position at x<sub>M</sub></dt><dd className="text-right font-semibold">{['in the slab', 'in the top flange', 'in the fillet', 'in the web'][res.kM] ?? '–'}</dd>
                <dt>Studs A→x<sub>M</sub> / x<sub>M</sub>→B</dt><dd className="text-right font-semibold tabular-nums">{fmt(res.nA, 0)} / {fmt(res.nB, 0)}</dd>
                <dt>Studs needed per span</dt><dd className={`text-right font-semibold tabular-nums ${res.nreq > res.nh ? 'text-red-700' : ''}`}>{fmt(res.nreq, 0)} (provided {fmt(res.nh, 0)})</dd>
                <dt>η / η<sub>min</sub></dt><dd className={`text-right font-semibold tabular-nums ${res.eta < res.etaMin ? 'text-red-700' : ''}`}>{fmt(res.eta, 3)} / {fmt(res.etaMin, 3)}</dd>
                <dt>P<sub>Rd</sub> per stud</dt><dd className="text-right font-semibold tabular-nums">{fmt(res.PRd, 2)} kN</dd>
                <dt>N<sub>c</sub> = η N<sub>c,f</sub></dt><dd className="text-right font-semibold tabular-nums">{fmt(res.Nc, 0)} kN</dd>
                <dt>M<sub>Rd</sub> (6.3) / rigid-plastic</dt><dd className="text-right font-semibold tabular-nums">{fmt(res.MRd, 1)} / {fmt(res.MRdpl, 1)} kNm</dd>
              </dl>
              <h3 className="chart-title">M<sub>Ed</sub>(x) and M<sub>Rd</sub>(x) from the studs provided</h3>
              <LineChart series={[{ x: v.x, y: v.M, color: C.red, label: 'M_Ed', fill: true }, { x: v.x, y: v.MRdx, color: C.navy, label: 'M_Rd(x)' }]} height={150} invertY yUnit="kNm" label="Design moment and resistance along the span" />
              <Legend items={[{ color: C.red, label: 'M_Ed(x)' }, { color: C.navy, label: 'M_Rd(x), studs provided' }]} />
            </Card>
          </div>

          <Card title={`4. Deflection (${composite ? 'composite, partial interaction' : 'bare steel'}) and utilisation`} id="h-ur">
            <LineChart
              series={[
                { x: v.x, y: v.d, color: C.blue, label: 'DL+LL' },
                { x: v.x, y: v.dq, color: C.green, label: 'LL', width: 1.6 },
                { x: [v.x[0] ?? 0, v.x[v.x.length - 1] ?? 1], y: [res.dlim, res.dlim], color: C.red, label: 'limit', dash: true, width: 1.4 },
              ]}
              height={170}
              invertY
              yUnit="mm"
              label={`Deflection, maximum ${fmt(composite ? res.dmax : res.dnc, 1)} mm against a limit of ${fmt(res.dlim, 1)} mm`}
            />
            <Legend items={[{ color: C.blue, label: `1.0 DL + 1.0 LL (max ${fmt(composite ? res.dmax : res.dnc, 1)} mm)` }, { color: C.green, label: `LL (max ${fmt(Math.max(...v.dq), 1)} mm)` }, { color: C.red, label: `limit L/r = ${fmt(res.dlim, 1)} mm`, dash: true }]} />
            <table className="mt-4 w-full text-[0.8125rem]" data-testid="ur-table">
              <caption className="sr-only">Utilisation ratios by check and clause</caption>
              <thead>
                <tr className="border-b border-[--color-border] text-left text-[0.75rem] text-[--color-muted-foreground]">
                  <th scope="col" className="py-1 font-medium">Check</th>
                  <th scope="col" className="font-medium">Clause</th>
                  <th scope="col" className="w-[38%] font-medium">Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {CHECKS.filter(([, , , basis]) => !basis || (basis === 'c') === composite).map(([key, label, clause]) => {
                  const u = res[`UR.${key}`];
                  return (
                    <tr key={key} className={`border-b border-[--color-muted] ${key === 'des' ? 'font-semibold' : ''}`}>
                      <th scope="row" className="py-1 text-left font-[inherit]">{label}</th>
                      <td className="text-[--color-muted-foreground]">{clause}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded bg-[--color-muted]" aria-hidden="true">
                            <div className={`h-2 rounded ${barClass(u)}`} style={{ width: `${Math.min(100, (Number.isFinite(u) ? u : 0) * 100)}%` }} />
                          </div>
                          <span className={`w-16 text-right tabular-nums ${urClass(u)}`} data-testid={key === 'des' ? 'ur-des' : undefined}>
                            {fmt(u, 3)}
                            {u > 1 && <span className="sr-only"> (fails)</span>}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[0.75rem] text-[--color-muted-foreground]">
              Construction-stage checks apply to both design bases. {composite ? 'Bare-steel checks are in the report (chapter 6), for information.' : 'Composite checks are in the report (chapter 4), for information.'} Full derivations: Open full report.
            </p>
          </Card>
        </div>
      </main>
      <footer className="mx-auto max-w-[90rem] px-5 pb-8 text-[0.75rem] text-[--color-muted-foreground]">
        Review draft. Results come from the mCalcCanvas worksheet Composite_Beam_EC4 (verified against SCI P364, SBE Part 4 and an independent reference); confirm National Annex values before use.
      </footer>
    </div>
  );
}
