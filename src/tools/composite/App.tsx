/**
 * mCompositeBeamDesign – a design front end for the EC4 composite beam worksheet.
 * Every number on this page is read from the worksheet calculated by the CalcCanvas
 * engine (model.ts); the report is that worksheet with these inputs.
 */
import { useMemo, useRef, useState } from 'react';
import raw from '../../../templates/Composite_Beam_EC4.mCCV?raw';
import { sections } from '../../engineering/steel/sections';
import { CHECKS, CompositeModel, type InputField, type LoadTable, type Results } from './model';
import { Legend, LineChart, LoadingDiagram, SectionDrawing, type AreaLoad, type PointLoad } from './charts';
import { C, fmt } from './format';

const HANDOFF_KEY = 'calccanvas.handoff'; // read once by mCalcCanvas (?open=handoff)
const GREEK: Record<string, string> = { gamma: 'γ', psi: 'ψ', varphi: 'φ', varepsilon: 'ε', alpha: 'α', rho: 'ρ', eta: 'η', delta: 'δ', theta: 'θ', kappa: 'κ', chi: 'χ', lambda: 'λ' };

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

const FAMILIES = ['UB', 'UC', 'IPE', 'HEA', 'HEB', 'HEM', 'W'];

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function urClass(v: number) {
  return !Number.isFinite(v) ? 'text-slate-400' : v > 1 ? 'text-red-700' : v > 0.9 ? 'text-amber-700' : 'text-emerald-700';
}

export function App() {
  const model = useMemo(() => new CompositeModel(raw), []);
  const [res, setRes] = useState<Results>(() => model.results());
  const [, setTick] = useState(0);
  const [family, setFamily] = useState(() => sections.find((s) => s.id === model.sectionId)?.family ?? 'UB');
  const timer = useRef<number | undefined>(undefined);
  const recalc = () => {
    setTick((t) => t + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRes(model.results()), 30);
  };

  const groups = useMemo(() => {
    const g = new Map<string, InputField[]>();
    for (const f of model.inputs) g.set(f.group, [...(g.get(f.group) ?? []), f]);
    return [...g.entries()];
  }, [model]);

  const sb = model.inputValue(model.inputs.find((f) => f.name === 's_b')!.id);
  const [areaT, pointT] = model.tables;
  const area: AreaLoad[] = areaT.rows.filter((r) => r.slice(1).some((v) => v.trim())).map((r) => ({ q: r[0].trim().toUpperCase() === 'Q', x1: Number(r[1]), x2: Number(r[2]), p: Number(r[3]) }));
  const points: PointLoad[] = pointT.rows.filter((r) => r.slice(1).some((v) => v.trim())).map((r) => ({ q: r[0].trim().toUpperCase() === 'Q', a: Number(r[1]), F: Number(r[2]) }));
  const v = res.vectors;
  const composite = res.comp >= 1;
  // Overall: every check shown (construction stage + the permanent-stage design basis used).
  const shown = CHECKS.filter(([key, , , basis]) => key !== 'des' && (!basis || (basis === 'c') === composite));
  const overall = Math.max(...shown.map(([key]) => res[`UR.${key}`]).filter(Number.isFinite));
  const governing = shown.reduce((g, c) => (res[`UR.${c[0]}`] > res[`UR.${g[0]}`] ? c : g), shown[0]);
  const section = sections.find((s) => s.id === model.sectionId);

  const report = () => {
    try {
      localStorage.setItem(HANDOFF_KEY, JSON.stringify(model.reportDocument()));
      window.open('../?open=handoff', '_blank', 'noopener');
    } catch {
      alert('The report could not be handed to mCalcCanvas here. Use Download .mCCV and open it with File → Open.');
    }
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(model.reportDocument())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Composite_Beam_EC4.mCCV';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const editTable = (t: LoadTable, i: number, j: number, value: string) => {
    const rows = t.rows.map((r) => [...r]);
    rows[i][j] = value;
    model.setTableRows(t.id, rows);
    recalc();
  };
  const addRow = (t: LoadTable) => {
    model.setTableRows(t.id, [...t.rows, t.headers.map((_, j) => (j === 0 ? 'G' : ''))]);
    recalc();
  };
  const delRow = (t: LoadTable, i: number) => {
    model.setTableRows(t.id, t.rows.filter((_, k) => k !== i));
    recalc();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <div>
            <h1 className="text-[19px] font-semibold tracking-tight text-[#1e3a5f]">
              mComposite<span className="font-normal text-slate-500">BeamDesign</span>
            </h1>
            <p className="text-[12px] text-slate-500">EN 1994-1-1 · simply supported · solid slab · calculated by the mCalcCanvas worksheet</p>
          </div>
          <div className="flex items-center gap-3" data-testid="verdict">
            <span className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${composite ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-800'}`}>
              {composite ? 'COMPOSITE' : 'BARE STEEL (not composite)'}
            </span>
            <span className="text-[13px] text-slate-600">
              Governing UR <b className={`text-[18px] ${urClass(overall)}`} data-testid="ur-max">{fmt(overall, 3)}</b> <span className="text-[12px] text-slate-500">({governing[1]})</span>
            </span>
            <span className={`rounded-md px-2 py-1 text-[12px] font-semibold ${overall <= 1 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{overall <= 1 ? 'PASS' : 'FAIL'}</span>
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={download} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-slate-50">
              Download .mCCV
            </button>
            <button type="button" onClick={report} data-testid="open-report" className="rounded-md bg-[#1e3a5f] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#16304f]">
              Open full report
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-5 px-5 py-5 lg:grid-cols-[400px_1fr]">
        {/* Inputs */}
        <aside className="space-y-4 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto lg:pr-1">
          <Card title="Steel section">
            <div className="flex gap-2">
              <select aria-label="Section family" className="rounded border border-slate-300 bg-white px-2 py-1 text-[13px]" value={family} onChange={(e) => setFamily(e.target.value)}>
                {FAMILIES.map((f) => <option key={f}>{f}</option>)}
              </select>
              <select
                aria-label="Section"
                data-testid="section-select"
                className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-[13px]"
                value={section?.family === family ? model.sectionId : ''}
                onChange={(e) => {
                  model.setSection(Number(e.target.value));
                  recalc();
                }}
              >
                {section?.family !== family && <option value="">Choose…</option>}
                {sections.filter((s) => s.family === family).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <p className="mt-1 text-[11.5px] text-slate-500">{section ? `${section.name} · ${section.standard}` : ''}</p>
          </Card>

          {[areaT, pointT].map((t) => (
            <Card key={t.id} title={t === areaT ? 'Area loads (pressure × s_b)' : 'Point loads'}>
              <table className="w-full table-fixed text-[13px]">
                <colgroup><col className="w-[58px]" />{t.headers.slice(1).map((_, j) => <col key={j} />)}<col className="w-[22px]" /></colgroup>
                <thead>
                  <tr className="text-left text-[11.5px] text-slate-500">
                    {t.headers.map((h, j) => (
                      <th key={j} className="pb-1 font-medium">{j === 0 ? 'Pattern' : <Sym latex={h.replace(/_(\S+)$/, '_{$1}')} />} <span className="font-normal">{t.units[j] && j > 0 ? `(${t.units[j]})` : ''}</span></th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="py-0.5 pr-1">
                          {j === 0 ? (
                            <select aria-label="Load pattern" className="w-full rounded border border-slate-300 bg-amber-50 px-1 py-0.5 text-blue-800" value={cell.trim().toUpperCase() === 'Q' ? 'Q' : 'G'} onChange={(e) => editTable(t, i, j, e.target.value)}>
                              <option value="G">G</option>
                              <option value="Q">Q</option>
                            </select>
                          ) : (
                            <input aria-label={`${t.headers[j]} row ${i + 1}`} inputMode="decimal" className="w-full rounded border border-slate-300 bg-amber-50 px-1.5 py-0.5 text-right text-blue-800" defaultValue={cell} onBlur={(e) => e.target.value !== cell && editTable(t, i, j, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                          )}
                        </td>
                      ))}
                      <td><button type="button" aria-label="Delete row" className="px-1 text-slate-400 hover:text-red-600" onClick={() => delRow(t, i)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="mt-2 text-[12.5px] font-medium text-blue-700 hover:underline" onClick={() => addRow(t)}>+ Add load</button>
            </Card>
          ))}

          {groups.map(([g, fields]) => (
            <Card key={g} title={g}>
              <div className="space-y-1.5">
                {fields.map((f) => (
                  <label key={f.id} className="grid grid-cols-[1fr_92px_44px] items-center gap-2 text-[12.5px]">
                    <span className="text-slate-600" title={f.label}>
                      <Sym latex={f.name} /> <span className="text-slate-500">· {f.label}</span>
                    </span>
                    <input
                      aria-label={f.name}
                      data-input={f.name}
                      inputMode="decimal"
                      className="rounded border border-slate-300 bg-amber-50 px-1.5 py-0.5 text-right text-blue-800"
                      defaultValue={model.inputValue(f.id)}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n !== model.inputValue(f.id)) {
                          model.setInput(f.id, n);
                          recalc();
                        }
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    <span className="text-slate-500">{f.unit.replace('^2', '²').replace('^3', '³')}</span>
                  </label>
                ))}
              </div>
            </Card>
          ))}
        </aside>

        {/* Results */}
        <div className="space-y-5">
          {!composite && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13.5px] text-red-900" data-testid="basis-note">
              <b>Not designed as composite.</b> The studs that fit cannot give composite action (η = {fmt(res.eta, 3)} vs η<sub>min</sub> = {fmt(res.etaMin, 3)}, or M<sub>Rd</sub>(x) &lt; M<sub>Ed</sub>(x), e.g. a large point load close to a support). The beam is designed as{' '}
              <b>bare steel</b> to EN 1993-1-1 and EN 1993-1-5, with the LTB length equal to the stud spacing ({fmt(res.LLTnc, 0)} mm, top flange restrained per EN 1994-1-1 §6.4.1(1)); the UR uses the steel-alone deflection. If it fails, choose a larger section.
            </div>
          )}
          {res.errors.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12.5px] text-amber-900">Worksheet errors: {res.errors.slice(0, 3).join(' · ')}</div>}

          <Card title="1. Loading" right={<span className="text-[12px] text-slate-500">M<sub>Ed</sub> = <b>{fmt(res.M2, 1)}</b> kNm at x<sub>M</sub> = {fmt(res.xM, 2)} m · V<sub>Ed</sub> = <b>{fmt(res.V2, 1)}</b> kN</span>}>
            <LoadingDiagram L={res.L} area={area} points={points} sb={sb} />
            <p className="mb-1 mt-2 text-[12px] font-medium text-slate-600">Shear force V<sub>Ed</sub> (kN)</p>
            <LineChart series={[{ x: v.x, y: v.V, color: C.blue, label: 'V', fill: true }]} height={140} yUnit="kN" />
            <p className="mb-1 mt-2 text-[12px] font-medium text-slate-600">Bending moment M<sub>Ed</sub> (kNm, sagging below)</p>
            <LineChart series={[{ x: v.x, y: v.M, color: C.red, label: 'M', fill: true }]} height={150} invertY yUnit="kNm" labels={[{ x: res.xM, y: res.M2, text: fmt(res.M2, 1), color: C.red }]} />
            <p className="mt-1 text-[12px] text-slate-500">Construction stage: w<sub>Ed</sub> = {fmt(res.w1, 2)} kN/m over L<sub>1</sub> = {fmt(res.L1, 2)} m, M<sub>Ed</sub> = {fmt(res.M1, 1)} kNm (steel alone, g<sub>0</sub> = {fmt(res.g0, 2)} kN/m).</p>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="2. Section properties">
              <SectionDrawing r={res} showPna={false} />
              <table className="mt-2 w-full text-[12.5px]">
                <tbody>
                  {(
                    [
                      ['h_a', 'h_a', 'mm', 1], ['b_a', 'b_a', 'mm', 1], ['t_f', 't_f', 'mm', 1], ['t_w', 't_w', 'mm', 1], ['r', 'r', 'mm', 1], ['A_a', 'A_a', 'cm²', 2],
                      ['I_a', 'I_a', 'cm⁴', 0], ['W_{pl}', 'W_pl', 'cm³', 1], ['m_a', 'm_a', 'kg/m', 2], ['b_{eff}', 'b_eff', 'mm', 0], ['I_0', 'I_0', 'cm⁴', 0], ['I_L', 'I_L', 'cm⁴', 0],
                      ['M_{a.Rd}', 'MaRd', 'kNm', 1], ['M_{pl.Rd}', 'MplRd', 'kNm', 1], ['V_{pl.Rd}', 'VplRd', 'kN', 1],
                    ] as [string, string, string, number][]
                  ).map(([n, k, u, d]) => (
                    <tr key={k} className="border-b border-slate-100">
                      <td className="py-0.5"><Sym latex={n} /></td>
                      <td className="py-0.5 text-right font-medium tabular-nums">{fmt(res[k], d)}</td>
                      <td className="py-0.5 pl-2 text-slate-500">{u}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="3. Plastic neutral axis and shear connection">
              <SectionDrawing r={res} showPna />
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12.5px]">
                <span>PNA case at x<sub>M</sub></span><b className="text-right">{['in the slab', 'in the top flange', 'in the fillet', 'in the web'][res.kM] ?? '–'}</b>
                <span>Studs A→x<sub>M</sub> / x<sub>M</sub>→B</span><b className="text-right">{fmt(res.nA, 0)} / {fmt(res.nB, 0)}</b>
                <span>Studs needed per span</span><b className={`text-right ${res.nreq > res.nh ? 'text-red-700' : ''}`}>{fmt(res.nreq, 0)} (provided {fmt(res.nh, 0)})</b>
                <span>η / η<sub>min</sub></span><b className={`text-right ${res.eta < res.etaMin ? 'text-red-700' : ''}`}>{fmt(res.eta, 3)} / {fmt(res.etaMin, 3)}</b>
                <span>P<sub>Rd</sub> per stud</span><b className="text-right">{fmt(res.PRd, 2)} kN</b>
                <span>N<sub>c</sub> = η N<sub>c,f</sub></span><b className="text-right">{fmt(res.Nc, 0)} kN</b>
                <span>M<sub>Rd</sub> (6.3) / rigid-plastic</span><b className="text-right">{fmt(res.MRd, 1)} / {fmt(res.MRdpl, 1)} kNm</b>
              </div>
              <p className="mb-1 mt-3 text-[12px] font-medium text-slate-600">M<sub>Ed</sub>(x) and M<sub>Rd</sub>(x) from the studs provided (kNm)</p>
              <LineChart series={[{ x: v.x, y: v.M, color: C.red, label: 'M_Ed', fill: true }, { x: v.x, y: v.MRdx, color: C.navy, label: 'M_Rd(x)' }]} height={150} invertY yUnit="kNm" />
              <Legend items={[{ color: C.red, label: 'M_Ed(x)' }, { color: C.navy, label: 'M_Rd(x), studs provided' }]} />
            </Card>
          </div>

          <Card title={`4. Deflection (${composite ? 'composite, partial interaction' : 'bare steel'}) and utilisation`}>
            <LineChart
              series={[
                { x: v.x, y: v.d, color: C.blue, label: 'DL+LL' },
                { x: v.x, y: v.dq, color: C.green, label: 'LL', width: 1.6 },
                { x: [v.x[0] ?? 0, v.x[v.x.length - 1] ?? 1], y: [res.dlim, res.dlim], color: C.red, label: 'limit', dash: true, width: 1.4 },
              ]}
              height={170}
              invertY
              yUnit="mm"
            />
            <Legend items={[{ color: C.blue, label: `1.0 DL + 1.0 LL (max ${fmt(composite ? res.dmax : res.dnc, 1)} mm)` }, { color: C.green, label: `LL (max ${fmt(Math.max(...v.dq), 1)} mm)` }, { color: C.red, label: `limit L/r = ${fmt(res.dlim, 1)} mm`, dash: true }]} />
            <table className="mt-4 w-full text-[12.5px]" data-testid="ur-table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11.5px] text-slate-500">
                  <th className="py-1 font-medium">Check</th>
                  <th className="font-medium">Clause</th>
                  <th className="w-[38%] font-medium">Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {CHECKS.filter(([, , , basis]) => !basis || (basis === 'c') === composite).map(([key, label, clause]) => {
                  const u = res[`UR.${key}`];
                  return (
                    <tr key={key} className={`border-b border-slate-100 ${key === 'des' ? 'font-semibold' : ''}`}>
                      <td className="py-1" data-testid={key === 'des' ? 'ur-des-label' : undefined}>{label}</td>
                      <td className="text-slate-500">{clause}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded bg-slate-100">
                            <div className={`h-2 rounded ${u > 1 ? 'bg-red-500' : u > 0.9 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (Number.isFinite(u) ? u : 0) * 100)}%` }} />
                          </div>
                          <span className={`w-12 text-right tabular-nums ${urClass(u)}`} data-testid={key === 'des' ? 'ur-des' : undefined}>{fmt(u, 3)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11.5px] text-slate-500">
              Construction-stage checks apply to both bases. {composite ? 'Bare-steel checks are in the report (chapter 6), for information.' : 'Composite checks are in the report (chapter 4), for information.'} Full derivations: Open full report.
            </p>
          </Card>
        </div>
      </main>
      <footer className="mx-auto max-w-[1400px] px-5 pb-8 text-[11.5px] text-slate-500">
        Review draft. Results come from the mCalcCanvas worksheet Composite_Beam_EC4 (verified against SCI P364, SBE Part 4 and an independent reference); confirm Singapore National Annex values before use.
      </footer>
    </div>
  );
}
