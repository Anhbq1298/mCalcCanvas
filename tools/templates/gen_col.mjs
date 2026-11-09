// RC circular column (EN 1992-1-1, shear EN 1992-1-1:2023): N–M at the moment direction (strips), UR checks, shear. Writes templates/RC_Circular_Column_Check.mCalcCanvas.
// Flow layout: every parameter has a description line above it; items flow down and break to new pages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.resolve(HERE, '../../templates');

const R = String.raw;
const A4H = 1123, GAP = 48, LAST = 24;
const ln = (page, n) => page * (A4H + GAP) + 80 + Math.round((40 * n - 40) / 20) * 20;
const PG = A4H + GAP;
/** Top of a region whose first baseline (b px below its top) sits on the first grid line at or below y + b. */
const alignTop = (y, b) => { const o = Math.floor(y / PG) * PG + 60; return o + Math.ceil((y + b - o) / 20 - 1e-9) * 20 - b; };
let floorY = 0;
const place = (y, b, h, math, setFloor = true) => { const t = alignTop(math ? Math.max(y, floorY - 6) : y, b); if (setFloor) floorY = Math.max(floorY, t + (math ? h : 18)); return t; };
const syncRow = () => { const r = (floorY + 2 - (page * PG + 80)) / 40 + 1; if (r > row) row = Math.ceil(r * 2 - 1e-9) / 2; };
let uid = 0;
const id = () => `s_col_${(uid++).toString(36)}`;
const STYLES = { 1: { fontSize: 20, color: '#1e3a5f' }, 2: { fontSize: 16, color: '#0f172a' }, 3: { fontSize: 14, color: '#334155' } };
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const out = [];

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
  out.push({ id: id(), type: 'text', x: 76, y: alignTop(ln(page, row), 15), props: { w: 630, h: 24, html: '', fontFamily: 'Inter', fontSize: 14, color: '#2563eb', align: 'left', annex: { kind: 'link', target: aid } } });
  row += 1;
  ANNEX.push({ aid, title, fn });
};
const textAt = (pg, r, t, o = {}) => {
  const st = STYLES[o.heading] ?? { fontSize: 14, color: '#475569' };
  out.push({
    id: id(), type: 'text', x: o.x ?? 76, y: place(ln(pg, r) + (o.dy ?? 0), Math.round((o.size ?? st.fontSize) * 1.09), 0, false, o.floor !== false),
    props: { w: o.w ?? 630, h: Math.ceil((o.size ?? st.fontSize) * 1.45), html: o.italic ? `<i>${esc(t)}</i>` : esc(t), fontFamily: 'Inter',
      fontSize: o.size ?? st.fontSize, color: o.color ?? st.color, align: 'left', ...(o.heading ? { heading: o.heading } : {}), ...(o.annex ? { annex: o.annex } : {}) },
  });
};
const baseOf = (latex) => SIZES[latex]?.[2] ?? 20;
const mathAt = (pg, r, x, latex, extra = {}, dyPx = 0) =>
  out.push({ id: id(), type: 'math', x, y: place(ln(pg, r) + dyPx, baseOf(latex), SIZES[latex]?.[1] ?? 32, true),
    props: { w: 60, h: 32, latex, displayMode: 'auto', displayUnit: '', precision: -1, autoSize: true, fontSize: 16, color: '#0f172a', ...extra } });

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
const XM = 400;
const XM_WIDE = 96;
const SIZES = fs.existsSync(path.join(HERE, 'sizes_col.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'sizes_col.json'), 'utf8')) : {};
/** Parameter: description to the left and the region on the same row; long formulas get the description above. */
const P = (desc, latex, o = {}) => {
  const size = SIZES[latex];
  const hpx = size ? size[1] : null;
  const h = o.h ?? (hpx ? Math.max(1, Math.ceil((hpx + 4) / 40)) : hOf(latex, o));
  const wide = o.wide ?? (size ? size[0] : estW(latex, o)) > 714 - XM;
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
    const lines = desc.length * 6.2 > XM - 96 ? 2 : 1;
    const top0 = ln(page, row);
    const mTop = alignTop(top0, baseOf(latex));
    const hh = q(Math.max(mTop - top0 + (hpx ?? h * 40 - 8) + 6, lines === 2 ? 40 : 30) / 40);
    need(hh);
    const th = lines === 2 ? 34 : 18;
    const dy = hpx ? Math.max(0, Math.round(mTop - top0 + hpx / 2 - th / 2 - (hpx > 40 ? 4 : 0))) : 4;
    textAt(page, row, desc, { size: 12, color: '#475569', w: XM - 90, x: 76, dy, floor: false });
    mathAt(page, row, XM, latex, o.math ?? {});
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
const M = (...xs) => ({ math: Object.assign({}, ...xs) });
const SET2 = R`\delta_{2}`;
const COT = R`\mathrm{cot}_{\theta}`;

// ================= 1. Basis =================
H(1, 'RC CIRCULAR COLUMN CHECK – FLEXURE AND SHEAR (EC2)');
H(2, '1. DESIGN BASIS');
T('EN 1992-1-1. Strips and bars, strain pivots A/B/C, P–M curve in the MEd direction.');
T('Flexure: ray from 0 through (MEd, NEd) to the P–M curve (UR_M). fcd and shear (spirals):');
T('EN 1992-1-1:2023 (5.3), §8.2.3.');
T('N positive in compression. Annex A.n is calculated at its link ▸.');

// ================= 2. Inputs =================
H(2, '2. INPUTS');
H(3, '2.1 Materials');
P('Characteristic concrete cylinder strength', R`f_{ck}\coloneq35\,\mathrm{MPa}`);
P('Partial factor for concrete', R`\gamma_{C}\coloneq1.5`);
P('Sustained-load factor (5.3): 0.85, or 1.0 if loaded after 90 days', R`k_{tc}\coloneq0.85`);
P('Yield strength of longitudinal bars', R`f_{yk}\coloneq500\,\mathrm{MPa}`);
P('Yield strength of spirals', R`f_{ywk}\coloneq500\,\mathrm{MPa}`);
P('Ductility class of the spirals: 1 = class A, 0 = class B or C', R`\delta_{A}\coloneq0`);
P('Partial factor for reinforcement', R`\gamma_{S}\coloneq1.15`);
P('Elastic modulus of reinforcement', R`E_{s}\coloneq200\,\mathrm{GPa}`);
P('Ultimate concrete strain (Table 3.1)', R`\varepsilon_{cu2}\coloneq0.0035`);
P('Concrete strain at peak stress', R`\varepsilon_{c2}\coloneq0.002`);
P('Design limit of steel strain, 0.9·εuk', R`\varepsilon_{ud}\coloneq0.045`);
H(3, '2.2 Section and reinforcement sets');
P('Column diameter', R`D\coloneq1200\,\mathrm{mm}`, M(mm));
P('Nominal cover to the set-1 spiral', R`c_{nom}\coloneq75\,\mathrm{mm}`, M(mm));
P('Reinforcement sets: 1 = outer, 2 = outer + inner', R`n_{set}\coloneq1`);
P('Set 1 (outer): longitudinal bar diameter', R`\phi_{l1}\coloneq32\,\mathrm{mm}`, M(mm));
P('Set 1: number of bars (evenly spaced)', R`n_{l1}\coloneq22`);
P('Set 1: spiral bar diameter', R`\phi_{w1}\coloneq20\,\mathrm{mm}`, M(mm));
P('Set 1: spiral pitch', R`s_{1}\coloneq85\,\mathrm{mm}`, M(mm));
P('Set 2 (inner): longitudinal bar diameter', R`\phi_{l2}\coloneq25\,\mathrm{mm}`, M(mm));
P('Set 2: number of longitudinal bars', R`n_{l2}\coloneq16`);
P('Set 2: spiral bar diameter', R`\phi_{w2}\coloneq16\,\mathrm{mm}`, M(mm));
P('Set 2: spiral pitch', R`s_{2}\coloneq150\,\mathrm{mm}`, M(mm));
H(3, '2.3 Integration');
P('Number of concrete strips across D', R`n_{c}\coloneq100`);
H(3, '2.4 Design actions (ULS)');
P('Axial force, compression positive', R`N_{Ed}\coloneq8000\,\mathrm{kN}`, M(kN));
P('Bending moment about x', R`M_{Ed.x}\coloneq3000\,\mathrm{kN}\cdot\mathrm{m}`, M(kNm));
P('Bending moment about y', R`M_{Ed.y}\coloneq2000\,\mathrm{kN}\cdot\mathrm{m}`, M(kNm));
P('Shear force', R`V_{Ed}\coloneq2500\,\mathrm{kN}`, M(kN));

// ================= 3. Design values =================
H(2, '3. DESIGN VALUES');
P('Effective strength factor (5.4), fck,ref = 40 MPa', R`\eta_{cc}\coloneq\min\left(\left(\frac{40\,\mathrm{MPa}}{f_{ck}}\right)^{\frac{1}{3}},1\right)`, M({ precision: 3 }, fr));
P('Design compressive strength (5.3)', R`f_{cd}\coloneq\frac{\eta_{cc}k_{tc}f_{ck}}{\gamma_{C}}`, M(MPa, { precision: 2 }, fr));
P('Design yield strength of longitudinal bars', R`f_{yd}\coloneq\frac{f_{yk}}{\gamma_{S}}`, M(MPa, fr));
P('Design yield strength of spirals', R`f_{ywd}\coloneq\frac{f_{ywk}}{\gamma_{S}}`, M(MPa, fr));
P('Design yield strain of longitudinal bars', R`\varepsilon_{yd}\coloneq\frac{f_{yd}}{E_{s}}`, M({ precision: 5 }, fr));
P('Set-2 switch: 1 = included, 0 = ignored', R`\delta_{2}\coloneq\begin{array}{||l}\mathrm{if}\ n_{set}\ge2\\\quad\left\Vert\displaystyle 1\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 0\right.\end{array}`);

// ================= 4. Geometry =================
H(2, '4. SECTION GEOMETRY');
H(3, '4.1 Rings, bars and spirals');
P('Section radius R (centroid to the outer face)', R`R\coloneq\frac{D}{2}`, M(mm, fr));
P('Cover to set-2 spiral (inside set-1 bars)', R`c_{2}\coloneq c_{nom}+\phi_{w1}+\phi_{l1}`, M(mm, fr));
P('Radius to set-1 bar centres', R`r_{1}\coloneq R-c_{nom}-\phi_{w1}-\frac{\phi_{l1}}{2}`, M(mm, fr));
P('Radius to set-2 bar centres', R`r_{2}\coloneq R-c_{2}-\phi_{w2}-\frac{\phi_{l2}}{2}`, M(mm, fr));
P('Set 2 must sit inside set 1', R`r_{2}\le r_{1}-\frac{\phi_{l1}+\phi_{l2}}{2}`, M(mm));
P('Area of one set-1 longitudinal bar', R`A_{b1}\coloneq0.25\pi\phi_{l1}^2`, M(mm2));
P('Area of one set-2 longitudinal bar', R`A_{b2}\coloneq0.25\pi\phi_{l2}^2`, M(mm2));
P('Gross section area', R`A_{g}\coloneq\pi R^2`, M(mm2));
P('Total longitudinal steel area', R`A_{st}\coloneq n_{l1}A_{b1}+${SET2}n_{l2}A_{b2}`, M(mm2, fr));
P('Spiral centreline diameter, set 1', R`D_{sp.1}\coloneq D-2c_{nom}-\phi_{w1}`, M(mm, fr));
P('Spiral centreline diameter, set 2', R`D_{sp.2}\coloneq D-2c_{2}-\phi_{w2}`, M(mm, fr));
P('Area of one set-1 spiral bar', R`A_{w1}\coloneq0.25\pi\phi_{w1}^2`, M(mm2));
P('Area of one set-2 spiral bar', R`A_{w2}\coloneq0.25\pi\phi_{w2}^2`, M(mm2));
P('Clear spacing of set-1 bars on the ring', R`s_{cl.1}\coloneq\frac{2\pi r_{1}}{n_{l1}}-\phi_{l1}`, M(mm, fr));
P('Minimum clear spacing, EN 1536 bored piles', R`s_{cl.1}\ge100\,\mathrm{mm}`, M(mm));

H(3, '4.2 Bars and section');

const circle = (rad) => [R`${rad}\cos\left(\varphi_{t}\right)`, R`${rad}\sin\left(\varphi_{t}\right)`];
const S = (sid, label, [x, y], style, color, width, extra = {}) => ({ id: sid, label, x, y, style, r: '', color, width, show: '', ...extra });
const GRAPH = (size, props) => {
  const rows = (size + 16) / 40;
  need(rows);
  out.push({
    id: id(), type: 'graph', x: Math.round((80 + 714) / 2 - size / 2), y: ln(page, row) - 8,
    props: { w: size, h: size, xLabel: '', yLabel: '', grid: false, axesAtOrigin: true, font: 'Roboto', background: '#fff9c4', ...props },
  });
  row += q(rows);
};
const colTable = (n) => (n * 14.6 + 30) / 40;
const cv = (unit, prec) => ({ ...(unit ? { displayUnit: unit } : {}), precision: prec, vectorLayout: 'column', vectorExpanded: true, fontSize: 12 });

LINK('ax_bars', 'Bar coordinates', () => {
P('Bar index, set 1 (edit seq to renumber)', R`i_{1}\coloneq\mathrm{seq}\left(0,n_{l1}-1\right)`, M(fo));
P('Bar index, set 2', R`i_{2}\coloneq\mathrm{seq}\left(0,n_{l2}-1\right)`, M(fo));
P('Angles for drawing circles', R`\varphi_{t}\coloneq\mathrm{seq}\left(0,2\pi,\frac{\pi}{36}\right)`, M(fo));
const cosT = (r, i, n) => R`${r}\cos\left(\frac{2\pi ${i}}{${n}}\right)`;
const sinT = (r, i, n) => R`${r}\sin\left(\frac{2\pi ${i}}{${n}}\right)`;
P('Set-1 bar coordinates, x', R`x_{l1}\coloneq ` + cosT('r_{1}', 'i_{1}', 'n_{l1}'), M(fo));
P('Set-1 bar coordinates, y', R`y_{l1}\coloneq ` + sinT('r_{1}', 'i_{1}', 'n_{l1}'), M(fo));
P('Set-2 bar coordinates, x', R`x_{l2}\coloneq ` + cosT('r_{2}', 'i_{2}', 'n_{l2}'), M(fo));
P('Set-2 bar coordinates, y', R`y_{l2}\coloneq ` + sinT('r_{2}', 'i_{2}', 'n_{l2}'), M(fo));
// bar tables
need(1 + colTable(22));
textAt(page, row, 'Set 1 (outer)', { x: 96, w: 280, size: 13, color: '#dc2626' });
textAt(page, row, 'Set 2 (inner, used when nset = 2)', { x: 416, w: 300, size: 13, color: '#ea580c' });
row += 0.5;
ROW([[96, 'i_{1}=', cv('', 0)], [176, 'x_{l1}=', cv('mm', 0)], [296, 'y_{l1}=', cv('mm', 0)],
     [416, 'i_{2}=', cv('', 0)], [496, 'x_{l2}=', cv('mm', 0)], [596, 'y_{l2}=', cv('mm', 0)]], colTable(22));
});
GRAPH(300, {
  title: 'Section', xUnit: 'mm', yUnit: 'mm', equalAxes: true,
  series: [
    S('pile', '', circle('R'), 'line', '#1e3a5f', 2),
    S('sp1', '', circle(R`0.5D_{sp.1}`), 'line', '#2563eb', 1),
    S('bar1', 'Set 1', ['x_{l1}', 'y_{l1}'], 'circle', '#dc2626', 1, { r: R`0.5\phi_{l1}` }),
    S('sp2', '', circle(R`0.5D_{sp.2}`), 'line', '#047857', 1, { show: R`n_{set}\ge2` }),
    S('bar2', 'Set 2', ['x_{l2}', 'y_{l2}'], 'circle', '#ea580c', 1, { r: R`0.5\phi_{l2}`, show: R`n_{set}\ge2` }),
  ],
});

H(3, '4.3 Concrete strips');
LINK('ax_strips', 'Concrete strips', () => {
T('The concrete is cut into nc thin strips parallel to the neutral axis. Each strip carries the');
T('stress at its centre strain; summing strip forces (× lever arm) gives the concrete N and M.');
P('Strip index', R`j\coloneq\mathrm{seq}\left(0,n_{c}-1\right)`, M(fo));
P('Strip width', R`\Delta\coloneq\frac{D}{n_{c}}`, M(mm, fr));
P('Strip centre coordinate, from the centroid', R`x_{c}\coloneq R-\left(j+0.5\right)\Delta`, M(fo));
P('Strip area (chord length × width)', R`A_{c}\coloneq2\sqrt{R^2-x_{c}^2}\cdot\Delta`, M(fo));
P('Strip area / gross area (check of nc)', R`\frac{\mathrm{sum}\left(A_{c}\right)}{A_{g}}=`, M({ precision: 4 }));
});

// ================= 5. Flexure: N–M curve =================
H(2, '5. INTERACTION CURVE (N–M AT THE DEMAND DIRECTION)');
H(3, '5.1 Bending direction');
P('Resultant design moment', R`M_{Ed}\coloneq\sqrt{M_{Ed.x}^2+M_{Ed.y}^2}`, M(kNm, fr));
P('Direction of MEd, signs kept (0 … 360°)', R`\theta_{M}\coloneq\mathrm{angle}\left(M_{Ed.x},M_{Ed.y}\right)`, M(deg, fr));
LINK('ax_resultants', 'Strain plane, stress laws and section resultants', () => {
P('Set-1 bar coordinate p along θM (from centroid)', R`p_{l1}\coloneq r_{1}\cos\left(\frac{2\pi i_{1}}{n_{l1}}\mathrm{rad}-\theta_{M}\right)`, M(fo));
P('Set-2 bar coordinate p along θM', R`p_{l2}\coloneq r_{2}\cos\left(\frac{2\pi i_{2}}{n_{l2}}\mathrm{rad}-\theta_{M}\right)`, M(fo));
P('Depth dθ: compression edge to extreme bar', R`d_{\theta}\coloneq\begin{array}{||l}\mathrm{if}\ n_{set}\ge2\\\quad\left\Vert\displaystyle R-\min\left(p_{l1},p_{l2}\right)\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle R-\min\left(p_{l1}\right)\right.\end{array}`, M(mm, fr));
P('Depth cA at pivot A/B boundary', R`c_{A}\coloneq\frac{\varepsilon_{cu2}d_{\theta}}{\varepsilon_{cu2}+\varepsilon_{ud}}`, M(mm, fr));
P('Depth yC of pivot C (εc2 in full compression)', R`y_{C}\coloneq\left(1-\frac{\varepsilon_{c2}}{\varepsilon_{cu2}}\right)D`, M(mm, fr));
H(3, 'Strain plane (+ compression)');
T('c = neutral-axis depth below the compression edge; p = fibre coordinate from the centroid along');
T('θM, so R − p = fibre depth. The plane pivots about A (extreme bar at −εud, c < cA), B (edge at');
T('εcu2, c ≤ D) or C (εc2 at depth yC, c > D), EC2 Fig. 6.1.');
P('Strain at fibre p for depth c', R`\varepsilon\left(c,p\right)\coloneq\begin{array}{||l}\mathrm{if}\ c<c_{A}\\\quad\left\Vert\displaystyle \varepsilon_{ud}\frac{c-R+p}{d_{\theta}-c}\right.\\\mathrm{else}\ \mathrm{if}\ c\le D\\\quad\left\Vert\displaystyle \varepsilon_{cu2}\frac{c-R+p}{c}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle \varepsilon_{c2}\frac{c-R+p}{c-y_{C}}\right.\end{array}`, M(fo));
H(3, 'Stress laws');
P('Concrete stress, parabola-rectangle (EC2 3.17), no tension', R`\sigma_{c}\left(\varepsilon\right)\coloneq\begin{array}{||l}\mathrm{if}\ \varepsilon\le0\\\quad\left\Vert\displaystyle 0\,\mathrm{MPa}\right.\\\mathrm{else}\ \mathrm{if}\ \varepsilon<\varepsilon_{c2}\\\quad\left\Vert\displaystyle f_{cd}\left(1-\left(1-\frac{\varepsilon}{\varepsilon_{c2}}\right)^2\right)\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle f_{cd}\right.\end{array}`, M(fo));
P('Steel stress, elastic-plastic within ±fyd', R`\sigma_{s}\left(\varepsilon\right)\coloneq\begin{array}{||l}\mathrm{if}\ E_{s}\varepsilon<-f_{yd}\\\quad\left\Vert\displaystyle -f_{yd}\right.\\\mathrm{else}\ \mathrm{if}\ E_{s}\varepsilon>f_{yd}\\\quad\left\Vert\displaystyle f_{yd}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle E_{s}\varepsilon\right.\end{array}`, M(fo));
P('Net bar stress (concrete it displaces subtracted)', R`\sigma_{b}\left(\varepsilon\right)\coloneq\sigma_{s}\left(\varepsilon\right)-\sigma_{c}\left(\varepsilon\right)`, M(fo));
H(3, 'Section resultants');
T('Concrete strips (xc, Ac) plus bars of set 1 and, when δ2 = 1, set 2:');
P('Axial resistance for depth c', R`N_{R}\left(c\right)\coloneq\mathrm{sum}\left(\sigma_{c}\left(\varepsilon\left(c,x_{c}\right)\right)A_{c}\right)+A_{b1}\mathrm{sum}\left(\sigma_{b}\left(\varepsilon\left(c,p_{l1}\right)\right)\right)+${SET2}A_{b2}\mathrm{sum}\left(\sigma_{b}\left(\varepsilon\left(c,p_{l2}\right)\right)\right)`, M(fo, { fontSize: 16 }));
P('Moment resistance for depth c (about the centroid)', R`M_{R}\left(c\right)\coloneq\mathrm{sum}\left(\sigma_{c}\left(\varepsilon\left(c,x_{c}\right)\right)A_{c}x_{c}\right)+A_{b1}\mathrm{sum}\left(\sigma_{b}\left(\varepsilon\left(c,p_{l1}\right)\right)p_{l1}\right)+${SET2}A_{b2}\mathrm{sum}\left(\sigma_{b}\left(\varepsilon\left(c,p_{l2}\right)\right)p_{l2}\right)`, M(fo, { fontSize: 16 }));
});

H(3, '5.2 Control points of the curve');
T('The curve is evaluated at 55 neutral-axis depths from pure tension to uniform compression.');
LINK('ax_curve', 'P–M diagram data (control points)', () => {
P('Neutral-axis depths: −0.1D (all bars yielded in tension) … 100D (uniform εc2)', R`c_{v}\coloneq\mathrm{stack}\left(\mathrm{seq}\left(-0.1,1,0.025\right)D,\frac{D}{\mathrm{seq}\left(0.9,0.1,-0.1\right)},100D\right)`, M(fo));
P('Number of control points', R`\mathrm{len}\left(c_{v}\right)=`, M({ precision: 0 }));
P('Strain at the compression edge for each point', R`\varepsilon_{top}\coloneq\mathrm{map}\left(\varepsilon,c_{v},R\right)`, M(fo));
P('Strain at the extreme tension bar for each point', R`\varepsilon_{bar}\coloneq\mathrm{map}\left(\varepsilon,c_{v},R-d_{\theta}\right)`, M(fo));
P('Axial resistance at each point', R`N_{v}\coloneq\mathrm{map}\left(N_{R},c_{v}\right)`, M(fo));
P('Moment resistance at each point', R`M_{v}\coloneq\mathrm{map}\left(M_{R},c_{v}\right)`, M(fo));
const NP = 55;
need(1 + colTable(NP));
textAt(page, row, 'Control points at θM (N compression +)', { x: 96, w: 400, size: 13, color: '#1e3a5f' });
row += 0.5;
ROW([[96, 'c_{v}=', cv('mm', 0)], [216, R`\varepsilon_{top}=`, cv('', 4)], [340, R`\varepsilon_{bar}=`, cv('', 4)],
     [476, 'N_{v}=', cv('kN', 0)], [596, 'M_{v}=', cv('kN m', 0)]], colTable(NP));
P('Max. axial resistance (uniform εc2)', R`N_{Rd.max}\coloneq\max\left(N_{v}\right)`, M(kN1, fr));
P('Maximum moment resistance on the curve', R`M_{Rd.max}\coloneq\max\left(M_{v}\right)`, M(kNm, fr));
P('Normalised N of the control points', R`n_{v}\coloneq\frac{N_{v}}{N_{Rd.max}}`, M(fo));
P('Normalised M of the control points', R`m_{v}\coloneq\frac{M_{v}}{M_{Rd.max}}`, M(fo));
P('Distance of each control point from the origin', R`\rho_{v}\coloneq\sqrt{n_{v}^2+m_{v}^2}`, M(fo));
P('Direction of each point (sine of angle)', R`s_{v}\coloneq\frac{n_{v}}{\rho_{v}}`, M(fo));
});
P('Max. axial resistance (uniform εc2)', R`N_{Rd.max}=`, M(kN1));
P('Maximum moment resistance on the curve', R`M_{Rd.max}=`, M(kNm));

// ================= 6. Flexural check =================
H(2, '6. FLEXURAL CHECK');
T('Ray from the origin through the design point (MEd, NEd) to the P–M curve, as MBColumn.');
H(3, '6.1 Radial ratio');
P('Normalised design axial force', R`n_{Ed}\coloneq\frac{N_{Ed}}{N_{Rd.max}}`, M({ precision: 4 }, fr));
P('Normalised design moment', R`m_{Ed}\coloneq\frac{M_{Ed}}{M_{Rd.max}}`, M({ precision: 4 }, fr));
P('Distance of the design point from the origin', R`\rho_{Ed}\coloneq\sqrt{n_{Ed}^2+m_{Ed}^2}`, M({ precision: 4 }, fr));
P('Curve distance along the design ray', R`\rho_{Rd}\coloneq\mathrm{linterp}\left(s_{v},\rho_{v},\frac{n_{Ed}}{\rho_{Ed}}\right)`, M({ precision: 4 }, fr));
P('Radial ratio (scale-independent)', R`\mathrm{UR}_{M}\coloneq\frac{\rho_{Ed}}{\rho_{Rd}}`, M({ precision: 3 }, fr));
P('Check', R`\mathrm{UR}_{M}\le1`, M({ precision: 3 }));

need(1 + 436 / 40);
H(3, '6.2 P–M diagram at θM');
GRAPH(420, {
  title: 'P–M at θM', xUnit: 'kN m', yUnit: 'kN', equalAxes: false,
  series: [
    S('curve', 'NRd–MRd', ['M_{v}', 'N_{v}'], 'line', '#1e3a5f', 2),
    S('mirror', '', ['-M_{v}', 'N_{v}'], 'line', '#1e3a5f', 2),
    S('pts', 'Control points', ['M_{v}', 'N_{v}'], 'marker', '#64748b', 1),
    S('ray', '', [R`\mathrm{stack}\left(0,\max\left(1,\frac{1}{\mathrm{UR}_{M}}\right)\right)M_{Ed}`, R`\mathrm{stack}\left(0,\max\left(1,\frac{1}{\mathrm{UR}_{M}}\right)\right)N_{Ed}`], 'line', '#94a3b8', 1),
    S('cap', 'Capacity on the ray', [R`\frac{M_{Ed}}{\mathrm{UR}_{M}}`, R`\frac{N_{Ed}}{\mathrm{UR}_{M}}`], 'marker', '#047857', 2),
    S('ed', 'Design (MEd, NEd)', ['M_{Ed}', 'N_{Ed}'], 'marker', '#dc2626', 2),
  ],
});

// ================= 7. Shear =================
H(2, '7. SHEAR CHECK (EN 1992-1-1:2023 §8.2.3, SPIRALS)');
H(3, '7.1 Chords, web width and stresses');
T('Truss in stresses: τEd = VEd/(bw·z) (8.18); spirals τRd,sy = ρw·fywd·cotθ (8.42); strut');
T('σcd = τEd·(cotθ + tanθ) ≤ ν·fcd (8.44), ν = 0.5 (8.2.3(6)). bw: least width between the');
T('compression chord (centroid of the concrete compression, §8.1) and the tension chord (d).');
T('Each spiral crosses the shear plane twice: Asw = 2·Aw.');
gap(0.35);
P('Effective depth: D/2 + half-ring centroid 2r/π, weighted by bar area', R`d\coloneq\frac{D}{2}+\frac{2}{\pi}\cdot\frac{n_{l1}A_{b1}r_{1}+${SET2}n_{l2}A_{b2}r_{2}}{n_{l1}A_{b1}+${SET2}n_{l2}A_{b2}}`, M(mm, fr));
P('Lever arm, 8.2.1(3)', R`z\coloneq0.9d`, M(mm, fr));
P('Neutral-axis depth at the bending resistance under NEd (§8.1)', R`x\coloneq\mathrm{linterp}\left(N_{v},c_{v},N_{Ed}\right)`, M(mm, fr));
P('Depth of the compression chord centroid (concrete compression at x)', R`y_{cc}\coloneq\begin{array}{||l}\mathrm{if}\ x\le0\,\mathrm{mm}\\\quad\left\Vert\displaystyle 0\,\mathrm{mm}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle R-\frac{\mathrm{sum}\left(\sigma_{c}\left(\varepsilon\left(x,x_{c}\right)\right)A_{c}x_{c}\right)}{\mathrm{sum}\left(\sigma_{c}\left(\varepsilon\left(x,x_{c}\right)\right)A_{c}\right)}\right.\end{array}`, M(mm, fr));
P('Web width: least chord width between the chords (only the tension chord if x ≤ 0)', R`b_{w}\coloneq\begin{array}{||l}\mathrm{if}\ x\le0\,\mathrm{mm}\\\quad\left\Vert\displaystyle 2\sqrt{R^2-\left(d-R\right)^2}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle \min\left(2\sqrt{R^2-\left(R-y_{cc}\right)^2},2\sqrt{R^2-\left(d-R\right)^2}\right)\right.\end{array}`, M(mm, fr));
P('Average shear stress (8.18)', R`\tau_{Ed}\coloneq\frac{V_{Ed}}{b_{w}z}`, M(MPa, { precision: 2 }, fr));
P('Strength reduction for cracked concrete, 8.2.3(6)', R`\nu\coloneq0.5`);
H(3, '7.2 Strut angle');
T('1 ≤ cotθ ≤ cot θmin (8.41): 2.5; 3.0 if σcp ≥ 3 MPa and x < 0.25d (linear between); 2.5 if');
T('x ≥ 0.25d; 2.5 − 0.1·|NEd|/VEd ≥ 1 in tension; × kA = 0.8 for class A spirals. cotθ < 1');
T('(8.2.3(11)) is not used: σcd is least at θ = 45° and τRd,sy falls with cotθ.');
T('Design cotθ: the largest value ≤ cot θmin that keeps σcd ≤ ν·fcd.');
gap(0.35);
P('Factor on cot θmin: 0.8 for class A spirals, 8.2.3(4)', R`k_{A}\coloneq1-0.2\delta_{A}`, M({ precision: 2 }, fr));
P('Average axial stress, compression positive', R`\sigma_{cp}\coloneq\frac{N_{Ed}}{A_{g}}`, M(MPa, { precision: 2 }, fr));
P('Flattest strut allowed (8.41)', R`\mathrm{cot}_{\theta min}\coloneq\begin{array}{||l}\mathrm{if}\ N_{Ed}<0\,\mathrm{kN}\\\quad\left\Vert\displaystyle \max\left(1,k_{A}\left(2.5-0.1\cdot\frac{\left|N_{Ed}\right|}{V_{Ed}}\right)\right)\right.\\\mathrm{else}\ \mathrm{if}\ x\ge0.25d\\\quad\left\Vert\displaystyle 2.5k_{A}\right.\\\mathrm{else}\ \mathrm{if}\ \sigma_{cp}\ge3\,\mathrm{MPa}\\\quad\left\Vert\displaystyle 3.0k_{A}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle \left(2.5+0.5\cdot\frac{\sigma_{cp}}{3\,\mathrm{MPa}}\right)k_{A}\right.\end{array}`, M({ precision: 2 }, fr));
P('Design cotθ: cot θmin if the strut holds, else the root of τEd(cotθ + tanθ) = ν·fcd; 1: strut fails', COT + R`\coloneq\begin{array}{||l}\mathrm{if}\ \tau_{Ed}\left(\mathrm{cot}_{\theta min}+\frac{1}{\mathrm{cot}_{\theta min}}\right)\le\nu f_{cd}\\\quad\left\Vert\displaystyle \mathrm{cot}_{\theta min}\right.\\\mathrm{else}\ \mathrm{if}\ 2\tau_{Ed}\le\nu f_{cd}\\\quad\left\Vert\displaystyle \frac{\nu f_{cd}}{2\tau_{Ed}}+\sqrt{\left(\frac{\nu f_{cd}}{2\tau_{Ed}}\right)^2-1}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 1\right.\end{array}`, M({ precision: 2 }, fr));
H(3, '7.3 Resistance');
P('Shear reinforcement ratio (8.43), set 2 when δ2 = 1', R`\rho_{w}\coloneq\frac{2}{b_{w}}\left(\frac{A_{w1}}{s_{1}}+${SET2}\frac{A_{w2}}{s_{2}}\right)`, M({ precision: 5 }, fr));
P('Spiral resistance (8.42)', R`\tau_{Rd.sy}\coloneq\rho_{w}f_{ywd}${COT}`, M(MPa, { precision: 2 }, fr));
P('Strut stress (8.44)', R`\sigma_{cd}\coloneq\tau_{Ed}\left(${COT}+\frac{1}{${COT}}\right)`, M(MPa, { precision: 2 }, fr));
P('Shear utilisation ratio', R`\mathrm{UR}_{V}\coloneq\max\left(\frac{\tau_{Ed}}{\tau_{Rd.sy}},\frac{\sigma_{cd}}{\nu f_{cd}}\right)`, M({ precision: 3 }, fr));
P('Check', R`\mathrm{UR}_{V}\le1`, M({ precision: 3 }));

// ================= 8. Summary =================
H(2, '8. SUMMARY');
P('Flexure utilisation ratio', R`\mathrm{UR}_{M}=`, M({ precision: 3 }));
P('Shear utilisation ratio', R`\mathrm{UR}_{V}=`, M({ precision: 3 }));

// ================= Annex =================
// Compact: the ANNEX title and the blocks flow on from one page; a block starts a new page only when needed.
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

const pages = page + 1;
const now = new Date().toISOString();
const doc = {
  format: 'calccanvas', id: 'doc_rc_circular_column', version: 2, title: 'RC Circular Column Check',
  metadata: { project: 'Project name', calculationReference: 'CALC-COL-01', preparedBy: 'Mark', checkedBy: '', revision: 'A' },
  settings: { unitSystem: 'SI', precision: 2, canvasMode: 'page', pageOrientation: 'portrait', showHeaderFooter: true, textFont: 'Inter', baselineSnap: 'minor', pages },
  shapes: out, createdAt: now, updatedAt: now,
};
fs.writeFileSync(path.join(TPL, 'RC_Circular_Column_Check.mCalcCanvas'), JSON.stringify(doc, null, 2));
console.log('ok', out.length, 'pages', pages);
