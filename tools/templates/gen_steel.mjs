// Steel beam-column (EN 1993-1-1:2005 + A1:2014): library or custom welded I/H section, classification,
// cross-section resistance, flexural / torsional / lateral-torsional buckling, Annex B interaction.
// Every result is a worksheet equation. Writes templates/Steel_Beam_Column_EC3.mCCV.
// Default data: JRC "Design of steel buildings with worked examples" (2014), R. Simões, Example 3 (HEB 320, S355).
import { createLayout, R } from './layout.mjs';
import { ltbCaseTable } from './ltbTable.mjs';
import sectionFormulae from '../../src/engineering/steel/sectionFormulae.json' with { type: 'json' };

const layout = createLayout({ idPrefix: 's_stl', sizesFile: 'sizes_steel.json' });
const { gap, LINK, H, T, P, ROW, S, GRAPH, M, mm, kN, kNm, MPa, fr, finish } = layout;

const IF = (...branches) => {
  const rows = branches.map(([c, v], i) => (c === null ? R`\mathrm{else}` : `${i ? R`\mathrm{else}\ ` : ''}\\mathrm{if}\\ ${c}`) + R`\\\quad\left\Vert\displaystyle ${v}\right.`);
  return R`\begin{array}{||l}` + rows.join(R`\\`) + R`\end{array}`;
};
const SEC = R`\mathrm{Section}`;
const curve = symbol => {
  const { branches, otherwise } = sectionFormulae.curves[symbol];
  return IF(...branches.map(({ condition, value }) => [condition, value]), [null, otherwise]);
};
const kNm0 = R`0\,\mathrm{kN}\cdot\mathrm{m}`;
const p3 = { precision: 3 };
const U = {};
const UR = (desc, name, latex, clause) => {
  U[name] = R`\mathrm{UR}_{${name}}\coloneq ${latex}`;
  P(desc, U[name], M(p3, fr));
  P(clause, R`\mathrm{UR}_{${name}}\le1`, M(p3));
};
const chiOf = (phi, lam) => R`\min\left(1,\frac{1}{${phi}+\sqrt{${phi}^2-${lam}^2}}\right)`;
const phiOf = (lam, alpha) => R`0.5\left(1+${alpha}\left(${lam}-0.2\right)+${lam}^2\right)`;

// ================= 1. Basis =================
H(1, 'STEEL BEAM-COLUMN CHECK – I/H SECTION (EC3)');
H(2, '1. DESIGN BASIS');
T('EN 1993-1-1:2005 + A1:2014. Doubly symmetric rolled or welded I/H, Class 1 to 3, uniform member.');
T('Cross-section resistance §6.2; flexural and torsional buckling §6.3.1; lateral-torsional buckling');
T('§6.3.2.2 (general case) with Mcr from SCI NCCI SN003b; interaction §6.3.3 with Annex B (Method 2).');
T('N positive in compression. Enter moments and shears as magnitudes. z is the web direction.');
T('Not covered: Class 4, tension, torsion, shear buckling, holes, fire, connections.');

// ================= 2. Inputs =================
H(2, '2. INPUTS');
H(3, '2.1 Material and partial factors');
P('Yield strength (reduce for thick flanges, EN 10025)', R`f_{y}\coloneq355\,\mathrm{MPa}`, M(MPa));
P('Elastic modulus', R`E\coloneq210\,\mathrm{GPa}`);
P('Shear modulus', R`G\coloneq81\,\mathrm{GPa}`);
P('Partial factor, cross-section resistance (National Annex)', R`\gamma_{M0}\coloneq1.0`);
P('Partial factor, member buckling (National Annex)', R`\gamma_{M1}\coloneq1.0`);
P('Shear area factor η, EN 1993-1-5 §5.1 (National Annex)', R`\eta\coloneq1.2`);
H(3, '2.2 Section');
P('Steel section (Browse)', R`${SEC}\coloneq1211`);
H(3, '2.3 Member');
P('Buckling length about y-y (major axis)', R`L_{cr.y}\coloneq4.335\,\mathrm{m}`);
P('Buckling length about z-z (minor axis)', R`L_{cr.z}\coloneq4.335\,\mathrm{m}`);
P('Buckling length for torsional buckling', R`L_{cr.T}\coloneq4.335\,\mathrm{m}`);
P('Length between lateral restraints (LTB)', R`L_{LT}\coloneq4.335\,\mathrm{m}`);
P('LTB moment case 1 to 13 (Annex A.1); 0 = use C1, C2 below', R`n_{LT}\coloneq6`);
P('User C1 (only when the case is 0)', R`C_{1.u}\coloneq1.0`);
P('User C2 (only when the case is 0)', R`C_{2.u}\coloneq0`);
P('Load height above the shear centre (destabilising positive)', R`z_{g}\coloneq0\,\mathrm{mm}`, M(mm));
P('End rotation on plan factor k (1 = free)', R`k\coloneq1.0`);
P('End warping factor kw (1 = free)', R`k_{w}\coloneq1.0`);
P('Equivalent uniform moment factor Cmy (Table B.3)', R`C_{my}\coloneq0.43`);
P('Equivalent uniform moment factor Cmz (Table B.3)', R`C_{mz}\coloneq1.0`);
P('Equivalent uniform moment factor CmLT (Table B.3)', R`C_{mLT}\coloneq0.43`);
H(3, '2.4 Design actions (ULS)');
P('Axial force, compression positive', R`N_{Ed}\coloneq1704\,\mathrm{kN}`, M(kN));
P('Bending moment about y-y (maximum along the member)', R`M_{y.Ed}\coloneq24.8\,\mathrm{kN}\cdot\mathrm{m}`, M(kNm));
P('Bending moment about z-z', R`M_{z.Ed}\coloneq${kNm0}`, M(kNm));
P('Shear force along z (web)', R`V_{z.Ed}\coloneq0\,\mathrm{kN}`, M(kN));
P('Shear force along y (flanges)', R`V_{y.Ed}\coloneq0\,\mathrm{kN}`, M(kN));

// ================= 3. Section properties =================
H(2, '3. SECTION PROPERTIES');
T('Browse: choose a section by name, or enter custom h, b, tf, tw; properties update automatically.');
T('Custom: r = 0, no weld metal; It / Iw: SCI P385 B.2.2 / B.3.1 thin-wall approximations.');
T('Custom shear areas: EN 1993-1-1 §6.2.6(3), conservative η = 1.0. Check project section tables.');
const PROPS = [['h', 'mm'], ['b', 'mm'], ['t_w', 'mm'], ['t_f', 'mm'], ['r', 'mm'], ['A', 'mm^2'], ['I_y', 'mm^4'], ['I_z', 'mm^4'],
  ['W_{el.y}', 'mm^3'], ['W_{el.z}', 'mm^3'], ['W_{pl.y}', 'mm^3'], ['W_{pl.z}', 'mm^3'], ['I_t', 'mm^4'], ['I_w', 'mm^6'], ['A_{v.y}', 'mm^2'], ['A_{v.z}', 'mm^2']];
const DISP = { 'mm': ['mm', 1], 'mm^2': ['cm^2', 1], 'mm^3': ['cm^3', 0], 'mm^4': ['cm^4', 0], 'mm^6': ['cm^6', 0] };
for (let i = 0; i < PROPS.length; i += 2) {
  ROW(PROPS.slice(i, i + 2).map(([sym, unit], j) => [[96, 396][j], R`${sym}\coloneq \operatorname{sectionProp}(${SEC},${i + j})`,
    { displayMode: 'result', displayUnit: DISP[unit][0], precision: DISP[unit][1] }]), 0.75);
}
gap(0.25);
const hw = R`\left(\frac{h}{2}-t_{f}\right)`;
GRAPH(260, { title: 'Section', xUnit: 'mm', yUnit: 'mm', equalAxes: true,
  series: [
    S('outline', '', [
      R`\mathrm{stack}\left(-\frac{b}{2},\frac{b}{2},\frac{b}{2},\frac{t_{w}}{2},\frac{t_{w}}{2},\frac{b}{2},\frac{b}{2},-\frac{b}{2},-\frac{b}{2},-\frac{t_{w}}{2},-\frac{t_{w}}{2},-\frac{b}{2},-\frac{b}{2}\right)`,
      R`\mathrm{stack}\left(\frac{h}{2},\frac{h}{2},${hw},${hw},-${hw},-${hw},-\frac{h}{2},-\frac{h}{2},-${hw},-${hw},${hw},${hw},\frac{h}{2}\right)`,
    ], 'line', '#1e3a5f', 2),
  ] });

// ================= 4. Classification =================
H(2, '4. CLASSIFICATION (§5.5, Table 5.2)');
P('Material parameter ε', R`\varepsilon\coloneq\sqrt{\frac{235\,\mathrm{MPa}}{f_{y}}}`, M(p3, fr));
H(3, '4.1 Flange (outstand in compression)');
P('Flange outstand', R`c_{f}\coloneq\frac{b-t_{w}-2r}{2}`, M(mm, fr));
P('Flange slenderness c/(t·ε): limits 9, 10, 14', R`\beta_{f}\coloneq\frac{c_{f}}{t_{f}\varepsilon}`, M({ precision: 2 }, fr));
P('Flange class', R`\mathrm{Class}_{f}\coloneq${IF([R`\beta_{f}\le9`, '1'], [R`\beta_{f}\le10`, '2'], [R`\beta_{f}\le14`, '3'], [null, '4'])}`);
H(3, '4.2 Web (internal part)');
T('Bending with compression is used for My with Mz = 0; otherwise the web is taken in uniform compression.');
P('Web depth between fillets', R`c_{w}\coloneq h-2t_{f}-2r`, M(mm, fr));
P('Compressed part of the web at full plasticity', R`\alpha_{w}\coloneq${IF([R`M_{y.Ed}>${kNm0}\land M_{z.Ed}=${kNm0}`, R`\min\left(1,0.5\left(1+\frac{N_{Ed}}{c_{w}t_{w}f_{y}}\right)\right)`], [null, '1'])}`, M(p3));
P('Elastic stress ratio (compression positive)', R`\psi_{w}\coloneq${IF([R`M_{y.Ed}>${kNm0}\land M_{z.Ed}=${kNm0}`, R`\max\left(-3,\frac{\frac{N_{Ed}}{A}-\frac{M_{y.Ed}c_{w}}{2I_{y}}}{\frac{N_{Ed}}{A}+\frac{M_{y.Ed}c_{w}}{2I_{y}}}\right)`], [null, '1'])}`, M(p3));
P('Class 1 limit of c/(t·ε)', R`\beta_{w1}\coloneq${IF([R`\alpha_{w}>0.5`, R`\frac{396}{13\alpha_{w}-1}`], [null, R`\frac{36}{\max\left(\alpha_{w},0.01\right)}`])}`, M({ precision: 1 }));
P('Class 2 limit', R`\beta_{w2}\coloneq${IF([R`\alpha_{w}>0.5`, R`\frac{456}{13\alpha_{w}-1}`], [null, R`\frac{41.5}{\max\left(\alpha_{w},0.01\right)}`])}`, M({ precision: 1 }));
P('Class 3 limit', R`\beta_{w3}\coloneq${IF([R`\psi_{w}>-1`, R`\frac{42}{0.67+0.33\psi_{w}}`], [null, R`62\left(1-\psi_{w}\right)\sqrt{-\psi_{w}}`])}`, M({ precision: 1 }));
P('Web slenderness c/(t·ε)', R`\beta_{w}\coloneq\frac{c_{w}}{t_{w}\varepsilon}`, M({ precision: 2 }, fr));
P('Web class', R`\mathrm{Class}_{w}\coloneq${IF([R`\beta_{w}\le\beta_{w1}`, '1'], [R`\beta_{w}\le\beta_{w2}`, '2'], [R`\beta_{w}\le\beta_{w3}`, '3'], [null, '4'])}`);
H(3, '4.3 Section class');
P('Class of the cross-section', R`\mathrm{Class}\coloneq\max\left(\mathrm{Class}_{f},\mathrm{Class}_{w}\right)`, M(fr));
P('Class 4 (effective section) is not covered', R`\mathrm{Class}\le3`);

// ================= 5. Cross-section resistance =================
H(2, '5. CROSS-SECTION RESISTANCE (§6.2)');
H(3, '5.1 Shear (§6.2.6)');
P('Plastic shear resistance along z', R`V_{pl.z.Rd}\coloneq\frac{A_{v.z}f_{y}}{\sqrt{3}\gamma_{M0}}`, M(kN, fr));
P('Plastic shear resistance along y', R`V_{pl.y.Rd}\coloneq\frac{A_{v.y}f_{y}}{\sqrt{3}\gamma_{M0}}`, M(kN, fr));
UR('Shear along z', 'V.z', R`\frac{V_{z.Ed}}{V_{pl.z.Rd}}`, '§6.2.6 (6.17)');
UR('Shear along y', 'V.y', R`\frac{V_{y.Ed}}{V_{pl.y.Rd}}`, '§6.2.6 (6.17)');
P('No shear buckling check needed, §6.2.6(6)', R`\frac{h-2t_{f}}{t_{w}}\le\frac{72\varepsilon}{\eta}`, M({ precision: 1 }));
const RHO = (d) => IF([R`\mathrm{UR}_{V.${d}}>0.5`, R`\min\left(1,\left(2\mathrm{UR}_{V.${d}}-1\right)^2\right)`], [null, '0']);
P('Reduction for shear above 0.5 Vpl (§6.2.8), along z', R`\rho_{z}\coloneq${RHO('z')}`, M(p3));
P('Along y', R`\rho_{y}\coloneq${RHO('y')}`, M(p3));
P('Larger of both directions', R`\rho\coloneq\max\left(\rho_{z},\rho_{y}\right)`, M(p3, fr));
T('The reduction (1 − ρ) is applied to the whole section (conservative).');
H(3, '5.2 Compression and bending (§6.2.4, §6.2.5)');
P('Compression resistance (6.10)', R`N_{c.Rd}\coloneq\frac{Af_{y}}{\gamma_{M0}}`, M(kN, fr));
P('Section modulus about y: plastic for Class 1, 2; elastic for Class 3', R`W_{y}\coloneq${IF([R`\mathrm{Class}\le2`, 'W_{pl.y}'], [null, 'W_{el.y}'])}`, M({ displayUnit: 'cm^3', precision: 0 }));
P('Section modulus about z', R`W_{z}\coloneq${IF([R`\mathrm{Class}\le2`, 'W_{pl.z}'], [null, 'W_{el.z}'])}`, M({ displayUnit: 'cm^3', precision: 0 }));
P('Bending resistance about y (6.13), (6.14), reduced for shear', R`M_{c.y.Rd}\coloneq\frac{W_{y}f_{y}\left(1-\rho\right)}{\gamma_{M0}}`, M(kNm, fr));
P('Bending resistance about z', R`M_{c.z.Rd}\coloneq\frac{W_{z}f_{y}\left(1-\rho\right)}{\gamma_{M0}}`, M(kNm, fr));
UR('Compression', 'N', R`\frac{N_{Ed}}{N_{c.Rd}}`, '§6.2.4 (6.9)');
UR('Bending about y', 'M.y', R`\frac{M_{y.Ed}}{M_{c.y.Rd}}`, '§6.2.5 (6.12)');
UR('Bending about z', 'M.z', R`\frac{M_{z.Ed}}{M_{c.z.Rd}}`, '§6.2.5 (6.12)');
UR('Combined N + My + Mz, linear summation', 'sec', R`\frac{N_{Ed}}{N_{c.Rd}\left(1-\rho\right)}+\mathrm{UR}_{M.y}+\mathrm{UR}_{M.z}`, '§6.2.1(7) (6.2)');

// ================= 6. Flexural and torsional buckling =================
H(2, '6. BUCKLING IN COMPRESSION (§6.3.1)');
H(3, '6.1 Buckling curves (Table 6.2, rolled / welded I/H, S235 to S420)');
P('Imperfection factor about y: Table 6.2, welded when Section = 0', R`\alpha_{y}\coloneq${curve(R`\alpha_{y}`)}`);
P('Imperfection factor about z: Table 6.2, welded when Section = 0', R`\alpha_{z}\coloneq${curve(R`\alpha_{z}`)}`);
P('Steel grade within the range of these curves', R`f_{y}\le460\,\mathrm{MPa}`, M(MPa));
H(3, '6.2 Flexural buckling about y-y');
P('Elastic critical force', R`N_{cr.y}\coloneq\frac{\pi^2EI_{y}}{L_{cr.y}^2}`, M(kN, fr));
P('Relative slenderness (6.50)', R`\lambda_{y}\coloneq\sqrt{\frac{Af_{y}}{N_{cr.y}}}`, M(p3, fr));
P('', R`\Phi_{y}\coloneq${phiOf(R`\lambda_{y}`, R`\alpha_{y}`)}`, M(p3, fr));
P('Reduction factor (6.49)', R`\chi_{y}\coloneq${chiOf(R`\Phi_{y}`, R`\lambda_{y}`)}`, M(p3, fr));
P('Buckling resistance (6.47)', R`N_{b.y.Rd}\coloneq\frac{\chi_{y}Af_{y}}{\gamma_{M1}}`, M(kN, fr));
UR('Flexural buckling about y', 'b.y', R`\frac{N_{Ed}}{N_{b.y.Rd}}`, '§6.3.1.1 (6.46)');
H(3, '6.3 Flexural buckling about z-z');
P('Elastic critical force', R`N_{cr.z}\coloneq\frac{\pi^2EI_{z}}{L_{cr.z}^2}`, M(kN, fr));
P('Relative slenderness', R`\lambda_{z}\coloneq\sqrt{\frac{Af_{y}}{N_{cr.z}}}`, M(p3, fr));
P('', R`\Phi_{z}\coloneq${phiOf(R`\lambda_{z}`, R`\alpha_{z}`)}`, M(p3, fr));
P('Reduction factor', R`\chi_{z}\coloneq${chiOf(R`\Phi_{z}`, R`\lambda_{z}`)}`, M(p3, fr));
P('Buckling resistance', R`N_{b.z.Rd}\coloneq\frac{\chi_{z}Af_{y}}{\gamma_{M1}}`, M(kN, fr));
UR('Flexural buckling about z', 'b.z', R`\frac{N_{Ed}}{N_{b.z.Rd}}`, '§6.3.1.1 (6.46)');
H(3, '6.4 Torsional buckling (§6.3.1.4)');
P('Polar radius of gyration squared', R`i_{0}\coloneq\sqrt{\frac{I_{y}+I_{z}}{A}}`, M(mm, fr));
P('Elastic critical force', R`N_{cr.T}\coloneq\frac{1}{i_{0}^2}\left(GI_{t}+\frac{\pi^2EI_{w}}{L_{cr.T}^2}\right)`, M(kN, fr));
P('Relative slenderness (6.52)', R`\lambda_{T}\coloneq\sqrt{\frac{Af_{y}}{N_{cr.T}}}`, M(p3, fr));
P('Curve for z-z, §6.3.1.4(3)', R`\Phi_{T}\coloneq${phiOf(R`\lambda_{T}`, R`\alpha_{z}`)}`, M(p3, fr));
P('Reduction factor', R`\chi_{T}\coloneq${chiOf(R`\Phi_{T}`, R`\lambda_{T}`)}`, M(p3, fr));
P('Buckling resistance', R`N_{b.T.Rd}\coloneq\frac{\chi_{T}Af_{y}}{\gamma_{M1}}`, M(kN, fr));
UR('Torsional buckling', 'b.T', R`\frac{N_{Ed}}{N_{b.T.Rd}}`, '§6.3.1.1 (6.46)');

// ================= 7. LTB =================
H(2, '7. LATERAL-TORSIONAL BUCKLING (§6.3.2.2)');
T('Mcr: SCI NCCI SN003b eq. (1), fork supports. Tabulated C1, C2 are for k = kw = 1 only.');
LINK('ltb', 'LTB moment cases – C1 and C2 (SN003b Tables 3.1 and 3.2)', () => ltbCaseTable(layout));
P('Case valid (1 = yes): 0, or a whole number 1 to 13 with k = kw = 1', R`\delta_{LT}\coloneq${IF([R`n_{LT}=0`, '1'], [R`n_{LT}=\mathrm{floor}\left(n_{LT}\right)\land n_{LT}\ge1\land n_{LT}\le13\land k=1\land k_{w}=1`, '1'], [null, '0'])}`);
P('Tabulated C1, C2 are for k = kw = 1', R`\delta_{LT}\ge1`);
P('Moment distribution factor', R`C_{1}\coloneq${IF([R`n_{LT}=0`, 'C_{1.u}'], [null, R`\mathrm{linterp}\left(n_{t},C_{1.t},n_{LT}\right)`])}`, M(p3));
P('Load height factor', R`C_{2}\coloneq${IF([R`n_{LT}=0`, 'C_{2.u}'], [null, R`\mathrm{linterp}\left(n_{t},C_{2.t},n_{LT}\right)`])}`, M(p3));
P('Euler force of the compression flange length', R`N_{cr.LT}\coloneq\frac{\pi^2EI_{z}}{\left(kL_{LT}\right)^2}`, M(kN, fr));
P('Elastic critical moment, SN003b (1)', R`M_{cr}\coloneq C_{1}N_{cr.LT}\left(\sqrt{\left(\frac{k}{k_{w}}\right)^2\frac{I_{w}}{I_{z}}+\frac{GI_{t}}{N_{cr.LT}}+\left(C_{2}z_{g}\right)^2}-C_{2}z_{g}\right)`, { wide: true, ...M(kNm, fr) });
P('Relative slenderness (6.56)', R`\lambda_{LT}\coloneq\sqrt{\frac{W_{y}f_{y}}{M_{cr}}}`, M(p3, fr));
P('Imperfection factor, Table 6.4: rolled a/b; custom welded c/d', R`\alpha_{LT}\coloneq${curve(R`\alpha_{LT}`)}`);
P('', R`\Phi_{LT}\coloneq${phiOf(R`\lambda_{LT}`, R`\alpha_{LT}`)}`, M(p3, fr));
P('Reduction factor (6.56)', R`\chi_{LT}\coloneq${chiOf(R`\Phi_{LT}`, R`\lambda_{LT}`)}`, M(p3, fr));
P('Buckling resistance moment (6.55)', R`M_{b.Rd}\coloneq\frac{\chi_{LT}W_{y}f_{y}}{\gamma_{M1}}`, M(kNm, fr));
UR('Lateral-torsional buckling', 'LT', R`\frac{M_{y.Ed}}{M_{b.Rd}}`, '§6.3.2.1 (6.54)');

// ================= 8. Interaction =================
H(2, '8. BENDING AND AXIAL COMPRESSION (§6.3.3, Annex B)');
T('Interaction factors: Table B.1 and B.2, I-sections, Class 1 and 2, member susceptible to torsional');
T('deformations. Cm factors are inputs (Table B.3). High shear (ρ > 0) needs a separate check.');
P('Plastic interaction factors apply to Class 1 and 2', R`\mathrm{Class}\le2`);
P('Branch of kzy used here needs λz ≥ 0.4', R`\lambda_{z}\ge0.4`, M(p3));
P('Axial ratios', R`n_{y}\coloneq\frac{N_{Ed}}{N_{b.y.Rd}}`, M(p3, fr));
P('', R`n_{z}\coloneq\frac{N_{Ed}}{N_{b.z.Rd}}`, M(p3, fr));
P('Table B.1', R`k_{yy}\coloneq C_{my}\left(1+\min\left(\lambda_{y}-0.2,0.8\right)n_{y}\right)`, M(p3, fr));
P('Table B.1', R`k_{zz}\coloneq C_{mz}\left(1+\min\left(2\lambda_{z}-0.6,1.4\right)n_{z}\right)`, M(p3, fr));
P('Table B.1', R`k_{yz}\coloneq0.6k_{zz}`, M(p3, fr));
P('Table B.2', R`k_{zy}\coloneq\max\left(1-\frac{0.1\lambda_{z}n_{z}}{C_{mLT}-0.25},1-\frac{0.1n_{z}}{C_{mLT}-0.25}\right)`, M(p3, fr));
P('Minor-axis bending resistance with γM1', R`M_{z.Rd1}\coloneq\frac{W_{z}f_{y}}{\gamma_{M1}}`, M(kNm, fr));
UR('Interaction (6.61)', '6.61', R`n_{y}+k_{yy}\frac{M_{y.Ed}}{M_{b.Rd}}+k_{yz}\frac{M_{z.Ed}}{M_{z.Rd1}}`, '§6.3.3 (6.61)');
UR('Interaction (6.62)', '6.62', R`n_{z}+k_{zy}\frac{M_{y.Ed}}{M_{b.Rd}}+k_{zz}\frac{M_{z.Ed}}{M_{z.Rd1}}`, '§6.3.3 (6.62)');

// ================= 9. Summary =================
H(2, '9. SUMMARY');
const GOV = R`\mathrm{UR}\coloneq\max\left(\mathrm{UR}_{V.z},\mathrm{UR}_{V.y},\mathrm{UR}_{sec},\mathrm{UR}_{b.y},\mathrm{UR}_{b.z},\mathrm{UR}_{b.T},\mathrm{UR}_{LT},\mathrm{UR}_{6.61},\mathrm{UR}_{6.62}\right)`;
P('Governing utilisation', GOV, M(p3));
P('Member check', R`\mathrm{UR}\le1`, M(p3));

const lc = (id, name, sec, n, my, mz, vz, lcr, llt, nlt) => ({ id, name, values: { sec, n, my, mz, vz, lcry: lcr, lcrz: lcr, llt, nlt } });
finish({
  id: 'tpl-steel-beam-column', title: 'Steel Beam-Column Check (EN 1993-1-1)', reference: 'CALC-ST-01', file: 'Steel_Beam_Column_EC3.mCCV',
  batch: {
    title: 'Members and load cases',
    inputs: [
      ['sec', 'Section ID', R`${SEC}\coloneq1211`],
      ['n', 'N_Ed', R`N_{Ed}\coloneq1704\,\mathrm{kN}`],
      ['my', 'M_y,Ed', R`M_{y.Ed}\coloneq24.8\,\mathrm{kN}\cdot\mathrm{m}`],
      ['mz', 'M_z,Ed', R`M_{z.Ed}\coloneq${kNm0}`],
      ['vz', 'V_z,Ed', R`V_{z.Ed}\coloneq0\,\mathrm{kN}`],
      ['lcry', 'L_cr,y', R`L_{cr.y}\coloneq4.335\,\mathrm{m}`],
      ['lcrz', 'L_cr,z', R`L_{cr.z}\coloneq4.335\,\mathrm{m}`],
      ['llt', 'L_LT', R`L_{LT}\coloneq4.335\,\mathrm{m}`],
      ['nlt', 'LTB case', R`n_{LT}\coloneq6`],
    ],
    outputs: [
      ['cls', 'Class', R`\mathrm{Class}\coloneq\max\left(\mathrm{Class}_{f},\mathrm{Class}_{w}\right)`],
      ['ursec', 'UR section', U.sec],
      ['urby', 'UR buckling y', U['b.y']],
      ['urbz', 'UR buckling z', U['b.z']],
      ['urlt', 'UR LTB', U.LT],
      ['ur61', 'UR (6.61)', U['6.61']],
      ['ur62', 'UR (6.62)', U['6.62']],
      ['ur', 'UR', GOV],
      ['ok', 'Member', R`\mathrm{UR}\le1`],
    ],
    rows: [
      lc('m1', 'C1 HEB 320 (Simões ex. 3)', 1211, 1704, 24.8, 0, 0, 4.335, 4.335, 6),
      lc('m2', 'C2 HEB 320, higher moment', 1211, 1200, 150, 20, 60, 4.335, 4.335, 5),
      lc('m3', 'B1 IPE 400 beam, UDL', 1013, 0, 110, 0, 75, 6, 6, 10),
    ],
  },
});
