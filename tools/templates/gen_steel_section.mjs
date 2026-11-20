// Steel cross-section design (EN 1993-1-1:2005 + A1:2014, §5.5 and §6.2 only, no member buckling) for
// mSteelBeamColumn. One generator, three worksheets: I/H (library or custom welded), RHS/SHS and CHS.
// Every result is a worksheet equation; the page runs the sheet once per load combination.
//   templates/Steel_Section_I_EC3.mCCV, Steel_Section_RHS_EC3.mCCV, Steel_Section_CHS_EC3.mCCV
// Hollow-section properties: EN 10210-2 / EN 10219-2 geometry with rounded corners (Annex B style), checked
// against the Tata Steel Blue Book (SCI P363) in src/tests/unit/steelSectionTemplates.test.ts.
import { createLayout, R } from './layout.mjs';

const IF = (...branches) => {
  const rows = branches.map(([c, v], i) => (c === null ? R`\mathrm{else}` : `${i ? R`\mathrm{else}\ ` : ''}\\mathrm{if}\\ ${c}`) + R`\\\quad\left\Vert\displaystyle ${v}\right.`);
  return R`\begin{array}{||l}` + rows.join(R`\\`) + R`\end{array}`;
};
const aN = R`\left|N_{Ed}\right|`, aMy = R`\left|M_{y.Ed}\right|`, aMz = R`\left|M_{z.Ed}\right|`;
const kNm0 = R`0\,\mathrm{kN}\cdot\mathrm{m}`;
const p3 = { precision: 3 };
const clamp01 = (x) => R`\min\left(1,\max\left(0,${x}\right)\right)`;
/** Table 5.2 internal part in bending and compression: Class 1, 2, 3 limits of c/(tε) from α and ψ. */
const LIMITS = (P, M, s) => {
  P('Class 1 limit of c/(t·ε)', R`\beta_{${s}1}\coloneq${IF([R`\alpha_{${s}}>0.5`, R`\frac{396}{13\alpha_{${s}}-1}`], [null, R`\frac{36}{\max\left(\alpha_{${s}},0.01\right)}`])}`, M({ precision: 1 }));
  P('Class 2 limit', R`\beta_{${s}2}\coloneq${IF([R`\alpha_{${s}}>0.5`, R`\frac{456}{13\alpha_{${s}}-1}`], [null, R`\frac{41.5}{\max\left(\alpha_{${s}},0.01\right)}`])}`, M({ precision: 1 }));
  P('Class 3 limit', R`\beta_{${s}3}\coloneq${IF([R`\psi_{${s}}>-1`, R`\frac{42}{0.67+0.33\psi_{${s}}}`], [null, R`62\left(1-\psi_{${s}}\right)\sqrt{-\psi_{${s}}}`])}`, M({ precision: 1 }));
};
const CLASS4 = (b, l1, l2, l3) => IF([R`${b}\le${l1}`, '1'], [R`${b}\le${l2}`, '2'], [R`${b}\le${l3}`, '3'], [null, '4']);
/** α: plastic compressed part; N + one moment (M) over a wall of total area cA; moment about the other axis ⇒ uniform. */
const alphaOf = (Mown, Mother, cA) => IF(...(Mother ? [[R`${Mother}>${kNm0}`, '1']] : []), [R`${Mown}>${kNm0}`, clamp01(R`0.5\left(1+\frac{N_{Ed}}{${cA}f_{y}}\right)`)], [R`N_{Ed}>0\,\mathrm{kN}`, '1'], [null, '0']);
/** ψ: elastic stress ratio over the wall depth c (compression positive), N + M about the axis with inertia I. */
const psiOf = (Mown, Mother, c, I) => {
  const s1 = R`\frac{N_{Ed}}{A}+\frac{${Mown}${c}}{2${I}}`, s2 = R`\frac{N_{Ed}}{A}-\frac{${Mown}${c}}{2${I}}`;
  return IF(...(Mother ? [[R`${Mother}>${kNm0}`, '1']] : []), [R`${Mown}>${kNm0}\land${s1}>0\,\mathrm{MPa}`, R`\max\left(-3,\frac{${s2}}{${s1}}\right)`], [null, '1']);
};
const NO_COMPRESSION = R`N_{Ed}\le0\,\mathrm{kN}\land M_{y.Ed}=${kNm0}\land M_{z.Ed}=${kNm0}`;

function sheet(shape) {
  const L = createLayout({ idPrefix: `s_sec${shape.toLowerCase()}`, sizesFile: `sizes_section_${shape.toLowerCase()}.json`, textFont: 'Roboto', mathColumn: 396 });
  const { gap, H, T, P, ROW, S, GRAPH, M, mm, kN, kNm, MPa, fr, KEEP, need, finish } = L;
  const U = {};
  const UR = (desc, name, latex, clause) => {
    U[name] = R`\mathrm{UR}_{${name}}\coloneq ${latex}`;
    P(desc, U[name], M(p3, fr));
    P(clause, R`\mathrm{UR}_{${name}}\le1`, M(p3));
  };
  const I = shape === 'I', RHS = shape === 'RHS', CHS = shape === 'CHS';
  let CLS = '';
  const D = shape === 'I' ? { N: 1500, My: 120, Mz: 20, Vz: 150, Vy: 20 } : { N: 900, My: 60, Mz: 15, Vz: 100, Vy: 20 };
  const ACT = { N: R`N_{Ed}\coloneq${D.N}\,\mathrm{kN}`, My: R`M_{y.Ed}\coloneq${D.My}\,\mathrm{kN}\cdot\mathrm{m}`, Mz: R`M_{z.Ed}\coloneq${D.Mz}\,\mathrm{kN}\cdot\mathrm{m}`, Vz: R`V_{z.Ed}\coloneq${D.Vz}\,\mathrm{kN}`, Vy: R`V_{y.Ed}\coloneq${D.Vy}\,\mathrm{kN}` };
  const title = { I: 'I/H SECTION', RHS: 'RECTANGULAR HOLLOW SECTION', CHS: 'CIRCULAR HOLLOW SECTION' }[shape];

  // ================= 1. Basis =================
  H(1, `STEEL CROSS-SECTION CHECK – ${title} (EC3)`);
  H(2, '1. DESIGN BASIS');
  T('EN 1993-1-1:2005 + A1:2014: classification §5.5 (Table 5.2) and cross-section resistance §6.2.');
  T('Section design only: member buckling (§6.3) is not part of this sheet. Class 1 to 3.');
  T('N positive in compression, negative in tension. Moments and shears in either sign; magnitudes are used.');
  T('Not covered: Class 4, torsion, holes and net sections, shear buckling, fire, connections.');
  if (I) T('Doubly symmetric rolled or welded I/H. z is the web direction, y the flange direction.');
  if (RHS) T('Hot-finished (EN 10210-2) or cold-formed (EN 10219-2) RHS/SHS; h along z, b along y.');
  if (CHS) T('Hot-finished or cold-formed CHS: bending and shear are combined as resultants.');

  // ================= 2. Inputs =================
  H(2, '2. INPUTS');
  H(3, '2.1 Material and partial factors');
  P('Nominal yield strength of the grade (t ≤ 40 mm)', R`f_{y.nom}\coloneq355\,\mathrm{MPa}`, M(MPa));
  P('Partial factor, cross-section resistance (National Annex)', R`\gamma_{M0}\coloneq1.0`);
  if (!CHS) P('Shear area factor η, EN 1993-1-5 §5.1 (National Annex)', R`\eta\coloneq1.2`);
  H(3, '2.2 Section');
  if (I) P('Steel section (Browse)', R`\mathrm{Section}\coloneq1211`);
  if (RHS) {
    P('Depth (along z)', R`h\coloneq200\,\mathrm{mm}`, M(mm));
    P('Width (along y)', R`b\coloneq200\,\mathrm{mm}`, M(mm));
    P('Wall thickness', R`t\coloneq10\,\mathrm{mm}`, M({ displayUnit: 'mm', precision: 1 }));
    P('Process: 0 = hot-finished EN 10210, 1 = cold-formed EN 10219', R`\mathrm{CF}\coloneq0`);
  }
  if (CHS) {
    P('Outside diameter', R`d\coloneq219.1\,\mathrm{mm}`, M({ displayUnit: 'mm', precision: 1 }));
    P('Wall thickness', R`t\coloneq10\,\mathrm{mm}`, M({ displayUnit: 'mm', precision: 1 }));
  }
  H(3, '2.3 Design actions (ULS, one load combination)');
  P('Axial force, compression positive', ACT.N, M(kN));
  P('Bending moment about y-y', ACT.My, M(kNm));
  P('Bending moment about z-z', ACT.Mz, M(kNm));
  P(I ? 'Shear force along z (web)' : 'Shear force along z', ACT.Vz, M(kN));
  P(I ? 'Shear force along y (flanges)' : 'Shear force along y', ACT.Vy, M(kN));

  // ================= 3. Section properties =================
  H(2, '3. SECTION PROPERTIES');
  if (I) {
    T('Browse: choose a section by name, or enter custom h, b, tf, tw; properties update automatically.');
    T('Custom welded: r = 0, no weld metal; shear areas EN 1993-1-1 §6.2.6(3) with η = 1.0.');
    const PROPS = [['h', 'mm'], ['b', 'mm'], ['t_w', 'mm'], ['t_f', 'mm'], ['r', 'mm'], ['A', 'mm^2'], ['I_y', 'mm^4'], ['I_z', 'mm^4'],
      ['W_{el.y}', 'mm^3'], ['W_{el.z}', 'mm^3'], ['W_{pl.y}', 'mm^3'], ['W_{pl.z}', 'mm^3'], ['I_t', 'mm^4'], ['I_w', 'mm^6'], ['A_{v.y}', 'mm^2'], ['A_{v.z}', 'mm^2']];
    const DISP = { 'mm': ['mm', 1], 'mm^2': ['cm^2', 1], 'mm^3': ['cm^3', 0], 'mm^4': ['cm^4', 0], 'mm^6': ['cm^6', 0] };
    for (let i = 0; i < PROPS.length; i += 2) {
      ROW(PROPS.slice(i, i + 2).map(([sym, unit], j) => [[96, 396][j], R`${sym}\coloneq \operatorname{sectionProp}(\mathrm{Section},${i + j})`,
        { displayMode: 'result', displayUnit: DISP[unit][0], precision: DISP[unit][1] }]), 0.75);
    }
    gap(0.25);
    const hw = R`\left(\frac{h}{2}-t_{f}\right)`;
    GRAPH(240, { title: 'Section', xUnit: 'mm', yUnit: 'mm', equalAxes: true,
      series: [S('outline', '', [
        R`\mathrm{stack}\left(-\frac{b}{2},\frac{b}{2},\frac{b}{2},\frac{t_{w}}{2},\frac{t_{w}}{2},\frac{b}{2},\frac{b}{2},-\frac{b}{2},-\frac{b}{2},-\frac{t_{w}}{2},-\frac{t_{w}}{2},-\frac{b}{2},-\frac{b}{2}\right)`,
        R`\mathrm{stack}\left(\frac{h}{2},\frac{h}{2},${hw},${hw},-${hw},-${hw},-\frac{h}{2},-\frac{h}{2},-${hw},-${hw},${hw},${hw},\frac{h}{2}\right)`,
      ], 'line', '#1e3a5f', 2)] });
    P('Thickest plate (yield strength)', R`t_{max}\coloneq\max\left(t_{f},t_{w}\right)`, M({ displayUnit: 'mm', precision: 1 }, fr));
  }
  if (RHS) {
    H(3, '3.1 Corner radii');
    T('EN 10210-2: r_o = 1.5t, r_i = t. EN 10219-2 (mean of Table A.1): r_o = 2t, 2.5t, 3t for t ≤ 6, ≤ 10, > 10 mm.');
    P('External corner radius', R`r_{o}\coloneq${IF([R`\mathrm{CF}=0`, '1.5t'], [R`t\le6\,\mathrm{mm}`, '2t'], [R`t\le10\,\mathrm{mm}`, '2.5t'], [null, '3t'])}`, M({ displayUnit: 'mm', precision: 1 }));
    P('Internal corner radius', R`r_{i}\coloneq${IF([R`\mathrm{CF}=0`, 't'], [null, R`r_{o}-t`])}`, M({ displayUnit: 'mm', precision: 1 }));
    P('Wall geometry', R`2r_{o}<\min\left(h,b\right)`);
    H(3, '3.2 Properties (outer rounded rectangle minus inner)');
    T('Each corner: an r × r square less a quarter circle (area k_A r², centroid k_x r from the edges, own I k_I r⁴).');
    P('Corner area factor', R`k_{A}\coloneq1-\frac{\pi}{4}`, M({ precision: 4 }, fr));
    P('Corner centroid factor', R`k_{x}\coloneq\frac{10-3\pi}{12-3\pi}`, M({ precision: 4 }, fr));
    P('Corner inertia factor', R`k_{I}\coloneq1-\frac{5\pi}{16}-k_{A}k_{x}^2`, M({ precision: 5 }, fr));
    P('Inner depth and width', R`h_{i}\coloneq h-2t`, M(mm, fr));
    P('', R`b_{i}\coloneq b-2t`, M(mm, fr));
    const area = (B, Hh, r) => R`${B}${Hh}-4k_{A}${r}^2`;
    const inertia = (B, Hh, r) => R`\frac{${B}${Hh}^3}{12}-4${r}^2\left(k_{A}\left(\frac{${Hh}}{2}-k_{x}${r}\right)^2+k_{I}${r}^2\right)`;
    const plastic = (B, Hh, r) => R`\frac{${B}${Hh}^2}{4}-4k_{A}${r}^2\left(\frac{${Hh}}{2}-k_{x}${r}\right)`;
    P('Area', R`A\coloneq ${area('b', 'h', 'r_{o}')}-\left(${area('b_{i}', 'h_{i}', 'r_{i}')}\right)`, M({ displayUnit: 'cm^2', precision: 2 }, fr));
    const cm4 = { displayUnit: 'cm^4', precision: 0 };
    P('Second moment of area about y: outer and inner outline', R`I_{y.o}\coloneq${inertia('b', 'h', 'r_{o}')}`, M(cm4, fr));
    P('', R`I_{y.i}\coloneq${inertia('b_{i}', 'h_{i}', 'r_{i}')}`, M(cm4, fr));
    P('', R`I_{y}\coloneq I_{y.o}-I_{y.i}`, M(cm4, fr));
    P('Second moment of area about z: outer and inner outline', R`I_{z.o}\coloneq${inertia('h', 'b', 'r_{o}')}`, M(cm4, fr));
    P('', R`I_{z.i}\coloneq${inertia('h_{i}', 'b_{i}', 'r_{i}')}`, M(cm4, fr));
    P('', R`I_{z}\coloneq I_{z.o}-I_{z.i}`, M(cm4, fr));
    P('Elastic moduli', R`W_{el.y}\coloneq\frac{2I_{y}}{h}`, M({ displayUnit: 'cm^3', precision: 0 }, fr));
    P('', R`W_{el.z}\coloneq\frac{2I_{z}}{b}`, M({ displayUnit: 'cm^3', precision: 0 }, fr));
    P('Plastic modulus about y', R`W_{pl.y}\coloneq${plastic('b', 'h', 'r_{o}')}-\left(${plastic('b_{i}', 'h_{i}', 'r_{i}')}\right)`, M({ displayUnit: 'cm^3', precision: 0 }, fr));
    P('Plastic modulus about z', R`W_{pl.z}\coloneq${plastic('h', 'b', 'r_{o}')}-\left(${plastic('h_{i}', 'b_{i}', 'r_{i}')}\right)`, M({ displayUnit: 'cm^3', precision: 0 }, fr));
    P('Shear areas, §6.2.6(3)(f): load parallel to depth', R`A_{v.z}\coloneq\frac{Ah}{b+h}`, M({ displayUnit: 'cm^2', precision: 2 }, fr));
    P('Load parallel to width', R`A_{v.y}\coloneq\frac{Ab}{b+h}`, M({ displayUnit: 'cm^2', precision: 2 }, fr));
    GRAPH(240, { title: 'Section (corners drawn square)', xUnit: 'mm', yUnit: 'mm', equalAxes: true,
      series: [
        S('outer', '', [R`\mathrm{stack}\left(-\frac{b}{2},\frac{b}{2},\frac{b}{2},-\frac{b}{2},-\frac{b}{2}\right)`, R`\mathrm{stack}\left(\frac{h}{2},\frac{h}{2},-\frac{h}{2},-\frac{h}{2},\frac{h}{2}\right)`], 'line', '#1e3a5f', 2),
        S('inner', '', [R`\mathrm{stack}\left(-\frac{b_{i}}{2},\frac{b_{i}}{2},\frac{b_{i}}{2},-\frac{b_{i}}{2},-\frac{b_{i}}{2}\right)`, R`\mathrm{stack}\left(\frac{h_{i}}{2},\frac{h_{i}}{2},-\frac{h_{i}}{2},-\frac{h_{i}}{2},\frac{h_{i}}{2}\right)`], 'line', '#1e3a5f', 2),
      ] });
    P('Thickest plate (yield strength)', R`t_{max}\coloneq t`, M({ displayUnit: 'mm', precision: 1 }));
  }
  if (CHS) {
    P('Inside diameter', R`d_{i}\coloneq d-2t`, M({ displayUnit: 'mm', precision: 1 }, fr));
    P('Area', R`A\coloneq\frac{\pi\left(d^2-d_{i}^2\right)}{4}`, M({ displayUnit: 'cm^2', precision: 2 }, fr));
    P('Second moment of area', R`I\coloneq\frac{\pi\left(d^4-d_{i}^4\right)}{64}`, M({ displayUnit: 'cm^4', precision: 0 }, fr));
    P('Elastic modulus', R`W_{el}\coloneq\frac{2I}{d}`, M({ displayUnit: 'cm^3', precision: 0 }, fr));
    P('Plastic modulus', R`W_{pl}\coloneq\frac{d^3-d_{i}^3}{6}`, M({ displayUnit: 'cm^3', precision: 0 }, fr));
    P('Shear area, §6.2.6(3)(g)', R`A_{v}\coloneq\frac{2A}{\pi}`, M({ displayUnit: 'cm^2', precision: 2 }, fr));
    P('Angles for drawing', R`\varphi_{t}\coloneq\mathrm{seq}\left(0,2\pi,\frac{\pi}{36}\right)`, M({ displayMode: 'formula' }));
    GRAPH(220, { title: 'Section', xUnit: 'mm', yUnit: 'mm', equalAxes: true,
      series: [
        S('outer', '', [R`\frac{d}{2}\cos\left(\varphi_{t}\right)`, R`\frac{d}{2}\sin\left(\varphi_{t}\right)`], 'line', '#1e3a5f', 2),
        S('inner', '', [R`\frac{d_{i}}{2}\cos\left(\varphi_{t}\right)`, R`\frac{d_{i}}{2}\sin\left(\varphi_{t}\right)`], 'line', '#1e3a5f', 2),
      ] });
    P('Thickest plate (yield strength)', R`t_{max}\coloneq t`, M({ displayUnit: 'mm', precision: 1 }));
  }
  H(3, 'Yield strength (EN 1993-1-1 Table 3.1)');
  P('Reduced for t > 40 mm: −20 MPa up to S355, −30 MPa above', R`f_{y}\coloneq${IF([R`t_{max}\le40\,\mathrm{mm}`, R`f_{y.nom}`], [R`f_{y.nom}\le355\,\mathrm{MPa}`, R`f_{y.nom}-20\,\mathrm{MPa}`], [null, R`f_{y.nom}-30\,\mathrm{MPa}`])}`, M(MPa));
  P('Thickness within Table 3.1', R`t_{max}\le80\,\mathrm{mm}`, M({ displayUnit: 'mm', precision: 1 }));

  // ================= 4. Classification =================
  H(2, '4. CLASSIFICATION (§5.5, Table 5.2)');
  P('Material parameter ε', R`\varepsilon\coloneq\sqrt{\frac{235\,\mathrm{MPa}}{f_{y}}}`, M(p3, fr));
  if (I) {
    H(3, '4.1 Flange (outstand, taken in uniform compression)');
    P('Flange outstand', R`c_{f}\coloneq\frac{b-t_{w}-2r}{2}`, M(mm, fr));
    P('Flange slenderness c/(t·ε): limits 9, 10, 14', R`\beta_{f}\coloneq\frac{c_{f}}{t_{f}\varepsilon}`, M({ precision: 2 }, fr));
    P('Flange class (Class 1 when nothing is in compression)', R`\mathrm{Class}_{f}\coloneq${IF([NO_COMPRESSION, '1'], [R`\beta_{f}\le9`, '1'], [R`\beta_{f}\le10`, '2'], [R`\beta_{f}\le14`, '3'], [null, '4'])}`);
    H(3, '4.2 Web (internal part, N + My; Mz causes no web stress)');
    P('Web depth between fillets', R`c_{w}\coloneq h-2t_{f}-2r`, M(mm, fr));
    P('Compressed part of the web at full plasticity', R`\alpha_{w}\coloneq${alphaOf(aMy, null, R`c_{w}t_{w}`)}`, M(p3));
    P('Elastic stress ratio (compression positive)', R`\psi_{w}\coloneq${psiOf(aMy, null, R`c_{w}`, R`I_{y}`)}`, M(p3));
    LIMITS(P, M, 'w');
    P('Web slenderness c/(t·ε)', R`\beta_{w}\coloneq\frac{c_{w}}{t_{w}\varepsilon}`, M({ precision: 2 }, fr));
    P('Web class', R`\mathrm{Class}_{w}\coloneq${CLASS4(R`\beta_{w}`, R`\beta_{w1}`, R`\beta_{w2}`, R`\beta_{w3}`)}`);
    H(3, '4.3 Section class');
    CLS = R`\mathrm{Class}\coloneq\max\left(\mathrm{Class}_{f},\mathrm{Class}_{w}\right)`;
    P('Class of the cross-section', CLS, M(fr));
  }
  if (RHS) {
    T('Flat widths c = h − 3t and b − 3t (Table 5.2 note). A wall is in bending with N when only the moment');
    T('about its own axis acts; with the other moment present it is taken in uniform compression.');
    H(3, '4.1 Walls of depth h (bending about y)');
    P('Flat width', R`c_{h}\coloneq h-3t`, M(mm, fr));
    P('Compressed part at full plasticity', R`\alpha_{h}\coloneq${alphaOf(aMy, aMz, R`2c_{h}t`)}`, M(p3));
    P('Elastic stress ratio', R`\psi_{h}\coloneq${psiOf(aMy, aMz, R`c_{h}`, R`I_{y}`)}`, M(p3));
    LIMITS(P, M, 'h');
    P('Slenderness c/(t·ε)', R`\beta_{h}\coloneq\frac{c_{h}}{t\varepsilon}`, M({ precision: 2 }, fr));
    P('Class of the h walls', R`\mathrm{Class}_{h}\coloneq${CLASS4(R`\beta_{h}`, R`\beta_{h1}`, R`\beta_{h2}`, R`\beta_{h3}`)}`);
    H(3, '4.2 Walls of width b (bending about z)');
    P('Flat width', R`c_{b}\coloneq b-3t`, M(mm, fr));
    P('Compressed part at full plasticity', R`\alpha_{b}\coloneq${alphaOf(aMz, aMy, R`2c_{b}t`)}`, M(p3));
    P('Elastic stress ratio', R`\psi_{b}\coloneq${psiOf(aMz, aMy, R`c_{b}`, R`I_{z}`)}`, M(p3));
    LIMITS(P, M, 'b');
    P('Slenderness c/(t·ε)', R`\beta_{b}\coloneq\frac{c_{b}}{t\varepsilon}`, M({ precision: 2 }, fr));
    P('Class of the b walls', R`\mathrm{Class}_{b}\coloneq${CLASS4(R`\beta_{b}`, R`\beta_{b1}`, R`\beta_{b2}`, R`\beta_{b3}`)}`);
    H(3, '4.3 Section class');
    CLS = R`\mathrm{Class}\coloneq\max\left(\mathrm{Class}_{h},\mathrm{Class}_{b}\right)`;
    P('Class of the cross-section', CLS, M(fr));
  }
  if (CHS) {
    P('Slenderness d/(t·ε²): limits 50, 70, 90', R`\beta_{d}\coloneq\frac{d}{t\varepsilon^2}`, M({ precision: 2 }, fr));
    CLS = R`\mathrm{Class}\coloneq${IF([NO_COMPRESSION, '1'], [R`\beta_{d}\le50`, '1'], [R`\beta_{d}\le70`, '2'], [R`\beta_{d}\le90`, '3'], [null, '4'])}`;
    P('Class of the cross-section (Class 1 when nothing is in compression)', CLS);
  }
  P('Class 4 (effective section) is not covered', R`\mathrm{Class}\le3`);

  // ================= 5. Resistance =================
  H(2, '5. CROSS-SECTION RESISTANCE (§6.2)');
  H(3, '5.1 Shear (§6.2.6) and its effect on bending (§6.2.8)');
  const RHO = (u) => IF([R`\mathrm{UR}_{${u}}>0.5`, R`\min\left(0.99,\left(2\mathrm{UR}_{${u}}-1\right)^2\right)`], [null, '0']);
  if (CHS) {
    P('Resultant shear force', R`V_{Ed}\coloneq\sqrt{V_{y.Ed}^2+V_{z.Ed}^2}`, M(kN, fr));
    P('Plastic shear resistance (6.18)', R`V_{pl.Rd}\coloneq\frac{A_{v}f_{y}}{\sqrt{3}\gamma_{M0}}`, M(kN, fr));
    UR('Shear', 'V', R`\frac{V_{Ed}}{V_{pl.Rd}}`, '§6.2.6 (6.17)');
    P('Reduction for shear above 0.5 Vpl (6.29)', R`\rho\coloneq${RHO('V')}`, M(p3, fr));
  } else {
    P('Plastic shear resistance along z (6.18)', R`V_{pl.z.Rd}\coloneq\frac{A_{v.z}f_{y}}{\sqrt{3}\gamma_{M0}}`, M(kN, fr));
    P('Plastic shear resistance along y', R`V_{pl.y.Rd}\coloneq\frac{A_{v.y}f_{y}}{\sqrt{3}\gamma_{M0}}`, M(kN, fr));
    UR('Shear along z', 'V.z', R`\frac{\left|V_{z.Ed}\right|}{V_{pl.z.Rd}}`, '§6.2.6 (6.17)');
    UR('Shear along y', 'V.y', R`\frac{\left|V_{y.Ed}\right|}{V_{pl.y.Rd}}`, '§6.2.6 (6.17)');
    if (I) P('No shear buckling check needed, §6.2.6(6)', R`\frac{h-2t_{f}}{t_{w}}\le\frac{72\varepsilon}{\eta}`, M({ precision: 1 }));
    else P('No shear buckling check needed, §6.2.6(6)', R`\frac{\max\left(h,b\right)-2t}{t}\le\frac{72\varepsilon}{\eta}`, M({ precision: 1 }));
    P('Reduction for shear above 0.5 Vpl (6.29), along z', R`\rho_{z}\coloneq${RHO('V.z')}`, M(p3, fr));
    P('Along y', R`\rho_{y}\coloneq${RHO('V.y')}`, M(p3, fr));
    P('Larger of both directions', R`\rho\coloneq\max\left(\rho_{z},\rho_{y}\right)`, M(p3, fr));
  }
  T('The reduced yield strength (1 − ρ)f_y is applied to the whole section (conservative, §6.2.8(3)).');
  T('ρ is capped at 0.99 so the other checks stay finite when the shear check itself fails.');
  H(3, '5.2 Axial force (§6.2.3, §6.2.4) and bending (§6.2.5)');
  P('Plastic axial resistance, compression (6.10) or gross tension (6.6)', R`N_{pl.Rd}\coloneq\frac{Af_{y}}{\gamma_{M0}}`, M(kN, fr));
  UR('Axial force', 'N', R`\frac{${aN}}{N_{pl.Rd}}`, '§6.2.3 (6.5), §6.2.4 (6.9)');
  if (CHS) {
    P('Resultant bending moment', R`M_{Ed}\coloneq\sqrt{M_{y.Ed}^2+M_{z.Ed}^2}`, M(kNm, fr));
    P('Section modulus: plastic for Class 1, 2; elastic for Class 3', R`W\coloneq${IF([R`\mathrm{Class}\le2`, 'W_{pl}'], [null, 'W_{el}'])}`, M({ displayUnit: 'cm^3', precision: 0 }));
    P('Bending resistance (6.13), (6.14), reduced for shear', R`M_{c.Rd}\coloneq\frac{Wf_{y}\left(1-\rho\right)}{\gamma_{M0}}`, M(kNm, fr));
    UR('Bending', 'M', R`\frac{M_{Ed}}{M_{c.Rd}}`, '§6.2.5 (6.12)');
  } else {
    P('Section modulus about y: plastic for Class 1, 2; elastic for Class 3', R`W_{y}\coloneq${IF([R`\mathrm{Class}\le2`, 'W_{pl.y}'], [null, 'W_{el.y}'])}`, M({ displayUnit: 'cm^3', precision: 0 }));
    P('Section modulus about z', R`W_{z}\coloneq${IF([R`\mathrm{Class}\le2`, 'W_{pl.z}'], [null, 'W_{el.z}'])}`, M({ displayUnit: 'cm^3', precision: 0 }));
    P('Bending resistance about y (6.13), (6.14), reduced for shear', R`M_{c.y.Rd}\coloneq\frac{W_{y}f_{y}\left(1-\rho\right)}{\gamma_{M0}}`, M(kNm, fr));
    P('Bending resistance about z', R`M_{c.z.Rd}\coloneq\frac{W_{z}f_{y}\left(1-\rho\right)}{\gamma_{M0}}`, M(kNm, fr));
    UR('Bending about y', 'M.y', R`\frac{${aMy}}{M_{c.y.Rd}}`, '§6.2.5 (6.12)');
    UR('Bending about z', 'M.z', R`\frac{${aMz}}{M_{c.z.Rd}}`, '§6.2.5 (6.12)');
  }

  // ================= 6. Interaction =================
  H(2, '6. BENDING, SHEAR AND AXIAL FORCE (§6.2.9, §6.2.10)');
  P('Axial resistance with the shear reduction', R`N_{V.Rd}\coloneq\left(1-\rho\right)N_{pl.Rd}`, M(kN, fr));
  P('Axial ratio', R`n\coloneq\frac{${aN}}{N_{V.Rd}}`, M(p3, fr));
  H(3, '6.1 Class 1 and 2: reduced plastic moments (§6.2.9.1)');
  if (CHS) {
    P('Plastic moment resistance, reduced for shear', R`M_{pl.Rd}\coloneq\frac{W_{pl}f_{y}\left(1-\rho\right)}{\gamma_{M0}}`, M(kNm, fr));
    P('Reduced for axial force, SCI P363 §10.2.1 (Blue Book)', R`M_{N.Rd}\coloneq M_{pl.Rd}\left(1-\min\left(1,n\right)^{1.7}\right)`, M(kNm, fr));
    T('With α = β = 2 (§6.2.9.1(6)), (6.41) is (M_Ed/M_N,Rd)² ≤ 1, i.e. the resultant M_Ed/M_N,Rd ≤ 1.');
    P('Utilisation, plastic (n ≥ 1: axial force alone exceeds the resistance)', R`\mathrm{UR}_{pl}\coloneq${IF(['n<1', R`\frac{M_{Ed}}{M_{N.Rd}}`], [null, 'n'])}`, M(p3));
  } else {
    P('Plastic moment resistances, reduced for shear', R`M_{pl.y.Rd}\coloneq\frac{W_{pl.y}f_{y}\left(1-\rho\right)}{\gamma_{M0}}`, M(kNm, fr));
    P('', R`M_{pl.z.Rd}\coloneq\frac{W_{pl.z}f_{y}\left(1-\rho\right)}{\gamma_{M0}}`, M(kNm, fr));
    if (I) {
      P('Web depth between flanges', R`h_{w}\coloneq h-2t_{f}`, M(mm, fr));
      P('Web area ratio (6.36)', R`a\coloneq\min\left(\frac{A-2bt_{f}}{A},0.5\right)`, M(p3, fr));
      const webY = R`0.5h_{w}t_{w}\frac{f_{y}\left(1-\rho\right)}{\gamma_{M0}}`;
      P('About y: no reduction when (6.33) and (6.34) hold; else (6.36)', R`M_{N.y.Rd}\coloneq${IF([R`${aN}\le0.25N_{V.Rd}\land${aN}\le ${webY}`, R`M_{pl.y.Rd}`], [null, R`\min\left(M_{pl.y.Rd},M_{pl.y.Rd}\frac{1-n}{1-0.5a}\right)`])}`, M(kNm));
      const webZ = R`h_{w}t_{w}\frac{f_{y}\left(1-\rho\right)}{\gamma_{M0}}`;
      P('About z: no reduction when (6.35) holds or n ≤ a; else (6.38)', R`M_{N.z.Rd}\coloneq${IF([R`\left(${aN}\le ${webZ}\right)\lor\left(n\le a\right)`, R`M_{pl.z.Rd}`], [null, R`M_{pl.z.Rd}\left(1-\left(\frac{n-a}{1-a}\right)^2\right)`])}`, M(kNm));
      P('Exponents (6.41), I and H sections', R`\alpha\coloneq2`);
      P('', R`\beta\coloneq\max\left(5n,1\right)`, M(p3, fr));
    } else {
      P('Web area ratio (6.39)', R`a_{w}\coloneq\min\left(\frac{A-2bt}{A},0.5\right)`, M(p3, fr));
      P('Flange area ratio (6.40)', R`a_{f}\coloneq\min\left(\frac{A-2ht}{A},0.5\right)`, M(p3, fr));
      P('About y (6.39)', R`M_{N.y.Rd}\coloneq\min\left(M_{pl.y.Rd},M_{pl.y.Rd}\frac{1-\min\left(1,n\right)}{1-0.5a_{w}}\right)`, M(kNm, fr));
      P('About z (6.40)', R`M_{N.z.Rd}\coloneq\min\left(M_{pl.z.Rd},M_{pl.z.Rd}\frac{1-\min\left(1,n\right)}{1-0.5a_{f}}\right)`, M(kNm, fr));
      P('Exponents (6.41), RHS: 1.66/(1 − 1.13n²) ≤ 6', R`\alpha\coloneq${IF([R`n<0.8`, R`\min\left(6,\frac{1.66}{1-1.13n^2}\right)`], [null, '6'])}`, M(p3));
      P('', R`\beta\coloneq\alpha`, M(p3));
    }
    if (I) T('One moment only: (6.31) M_Ed/M_N,Rd ≤ 1. Both moments: (6.41) biaxial criterion.');
    else T('One moment only: (6.31). Both moments: (6.41) with α = β, written as its α-th root (same limit 1, linear in M).');
    const biax = I ? R`\left(\frac{${aMy}}{M_{N.y.Rd}}\right)^{\alpha}+\left(\frac{${aMz}}{M_{N.z.Rd}}\right)^{\beta}`
      : R`\left(\left(\frac{${aMy}}{M_{N.y.Rd}}\right)^{\alpha}+\left(\frac{${aMz}}{M_{N.z.Rd}}\right)^{\alpha}\right)^{\frac{1}{\alpha}}`;
    P('Utilisation, plastic (n ≥ 1: axial force alone exceeds the resistance)', R`\mathrm{UR}_{pl}\coloneq${IF(['n\\ge1', 'n'], [R`M_{z.Ed}=${kNm0}`, R`\frac{${aMy}}{M_{N.y.Rd}}`], [R`M_{y.Ed}=${kNm0}`, R`\frac{${aMz}}{M_{N.z.Rd}}`], [null, biax])}`, M(p3));
  }
  H(3, '6.2 Class 3: elastic stresses (§6.2.9.2, (6.42))');
  if (CHS) P('Peak normal stress over f_y(1 − ρ)/γM0', R`\mathrm{UR}_{el}\coloneq\frac{${aN}}{N_{V.Rd}}+\frac{M_{Ed}\gamma_{M0}}{W_{el}f_{y}\left(1-\rho\right)}`, M(p3, fr));
  else P('Peak normal stress over f_y(1 − ρ)/γM0', R`\mathrm{UR}_{el}\coloneq\frac{${aN}}{N_{V.Rd}}+\frac{${aMy}\gamma_{M0}}{W_{el.y}f_{y}\left(1-\rho\right)}+\frac{${aMz}\gamma_{M0}}{W_{el.z}f_{y}\left(1-\rho\right)}`, M(p3, fr));
  H(3, '6.3 Combined check');
  UR('Class 1, 2: plastic; Class 3: elastic', 'sec', IF([R`\mathrm{Class}\le2`, R`\mathrm{UR}_{pl}`], [null, R`\mathrm{UR}_{el}`]), '§6.2.9 (6.31), (6.41), (6.42)');

  // ================= 7. Summary =================
  H(2, '7. SUMMARY');
  T('Results apply only within the stated assumptions and scope; applicability is not checked.');
  const keys = CHS ? ['V', 'N', 'M', 'sec'] : ['V.z', 'V.y', 'N', 'M.y', 'M.z', 'sec'];
  const GOV = R`\mathrm{UR}\coloneq\max\left(${keys.map((k) => R`\mathrm{UR}_{${k}}`).join(',')}\right)`;
  need(6);
  KEEP(() => {
    P('Governing utilisation', GOV, M(p3));
    P('Cross-section resistance check', R`\mathrm{UR}\le1`);
  });

  const file = `Steel_Section_${shape}_EC3.mCCV`;
  finish({
    id: `tpl-steel-section-${shape.toLowerCase()}`, title: `Steel Cross-Section Check – ${shape === 'I' ? 'I/H' : shape} (EN 1993-1-1)`, reference: `CALC-ST-S${shape[0]}`, file,
    batch: {
      title: 'Load combinations',
      inputs: [['n', 'N_Ed', ACT.N], ['my', 'M_y,Ed', ACT.My], ['mz', 'M_z,Ed', ACT.Mz], ['vz', 'V_z,Ed', ACT.Vz], ['vy', 'V_y,Ed', ACT.Vy]],
      outputs: [
        ['cls', 'Class', CLS],
        ...keys.map((k) => [`ur_${k.replace('.', '')}`, `UR ${k}`, U[k]]),
        ['ur', 'UR', GOV],
      ],
      rows: [
        { id: 'c1', name: 'ULS 1', values: { n: D.N, my: D.My, mz: D.Mz, vz: D.Vz, vy: D.Vy } },
        { id: 'c2', name: 'ULS 2', values: { n: -0.2 * D.N, my: 1.5 * D.My, mz: 0, vz: 1.5 * D.Vz, vy: 0 } },
        { id: 'c3', name: 'ULS 3', values: { n: 1.4 * D.N, my: 0.3 * D.My, mz: 0.5 * D.Mz, vz: 0.3 * D.Vz, vy: D.Vy } },
      ],
    },
  });
  return { keys };
}

for (const shape of (process.argv[2] ? [process.argv[2]] : ['I', 'RHS', 'CHS'])) sheet(shape);
