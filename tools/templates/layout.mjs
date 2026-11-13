// Shared page layout for the template generators (A4 pages, 20 px grid, baselines on grid lines).
// createLayout() returns the placing helpers; st.page / st.row are the cursor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeTemplateLayout } from '../../src/canvas/templateLayout.ts';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TPL = path.resolve(HERE, '../../templates');
export const R = String.raw;

export function createLayout({ idPrefix, sizesFile, textFont = 'Inter', mathColumn = null }) {
const A4H = 1123, GAP = 48, LAST = 24;
const ln = (page, n) => page * (A4H + GAP) + 80 + Math.round((40 * n - 40) / 20) * 20;
const PG = A4H + GAP;
/** Top of a region whose first baseline (b px below its top) sits on the first grid line at or below y + b. */
const alignTop = (y, b) => { const o = Math.floor(y / PG) * PG + 60; return o + Math.ceil((y + b - o) / 20 - 1e-9) * 20 - b; };
let floorY = 0;
const place = (y, b, h, math, setFloor = true) => { const t = alignTop(math ? Math.max(y, floorY - 6) : y, b); if (setFloor) floorY = Math.max(floorY, t + (math ? h : 18)); return t; };
const syncRow = () => { const r = (floorY + 2 - (page * PG + 80)) / 40 + 1; if (r > row) row = Math.ceil(r * 2 - 1e-9) / 2; };
let uid = 0;
const id = () => `${idPrefix}_${(uid++).toString(36)}`;
const STYLES = { 1: { fontSize: 20, color: '#1e3a5f' }, 2: { fontSize: 16, color: '#0f172a' }, 3: { fontSize: 14, color: '#334155' } };
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const out = [];
/** Keep a caption and its compact table/figure on the same page. */
const KEEP = (fn) => {
  const start = out.length;
  fn();
  for (const shape of out.slice(start)) shape.groupId = `${idPrefix}_group_${start.toString(36)}`;
};

// ---- cursor ----
let page = 0, row = 1;
const need = (rows) => { if (row + rows > LAST + 1) { page++; row = 1; } };
const q = (r) => Math.ceil(r * 2 - 1e-9) / 2;
const gap = (n = 1) => { row += q(n); };

const ANNEX = [];
const newPage = () => { page++; row = 1; };
/** Annex link here; the block (fn) is written in the annex and calculated at this line. */
const LINK = (aid, title, fn) => {
  need(1);
  out.push({ id: id(), type: 'text', x: 76, y: alignTop(ln(page, row), 15), props: { w: 630, h: 24, html: '', fontFamily: textFont, fontSize: 14, color: '#2563eb', align: 'left', annex: { kind: 'link', target: aid } } });
  row += 1;
  ANNEX.push({ aid, title, fn });
};
const textAt = (pg, r, t, o = {}) => {
  const st = STYLES[o.heading] ?? { fontSize: 14, color: '#475569' };
  out.push({
    id: id(), type: 'text', x: o.x ?? 76, y: place(ln(pg, r) + (o.dy ?? 0), Math.round((o.size ?? st.fontSize) * 1.09), 0, false, o.floor !== false),
    props: { w: o.w ?? 630, h: Math.ceil((o.size ?? st.fontSize) * 1.45), html: o.italic ? `<i>${esc(t)}</i>` : esc(t), fontFamily: textFont,
      fontSize: o.size ?? st.fontSize, color: o.color ?? st.color, align: 'left', ...(o.heading ? { heading: o.heading } : {}), ...(o.annex ? { annex: o.annex } : {}) },
  });
};
const baseOf = (latex) => SIZES[latex]?.[2] ?? 20;
const mathAt = (pg, r, x, latex, extra = {}, dyPx = 0) =>
  out.push({ id: id(), type: 'math', x, y: place(ln(pg, r) + dyPx, baseOf(latex), SIZES[latex]?.[1] ?? 32, true),
    // Measured size and baseline: the app then keeps the region where it is placed on load
    // (an estimated baseline would be re-measured, move the region and recalculate the sheet).
    props: { w: SIZES[latex]?.[0] ?? 60, h: SIZES[latex]?.[1] ?? 32, ...(SIZES[latex]?.[2] ? { baseline: SIZES[latex][2] } : {}), latex, displayMode: 'auto', displayUnit: '', precision: -1, autoSize: true, fontSize: 16, color: '#0f172a', ...extra } });

const H = (level, t) => { need(level === 3 ? 2 : 2.5); if (level === 2 && row > 1) row += 0.5; textAt(page, row, t, { heading: level }); row += level === 1 ? 1.0 : 1.0; };
const T = (t) => { need(0.5); textAt(page, row, t, { size: 13 }); row += 0.5; syncRow(); };
const hOf = (latex, o) => o.h ?? (o.displayMode === 'full' ? (latex.includes('\\frac') ? 4 : 2) : (latex.includes('\\frac') || /\\sqrt\{[^}]*\^/.test(latex) ? 2 : 1));
/** Rough rendered width of a math region (px) – decides inline vs stacked. */
const estW = (latex, o) => {
  let t = latex.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => (a.length > b.length ? a : b));
  t = t.replace(/\\(left|right|mathrm|coloneq|cdot|,|\s)/g, (m) => (m === '\\coloneq' ? 'XX' : ''));
  t = t.replace(/\\[a-zA-Z]+/g, 'X').replace(/[{}^]/g, '').replace(/_[^ ]?/g, '');
  const res = /\\(le|ge)/.test(latex) ? 120 + t.length * 6 : (o.math?.displayMode === 'formulaResult' || latex.endsWith('=')) ? 110 : 0;
  return t.length * 10 + res;
};
const XM = 296;
const XM_WIDE = 96;
const SIZES = fs.existsSync(path.join(HERE, sizesFile)) ? JSON.parse(fs.readFileSync(path.join(HERE, sizesFile), 'utf8')) : {};
const CATALOG = JSON.parse(fs.readFileSync(path.resolve(HERE, '../../src/documents/templateMetrics.json'), 'utf8'));
const METRICS = CATALOG[sizesFile.includes('rect') ? 'rc-rectangular-column' : sizesFile.includes('col') ? 'rc-circular-column' : ''] ?? {};
/** Parameter: description to the left and the region on the same row; long formulas get the description above. */
const P = (desc, latex, o = {}) => {
  const size = SIZES[latex];
  const hpx = size ? size[1] : null;
  const h = o.h ?? (hpx ? Math.max(1, Math.ceil((hpx + 4) / 40)) : hOf(latex, o));
  const labelW = METRICS[esc(desc)]?.[3] ?? desc.length * 6.2;
  const mathX = mathColumn ?? Math.max(XM, 76 + Math.ceil((labelW + 16) / 20) * 20);
  const wide = o.wide ?? (size ? size[0] : estW(latex, o)) > 714 - mathX;
  if (wide) {
    const top0 = ln(page, row);
    const mTop = alignTop(top0 + 22, baseOf(latex));
    const span = q((mTop - top0 + (hpx ?? h * 40 - 8) + 6) / 40);
    need(span);
    textAt(page, row, desc, { size: 12, color: '#475569', dy: 0 });
    mathAt(page, row, XM_WIDE, latex, o.math ?? {}, 22);
    row += span; syncRow();
  } else {
    // description vertically centred on the region; a two-line description takes two rows
    const lines = labelW > mathX - 92 ? 2 : 1;
    const top0 = ln(page, row);
    const mTop = alignTop(top0, baseOf(latex));
    const hh = q(Math.max(mTop - top0 + (hpx ?? h * 40 - 8) + 6, lines === 2 ? 40 : 30) / 40);
    need(hh);
    const th = lines === 2 ? 34 : 18;
    const dy = hpx ? Math.max(0, Math.round(mTop - top0 + hpx / 2 - th / 2 - (hpx > 40 ? 4 : 0))) : 4;
    textAt(page, row, desc, { size: 12, color: '#475569', w: mathX - 92, x: 76, dy, floor: false });
    mathAt(page, row, mathX, latex, o.math ?? {});
    row += hh; syncRow();
  }
};

/** Several regions side by side on one row (tables). */
const ROW = (items, h) => { need(h); const f0 = floorY; let f1 = f0; for (const [x, latex, extra] of items) { floorY = f0; mathAt(page, row, x, latex, extra); f1 = Math.max(f1, floorY); } floorY = f1; row += q(h); syncRow(); };

const mm = { displayUnit: 'mm', precision: 0 };
const mm2 = { displayUnit: 'mm^2', precision: 0 };
const kN = { displayUnit: 'kN', precision: 0 };
const kN1 = { displayUnit: 'kN', precision: 1 };
const kNm = { displayUnit: 'kN m', precision: 1 };
const MPa = { displayUnit: 'MPa', precision: 1 };
const deg = { displayUnit: 'deg', precision: 1 };
const fr = { displayMode: 'formulaResult' };
const fo = { displayMode: 'formula' };
const FU = { displayMode: 'full' };
const M = (...xs) => ({ math: Object.assign({}, ...xs) });
const S = (sid, label, [x, y], style, color, width, extra = {}) => ({ id: sid, label, x, y, style, r: '', color, width, show: '', ...extra });
const GBASE = { xLabel: '', yLabel: '', grid: false, axesAtOrigin: true, font: 'Roboto', background: '#fff9c4' };
const GRAPH = (size, props) => {
  const rows = (size + 16) / 40;
  need(rows);
  out.push({ id: id(), type: 'graph', x: Math.round((80 + 714) / 2 - size / 2), y: ln(page, row) - 8, props: { w: size, h: size, ...GBASE, ...props } });
  row += q(rows);
};
const GRAPH2 = (size, a, b) => {
  const rows = (size + 16) / 40;
  need(rows);
  out.push({ id: id(), type: 'graph', x: 80, y: ln(page, row) - 8, props: { w: size, h: size, ...GBASE, ...a } });
  out.push({ id: id(), type: 'graph', x: 714 - size, y: ln(page, row) - 8, props: { w: size, h: size, ...GBASE, ...b } });
  row += q(rows);
};
const colTable = (n) => (n * 14.6 + 30) / 40;
const cv = (unit, prec) => ({ ...(unit ? { displayUnit: unit } : {}), precision: prec, vectorLayout: 'column', vectorExpanded: true, fontSize: 12 });

const st = {
  get page() { return page; }, set page(v) { page = v; },
  get row() { return row; }, set row(v) { row = v; },
};

/** Writes the annex after the main body and saves the document (fixed dates: the output is reproducible). */
/** Input & Results set-up: columns refer to math regions by their exact LaTeX. */
const batchConfig = (spec) => {
  if (!spec) return { title: 'Batch calculation', inputs: [], outputs: [], rows: [] };
  const regionOf = (latex) => {
    const s = out.find((x) => x.type === 'math' && x.props.latex === latex);
    if (!s) throw new Error(`batch column: no region ${latex}`);
    return s.id;
  };
  const cols = (list) => list.map(([cid, label, latex]) => ({ id: cid, regionId: regionOf(latex), label }));
  return { title: spec.title, inputs: cols(spec.inputs), outputs: cols(spec.outputs), rows: spec.rows };
};
const finish = ({ id: docId, title, reference, file, batch }) => {
  newPage();
  textAt(page, row, 'ANNEX', { heading: 1, annex: { kind: 'start' } });
  row += 1.0;
  for (const a of ANNEX) {
    need(3);
    if (row > 2.2) row += 0.5;
    textAt(page, row, a.title, { heading: 2, annex: { kind: 'heading', id: a.aid } });
    row += 1.0;
    a.fn();
  }
  const metrics = METRICS;
  const measured = out.map(s => {
    const key = s.type === 'math' ? s.props.latex : s.type === 'text' ? s.props.html : null;
    const size = key === null ? null : metrics[key];
    return size ? { ...s, props: { ...s.props, h: size[1], ...(s.type === 'math' ? { w: size[0], baseline: size[2] } : {}) } } : s;
  });
  const layout = optimizeTemplateLayout(measured);
  if (layout.issues.length) throw new Error(layout.issues.join('\n'));
  const pages = layout.pages;
  const date = '2026-01-01T00:00:00.000Z';
  const doc = {
    format: 'calccanvas', id: docId, version: 3, title,
    metadata: { project: 'Project name', calculationReference: reference, preparedBy: 'Mark', checkedBy: '', revision: 'A' },
    settings: { unitSystem: 'SI', precision: 2, canvasMode: 'page', pageOrientation: 'portrait', showHeaderFooter: true, textFont, baselineSnap: 'minor', snapToGrid: false, optimizePrintLayout: true, pages },
    inputResult: batchConfig(batch), shapes: layout.shapes, createdAt: date, updatedAt: date,
  };
  fs.writeFileSync(path.join(process.env.TEMPLATE_OUT ?? TPL, file), JSON.stringify(doc, null, 2));
  console.log('ok', out.length, 'pages', pages);
};

return { st, out, id, ln, need, gap, q, newPage, LINK, KEEP, textAt, mathAt, H, T, P, ROW, S, GRAPH, GRAPH2, colTable, cv, M,
  mm, mm2, kN, kN1, kNm, MPa, deg, fr, fo, FU, XM, XM_WIDE, finish };
}
