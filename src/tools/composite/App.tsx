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
import { legacyBracing, linearTaper, taperStations, validateBracing, validateSlabZones, validateTaper, type ConstructionBracing, type SlabZones, type TaperProfile, BAR_DIAMETERS, BAR_SPACINGS, CHECKS, governingCheck, type DesignCriteria, type InputField, type LoadTable, type Results } from './model';
import type { OptimizeResult, ToWorker } from './worker';
import { BeamCad, DeckProfile, Legend, LineChart, LongSection, PointDrawing, ShearSurface3D, UdlDrawing, type AreaLoad, type PointLoad } from './charts';
import { headerParts } from '../../canvas/inputTable';
import { C, fmt } from './format';
import { ConstructionStage } from './ConstructionStage';
import { TaperDialog } from './TaperDialog';
import { SlabZoneDialog } from './SlabZoneDialog';
import { optimizeDesign, warmOptimizer } from './optimizer';

/** One state of the inputs: input values, load-table rows and section, for undo/redo. */
type Snap = { bracing: ConstructionBracing; taper: TaperProfile; slab: SlabZones; values: Record<string, number>; rows: Record<string, string[][]>; sectionId: number };
import { Rich } from './rich';

const HANDOFF_KEY = 'calccanvas.handoff'; // read once by mCalcCanvas (?open=handoff)
const GREEK: Record<string, string> = { gamma: 'γ', psi: 'ψ', varphi: 'φ', varepsilon: 'ε', alpha: 'α', rho: 'ρ', eta: 'η', delta: 'δ', theta: 'θ', kappa: 'κ', chi: 'χ', lambda: 'λ' };
const NUMBER = /^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;
const FAMILIES = ['UB', 'UC', 'IPE', 'HEA', 'HEB', 'HEM', 'W'];
/**
 * Deck catalogue: worksheet inputs of 1.11 for common profiles, from the manufacturers' data (area, mass, grade per
 * thickness) and, for the rib width b_0 (EN 1994-1-1 Figure 6.13), a published drawing or worked example. Each entry
 * says where its numbers come from; a value that is an assumption is marked so. t_p is the nominal thickness.
 */
interface DeckEntry { name: string; maker: string; values: Record<string, number>; src: string }
const kN = (kg: number) => Math.round(kg * 9.81) / 1000; // kg/m² → kPa
const deck = (maker: string, family: string, base: Record<string, number>, src: string, rows: [number, number, number, number?][]): DeckEntry[] =>
  rows.map(([t, A, g, fy]) => ({ name: `${family}, ${t.toFixed(2)} mm`, maker, src, values: { ...base, t_p: t, 'A_{pe}': A, g_p: g, ...(fy ? { 'f_{yp}': fy } : {}) } }));
const DECKS: DeckEntry[] = [
  ...deck('Fielders / M Metal', 'RF55', { 'c_{re}': 1, h_p: 55, b_r: 168, e_r: 200 },
    'M Metal RF55 data sheet (Table 1: area, mass, grade). b_0 = 200 − 32 assumes a 32 mm dovetail, as Bondek: not on the data sheet.',
    [[0.75, 1248, kN(10.32), 550], [1, 1664, kN(13.56), 550], [1.2, 1997, kN(16.32), 500]]),
  ...deck('Lysaght', 'Bondek', { 'c_{re}': 1, h_p: 54, b_r: 168, e_r: 200, 'f_{yp}': 550 },
    'Lysaght Bondek design manual (Table 1.2 area; profile figure: rib 54 high, 32 wide at the top, at 200; G550). Mass from the Bondek brochure.',
    [[0.6, 1007, kN(8.52)], [0.75, 1259, kN(10.5)], [1, 1678, kN(13.79)]]),
  ...deck('Tata Steel', 'ComFlor 60', { 'c_{re}': 0, h_p: 60, b_r: 145, e_r: 300, 'f_{yp}': 350 },
    'ComFlor manual (S350: area, weight). b_0 = (120 + 170)/2 and h_p = 60 (trapezoid; 75 overall with the top stiffener) as in SCI P387 Example 03.',
    [[0.9, 1276, 0.10], [1, 1424, 0.11], [1.2, 1721, 0.14]]),
  ...deck('Tata Steel', 'ComFlor 80', { 'c_{re}': 0, h_p: 80, b_r: 135, e_r: 300, 'f_{yp}': 350 },
    'ComFlor 80 data sheet (S350: area, weight; valley 120, crown 150, pitch 300) → b_0 = (120 + 300 − 150)/2. h_p = 80 (95 overall); use studs of 125 mm or more.',
    [[0.9, 1382, 0.11], [1, 1542, 0.12], [1.2, 1864, 0.15]]),
  { name: 'Trapezoidal 60, 1.00 mm (generic)', maker: 'generic', src: 'Generic open trapezoid for checking only: not a product.', values: { 'c_{re}': 0, h_p: 60, b_r: 150, e_r: 300, t_p: 1, g_p: 0.13, 'A_{pe}': 1400, 'f_{yp}': 350 } },
];
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


function InputHelp({ title, children }: { title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className="info-button" aria-haspopup="dialog" aria-label={`${title} input guide`} onClick={() => ref.current?.showModal()}>i</button>
    <dialog ref={ref} className="opt-dialog input-guide" aria-label={`${title} input guide`}>
      <div className="opt-form">
        <div className="opt-head"><h2>{title} input guide</h2><button type="button" className="btn" onClick={() => ref.current?.close()}>Close</button></div>
        {children}
      </div>
    </dialog>
  </>;
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
  const [bracing, setBracing] = useState<ConstructionBracing>(legacyBracing);
  const [constructionOpen, setConstructionOpen] = useState(false);
  const [taper, setTaper] = useState<TaperProfile>(linearTaper);
  const [taperOpen, setTaperOpen] = useState(false);
  const [slab, setSlab] = useState<SlabZones>({ zones: [] });
  const [slabOpen, setSlabOpen] = useState(false);
  const [values, setValues] = useState<Record<string, number>>({});
  const [family, setFamily] = useState('UB');
  const [hMax, setHMax] = useState('');
  const [optFamilies, setOptFamilies] = useState<string[]>(['UB']);
  const [hMin, setHMin] = useState('');
  const [bMin, setBMin] = useState('');
  const [studMode, setStudMode] = useState<DesignCriteria['studs']>('prefer-uniform');
  const [camAuto, setCamAuto] = useState(false);
  const [cam, setCam] = useState({ pct: '80', min: '20', max: '100', step: '5', minSpan: '7.5' });
  const [tStrength, setTStrength] = useState('1.00');
  const [tDefl, setTDefl] = useState('1.00');
  const [etaReq, setEtaReq] = useState(''); // optimiser: project minimum degree of shear connection, %; blank = code minimum only
  const [etaCap, setEtaCap] = useState(''); // optimiser: maximum degree of shear connection, %; blank = up to full connection
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadRef = useRef<HTMLDialogElement>(null);
  const factorRef = useRef<HTMLDialogElement>(null);
  const deckRef = useRef<HTMLDialogElement>(null);
  const [deckQuery, setDeckQuery] = useState('');
  const [opt, setOpt] = useState<{ running: boolean; i?: number; n?: number; name?: string; result?: OptimizeResult; seconds?: number } | null>(null);
  const calculationRevision = useRef(0);
  const reportReq = useRef(0);
  const reportCb = useRef<((doc: unknown) => void) | null>(null);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.kind === 'init') {
        setBracing(m.bracing ?? legacyBracing());
        setTaper(m.taper ?? linearTaper());
        setSlab(m.slab ?? { zones: [] });
        // build the optimiser's worker models in the background, after the page is up
        setTimeout(() => warmOptimizer({ values: {}, tables: m.tables.map((t: LoadTable) => ({ id: t.id, rows: t.rows })) }), 2500);
        setState({ inputs: m.inputs, tables: m.tables, sectionId: m.sectionId, results: m.results, defaults: { tables: m.tables, sectionId: m.sectionId } });
        setFamily(sections.find((s) => s.id === m.sectionId)?.family ?? 'UB');
      } else if (m.kind === 'results') {
        // A previous calculation can finish after the user has edited the load table again.
        if (m.calculationRevision !== calculationRevision.current) return;
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

  const history = useRef<{ past: Snap[]; future: Snap[] }>({ past: [], future: [] });
  const replaying = useRef(false);
  const recordRef = useRef<() => void>(() => {});
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const [hist, setHist] = useState({ past: 0, future: 0 });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'z') { e.preventDefault(); undoRef.current(); }
      else if (((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'z') || (e.ctrlKey && k === 'y')) { e.preventDefault(); redoRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const send = (msg: ToWorker) => {
    if (msg.kind !== 'report') {
      calculationRevision.current++;
      setBusy(true);
    }
    if (!replaying.current && (msg.kind === 'input' || msg.kind === 'table' || msg.kind === 'section')) recordRef.current();
    worker.postMessage({ ...msg, calculationRevision: calculationRevision.current });
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
  const isFactors = (g: string) => /^Partial and combination factors/.test(g);
  const isDeck = (g: string) => /^Slab type and profiled steel deck/.test(g);
  const byName = (name: string) => inputs.find((f) => f.name === name)!;
  const deck = value(byName('c_{deck}')) >= 1, parallel = deck && value(byName('c_{par}')) >= 1, transverse = deck && !parallel;
  const deckPreset = DECKS.find((d) => Object.entries(d.values).every(([n, x]) => Math.abs(value(byName(n)) - x) < 1e-9));
  const deckName = deckPreset?.name ?? 'Custom deck';
  const words = deckQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const deckList = DECKS.filter((d) => words.every((w) => `${d.maker} ${d.name} ${d.values['c_{re}'] ? 're-entrant dovetail' : 'open trapezoidal'}`.toLowerCase().includes(w)));
  const applyDeck = (name: string) => { const d = DECKS.find((x) => x.name === name); if (d) for (const [n, x] of Object.entries(d.values)) if (value(byName(n)) !== x) setInput(byName(n), x); };
  const isSteel = (g: string) => /^Steel section/.test(g);
  const allGroups = [...inputs.filter((f) => !isSteel(f.group)).reduce((g, f) => g.set(f.group, [...(g.get(f.group) ?? []), f]), new Map<string, InputField[]>()).entries()];
  // the slab type comes right after the geometry, wherever its inputs sit in the worksheet
  const groups = [...allGroups.filter(([g]) => /^Geometry/.test(g)), ...allGroups.filter(([g]) => /^Slab type and profiled steel deck/.test(g)), ...allGroups.filter(([g]) => !/^Geometry/.test(g) && !/^Slab type and profiled steel deck/.test(g))];
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
  const invalidBracing = (bracing.mode === 'explicit' && !!validateBracing(bracing, value(byName('L')))) || (value(byName('c_{tap}')) >= 1 && !!validateTaper(taper, value(byName('L')))) || (slab.zones.length > 0 && !!validateSlabZones(slab, value(byName('L')), value(byName('h_c'))));
  const section = sections.find((s) => s.id === state.sectionId);
  const pass = overall <= 1;
  const hLib = section?.values.h ?? res.h_a;
  const tapered = value(byName('c_{tap}')) >= 1;
  const profileStations = taperStations(taper, value(byName('L')), Math.min(value(byName('h_{A.in}')) || hLib, hLib), Math.min(value(byName('h_{B.in}')) || hLib, hLib), hLib);
  const taperError = tapered ? validateTaper(taper, value(byName('L'))) : null;
  const depthAtX = (x: number) => { const { x: X, h: Hs } = profileStations; for (let i = 1; i < X.length; i++) if (x <= X[i] + 1e-12) return Hs[i - 1] + ((Hs[i] - Hs[i - 1]) * (x - X[i - 1])) / (X[i] - X[i - 1] || 1); return Hs[Hs.length - 1]; };
  // tapered beam: where (and at which depth) each check governs
  const where = (k: string): string => {
    if (!res.taper) return '';
    const x = res[`at.${k}`], h = res[`hat.${k}`];
    if (Number.isFinite(x)) return `x = ${fmt(x, 2)} m, h = ${fmt(h, 1)} mm`;
    if (Number.isFinite(h)) return `worst depth h = ${fmt(h, 1)} mm`;
    return 'along the span';
  };

  const setInput = (f: InputField, n: number) => {
    setValues((vs) => ({ ...vs, [f.id]: n }));
    send({ kind: 'input', id: f.id, value: n });
  };
  const setRows = (t: LoadTable, rows: string[][]) => {
    setState((s) => s && { ...s, tables: s.tables.map((x) => (x.id === t.id ? { ...x, rows } : x)) });
    send({ kind: 'table', id: t.id, rows });
  };
  const snap = (): Snap => ({ bracing, taper, slab, values: Object.fromEntries(inputs.map((f) => [f.id, value(f)])), rows: Object.fromEntries(tables.map((t) => [t.id, t.rows])), sectionId: state.sectionId });
  const record = () => {
    const h = history.current;
    h.past.push(snap());
    if (h.past.length > 100) h.past.shift();
    h.future = [];
    setHist({ past: h.past.length, future: 0 });
  };
  const apply = (t: Snap) => {
    replaying.current = true;
    try {
      setBracing(t.bracing); send({ kind: 'bracing', bracing: t.bracing });
      setTaper(t.taper); send({ kind: 'taper', taper: t.taper, values: {} });
      setSlab(t.slab); send({ kind: 'slab', slab: t.slab });
      inputs.forEach((f) => { const nv = t.values[f.id]; if (nv !== undefined && nv !== value(f)) setInput(f, nv); });
      tables.forEach((tb) => { const rows = t.rows[tb.id]; if (rows && JSON.stringify(rows) !== JSON.stringify(tb.rows)) setRows(tb, rows); });
      if (t.sectionId !== state.sectionId) { send({ kind: 'section', id: t.sectionId }); setFamily(sections.find((x) => x.id === t.sectionId)?.family ?? family); }
    } finally {
      replaying.current = false;
    }
  };
  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(snap());
    apply(prev);
    setHist({ past: h.past.length, future: h.future.length });
  };
  const redo = () => {
    const h = history.current;
    const nxt = h.future.pop();
    if (!nxt) return;
    h.past.push(snap());
    apply(nxt);
    setHist({ past: h.past.length, future: h.future.length });
  };

  // Keep global keyboard handlers and snapshot recording in sync with this render.
  /* oxlint-disable react/refs -- callbacks are invoked only by user events, never during render. */
  recordRef.current = record;
  undoRef.current = undo;
  redoRef.current = redo;
  /* oxlint-enable react/refs */
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
  const urDes = res['UR.des'];
  const dMax = composite ? res.dmax : res.dnc;
  const rows = CHECKS.filter(([key, , , basis]) => key !== 'des' && (!basis || (basis === 'c') === composite));
  const nFail = shown.filter(([key]) => res[`UR.${key}`] > 1).length;

  const sectionProps: [string, string, string, number][] = [
    ['h_a', 'h_a', 'mm', 1], ['b_a', 'b_a', 'mm', 1], ['t_f', 't_f', 'mm', 1], ['t_w', 't_w', 'mm', 1], ['r', 'r', 'mm', 1], ['A_a', 'A_a', 'cm²', 2],
    ['I_a', 'I_a', 'cm⁴', 0], ['W_{pl}', 'W_pl', 'cm³', 1], ['m_a', 'm_a', 'kg/m', 1], ['b_{eff}', 'b_eff', 'mm', 0], ['I_0', 'I_0', 'cm⁴', 0], ['I_L', 'I_L', 'cm⁴', 0],
    ['M_{a.Rd}', 'MaRd', 'kNm', 1], ['M_{pl.Rd}', 'MplRd', 'kNm', 1], ['V_{pl.Rd}', 'VplRd', 'kN', 1],
  ];
  const okNum = (t: string, blankOk = false) => (blankOk && !t.trim()) || (NUMBER.test(t) && Number(t) > 0);
  const camberField = inputs.find((f) => f.name === 'c_{cam}');
  const camber0Field = inputs.find((f) => f.name === 'w_{c.0}');
  const okPct = (t: string) => !t.trim() || (NUMBER.test(t) && Number(t) >= 0 && Number(t) <= 100);
  const okEta = okPct(etaReq) && okPct(etaCap) && !(etaReq.trim() && etaCap.trim() && Number(etaReq) > Number(etaCap));
  // Optimise one detail with the section fixed: stud spacing, or rebar spacing (with the bar diameter as fallback).
  const okZero = (t: string) => NUMBER.test(t) && Number(t) >= 0;
  const lim = (t: string) => (t.trim() ? Number(t) : null);
  const optSections = sections
    .filter((x) => optFamilies.includes(x.family) && Number.isFinite(x.values.mass)
      && (lim(hMin) === null || x.values.h >= lim(hMin)! - 1e-9) && (lim(hMax) === null || x.values.h <= lim(hMax)! + 1e-9) && (lim(bMin) === null || x.values.b >= lim(bMin)! - 1e-9))
    .sort((a, b) => a.values.mass - b.values.mass);
  const optLabel = FAMILIES.filter((f) => optFamilies.includes(f)).join(' / ') || 'section';
  const optOk = okNum(hMin, true) && okNum(hMax, true) && okNum(bMin, true) && okNum(tStrength) && okNum(tDefl) && okEta
    && (!camAuto || Object.values(cam).every(okZero)) && optSections.length > 0;
  const runOptimize = async () => {
    const criteria: DesignCriteria = {
      strength: Number(tStrength), deflection: Number(tDefl), etaMin: etaReq.trim() ? Number(etaReq) / 100 : 0, etaMax: etaCap.trim() ? Number(etaCap) / 100 : 1,
      studs: studMode, bars: BAR_DIAMETERS, barSpacings: BAR_SPACINGS,
      camber: camAuto ? { pct: Number(cam.pct), min: Number(cam.min), max: Number(cam.max), step: Number(cam.step), minSpan: Number(cam.minSpan) } : null,
    };
    setOpt({ running: true });
    const t0 = performance.now();
    const result = await optimizeDesign(optLabel, optSections.map((x) => ({ id: x.id, name: x.name, mass: x.values.mass, h: x.values.h })), value(byName('L')), criteria,
      { bracing, taper, slab, values, tables: state.tables.map((t) => ({ id: t.id, rows: t.rows })) }, (i, n, name) => setOpt({ running: true, i, n, name }));
    setOpt({ running: false, result, seconds: (performance.now() - t0) / 1000 });
  };
  const renderField = (f: InputField) =>
    f.name === 'c_{NA}' ? (
      <label key={f.id} className={`f wide ${changed(f) ? 'changed' : ''}`} htmlFor={`in-${f.id}`}>
        <span>National Annex <em className="input-description">EN 1993-1-1 lateral-torsional buckling (§6.3.2)</em></span>
        <select id={`in-${f.id}`} data-testid="na" value={value(f) >= 1 ? '1' : '0'} onChange={(e) => setInput(f, Number(e.target.value))}>
          <option value="1">Singapore (NA to SS EN 1993-1-1; same LTB values as the UK NA): §6.3.2.3</option>
          <option value="0">EN recommended values: §6.3.2.2</option>
        </select>
      </label>
    ) : ['c_{brace}', 'c_{LT.d}', 'c_{pe}'].includes(f.name) ? (
      <label key={f.id} className={`f check ${changed(f) ? 'changed' : ''}`} htmlFor={`in-${f.id}`}>
        <span><Sym latex={f.name} /> <em className="input-description"><Rich text={f.label.replace(/:\s*1 = yes.*$/, '')} /></em></span>
        <input id={`in-${f.id}`} type="checkbox" checked={value(f) >= 1} onChange={(e) => setInput(f, e.target.checked ? 1 : 0)} />
      </label>
    ) : (
      <label key={f.id} className={`f ${changed(f) ? 'changed' : ''}`} htmlFor={`in-${f.id}`}>
        <span><Sym latex={f.name} />{f.unit ? ` (${unit(f.unit)})` : ''} <em className="input-description"><Rich text={f.label} /></em></span>
        <NumberField id={`in-${f.id}`} label={f.name} value={String(value(f))} onCommit={(nv) => setInput(f, nv)} />
      </label>
    );
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
        <span className="hint">Simply supported composite beam · EN 1994-1-1 · {deck ? `steel deck, ribs ${parallel ? 'parallel' : 'perpendicular'}` : 'solid slab'} · mCalcCanvas engine</span>
        <span className={`status ${busy ? 'busy' : ''}`} aria-hidden="true">{busy ? 'Calculating…' : 'Up to date'}</span>
        <div className="exports" role="group" aria-label="Report">
          <button type="button" onClick={undo} disabled={hist.past === 0} className="btn export" title="Undo (Ctrl+Z)">Undo</button>
          <button type="button" onClick={redo} disabled={hist.future === 0} className="btn export" title="Redo (Ctrl+Shift+Z)">Redo</button>
          <button type="button" onClick={download} disabled={invalidBracing} className="btn export" title="Download the worksheet with these inputs; it reopens in mCalcCanvas">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" strokeWidth="1.3" strokeLinejoin="round" /><path d="M9.5 1.5V5H13" fill="none" strokeWidth="1.3" strokeLinejoin="round" /><path d="M8.5 7.5v4.5M6.5 10l2 2 2-2" fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            .mCCV
          </button>
          <button type="button" onClick={report} disabled={invalidBracing} data-testid="open-report" className="btn primary">Open full report</button>
        </div>
      </header>

      {/* phone: the governing UR and quick links stay at the top while scrolling */}
      <nav className="phone-bar" aria-label="Page sections" data-testid="phone-bar">
        <a href="#verdict" className={`phone-ur ${pass ? 'pass' : 'fail'}`} data-testid="phone-ur">UR {fmt(overall, 3)} {pass ? 'PASS' : 'FAIL'}</a>
        <a href="#design-inputs">Inputs</a>
        <a href="#verdict">Checks</a>
        <a href="#diagrams">Diagrams</a>
      </nav>
      <main>
        <div className="workspace">
          {/* ── Inputs ── */}
          <form className="panel inputs" id="design-inputs" aria-label="Design inputs" onSubmit={(e) => e.preventDefault()} noValidate>
            <section aria-labelledby="h-section">
              <div className="input-heading"><h2 id="h-section">Steel section</h2><InputHelp title="Steel section">
                <p>Select a section family and size. Tapered beams retain the library flange and web thicknesses; the web depth varies linearly between supports A and B, or through intermediate points set with Depth profile… (segments, as a nonprismatic member in ETABS).</p>
                <p>h<sub>A</sub>, h<sub>B</sub> (mm): overall steel depths at supports A and B, limited to the library depth of {fmt(hLib, 1)} mm. Enter 0 to use the library depth.</p>
              </InputHelp></div>
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
                <label className="f check wide" htmlFor="in-taper">
                  <span>Tapered</span>
                  <input id="in-taper" data-testid="taper" type="checkbox" checked={tapered} onChange={(e) => {
                    const on = e.target.checked;
                    if (on) for (const n of ['h_{A.in}', 'h_{B.in}']) if (!(value(byName(n)) > 0)) setInput(byName(n), hLib);
                    setInput(byName('c_{tap}'), on ? 1 : 0);
                  }} />
                </label>
                {tapered && ([['h_{A.in}', 'Depth at start, support A'], ['h_{B.in}', 'Depth at end, support B']] as const).map(([n, label]) => {
                  const f = byName(n), over = value(f) > hLib + 1e-9;
                  return (
                    <label key={n} className={`f ${changed(f) ? 'changed' : ''}`} htmlFor={`in-${f.id}`}>
                      <span><Sym latex={n === 'h_{A.in}' ? 'h_A' : 'h_B'} /> (mm) <em className="sr-only">{label}, ≤ {fmt(hLib, 1)}</em></span>
                      <NumberField id={`in-${f.id}`} label={n} value={String(value(f))} onCommit={(nv) => setInput(f, nv)} />
                      {over && <small className="fail" role="alert">More than the library depth: {fmt(hLib, 1)} mm is used.</small>}
                    </label>
                  );
                })}
                {tapered && (
                  <div className="wide taper-profile-row">
                    <button type="button" className="btn" data-testid="taper-edit" onClick={() => setTaperOpen(true)}>Depth profile…</button>
                    <span className="hint" data-testid="taper-profile-summary">{taper.segments.length >= 2
                      ? `${taper.segments.length} segments: ${profileStations.h.map((h) => fmt(h, 0)).join(' → ')} mm at x = ${profileStations.x.map((x) => fmt(x, 2)).join(', ')} m`
                      : 'Linear from h_A to h_B (one segment)'}</span>
                    {taperError && <small className="fail" role="alert">{taperError}</small>}
                  </div>
                )}
                {tapered && (
                  <label className="f wide"><span>Fabrication <em className="input-description">LTB curve, EN 1993-1-1 Table 6.4</em></span>
                    <select data-testid="taper-fab" value={value(byName('c_{weld}')) >= 1 ? 'w' : 'r'} onChange={(e) => setInput(byName('c_{weld}'), e.target.value === 'w' ? 1 : 0)}>
                      <option value="w">Welded (plates, or cut and re-welded web): curve c / d</option>
                      <option value="r">Rolled curves a / b (justify)</option>
                    </select>
                  </label>
                )}
                {tapered && <div className="wide taper-summary"><span className="hint">h<sub>A</sub> {fmt(res.hA, 0)} to h<sub>B</sub> {fmt(res.hB, 0)} mm{taper.segments.length >= 2 ? `, ${taper.segments.length} segments` : ''}</span><InputHelp title="Tapered beam"><p className="hint wide" data-testid="taper-note">h<sub>A</sub> = {fmt(res.hA, 1)} → h<sub>B</sub> = {fmt(res.hB, 1)} mm, flanges and web thickness of {section?.name ?? 'the section'}. {res.taper ? <>Checked at the critical sections: x<sub>M</sub> = {fmt(res.xM, 2)} m (h = {fmt(depthAtX(res.xM), 1)} mm), both supports, LTB of the tapered beam (EN 1993-1-1 §6.3.4, α<sub>cr</sub> = {fmt(res['acr.LT'], 2)} by finite elements, λ̄ = {fmt(res['lam.LT'], 2)}, α<sub>LT</sub> = {fmt(res['alpha.LT'], 2)}), the web under each point load at its depth, the worst depth for bending with shear, the span for deflection. Governing: <Rich text={governing[1]} />, {where(gov.key) || 'see the table'}.</> : 'Same depth at both ends: uniform section.'}</p></InputHelp></div>}
              </div>
            </section>
            {groups.map(([g, fields], gi) => (
              <section key={g} aria-labelledby={`h-group-${gi}`}>
                <div className="input-heading"><h2 id={`h-group-${gi}`}>{isDeck(g) ? 'Slab' : g.replace(/\s*\(.*$/, '')}</h2><InputHelp title={isDeck(g) ? 'Slab' : g.replace(/\s*\(.*$/, '')}>
                  <dl>{fields.map((f) => <div key={f.id}><dt><Sym latex={f.name} />{f.unit ? ` (${unit(f.unit)})` : ''}</dt><dd><Rich text={f.label} /></dd></div>)}</dl>
                  {isDeck(g) && <p>Slab type selects a solid slab or filled steel deck. Deck direction is relative to the beam; transverse bars can have one or two layers. Use Define deck to select a profile and inspect its source.</p>}
                  {isDeck(g) && deck && <p className="hint">h<sub>c</sub> = {fmt(res.h_c, 0)} mm is the overall depth: {fmt(res.ht, 0)} mm of concrete above a {fmt(res.hpe, 0)} mm deck. P<sub>Rd</sub> = k<sub>d</sub> × solid-slab value = {fmt(res.PRd, 1)} kN ({parallel ? <>k<sub>l</sub>, (6.22)</> : <>k<sub>t</sub>, (6.23), limit {fmt(res.ktmax, 2)}</>}).{transverse && <> Studs sit in the ribs: spacing in effect {fmt(res.sA, 0)} / {fmt(res.sB, 0)} mm, {fmt(res.nre, 0)} per rib.</>}</p>}
                </InputHelp></div>
                {/Construction stage/.test(g) && <button type="button" className="btn" onClick={() => setConstructionOpen(true)}>Define Construction Stage?</button>}
                {isFactors(g) ? (
                  <div className="define-row">
                    <button type="button" className="btn" data-testid="factors-open" onClick={() => factorRef.current?.showModal()}>Define…</button>
                    <span className="hint">{fields.map((f) => <span key={f.id} className="chip"><Sym latex={f.name} /> {fmt(value(f), 2)}</span>)}</span>
                  </div>
                ) : isDeck(g) ? (
                  <>
                    <div className="fields">
                      <label className="f"><span>Slab type</span>
                        <select data-testid="slab-type" value={deck ? 'deck' : 'solid'} onChange={(e) => setInput(byName('c_{deck}'), e.target.value === 'deck' ? 1 : 0)}>
                          <option value="solid">Solid slab</option>
                          <option value="deck">Filled steel deck</option>
                        </select>
                      </label>
                      {deck && (
                        <label className="f"><span>Deck direction (ribs)</span>
                          <select data-testid="deck-dir" value={parallel ? 'par' : 'tr'} onChange={(e) => setInput(byName('c_{par}'), e.target.value === 'par' ? 1 : 0)}>
                            <option value="tr">Perpendicular to the beam</option>
                            <option value="par">Parallel to the beam</option>
                          </select>
                        </label>
                      )}
                      {deck && (
                        <label className="f"><span>Transverse bars</span>
                          <select data-testid="bar-layers" value={value(byName('n_{lay}')) <= 1 ? '1' : '2'} onChange={(e) => setInput(byName('n_{lay}'), Number(e.target.value))}>
                            <option value="1">1 layer, on the deck</option>
                            <option value="2">2 layers, top and bottom</option>
                          </select>
                        </label>
                      )}
                      {renderField(byName('h_c'))}
                    </div>
                    <div className="define-row" data-testid="slabzone-row">
                      <button type="button" className="btn" data-testid="slabzone-open" onClick={() => setSlabOpen(true)}>Sunken slab zones…</button>
                      <span className="hint" data-testid="slabzone-summary">{slab.zones.length
                        ? slab.zones.map((z, i) => {
                          const u = res.vectors?.zoneUr?.[i], xc = res.vectors?.zoneXc?.[i];
                          return `x ${fmt(z.x1, 2)}–${fmt(z.x2, 2)} m: ${fmt(z.hc, 0)} mm${Number.isFinite(u) ? ` (section x = ${fmt(xc, 2)} m, UR ${fmt(u, 3)})` : ''}`;
                        }).join('; ')
                        : 'None: full slab over the span'}</span>
                      {slab.zones.length > 0 && res.zoneDuctile === 0 && <small className="fail" role="alert">75 mm studs &lt; 4d: steel section alone in the zone</small>}
                    </div>
                    {deck && (
                      <div className="define-row">
                        <button type="button" className="btn" data-testid="deck-open" onClick={() => deckRef.current?.showModal()}>Define deck…</button>
                        <span className="hint">
                          <span className="chip">{deckName}</span>
                          {['h_p', 'b_r', 'e_r', 't_p'].map((n) => <span key={n} className="chip"><Sym latex={n} /> {fmt(value(byName(n)), n === 't_p' ? 2 : 0)}</span>)}
                          {transverse && <span className="chip"><Sym latex="n_r" /> {fmt(value(byName('n_r')), 0)}</span>}
                          <span className="chip"><Sym latex="k_d" /> {fmt(res.kd, 2)}</span>
                        </span>
                      </div>
                    )}

                  </>
                ) : (
                  <div className="fields">{fields.filter((f) => !(bracing.mode === 'explicit' && ['c_{brace}', 'k_{LT}'].includes(f.name)) && f.name !== 'h_c' && f.name !== 'c_{zg}' && !(res.ctop === 0 && ['d_{s.t}', 's_{f.t}'].includes(f.name))).map(renderField)}</div>
                )}
              </section>
            ))}
          </form>

          {/* ── Loading sheet ── */}
          <section className="stage" id="diagrams" aria-labelledby="h-loading">
            <div className="stagebar">
              <h2 id="h-loading">Loading</h2>
              <span className="hint">span L = {fmt(res.L, 2)} m · beam spacing s<sub>b</sub> = {fmt(sb, 2)} m · self-weight g<sub>0</sub> = {fmt(res.g0, 2)} kN/m</span>
              <span className="layers"><i className="lg" /> G permanent <i className="lq" /> Q variable</span>
              <button type="button" className="btn" data-testid="load-open" onClick={() => loadRef.current?.showModal()}>Modify load</button>
            </div>
            <div className="sheet cad-grid">
              <div>
                <h3>Beam: longitudinal section</h3>
                <BeamCad part="elevation" r={res} name={sections.find((x) => x.id === state.sectionId)?.name ?? ''} />
                <h3>Cross-section and plastic stress block at x<sub>M</sub></h3>
                <div className="cad-section"><BeamCad part="section" r={res} name="" /></div>
                <h3>Uniformly distributed loads</h3>
                <UdlDrawing L={res.L} area={area} sb={sb} sw={{ ga: res.ga, gc: res.gc, gF: res.gsw }} />
                <h3>Point loads</h3>
                <PointDrawing L={res.L} points={points} />
              </div>
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
            <section className="sheet-sec forces-panel" aria-labelledby="h-forces" data-testid="forces-panel">
              <div className="sec-head"><h2 id="h-forces">Internal forces, ULS</h2><span className="hint">hover or ← → on a chart to read values</span></div>
                        <h3>Shear V<sub>Ed</sub>, max {fmt(res.V2, 1)} kN</h3>
            <LineChart alignBeam series={[{ x: v.x, y: v.V, color: C.blue, label: 'V', fill: true }]} height={130} yUnit="kN" label={`Shear force diagram, ${fmt(res.V2, 1)} kN at the support`} />
            <h3>Moment M<sub>Ed</sub> and resistance M<sub>Rd</sub>(x) from the studs</h3>
            <LineChart alignBeam series={[{ x: v.x, y: v.M, color: C.red, label: 'M_Ed', fill: true }, ...(composite ? [{ x: v.x, y: v.MRdx, color: C.blue, label: 'M_Rd' }] : [])]} height={160} invertY yUnit="kNm" labels={[{ x: res.xM, y: res.M2, text: fmt(res.M2, 1), color: C.red }]} label={`Bending moment diagram, maximum ${fmt(res.M2, 1)} kNm at ${fmt(res.xM, 2)} m`} />
            <Legend items={[{ color: C.red, label: 'M_Ed(x)' }, ...(composite ? [{ color: C.blue, label: 'M_Rd(x), studs provided' }] : [])]} />
            {(() => {
              // moment-driven stud need at each x: (M_Ed(x) − M_a.Rd)/(M_pl.Rd − M_a.Rd) of N_c.f, over P_Rd
              const nM = v.x.map((_, i) => {
                const M = v.M[i];
                return M > res.MaRd ? Math.ceil(((M - res.MaRd) / (res.MplRd - res.MaRd)) * res.Ncf / res.PRd - 1e-9) : 0;
              });
              return (
                <>
                  <h3>Studs needed along the span</h3>
                  {!composite && (
                    <p className="basis-note" data-testid="stud-warning" role="alert">
                      {res.nreq > res.nh
                        ? <>Studs do not satisfy the requirement at the critical section (needed {res.nreq}, provided {res.nh} per shear span).</>
                        : <>The studs provided do not give M<sub>Rd</sub>(x) ≥ M<sub>Ed</sub>(x) along the span (see where the needed curve exceeds the provided one).</>}
                      {' '}The section is checked as bare steel.
                    </p>
                  )}
                  <LineChart alignBeam series={[
                    { x: v.x, y: nM, color: C.red, label: 'n needed' },
                    { x: v.x, y: v.nx, color: C.blue, label: 'n_x provided' },
                  ]} height={150} yMin={0} digits={0} yUnit="studs" label="Studs needed from M_Ed(x) and provided along the span" />
                  <Legend items={[{ color: C.red, label: 'n needed from M_Ed(x)' }, { color: C.blue, label: 'n_x provided (support to x)' }]} />
                </>
              );
            })()}
            <h3 id="h-defl1">Deflection, construction stage (steel alone), max {fmt(res.d1, 1)} mm</h3>
            <LineChart
              alignBeam
              series={[
                { x: v.x1v, y: v.d1v, color: C.blue, label: 'δ_1' },
                { x: [v.x1v[0] ?? 0, v.x1v[v.x1v.length - 1] ?? 1], y: [res.dlim, res.dlim], color: C.red, label: 'limit', dash: true, width: 1.2 },
              ]}
              height={130}
              invertY
              yUnit="mm"
              label={`Construction deflection, maximum ${fmt(res.d1, 1)} mm against a limit of ${fmt(res.dlim, 1)} mm`}
            />
            <Legend items={[{ color: C.blue, label: 'δ_1(x), steel alone' }, { color: C.red, label: 'limit L/r', dash: true }]} />
            <h3 id="h-defl">Deflection, permanent stage, {composite ? 'composite' : 'bare steel'}, max {fmt(dMax, 1)} mm</h3>
            <LineChart
              alignBeam
              series={[
                { x: v.x, y: v.d, color: C.blue, label: 'DL+LL' },
                { x: v.x, y: v.dq, color: C.green, label: 'LL', width: 1.4 },
                { x: [v.x[0] ?? 0, v.x[v.x.length - 1] ?? 1], y: [res.dlim, res.dlim], color: C.red, label: 'limit', dash: true, width: 1.2 },
              ]}
              height={150}
              invertY
              yUnit="mm"
              label={`Deflection, maximum ${fmt(dMax, 1)} mm against a limit of ${fmt(res.dlim, 1)} mm`}
            />
            <Legend items={[{ color: C.blue, label: '1.0 DL + 1.0 LL' }, { color: C.green, label: 'LL' }, { color: C.red, label: 'limit L/r', dash: true }]} />
          </section>
            <aside className="sheet-sec sls-panel" aria-labelledby="h-sls" data-testid="sls-panel">
              <div className="sec-head"><h2 id="h-sls">Serviceability</h2><span className="hint">1.0 DL + 1.0 LL; construction: w<sub>1,k</sub> = {fmt(res.w1k, 2)} kN/m over L<sub>1</sub> = {fmt(res.L1, 2)} m</span></div>
              <table className="kv sls-table">
                <thead><tr><th>Deflection</th><th>max (mm)</th><th>limit (mm)</th><th>UR</th></tr></thead>
                <tbody>
                  <tr><td>δ<sub>1</sub>, construction (steel alone)</td><td>{fmt(res.d1, 1)}</td><td>{fmt((res.L1 * 1000) / res.rlim1, 1)}</td><td className={tone(res['UR.d.1'])}>{fmt(res['UR.d.1'], 3)}</td></tr>
                  <tr><td>δ, total less precamber, {composite ? 'composite' : 'bare steel'}</td><td>{fmt(dMax, 1)}</td><td>{fmt(res.dlim, 1)}</td><td className={tone(composite ? res['UR.d.x'] : res['UR.d.nc'])}>{fmt(composite ? res['UR.d.x'] : res['UR.d.nc'], 3)}</td></tr>
                  <tr><td>δ<sub>LL</sub>, live load</td><td>{fmt(res.dq, 1)}</td><td>{fmt((res.L * 1000) / res.rlimq, 1)}</td><td className={tone(composite ? res['UR.d.q'] : res['UR.d.q.nc'])}>{fmt(composite ? res['UR.d.q'] : res['UR.d.q.nc'], 3)}</td></tr>
                </tbody>
              </table>
              <p className="hint" data-testid="frequency">
              Natural frequency f<sub>1</sub> = {fmt(composite ? res.f1 : res.f1nc, 2)} Hz{composite ? '' : ' (steel alone)'} against the limit f<sub>lim</sub> = {fmt(res.flim, 2)} Hz: UR = {fmt(composite ? res['UR.fn'] : res['UR.fn.nc'], 3)}. f<sub>1</sub> = 18/√δ, δ = {fmt(composite ? res.ddyn : res.ddynnc, 1)} mm under g<sub>0</sub> + G + ψ<sub>vib</sub>Q on the dynamic section (SCI P354 approximation, E<sub>c.dyn</sub> = {fmt(res.Ecdyn ?? 38, 1)} GPa; SCI P354 / AD 433 give 38 GPa, AISC DG11 uses 1.35 E<sub>cm</sub>; change E<sub>c.dyn</sub> under Serviceability).
            
              </p>
            </aside>

            <section className="sheet-sec" aria-labelledby="h-shear3d">
              <div className="sec-head"><h2 id="h-shear3d">Longitudinal shear surfaces a-a, b-b{res.ccc >= 1 ? ' and c-c' : ''}</h2><span className="hint">EN 1994-1-1 §6.6.6.1, Figure 6.15{deck ? ', §6.6.6.4, Figure 6.16' : ''}; the surfaces run the whole length of the beam</span></div>
              <div className="surfaces">
                <figure>
                  <ShearSurface3D r={res} which="a" />
                  <figcaption><b className="c-a">a-a</b>: two vertical planes through {deck ? <>the concrete above the deck, h<sub>t</sub> = {fmt(res.ht, 0)} mm,</> : <>h<sub>c</sub> = {fmt(res.h_c, 0)} mm</>} at the flange edges; v<sub>f</sub>/2 on each; crossed by {res.ctop === 0 ? <>the single layer on the deck, A<sub>b</sub></> : <>top and bottom bars, A<sub>t</sub> + A<sub>b</sub></>} = {fmt(res.asf, 0)} mm²/m{res.ape > 0 ? <>, plus the deck A<sub>pe</sub> = {fmt(res.ape, 0)} mm²/m (6.25)</> : null}; v<sub>Ed</sub> = {fmt(res.vLEd, 2)} MPa.</figcaption>
                </figure>
                {res.cbb >= 1 ? (
                  <figure>
                    <ShearSurface3D r={res} which="b" />
                    <figcaption><b className="c-b">b-b</b>: around the studs, l<sub>b</sub> = 2h<sub>sc</sub> + d<sub>head</sub> + b<sub>0</sub> = {fmt(res.lb, 0)} mm{res.ccc >= 1 ? ', down to the flange inside the rib (Figure 6.16)' : ''}; the whole v<sub>f</sub>; crossed by the bottom bars twice, 2A<sub>b</sub> = {fmt(res.asb, 0)} mm²/m; v<sub>Ed</sub> = {fmt(res.vbEd, 2)} MPa.</figcaption>
                  </figure>
                ) : (
                  <figure>
                    <figcaption data-testid="bb-note"><b className="c-b">b-b</b>: not required. With the ribs perpendicular to the beam and the stud resistance reduced by k<sub>t</sub> = {fmt(res.kd, 2)}, surfaces around the studs need not be checked (EN 1994-1-1 §6.6.6.4(2)).</figcaption>
                  </figure>
                )}
                {res.ccc >= 1 && (
                  <figure>
                    <ShearSurface3D r={res} which="c" />
                    <figcaption data-testid="cc-caption"><b className="c-c">c-c</b> (Figure 6.16): from each side of the rib at the deck crest, inclined to the stud head and across it, l<sub>c</sub> = {fmt(res.lc, 0)} mm; below the crest it follows the rib side and is not counted (§6.6.6.4(3)); the whole v<sub>f</sub>; crossed by the bottom bars twice, 2A<sub>b</sub> = {fmt(res.asb, 0)} mm²/m; v<sub>Ed</sub> = {fmt(res.vcEd, 2)} MPa.</figcaption>
                  </figure>
                )}
                <figure className={res.ccc >= 1 ? '' : 'wide'}>
                  <p className={`hint ${res.chd < 30 ? 'fail' : ''}`} data-testid="head-clearance">Bottom bars: top of bar {fmt(res.chd, 0)} mm below the underside of the stud heads (≥ 30 mm, §6.6.5.1(1)){res.chd < 30 ? ': not met. Use taller studs or lower the bars.' : '.'} Bars at {fmt(res.cb, 0)} mm cover above the {deck ? 'deck crest' : 'slab soffit'}; head {fmt(res.thead, 0)} mm high.</p>
                </figure>
                <figure className="wide">
                  <LongSection r={res} />
                  <figcaption>Longitudinal section along the span through the studs{transverse ? <>: ribs at e<sub>r</sub> = {fmt(res.er, 0)} mm, studs at {fmt(res.sA, 0)} mm ({fmt(res.nre, 0)} per rib)</> : <>: stud spacing s<sub>f.b</sub> = {fmt(res.sfb, 0)} mm</>}, slab depth h<sub>c</sub> = {fmt(res.h_c, 0)} mm, drawn to scale. Red band = a-a over the {deck ? 'concrete above the deck' : 'slab depth'}{res.cbb >= 1 ? '; teal band = b-b over the stud height, from the flange' : ''}.{parallel ? ' Dashed line = deck crest beside the rib.' : ''}</figcaption>
                </figure>
              </div>
              <p className="hint">Front face = cross-section to scale; the length along the span is not. Bars counted must be anchored past each surface (EC2 §8.4). v<sub>f</sub> = {res.nre > 1 ? `${fmt(res.nre, 0)} ` : ''}P<sub>Rd</sub>/s<sub>min</sub> = {fmt(res.vf, 0)} kN/m pulls the slab outstand along the beam.</p>
            </section>
          </section>

          {/* ── Verdict ── */}
          <section className="verdict-panel" id="verdict" tabIndex={-1} aria-labelledby="h-verdict">
            <div className="pin panel">
            <div className="check-head">
              <h2 id="h-verdict">Check</h2>
              <button type="button" className="btn" data-testid="optimize-open" disabled={tapered} title={tapered ? 'Not available for a tapered beam' : undefined} onClick={() => { setOptFamilies((v) => (v.includes(family) ? v : [...v, family])); dialogRef.current?.showModal(); }}>
                Optimize section…
              </button>
            </div>
            {tapered && <p className="hint" data-testid="optimize-taper">The optimizer is for uniform sections: untick Tapered to use it.</p>}
            {opt?.result?.best && !opt.running && <p className="hint">Last optimisation: {opt.result.best.name}, {fmt(opt.result.best.mass, 1)} kg/m.</p>}
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
                      <td><Rich text={label} /><span className="clause">{clause}{res.taper ? ` · ${where(key)}` : ''}</span></td>
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
                <tr><td>Surface length</td><td>2 × {fmt(res.ht, 0)}</td><td>{fmt(res.lb, 0)}</td><td>mm</td></tr>
                <tr><td>Flow on the surface</td><td>v<sub>f</sub>/2 each</td><td>v<sub>f</sub></td><td></td></tr>
                <tr><td>Shear stress v<sub>Ed</sub></td><td>{fmt(res.vLEd, 3)}</td><td>{fmt(res.vbEd, 3)}</td><td>MPa</td></tr>
                <tr><td>Strut angle cot θ<sub>f</sub> (auto)</td><td>{fmt(res.cta, 3)}</td><td>{fmt(res.ctb, 3)}</td><td></td></tr>
                <tr><td>Required a<sub>sf</sub>, (6.21)</td><td>{fmt(res.asfReq, 0)}</td><td>{fmt(res.asbReq, 0)}</td><td>mm²/m</td></tr>
                <tr><td>Bars counted</td><td>{res.ctop === 0 ? null : <>A<sub>t</sub> + </>}A<sub>b</sub>{res.ape > 0 ? ' (+ deck)' : ''}</td><td>2A<sub>b</sub></td><td></td></tr>
                <tr><td>Provided a<sub>sf</sub></td><td>{fmt(res.asf, 0)}</td><td>{fmt(res.asb, 0)}</td><td>mm²/m</td></tr>
                <tr><td>Transverse bars UR</td><td className={tone(res['UR.sf'])}>{fmt(res['UR.sf'], 3)}</td><td className={tone(res['UR.sf.b'])}>{fmt(res['UR.sf.b'], 3)}</td><td></td></tr>
                <tr><td>Strut resistance v<sub>Rd</sub>, (6.22)</td><td>{fmt(res.vLRd, 2)}</td><td>{fmt(res.vbRd, 2)}</td><td>MPa</td></tr>
                <tr><td>Strut UR v<sub>Ed</sub>/v<sub>Rd</sub></td><td className={tone(res['UR.L'])}>{fmt(res['UR.L'], 3)}</td><td className={tone(res['UR.L.b'])}>{fmt(res['UR.L.b'], 3)}</td><td></td></tr>
              </tbody>
            </table>
            <p className="hint">Bars: top A<sub>t</sub> Ø{fmt(res.dst, 0)} at {fmt(res.sft, 0)} = {fmt(res.at, 0)} mm²/m, bottom A<sub>b</sub> Ø{fmt(res.dsb, 0)} at {fmt(res.sfb, 0)} = {fmt(res.ab, 0)} mm²/m, anchored past each surface (EC2 §8.4). {res.cbb < 1 && <> b-b is not required with transverse ribs (§6.6.6.4(2)); its URs are shown as 0.</>}{deck && res.ape > 0 && <> Required a<sub>sf</sub> on a-a is net of the deck, A<sub>pe</sub> f<sub>yp,d</sub> (6.25).</>} {res.ccc >= 1 && <> Ribs parallel: surface c-c is checked as well (figure above); its two URs are in the check table.</>} Not checked: d-d and haunches, splitting at edge beams (§6.6.5.3), minimum reinforcement.</p>
          </section>

        </div>
      </main>
      {slabOpen && <SlabZoneDialog L={value(byName('L'))} hc={value(byName('h_c'))} hsc={value(byName('h_{sc}'))} dsc={value(byName('d_{sc}'))} zones={slab}
        onClose={() => setSlabOpen(false)}
        onSave={(z) => { record(); setSlab(z); send({ kind: 'slab', slab: z }); }} />}
      {taperOpen && <TaperDialog L={value(byName('L'))} hA={Math.min(value(byName('h_{A.in}')) || hLib, hLib)} hB={Math.min(value(byName('h_{B.in}')) || hLib, hLib)} hLib={hLib} sectionName={section?.name ?? ''} profile={taper}
        onClose={() => setTaperOpen(false)}
        onSave={(hA, hB, p) => {
          record();
          const fa = byName('h_{A.in}'), fb = byName('h_{B.in}');
          setValues((vs) => ({ ...vs, [fa.id]: hA, [fb.id]: hB }));
          setTaper(p);
          send({ kind: 'taper', taper: p, values: { [fa.id]: hA, [fb.id]: hB } });
        }} />}
      {constructionOpen && <ConstructionStage initialResults={res} inputs={inputs} values={snap().values} tables={tables} sectionId={state.sectionId} bracing={bracing} taper={taper} slab={slab}
        onClose={() => setConstructionOpen(false)} onSave={(draft, b) => {
          record(); setValues(draft); setBracing(b);
          send({ kind: 'construction', values: draft, bracing: b });
        }} />}
      <dialog ref={factorRef} className="opt-dialog" aria-labelledby="factor-title">
        <div className="opt-form">
          <header className="opt-head">
            <h2 id="factor-title">Partial and combination factors</h2>
            <button type="button" className="rowbtn" aria-label="Close" onClick={() => factorRef.current?.close()}>×</button>
          </header>
          <p className="hint">EN recommended values; confirm against the National Annex. They apply to the whole calculation.</p>
          <div className="fields">{groups.filter(([g]) => isFactors(g)).flatMap(([, fields]) => fields.map(renderField))}</div>
          <div className="opt-actions">
            <button type="button" className="btn primary" onClick={() => factorRef.current?.close()}>Done</button>
          </div>
        </div>
      </dialog>
      <dialog ref={deckRef} className="opt-dialog" aria-labelledby="deck-title">
        <div className="opt-form">
          <header className="opt-head">
            <h2 id="deck-title">Profiled steel deck</h2>
            <button type="button" className="rowbtn" aria-label="Close" onClick={() => deckRef.current?.close()}>×</button>
          </header>
          <div className="fields">
            <label className="f"><span>Search the catalogue</span>
              <input data-testid="deck-search" className="num-input" type="search" autoComplete="off" placeholder="e.g. ComFlor, 1.00, re-entrant" value={deckQuery} onChange={(e) => setDeckQuery(e.target.value)} />
            </label>
            <label className="f"><span>Deck profile ({deckList.length} of {DECKS.length})</span>
              <select data-testid="deck-preset" value={deckPreset?.name ?? ''} onChange={(e) => applyDeck(e.target.value)}>
                {!deckPreset && <option value="">Custom (values below)</option>}
                {deckPreset && !deckList.includes(deckPreset) && <option>{deckPreset.name}</option>}{/* the current profile, outside the search */}
                {[...new Set(deckList.map((d) => d.maker))].map((m) => (
                  <optgroup key={m} label={m}>{deckList.filter((d) => d.maker === m).map((d) => <option key={d.name}>{d.name}</option>)}</optgroup>
                ))}
              </select>
            </label>
          </div>
          <p className="hint" data-testid="deck-source">{deckPreset ? <><b>{deckPreset.maker} {deckPreset.name}</b>: <Rich text={deckPreset.src} /></> : 'Custom deck: values as entered below.'}</p>
          <p className="hint">Ribs {parallel ? 'parallel' : 'perpendicular'} to the beam. b<sub>r</sub> is b<sub>0</sub> of EN 1994-1-1 Figure 6.13: the mean width of an open rib, the minimum width of a re-entrant one. Concrete in the ribs carries weight but no force. Catalogue values are as published; check the current data sheet of the deck actually supplied.</p>
          <DeckProfile hc={res.h_c} hp={value(byName('h_p'))} br={value(byName('b_r'))} er={value(byName('e_r'))} hsc={res.hsc} dsc={res.dsc} nr={transverse ? value(byName('n_r')) : 1} reentrant={value(byName('c_{re}')) >= 1} />
          <div className="fields">
            {groups.filter(([g]) => isDeck(g)).flatMap(([, fields]) => fields)
              .filter((f) => !['c_{deck}', 'c_{par}', 'c_{re}', 'n_{lay}'].includes(f.name) && (transverse || !['n_r', 'c_{LT.d}', 'c_{pe}', 'A_{pe}', 'f_{yp}'].includes(f.name)))
              .map(renderField)}
          </div>
          <p className="hint">k<sub>d</sub> = {fmt(res.kd, 3)} on the stud resistance ({parallel ? <>k<sub>l</sub>, (6.22)</> : <>k<sub>t</sub>, (6.23), limit {fmt(res.ktmax, 2)} from Table 6.2 for studs welded through the sheet</>}); P<sub>Rd</sub> = {fmt(res.PRd, 1)} kN.{transverse && <> Minimum degree of connection {fmt(res.etaMin, 2)} ({res.c16 >= 1 ? '(6.16), one stud in every rib' : '(6.12)'}).</>}</p>
          <div className="opt-actions">
            <button type="button" className="btn primary" onClick={() => deckRef.current?.close()}>Done</button>
          </div>
        </div>
      </dialog>
      <dialog ref={loadRef} className="opt-dialog load-dialog" aria-labelledby="load-title">
        <div className="opt-form">
          <header className="opt-head">
            <h2 id="load-title">Modify load</h2>
            <button type="button" className="rowbtn" aria-label="Close" onClick={() => loadRef.current?.close()}>×</button>
          </header>
          <p className="hint">Area and point loads act on the beam and update the diagrams and checks as you change them. Other inputs are in the panel on the left.</p>
          {value(byName('c_{NA}')) >= 1 && (
            <p className="hint" data-testid="combo-note">Singapore NA (SS EN 1990): ULS by (6.10a) 1.35G + 1.5ψ<sub>0</sub>Q and (6.10b) 0.925·1.35G + 1.5Q. Governing: <b>{res.cbM >= 1 ? '(6.10b)' : '(6.10a)'}</b> (max M {fmt(res.Mamax, 1)} / {fmt(res.Mbmax, 1)} kNm). The γ<sub>F</sub> column is used only with EN recommended values.</p>
          )}
          {loadTable(areaT, 0)}
          {loadTable(pointT, 1)}
          <section aria-labelledby="h-zg">
            <h2 id="h-zg">Load position (lateral-torsional buckling)</h2>
            <div className="fields">
              <label className="f wide"><span>All loads act at <em>z<sub>g</sub> above the shear centre; used for M<sub>cr</sub> by finite elements</em></span>
                <select data-testid="load-zg" value={String(Math.round(value(byName('c_{zg}'))))} onChange={(e) => setInput(byName('c_{zg}'), Number(e.target.value))}>
                  <option value="1">Top flange, +h/2 above the shear centre (destabilising)</option>
                  <option value="0">Shear centre</option>
                  <option value="-1">Bottom flange, h/2 below the shear centre (stabilising)</option>
                </select>
              </label>
            </div>
            <p className="hint">Construction stage: M<sub>cr</sub> = {fmt(res['Mcr.LT'], 1)} kNm (α<sub>cr</sub> {fmt(res['acr.LT'], 2)}){Number.isFinite(res['Mcr.LT.nc']) ? <>; bare steel, unrestrained: M<sub>cr</sub> = {fmt(res['Mcr.LT.nc'], 1)} kNm</> : null}.</p>
          </section>
          <div className="opt-actions">
            <button type="button" className="btn primary" onClick={() => loadRef.current?.close()}>Done</button>
          </div>
        </div>
      </dialog>
      <dialog ref={dialogRef} className="opt-dialog wide" aria-labelledby="opt-title" onClose={() => undefined}>
        <form method="dialog" className="opt-form" onSubmit={(e) => e.preventDefault()} noValidate>
          <header className="opt-head">
            <h2 id="opt-title">Optimize section</h2>
            <button type="button" className="rowbtn" aria-label="Close" onClick={() => dialogRef.current?.close()}>×</button>
          </header>
          <p className="hint">Designs every allowed section, lightest first: camber from the rules, then the fewest studs and the lightest transverse bars (Ø10, Ø12, Ø13 at 200 to 100 mm) that pass every check, construction stage and longitudinal shear included. The lightest section wins. Only if no section works as composite are the sections tried as bare steel. Loads and other inputs stay as entered.</p>
          <fieldset className="crit">
            <legend>Sections</legend>
            <div className="fams" role="group" aria-label="Families">
              {FAMILIES.map((f) => (
                <label key={f} className="fam"><input type="checkbox" data-testid={`opt-fam-${f}`} checked={optFamilies.includes(f)} onChange={(e) => setOptFamilies((v) => (e.target.checked ? [...v, f] : v.filter((x) => x !== f)))} /> {f}</label>
              ))}
            </div>
            <div className="fields three">
              <label className="f"><span>Min depth h (mm)</span>
                <input data-testid="hmin" className="num-input" type="text" inputMode="decimal" autoComplete="off" placeholder="no limit" value={hMin} onChange={(e) => setHMin(e.target.value)} aria-invalid={!okNum(hMin, true)} />
              </label>
              <label className="f"><span>Max depth h (mm)</span>
                <input data-testid="hmax" className="num-input" type="text" inputMode="decimal" autoComplete="off" placeholder="no limit" value={hMax} onChange={(e) => setHMax(e.target.value)}
                  aria-invalid={!okNum(hMax, true)} aria-describedby={!okNum(hMax, true) ? 'hmax-error' : undefined} />
                {!okNum(hMax, true) && <span id="hmax-error" className="field-error">Error: a depth in mm, e.g. 350, or blank</span>}
              </label>
              <label className="f"><span>Min flange width b (mm)</span>
                <input data-testid="bmin" className="num-input" type="text" inputMode="decimal" autoComplete="off" placeholder="no limit" value={bMin} onChange={(e) => setBMin(e.target.value)} aria-invalid={!okNum(bMin, true)} />
              </label>
            </div>
            <p className="hint" data-testid="opt-count">{optSections.length} sections allowed.</p>
          </fieldset>
          <fieldset className="crit">
            <legend>Shear studs</legend>
            <div className="fields three">
              <label className="f"><span>Min % of full composite</span>
                <input data-testid="t-eta" className="num-input" type="text" inputMode="decimal" autoComplete="off" placeholder={`code, now ${fmt(res.etaMin * 100, 0)}`} value={etaReq} onChange={(e) => setEtaReq(e.target.value)} aria-invalid={!okEta} aria-describedby={!okEta ? 'te-error' : undefined} />
              </label>
              <label className="f"><span>Max % of full composite</span>
                <input data-testid="t-eta-max" className="num-input" type="text" inputMode="decimal" autoComplete="off" placeholder="100" value={etaCap} onChange={(e) => setEtaCap(e.target.value)} aria-invalid={!okEta} aria-describedby={!okEta ? 'te-error' : undefined} />
              </label>
              <label className="f"><span>Distribution</span>
                <select data-testid="stud-mode" value={studMode} onChange={(e) => setStudMode(e.target.value as DesignCriteria['studs'])} disabled={transverse}>
                  <option value="prefer-uniform">Prefer uniform (segmented only if needed)</option>
                  <option value="uniform">Uniform only</option>
                  <option value="segmented">Segmented (same count each side of M max)</option>
                </select>
              </label>
            </div>
            {!okEta && <span id="te-error" className="field-error">Error: percentages from 0 to 100, minimum not above maximum</span>}
            <p className="hint">{transverse ? 'Ribs perpendicular: studs sit in the ribs, so the layouts are every n-th rib, then two per rib.' : 'The stud count comes from the bending demand and the minimum degree; spacing is rounded down to 5 mm within the code limits.'} A section that needs more than the maximum is passed over for a heavier one.</p>
          </fieldset>
          <fieldset className="crit">
            <legend>Camber</legend>
            <label className="fam"><input type="checkbox" data-testid="camber-auto" checked={camAuto} onChange={(e) => setCamAuto(e.target.checked)} /> Choose the camber by rule (unpropped beams only)</label>
            {camAuto ? (
              <div className="fields three">
                {([['cam-pct', '% of the self-weight (g₀) deflection', 'pct'], ['cam-min', 'Minimum camber (mm); less = none', 'min'], ['cam-max', 'Maximum camber (mm)', 'max'], ['cam-step', 'Increment (mm)', 'step'], ['cam-span', 'No camber for spans below (m)', 'minSpan']] as const).map(([id, label, key]) => (
                  <label key={id} className="f"><span>{label}</span>
                    <input data-testid={id} className="num-input" type="text" inputMode="decimal" autoComplete="off" value={cam[key]} onChange={(e) => setCam((v) => ({ ...v, [key]: e.target.value }))} aria-invalid={!okZero(cam[key])} />
                  </label>
                ))}
              </div>
            ) : (
              <div className="fields three">
                {camberField && (
                  <label className="f" htmlFor={`opt-${camberField.id}`}><span>Precamber, % of the g<sub>0</sub> deflection</span>
                    <NumberField id={`opt-${camberField.id}`} label="c_cam" value={String(value(camberField))} onCommit={(nv) => setInput(camberField, nv)} />
                  </label>
                )}
                {camber0Field && (
                  <label className="f" htmlFor={`opt-${camber0Field.id}`}><span>Precamber, fixed value (mm)</span>
                    <NumberField id={`opt-${camber0Field.id}`} label="w_c.0" value={String(value(camber0Field))} onCommit={(nv) => setInput(camber0Field, nv)} />
                  </label>
                )}
              </div>
            )}
            <p className="hint">{camAuto ? 'Each section gets its own camber: the share of its self-weight deflection, rounded down to the increment.' : <>As entered, the same for every section; now w<sub>c</sub> = {fmt(res.wc, 1)} mm.</>} Camber reduces the total deflection only (EN 1990 A1.4.3); construction and live-load deflections are not cambered.</p>
          </fieldset>
          <fieldset className="crit">
            <legend>Deflection limits and targets</legend>
            <div className="fields three">
              {([['r_{lim.1}', 'Construction, L /'], ['r_{lim.q}', 'Live load, L /'], ['r_{lim}', 'Total less camber, L /']] as const).map(([n, label]) => (
                <label key={n} className="f" htmlFor={`opt-${byName(n).id}`}><span>{label}</span>
                  <NumberField id={`opt-${byName(n).id}`} label={n} value={String(value(byName(n)))} onCommit={(nv) => setInput(byName(n), nv)} />
                </label>
              ))}
              <label className="f"><span>Target max UR, strength (ULS)</span>
                <input data-testid="t-strength" className="num-input" type="text" inputMode="decimal" autoComplete="off" value={tStrength} onChange={(e) => setTStrength(e.target.value)}
                  aria-invalid={!okNum(tStrength)} aria-describedby={!okNum(tStrength) ? 'ts-error' : undefined} />
                {!okNum(tStrength) && <span id="ts-error" className="field-error">Error: a ratio, e.g. 0.90</span>}
              </label>
              <label className="f"><span>Target max UR, serviceability (SLS)</span>
                <input data-testid="t-defl" className="num-input" type="text" inputMode="decimal" autoComplete="off" value={tDefl} onChange={(e) => setTDefl(e.target.value)}
                  aria-invalid={!okNum(tDefl)} aria-describedby={!okNum(tDefl) ? 'td-error' : undefined} />
                {!okNum(tDefl) && <span id="td-error" className="field-error">Error: a ratio, e.g. 0.80</span>}
              </label>
            </div>
            <p className="hint">The three limits are worksheet inputs: they also apply to the design on the page and in the report.</p>
          </fieldset>
          <div className="opt-actions">
            <button type="button" className="btn primary" data-testid="optimize" disabled={opt?.running || !optOk} onClick={runOptimize}>
              {opt?.running ? 'Optimizing…' : `Find the best ${optLabel}`}
            </button>
            <p className="hint" role="status" data-testid="optimize-status">
              {opt?.running && opt.n ? <>Designed {opt.i} of {opt.n}: {opt.name}</> : null}
              {!opt?.running && opt?.result ? (
                opt.result.best ? (
                  <>Lightest {opt.result.family} meeting UR ≤ {fmt(opt.result.targets.strength, 2)} strength and ≤ {fmt(opt.result.targets.deflection, 2)} serviceability: <b>{opt.result.best.name}</b>.{opt.seconds !== undefined ? ` ${fmt(opt.seconds, 1)} s.` : ''}</>
                ) : (
                  <span className="error">No {opt.result.family} section meets the criteria ({opt.result.total / 2} sections).</span>
                )
              ) : null}
            </p>
            {!opt?.running && opt?.result?.best && (
              <table className="opt-result" data-testid="optimize-result">
                <caption className="sr-only">Optimised design</caption>
                <tbody>
                  <tr><td>Section</td><td>{opt.result.best.name}</td></tr>
                  <tr><td>Mass / depth h</td><td>{fmt(opt.result.best.mass, 1)} kg/m / {fmt(opt.result.best.h, 1)} mm</td></tr>
                  <tr><td>Design basis</td><td>{opt.result.best.composite ? 'Composite' : 'Bare steel: no section reaches composite action within the criteria'}</td></tr>
                  {opt.result.best.composite && <tr><td>Stud spacing s<sub>sc</sub> (A / B)</td><td>{opt.result.best.sc} / {opt.result.best.scB ?? opt.result.best.sc} mm{opt.result.best.nr ? `, ${opt.result.best.nr} per rib` : opt.result.best.layout ? `, ${opt.result.best.layout}` : ''}</td></tr>}
                  {opt.result.best.composite && <tr><td>Studs on the beam</td><td>{fmt(opt.result.best.studs ?? NaN, 0)}</td></tr>}
                  {opt.result.best.composite && opt.result.best.eta !== undefined && <tr><td>Degree of shear connection η</td><td>{fmt(opt.result.best.eta * 100, 0)} %</td></tr>}
                  {opt.result.best.composite && <tr><td>Transverse bars (top and bottom)</td><td>Ø{opt.result.best.bar}{opt.result.best.sf ? ` @ ${opt.result.best.sf} mm` : ' mm'}</td></tr>}
                  <tr><td>Camber</td><td>{(opt.result.best.camber ?? 0) > 0 ? `${fmt(opt.result.best.camber!, 0)} mm` : 'none'}</td></tr>
                  <tr><td>Strength UR (target {fmt(opt.result.targets.strength, 2)})</td><td className={tone(opt.result.best.strength.ur)}>{fmt(opt.result.best.strength.ur, 3)} · <Rich text={opt.result.best.strength.label} /></td></tr>
                  <tr><td>Deflection UR (target {fmt(opt.result.targets.deflection, 2)})</td><td className={tone(opt.result.best.deflection.ur)}>{fmt(opt.result.best.deflection.ur, 3)} · <Rich text={opt.result.best.deflection.label} /></td></tr>
                </tbody>
              </table>
            )}
            <div className="opt-buttons">
              {!opt?.running && opt?.result?.best && (
                <button type="button" className="btn primary" data-testid="optimize-apply" onClick={() => {
                  const b = opt.result!.best!;
                  send({ kind: 'section', id: b.id });
                  setFamily(sections.find((x) => x.id === b.id)!.family);
                  const put = (name: string, v: number) => { const f = inputs.find((x) => x.name === name); if (f && value(f) !== v) setInput(f, v); };
                  if (b.composite) { put('s_{sc.A}', b.sc); put('s_{sc.B}', b.scB ?? b.sc); put('d_{s.t}', b.bar); put('d_{s.b}', b.bar); if (b.sf) { put('s_{f.t}', b.sf); put('s_{f.b}', b.sf); } if (b.nr) put('n_r', b.nr); }
                  if (camAuto) { put('c_{cam}', 0); put('w_{c.0}', b.camber ?? 0); }
                  dialogRef.current?.close();
                }}>
                  Use {opt.result.best.name}
                </button>
              )}
              <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>Close</button>
            </div>
          </div>
        </form>
      </dialog>
      <p className="note">Review draft. Results come from the mCalcCanvas composite beam worksheet to EC4 (verified against SCI P364, SBE Part 4 and an independent reference); confirm National Annex values before use.</p>
    </>
  );
}
