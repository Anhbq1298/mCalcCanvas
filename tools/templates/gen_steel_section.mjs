// Steel cross-section design (EN 1993-1-1:2005 + A1:2014, §5.5 and §6.2 only, no member buckling) for
// mSteelBeamColumn. One generator, three worksheets: I/H (library or custom welded), RHS/SHS and CHS.
// Every result is a worksheet equation; the page runs the sheet once per load combination.
//   templates/Steel_Section_I_EC3.mCCV, Steel_Section_RHS_EC3.mCCV, Steel_Section_CHS_EC3.mCCV
// Hollow-section properties: EN 10210-2 / EN 10219-2 geometry with rounded corners (Annex B style), checked
// against the Tata Steel Blue Book (SCI P363) in src/tests/unit/steelSectionTemplates.test.ts.
import { createLayout, R } from './layout.mjs';
import { ltbCaseTable } from './ltbTable.mjs';
import sectionFormulae from '../../src/engineering/steel/sectionFormulae.json' with { type: 'json' };

const IF = (...branches) => {
  const rows = branches.map(([c, v], i) => (c === null ? R`\mathrm{else}` : `${i ? R`\mathrm{else}\ ` : ''}\\mathrm{if}\\ ${c}`) + R`\\\quad\left\Vert\displaystyle ${v}\right.`);
  return R`\begin{array}{||l}` + rows.join(R`\\`) + R`\end{array}`;
};
const curve = (symbol) => {
  const { branches, otherwise } = sectionFormulae.curves[symbol];
  return IF(...branches.map(({ condition, value }) => [condition, value]), [null, otherwise]);
};
const chiOf = (phi, lam) => R`\min\left(1,\frac{1}{${phi}+\sqrt{${phi}^2-${lam}^2}}\right)`;
const phiOf = (lam, alpha) => R`0.5\left(1+${alpha}\left(${lam}-0.2\right)+${lam}^2\right)`;
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
  const { gap, H, T, P, ROW, S, GRAPH, M, mm, kN, kNm, MPa, fr, KEEP, need, LINK, finish } = L;
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
  H(1, `STEEL BEAM-COLUMN CHECK – ${title} (EC3)`);
  H(2, '1. DESIGN BASIS');
  T('EN 1993-1-1:2005 + A1:2014. The check runs in this order, each step using the results before it:');
  T('section properties and yield strength (3) → class, Table 5.2 (4) → cross-section resistance §6.2 (5) →');
  T('member resistance §6.3: compression, lateral-torsional buckling, compression with bending (6) → summary (7).');
  T('Uniform member, Class 1 to 3; Annex B (Method 2) for the interaction factors.');
  T('N positive in compression, negative in tension. Moments and shears in either sign; magnitudes are used.');
  T('Not covered: Class 4, torsion, holes and net sections, shear buckling, fire, connections. N < 0 (tension):');
  T('no compression buckling; LTB and the interaction run with N = 0 (no tension credit).');
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
    P('Process: 0 = hot-finished EN 10210, 1 = cold-formed EN 10219', R`\mathrm{CF}\coloneq0`);
  }
  H(3, '2.3 Design actions (ULS, one load combination)');
  P('Axial force, compression positive', ACT.N, M(kN));
  P('Bending moment about y-y', ACT.My, M(kNm));
  P('Bending moment about z-z', ACT.Mz, M(kNm));
  P(I ? 'Shear force along z (web)' : 'Shear force along z', ACT.Vz, M(kN));
  P(I ? 'Shear force along y (flanges)' : 'Shear force along y', ACT.Vy, M(kN));
  H(3, '2.4 Member (buckling, LTB, interaction)');
  P('Elastic modulus', R`E\coloneq210\,\mathrm{GPa}`);
  P('Shear modulus', R`G\coloneq81\,\mathrm{GPa}`);
  P('Partial factor, member buckling (National Annex)', R`\gamma_{M1}\coloneq1.0`);
  P('System length for buckling about y-y (major axis)', R`L_{y}\coloneq4\,\mathrm{m}`, M({ displayUnit: 'm', precision: 3 }));
  P('Effective length factor about y-y', R`k_{y}\coloneq1.0`);
  P('System length for buckling about z-z (minor axis)', R`L_{z}\coloneq4\,\mathrm{m}`, M({ displayUnit: 'm', precision: 3 }));
  P('Effective length factor about z-z', R`k_{z}\coloneq1.0`);
  if (!CHS) P('Length between lateral restraints of the compression flange (0 = fully restrained)', R`L_{LT}\coloneq4\,\mathrm{m}`, M({ displayUnit: 'm', precision: 3 }));
  if (I) {
    P('LTB moment case 1 to 13 (SN003b, Annex); 0 = use C1, C2 below', R`n_{LT}\coloneq1`);
    P('User C1 (only when the case is 0)', R`C_{1.u}\coloneq1.0`);
    P('User C2 (only when the case is 0)', R`C_{2.u}\coloneq0`);
    P('Load height above the shear centre (destabilising positive)', R`z_{g}\coloneq0\,\mathrm{mm}`, M(mm));
    P('LTB method: 1 = §6.3.2.3 with the Singapore / UK NA; 0 = §6.3.2.2, recommended', R`c_{NA}\coloneq1`);
  }
  if (RHS) {
    P('Moment distribution factor C1 (SN003b; 1.0 for uniform moment)', R`C_{1}\coloneq1.0`);
    P('LTB method: 1 = §6.3.2.3 with the Singapore / UK NA; 0 = §6.3.2.2, recommended', R`c_{NA}\coloneq1`);
  }
  P('Equivalent uniform moment factor Cmy (Table B.3)', R`C_{my}\coloneq1.0`);
  P('Equivalent uniform moment factor Cmz (Table B.3)', R`C_{mz}\coloneq1.0`);
  if (I) P('Equivalent uniform moment factor CmLT (Table B.3)', R`C_{mLT}\coloneq1.0`);
  T('Conservative defaults Cm = 1.0 (no moment-gradient benefit); same factors for every combination.');

  // ================= 3. Section properties =================
  H(2, '3. SECTION PROPERTIES AND YIELD STRENGTH');
  if (!RHS) H(3, '3.1 Dimensions and properties');
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
  H(3, `${RHS ? '3.3' : '3.2'} Yield strength`);
  P('Basis: 1 = product standard (EN 10025-2/-4, EN 10210-1, EN 10219-1 thickness steps; Singapore / UK NA), 0 = EN 1993-1-1 Table 3.1', R`c_{fy}\coloneq1`);
  const big = R`f_{y.nom}\ge420\,\mathrm{MPa}`, low = R`f_{y.nom}\le235\,\mathrm{MPa}`;
  const step = (a, b, c) => IF([big, R`f_{y.nom}-${a}\,\mathrm{MPa}`], ...(c ? [[low, R`f_{y.nom}-${c}\,\mathrm{MPa}`]] : []), [null, R`f_{y.nom}-${b}\,\mathrm{MPa}`]);
  P('Product standard: steps at 16, 40, 63, 80, 100 mm', R`f_{y.ps}\coloneq${IF([R`t_{max}\le16\,\mathrm{mm}`, R`f_{y.nom}`], [R`t_{max}\le40\,\mathrm{mm}`, step(20, 10)], [R`t_{max}\le63\,\mathrm{mm}`, step(30, 20)], [R`t_{max}\le80\,\mathrm{mm}`, step(50, 30, 20)], [null, step(60, 40, 20)])}`, M(MPa));
  P('Table 3.1: −20 MPa above 40 mm up to S355, −30 MPa above', R`f_{y.31}\coloneq${IF([R`t_{max}\le40\,\mathrm{mm}`, R`f_{y.nom}`], [R`f_{y.nom}\le355\,\mathrm{MPa}`, R`f_{y.nom}-20\,\mathrm{MPa}`], [null, R`f_{y.nom}-30\,\mathrm{MPa}`])}`, M(MPa));
  P('Yield strength used', R`f_{y}\coloneq${IF([R`c_{fy}\ge1`, R`f_{y.ps}`], [null, R`f_{y.31}`])}`, M(MPa));
  P('Thickness within the steps', R`t_{max}\le100\,\mathrm{mm}`, M({ displayUnit: 'mm', precision: 1 }));

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
  H(3, '5.1 Shear (§6.2.6, §6.2.8)');
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
  H(3, '5.2 Axial force and bending (§6.2.3–§6.2.5)');
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
  H(3, '5.3 Bending, shear and axial force (§6.2.9)');
  P('Axial resistance with the shear reduction', R`N_{V.Rd}\coloneq\left(1-\rho\right)N_{pl.Rd}`, M(kN, fr));
  P('Axial ratio', R`n\coloneq\frac{${aN}}{N_{V.Rd}}`, M(p3, fr));
  T('Class 1 and 2 – reduced plastic moments, §6.2.9.1:');
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
  T('Class 3 – elastic stresses, §6.2.9.2, (6.42):');
  if (CHS) P('Peak normal stress over f_y(1 − ρ)/γM0', R`\mathrm{UR}_{el}\coloneq\frac{${aN}}{N_{V.Rd}}+\frac{M_{Ed}\gamma_{M0}}{W_{el}f_{y}\left(1-\rho\right)}`, M(p3, fr));
  else P('Peak normal stress over f_y(1 − ρ)/γM0', R`\mathrm{UR}_{el}\coloneq\frac{${aN}}{N_{V.Rd}}+\frac{${aMy}\gamma_{M0}}{W_{el.y}f_{y}\left(1-\rho\right)}+\frac{${aMz}\gamma_{M0}}{W_{el.z}f_{y}\left(1-\rho\right)}`, M(p3, fr));
  T('Check used for this class:');
  UR('Class 1, 2: plastic; Class 3: elastic', 'sec', IF([R`\mathrm{Class}\le2`, R`\mathrm{UR}_{pl}`], [null, R`\mathrm{UR}_{el}`]), '§6.2.9 (6.31), (6.41), (6.42)');

  // ================= 7. Flexural and torsional buckling =================
  H(2, '6. MEMBER RESISTANCE (§6.3)');
  let sub = 0;
  const H6 = (t) => H(3, `6.${++sub} ${t}`);
  H6('Buckling lengths and curves (§6.3.1.2, Table 6.2)');
  P('Compression part of the axial force', R`N_{c.Ed}\coloneq\max\left(N_{Ed},0\,\mathrm{kN}\right)`, M(kN, fr));
  P('Buckling lengths', R`L_{cr.y}\coloneq k_{y}L_{y}`, M({ displayUnit: 'm', precision: 3 }, fr));
  P('', R`L_{cr.z}\coloneq k_{z}L_{z}`, M({ displayUnit: 'm', precision: 3 }, fr));
  const Iy = CHS ? 'I' : 'I_{y}', Iz = CHS ? 'I' : 'I_{z}';
  if (I) {
    P('Imperfection factor about y: Table 6.2, welded when Section = 0', R`\alpha_{y}\coloneq${curve(R`\alpha_{y}`)}`);
    P('Imperfection factor about z', R`\alpha_{z}\coloneq${curve(R`\alpha_{z}`)}`);
  } else {
    P('Imperfection factor, Table 6.2: hot-finished a (S460: a0), cold-formed c', R`\alpha_{y}\coloneq${IF([R`\mathrm{CF}\ge1`, '0.49'], [R`f_{y.nom}\ge460\,\mathrm{MPa}`, '0.13'], [null, '0.21'])}`);
    P('', R`\alpha_{z}\coloneq\alpha_{y}`);
  }
  P('Steel grade within the range of these curves', R`f_{y}\le460\,\mathrm{MPa}`, M(MPa));
  for (const ax of ['y', 'z']) {
    H6(`Flexural buckling about ${ax}-${ax} (§6.3.1)`);
    P('Elastic critical force', R`N_{cr.${ax}}\coloneq\frac{\pi^2E${ax === 'y' ? Iy : Iz}}{L_{cr.${ax}}^2}`, M(kN, fr));
    P('Relative slenderness (6.50)', R`\lambda_{${ax}}\coloneq\sqrt{\frac{Af_{y}}{N_{cr.${ax}}}}`, M(p3, fr));
    P('', R`\Phi_{${ax}}\coloneq${phiOf(R`\lambda_{${ax}}`, R`\alpha_{${ax}}`)}`, M(p3, fr));
    P('Reduction factor (6.49)', R`\chi_{${ax}}\coloneq${chiOf(R`\Phi_{${ax}}`, R`\lambda_{${ax}}`)}`, M(p3, fr));
    P('Buckling resistance (6.47)', R`N_{b.${ax}.Rd}\coloneq\frac{\chi_{${ax}}Af_{y}}{\gamma_{M1}}`, M(kN, fr));
    UR(`Flexural buckling about ${ax}`, `b.${ax}`, R`\frac{N_{c.Ed}}{N_{b.${ax}.Rd}}`, '§6.3.1.1 (6.46)');
  }
  if (I) {
    H6('Torsional buckling (§6.3.1.4)');
    T('Buckling length L_cr,T = L_cr,z.');
    P('Polar radius of gyration', R`i_{0}\coloneq\sqrt{\frac{I_{y}+I_{z}}{A}}`, M(mm, fr));
    P('Elastic critical force', R`N_{cr.T}\coloneq\frac{1}{i_{0}^2}\left(GI_{t}+\frac{\pi^2EI_{w}}{L_{cr.z}^2}\right)`, M(kN, fr));
    P('Relative slenderness (6.52)', R`\lambda_{T}\coloneq\sqrt{\frac{Af_{y}}{N_{cr.T}}}`, M(p3, fr));
    P('Curve for z-z, §6.3.1.4(3)', R`\Phi_{T}\coloneq${phiOf(R`\lambda_{T}`, R`\alpha_{z}`)}`, M(p3, fr));
    P('Reduction factor', R`\chi_{T}\coloneq${chiOf(R`\Phi_{T}`, R`\lambda_{T}`)}`, M(p3, fr));
    P('Buckling resistance', R`N_{b.T.Rd}\coloneq\frac{\chi_{T}Af_{y}}{\gamma_{M1}}`, M(kN, fr));
    UR('Torsional buckling', 'b.T', R`\frac{N_{c.Ed}}{N_{b.T.Rd}}`, '§6.3.1.1 (6.46)');
  } else T('Closed hollow sections: torsional buckling does not govern (not checked).');

  // ================= 8. LTB =================
  H6('Lateral-torsional buckling (§6.3.2)');
  if (I) {
    T('Mcr: SCI NCCI SN003b eq. (1), fork supports, k = kw = 1. L_LT = 0: no LTB (χ_LT = 1).');
    LINK('ltb', 'LTB moment cases – C1 and C2 (SN003b Tables 3.1 and 3.2)', () => ltbCaseTable(L));
    P('Case valid: 0, or a whole number 1 to 13', R`\delta_{LT}\coloneq${IF([R`n_{LT}=0`, '1'], [R`n_{LT}=\mathrm{floor}\left(n_{LT}\right)\land n_{LT}\ge1\land n_{LT}\le13`, '1'], [null, '0'])}`);
    P('', R`\delta_{LT}\ge1`);
    P('Moment distribution factor', R`C_{1}\coloneq${IF([R`n_{LT}=0`, 'C_{1.u}'], [null, R`\mathrm{linterp}\left(n_{t},C_{1.t},n_{LT}\right)`])}`, M(p3));
    P('Load height factor', R`C_{2}\coloneq${IF([R`n_{LT}=0`, 'C_{2.u}'], [null, R`\mathrm{linterp}\left(n_{t},C_{2.t},n_{LT}\right)`])}`, M(p3));
    P('Euler force over L_LT', R`N_{cr.LT}\coloneq${IF([R`L_{LT}>0\,\mathrm{m}`, R`\frac{\pi^2EI_{z}}{L_{LT}^2}`], [null, R`0\,\mathrm{kN}`])}`, M(kN));
    P('Elastic critical moment, SN003b (1)', R`M_{cr}\coloneq${IF([R`L_{LT}>0\,\mathrm{m}`, R`C_{1}N_{cr.LT}\left(\sqrt{\frac{I_{w}}{I_{z}}+\frac{GI_{t}}{N_{cr.LT}}+\left(C_{2}z_{g}\right)^2}-C_{2}z_{g}\right)`], [null, R`0\,\mathrm{kN}\cdot\mathrm{m}`])}`, M(kNm));
    P('Relative slenderness (0 when restrained)', R`\lambda_{LT}\coloneq${IF([R`L_{LT}>0\,\mathrm{m}`, R`\sqrt{\frac{W_{y}f_{y}}{M_{cr}}}`], [null, '0'])}`, M(p3));
    T('§6.3.2.3 (NA): rolled λ_LT,0 = 0.4, β = 0.75, curves h/b ≤ 2 b, ≤ 3.1 c, else d; welded (Section = 0)');
    T('λ_LT,0 = 0.2, β = 1, h/b ≤ 2 c, else d; f with k_c = 1/√C1. §6.3.2.2: Table 6.4, λ_LT,0 = 0.2, β = 1.');
    const NA = R`c_{NA}\ge1`;
    P('Imperfection factor, §6.3.2.3 with the NA (Section = 0: welded)', R`\alpha_{LT.NA}\coloneq${IF([R`\mathrm{Section}=0\land\frac{h}{b}\le2`, '0.49'], [R`\mathrm{Section}=0`, '0.76'], [R`\frac{h}{b}\le2`, '0.34'], [R`\frac{h}{b}\le3.1`, '0.49'], [null, '0.76'])}`, M({ precision: 2 }));
    P('Imperfection factor, §6.3.2.2, Table 6.4', R`\alpha_{LT.EN}\coloneq${curve(R`\alpha_{LT}`)}`, M({ precision: 2 }));
    P('Used', R`\alpha_{LT}\coloneq${IF([NA, R`\alpha_{LT.NA}`], [null, R`\alpha_{LT.EN}`])}`, M({ precision: 2 }));
    P('Plateau length', R`\lambda_{LT.0}\coloneq${IF([R`${NA}\land\mathrm{Section}>0`, '0.4'], [null, '0.2'])}`, M({ precision: 2 }));
    P('Factor β', R`\beta_{LT}\coloneq${IF([R`${NA}\land\mathrm{Section}>0`, '0.75'], [null, '1'])}`, M({ precision: 2 }));
    P('(6.56) / (6.57)', R`\Phi_{LT}\coloneq0.5\left(1+\alpha_{LT}\left(\lambda_{LT}-\lambda_{LT.0}\right)+\beta_{LT}\lambda_{LT}^2\right)`, M(p3, fr));
    P('Reduction factor', R`\chi_{LT.0}\coloneq${IF([R`\lambda_{LT}\le\lambda_{LT.0}`, '1'], [null, R`\min\left(1,\frac{1}{\lambda_{LT}^2},\frac{1}{\Phi_{LT}+\sqrt{\Phi_{LT}^2-\beta_{LT}\lambda_{LT}^2}}\right)`])}`, M(p3));
    P('Correction factor k_c = 1/√C1 (NA, rolled; else 1)', R`k_{c}\coloneq${IF([R`${NA}\land\mathrm{Section}>0`, R`\frac{1}{\sqrt{C_{1}}}`], [null, '1'])}`, M(p3));
    P('(6.58)', R`f_{LT}\coloneq\min\left(1,1-0.5\left(1-k_{c}\right)\left(1-2\left(\lambda_{LT}-0.8\right)^2\right)\right)`, M(p3, fr));
    P('Modified reduction factor', R`\chi_{LT}\coloneq${IF([R`\lambda_{LT}\le\lambda_{LT.0}`, '1'], [null, R`\min\left(1,\frac{1}{\lambda_{LT}^2},\frac{\chi_{LT.0}}{f_{LT}}\right)`])}`, M(p3));
  } else if (RHS) {
    T('Closed section: warping neglected, load at the shear centre. §6.3.2.3 with the Singapore / UK NA: λ_LT,0 = 0.4,');
    T('β = 0.75, hot-finished h/b ≤ 2 b, ≤ 3.1 c, else d; cold-formed h/b ≤ 2 c, else d; f with k_c = 1/√C1.');
    T('§6.3.2.2 (recommended): Table 6.4 other cross-sections, curve d, λ_LT,0 = 0.2, β = 1.');
    P('Mid-line corner radius', R`r_{m}\coloneq\frac{r_{o}+r_{i}}{2}`, M(mm, fr));
    P('Mid-line perimeter', R`p_{m}\coloneq2\left(h+b-2t\right)-2\left(4-\pi\right)r_{m}`, M(mm, fr));
    P('Enclosed area', R`A_{h}\coloneq\left(h-t\right)\left(b-t\right)-\left(4-\pi\right)r_{m}^2`, M({ displayUnit: 'cm^2', precision: 1 }, fr));
    P('Torsion constant (EN 10210-2 Annex B form)', R`I_{t}\coloneq\frac{t^3p_{m}}{3}+\frac{4tA_{h}^2}{p_{m}}`, M({ displayUnit: 'cm^4', precision: 0 }, fr));
    P('Elastic critical moment', R`M_{cr}\coloneq${IF([R`L_{LT}>0\,\mathrm{m}`, R`\frac{C_{1}\pi}{L_{LT}}\sqrt{EI_{z}GI_{t}}`], [null, R`0\,\mathrm{kN}\cdot\mathrm{m}`])}`, M(kNm));
    P('Relative slenderness (0 when restrained)', R`\lambda_{LT}\coloneq${IF([R`L_{LT}>0\,\mathrm{m}`, R`\sqrt{\frac{W_{y}f_{y}}{M_{cr}}}`], [null, '0'])}`, M(p3));
    const NA = R`c_{NA}\ge1`;
    P('Imperfection factor', R`\alpha_{LT}\coloneq${IF([R`${NA}\land\mathrm{CF}<1\land\frac{h}{b}\le2`, '0.34'], [R`${NA}\land\mathrm{CF}<1\land\frac{h}{b}\le3.1`, '0.49'], [R`${NA}\land\mathrm{CF}\ge1\land\frac{h}{b}\le2`, '0.49'], [null, '0.76'])}`, M({ precision: 2 }));
    P('Plateau length', R`\lambda_{LT.0}\coloneq${IF([NA, '0.4'], [null, '0.2'])}`, M({ precision: 2 }));
    P('Factor β', R`\beta_{LT}\coloneq${IF([NA, '0.75'], [null, '1'])}`, M({ precision: 2 }));
    P('(6.56) / (6.57)', R`\Phi_{LT}\coloneq0.5\left(1+\alpha_{LT}\left(\lambda_{LT}-\lambda_{LT.0}\right)+\beta_{LT}\lambda_{LT}^2\right)`, M(p3, fr));
    P('Reduction factor', R`\chi_{LT.0}\coloneq${IF([R`\lambda_{LT}\le\lambda_{LT.0}`, '1'], [null, R`\min\left(1,\frac{1}{\lambda_{LT}^2},\frac{1}{\Phi_{LT}+\sqrt{\Phi_{LT}^2-\beta_{LT}\lambda_{LT}^2}}\right)`])}`, M(p3));
    P('Correction factor k_c = 1/√C1 (NA; else 1)', R`k_{c}\coloneq${IF([NA, R`\frac{1}{\sqrt{C_{1}}}`], [null, '1'])}`, M(p3));
    P('(6.58)', R`f_{LT}\coloneq\min\left(1,1-0.5\left(1-k_{c}\right)\left(1-2\left(\lambda_{LT}-0.8\right)^2\right)\right)`, M(p3, fr));
    P('Modified reduction factor', R`\chi_{LT}\coloneq${IF([R`\lambda_{LT}\le\lambda_{LT.0}`, '1'], [null, R`\min\left(1,\frac{1}{\lambda_{LT}^2},\frac{\chi_{LT.0}}{f_{LT}}\right)`])}`, M(p3));
  } else {
    T('Circular hollow section: not susceptible to lateral-torsional buckling.');
    P('Reduction factor', R`\chi_{LT}\coloneq1`);
  }
  if (CHS) {
    P('Bending resistances with γM1 (same about both axes)', R`M_{y.Rk1}\coloneq\frac{Wf_{y}}{\gamma_{M1}}`, M(kNm, fr));
    P('', R`M_{z.Rk1}\coloneq M_{y.Rk1}`, M(kNm, fr));
  } else {
    P('Bending resistances with γM1', R`M_{y.Rk1}\coloneq\frac{W_{y}f_{y}}{\gamma_{M1}}`, M(kNm, fr));
    P('', R`M_{z.Rk1}\coloneq\frac{W_{z}f_{y}}{\gamma_{M1}}`, M(kNm, fr));
  }
  P('Buckling resistance moment (6.55)', R`M_{b.Rd}\coloneq\chi_{LT}M_{y.Rk1}`, M(kNm, fr));
  UR('Lateral-torsional buckling', 'LT', R`\frac{${aMy}}{M_{b.Rd}}`, '§6.3.2.1 (6.54)');

  // ================= 9. Interaction =================
  H6('Compression and bending (§6.3.3, Annex B)');
  T(I ? 'I/H: torsionally susceptible (Table B.2) when L_LT > 0, else Table B.1. Class 3: elastic columns.'
    : 'Hollow sections: not susceptible to torsional deformations, Table B.1. Class 3: elastic columns.');
  P('Axial ratios', R`n_{y}\coloneq\frac{N_{c.Ed}}{N_{b.y.Rd}}`, M(p3, fr));
  P('', R`n_{z}\coloneq\frac{N_{c.Ed}}{N_{b.z.Rd}}`, M(p3, fr));
  const PL = R`\mathrm{Class}\le2`;
  P('Table B.1', R`k_{yy}\coloneq${IF([PL, R`C_{my}\left(1+\min\left(\lambda_{y}-0.2,0.8\right)n_{y}\right)`], [null, R`C_{my}\left(1+\min\left(0.6\lambda_{y},0.6\right)n_{y}\right)`])}`, M(p3));
  P('Table B.1', R`k_{zz}\coloneq${IF([PL, I ? R`C_{mz}\left(1+\min\left(2\lambda_{z}-0.6,1.4\right)n_{z}\right)` : R`C_{mz}\left(1+\min\left(\lambda_{z}-0.2,0.8\right)n_{z}\right)`], [null, R`C_{mz}\left(1+\min\left(0.6\lambda_{z},0.6\right)n_{z}\right)`])}`, M(p3));
  P('Table B.1', R`k_{yz}\coloneq${IF([PL, R`0.6k_{zz}`], [null, R`k_{zz}`])}`, M(p3));
  const b1 = IF([PL, R`0.6k_{yy}`], [null, R`0.8k_{yy}`]);
  if (I) {
    const B2pl = IF([R`\lambda_{z}\ge0.4`, R`\max\left(1-\frac{0.1\lambda_{z}n_{z}}{C_{mLT}-0.25},1-\frac{0.1n_{z}}{C_{mLT}-0.25}\right)`], [null, R`\min\left(0.6+\lambda_{z},1-\frac{0.1\lambda_{z}n_{z}}{C_{mLT}-0.25}\right)`]);
    P('Table B.2 (torsionally susceptible), Class 1, 2', R`k_{zy.pl}\coloneq${B2pl}`, M(p3));
    P('Table B.2, Class 3', R`k_{zy.el}\coloneq\max\left(1-\frac{0.05\lambda_{z}n_{z}}{C_{mLT}-0.25},1-\frac{0.05n_{z}}{C_{mLT}-0.25}\right)`, M(p3, fr));
    P('Factor used', R`k_{zy}\coloneq${IF([R`L_{LT}=0\,\mathrm{m}`, b1], [PL, R`k_{zy.pl}`], [null, R`k_{zy.el}`])}`, M(p3));
  } else P('Table B.1', R`k_{zy}\coloneq${b1}`, M(p3));
  UR('Interaction (6.61)', '6.61', R`n_{y}+k_{yy}\frac{${aMy}}{M_{b.Rd}}+k_{yz}\frac{${aMz}}{M_{z.Rk1}}`, '§6.3.3 (6.61)');
  UR('Interaction (6.62)', '6.62', R`n_{z}+k_{zy}\frac{${aMy}}{M_{b.Rd}}+k_{zz}\frac{${aMz}}{M_{z.Rk1}}`, '§6.3.3 (6.62)');
  T('Cm from Table B.3 for the moment diagram between braced points; ΔM = 0 for Class 1 to 3.');

  // ================= 10. Summary =================
  H(2, '7. SUMMARY');
  T('Results apply only within the stated assumptions and scope; applicability is not checked.');
  const keys = [...(CHS ? ['V', 'N', 'M', 'sec'] : ['V.z', 'V.y', 'N', 'M.y', 'M.z', 'sec']), 'b.y', 'b.z', ...(I ? ['b.T'] : []), 'LT', '6.61', '6.62'];
  const GOV = R`\mathrm{UR}\coloneq\max\left(\mathrm{UR}_{6.2},\mathrm{UR}_{6.3}\right)`;
  const mk = ['b.y', 'b.z', 'b.T', 'LT', '6.61', '6.62'];
  const list = (ks) => ks.map((k) => R`\mathrm{UR}_{${k}}`).join(',');
  need(8);
  T('Each utilisation from sections 5 and 6; the class from section 4 decides plastic or elastic resistance.');
  const LABEL = { 'V.z': 'Shear along z, §6.2.6', 'V.y': 'Shear along y, §6.2.6', V: 'Shear, §6.2.6', N: 'Axial force, §6.2.3/6.2.4', 'M.y': 'Bending about y, §6.2.5', 'M.z': 'Bending about z, §6.2.5', M: 'Bending, §6.2.5',
    sec: 'Bending and axial force, §6.2.9', 'b.y': 'Flexural buckling y-y, §6.3.1', 'b.z': 'Flexural buckling z-z, §6.3.1', 'b.T': 'Torsional buckling, §6.3.1.4', LT: CHS ? 'Bending with γM1 (no LTB), §6.3.2' : 'Lateral-torsional buckling, §6.3.2', '6.61': 'Interaction (6.61), §6.3.3', '6.62': 'Interaction (6.62), §6.3.3' };
  need(4 + keys.length);
  for (const k of keys) P(LABEL[k], R`\mathrm{UR}_{${k}}=`, M(p3));
  KEEP(() => {
    P('Cross-section (§6.2)', R`\mathrm{UR}_{6.2}\coloneq\max\left(${list(keys.filter((k) => !mk.includes(k)))}\right)`, M(p3));
    P('Member (§6.3)', R`\mathrm{UR}_{6.3}\coloneq\max\left(${list(keys.filter((k) => mk.includes(k)))}\right)`, M(p3));
    P('Governing utilisation', GOV, M(p3));
    P('Section and member check', R`\mathrm{UR}\le1`);
  });

  const file = `Steel_Section_${shape}_EC3.mCCV`;
  finish({
    id: `tpl-steel-section-${shape.toLowerCase()}`, title: `Steel Beam-Column Check – ${shape === 'I' ? 'I/H' : shape} (EN 1993-1-1)`, reference: `CALC-ST-S${shape[0]}`, file,
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
