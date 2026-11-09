// RC rectangular column (EN 1992-1-1, shear EN 1992-1-1:2023): biaxial P–Mθ (fibres), UR checks, shear. Writes templates/RC_Rectangular_Column_Check.mCalcCanvas.
import { createLayout, R } from './layout.mjs';

const { st, need, gap, LINK, textAt, H, T, P, ROW, S, GRAPH, colTable, cv, M, mm, mm2, kN, kNm, MPa, deg, fr, fo, FU, finish } =
  createLayout({ idPrefix: 's_rect', sizesFile: 'sizes_rect.json' });



// ================= 1. Basis =================
H(1, 'RC RECTANGULAR COLUMN CHECK (EC2)');
H(2, '1. DESIGN BASIS');
T('EN 1992-1-1. Fibres, strain pivots A/B/C; neutral axis rotated to the MEd direction (P–Mθ).');
T('Flexure: ray from 0 through (MEd, NEd) to the P–Mθ curve (UR_M). fcd and shear (links):');
T('EN 1992-1-1:2023 (5.3), §8.2.3.');
T('x along b, y along h; N positive in compression. Annex A.n is calculated at its link ▸.');

// ================= 2. Inputs =================
H(2, '2. INPUTS');
H(3, '2.1 Materials');
P('Characteristic concrete cylinder strength', R`f_{ck}\coloneq35\,\mathrm{MPa}`);
P('Partial factor for concrete', R`\gamma_{C}\coloneq1.5`);
P('Sustained-load factor (5.3): 0.85, or 1.0 if loaded after 90 days', R`k_{tc}\coloneq0.85`);
P('Yield strength of longitudinal bars', R`f_{yk}\coloneq500\,\mathrm{MPa}`);
P('Yield strength of links', R`f_{ywk}\coloneq500\,\mathrm{MPa}`);
P('Ductility class of the links: 1 = class A, 0 = class B or C', R`\delta_{A}\coloneq0`);
P('Partial factor for reinforcement', R`\gamma_{S}\coloneq1.15`);
P('Elastic modulus of reinforcement', R`E_{s}\coloneq200\,\mathrm{GPa}`);
P('Ultimate concrete strain (Table 3.1)', R`\varepsilon_{cu2}\coloneq0.0035`);
P('Concrete strain at peak stress', R`\varepsilon_{c2}\coloneq0.002`);
P('Design limit of steel strain, 0.9·εuk', R`\varepsilon_{ud}\coloneq0.045`);
H(3, '2.2 Section and reinforcement');
P('Section width (along x)', R`b\coloneq500\,\mathrm{mm}`, M(mm));
P('Section depth (along y)', R`h\coloneq800\,\mathrm{mm}`, M(mm));
P('Nominal cover to the links', R`c_{nom}\coloneq40\,\mathrm{mm}`, M(mm));
P('Longitudinal bar diameter', R`\phi\coloneq25\,\mathrm{mm}`, M(mm));
P('Bars along each b face, corners included (≥ 2)', R`n_{b}\coloneq4`);
P('Bars along each h face, corners included (≥ 2)', R`n_{h}\coloneq6`);
P('Tie (link) diameter', R`\phi_{w}\coloneq10\,\mathrm{mm}`, M(mm));
P('Tie spacing along the column', R`s\coloneq150\,\mathrm{mm}`, M(mm));
T('Tie legs are arranged automatically (EC2 9.5.3(6): bars ≤ 150 mm from a restrained bar).');
H(3, '2.3 Integration');
P('Concrete fibres along each side (nf × nf grid)', R`n_{f}\coloneq30`);
H(3, '2.4 Design actions (ULS)');
P('Axial force, compression positive', R`N_{Ed}\coloneq3000\,\mathrm{kN}`, M(kN));
P('Moment about x (compression on +y face when positive)', R`M_{Ed.x}\coloneq600\,\mathrm{kN}\cdot\mathrm{m}`, M(kNm));
P('Moment about y (compression on +x face when positive)', R`M_{Ed.y}\coloneq300\,\mathrm{kN}\cdot\mathrm{m}`, M(kNm));
P('Shear force along y', R`V_{Ed.y}\coloneq400\,\mathrm{kN}`, M(kN));
P('Shear force along x', R`V_{Ed.x}\coloneq200\,\mathrm{kN}`, M(kN));

// ================= 3. Design values =================
H(2, '3. DESIGN VALUES');
P('Effective strength factor (5.4), fck,ref = 40 MPa', R`\eta_{cc}\coloneq\min\left(\left(\frac{40\,\mathrm{MPa}}{f_{ck}}\right)^{\frac{1}{3}},1\right)`, M({ precision: 3 }, fr));
P('Design compressive strength (5.3)', R`f_{cd}\coloneq\frac{\eta_{cc}k_{tc}f_{ck}}{\gamma_{C}}`, M(MPa, { precision: 2 }, fr));
P('Design yield strength of longitudinal bars', R`f_{yd}\coloneq\frac{f_{yk}}{\gamma_{S}}`, M(MPa, fr));
P('Design yield strength of links', R`f_{ywd}\coloneq\frac{f_{ywk}}{\gamma_{S}}`, M(MPa, fr));
P('Design yield strain of longitudinal bars', R`\varepsilon_{yd}\coloneq\frac{f_{yd}}{E_{s}}`, M({ precision: 5 }, fr));

// ================= 4. Geometry =================
H(2, '4. SECTION GEOMETRY');
H(3, '4.1 Bars');
LINK('ax_bars', 'Bar layout and coordinates', () => {
P('Half-distance between corner bar centres along x', R`a_{x}\coloneq\frac{b}{2}-c_{nom}-\phi_{w}-\frac{\phi}{2}`, M(mm, fr));
P('Half-distance between corner bar centres along y', R`a_{y}\coloneq\frac{h}{2}-c_{nom}-\phi_{w}-\frac{\phi}{2}`, M(mm, fr));
P('Bar spacing (centres) along b', R`s_{x}\coloneq\frac{2a_{x}}{n_{b}-1}`, M(mm, fr));
P('Bar spacing (centres) along h', R`s_{y}\coloneq\frac{2a_{y}}{n_{h}-1}`, M(mm, fr));
P('Total number of bars', R`n_{bar}\coloneq2n_{b}+2\left(n_{h}-2\right)`);
T('Bars are numbered: top row (left to right), bottom row, left side, right side (corners once).');
P('Bar index', R`k_{s}\coloneq\mathrm{seq}\left(0,n_{bar}-1\right)`, M(fo));
P('x of each bar', R`x_{s}\coloneq\begin{array}{||l}\mathrm{if}\ k_{s}<n_{b}\\\quad\left\Vert\displaystyle -a_{x}+k_{s}s_{x}\right.\\\mathrm{else}\ \mathrm{if}\ k_{s}<2n_{b}\\\quad\left\Vert\displaystyle -a_{x}+\left(k_{s}-n_{b}\right)s_{x}\right.\\\mathrm{else}\ \mathrm{if}\ k_{s}<2n_{b}+n_{h}-2\\\quad\left\Vert\displaystyle -a_{x}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle a_{x}\right.\end{array}`, M(fo));
P('y of each bar', R`y_{s}\coloneq\begin{array}{||l}\mathrm{if}\ k_{s}<n_{b}\\\quad\left\Vert\displaystyle a_{y}\right.\\\mathrm{else}\ \mathrm{if}\ k_{s}<2n_{b}\\\quad\left\Vert\displaystyle -a_{y}\right.\\\mathrm{else}\ \mathrm{if}\ k_{s}<2n_{b}+n_{h}-2\\\quad\left\Vert\displaystyle -a_{y}+\left(k_{s}-2n_{b}+1\right)s_{y}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle -a_{y}+\left(k_{s}-2n_{b}-n_{h}+3\right)s_{y}\right.\end{array}`, M(fo));
need(1 + colTable(16));
textAt(st.page, st.row, 'Bar table', { x: 96, w: 280, size: 13, color: '#1e3a5f' });
st.row += 0.5;
ROW([[96, 'k_{s}=', cv('', 0)], [176, 'x_{s}=', cv('mm', 0)], [296, 'y_{s}=', cv('mm', 0)]], colTable(16));
});
P('Bar spacing (centres) along b', R`s_{x}=`, M(mm));
P('Bar spacing (centres) along h', R`s_{y}=`, M(mm));
P('Clear spacing along b, ≥ max(φ, 20 mm) (8.2)', R`s_{x}-\phi\ge\max\left(\phi,20\,\mathrm{mm}\right)`, M(mm));
P('Clear spacing along h', R`s_{y}-\phi\ge\max\left(\phi,20\,\mathrm{mm}\right)`, M(mm));
P('Total number of bars', R`n_{bar}=`);
H(3, '4.2 Ties (EC2 9.5.3)');
P('Tie diameter ≥ max(6 mm, φ/4), 9.5.3(1)', R`\phi_{w}\ge\max\left(6\,\mathrm{mm},\frac{\phi}{4}\right)`, M(mm));
P('Max. tie spacing min(20φ, b, h, 400 mm), 9.5.3(3)', R`s\le\min\left(20\phi,b,h,400\,\mathrm{mm}\right)`, M(mm));
P('Bar spacing on a b face, 9.5.3(6)', R`s_{x}\le150\,\mathrm{mm}`, M(mm));
P('Bar spacing on an h face', R`s_{y}\le150\,\mathrm{mm}`, M(mm));
LINK('ax_tielegs', 'Tie leg arrangement (EC2 9.5.3(6))', () => {
T('No inner ties when every bar is within 150 mm of a corner bar. Otherwise corners and every');
T('other bar are restrained, symmetric about the face centre.');
T('Each mirrored pair is held by one inner closed tie; a single middle bar gets a cross-tie.');
T('Every unrestrained bar is next to a restrained one, so a bar spacing ≤ 150 mm suffices.');
P('Farthest bar from a corner on a b face', R`l_{b}\coloneq\mathrm{floor}\left(\frac{n_{b}-1}{2}\right)s_{x}`, M(mm, fr));
P('Farthest bar from a corner on an h face', R`l_{h}\coloneq\mathrm{floor}\left(\frac{n_{h}-1}{2}\right)s_{y}`, M(mm, fr));
P('Inner ties across the depth (pairs 2i and nb − 1 − 2i on the b faces)', R`q_{b}\coloneq\begin{array}{||l}\mathrm{if}\ l_{b}>150\,\mathrm{mm}\\\quad\left\Vert\displaystyle \mathrm{floor}\left(\frac{n_{b}-1}{4}\right)\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 0\right.\end{array}`);
P('Inner ties across the width (pairs on the h faces)', R`q_{h}\coloneq\begin{array}{||l}\mathrm{if}\ l_{h}>150\,\mathrm{mm}\\\quad\left\Vert\displaystyle \mathrm{floor}\left(\frac{n_{h}-1}{4}\right)\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 0\right.\end{array}`);
P('Last pair is a single middle bar (cross-tie, one leg): 1, else 0', R`m_{b}\coloneq\begin{array}{||l}\mathrm{if}\ q_{b}\ge1\land4q_{b}=n_{b}-1\\\quad\left\Vert\displaystyle 1\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 0\right.\end{array}`);
P('', R`m_{h}\coloneq\begin{array}{||l}\mathrm{if}\ q_{h}\ge1\land4q_{h}=n_{h}-1\\\quad\left\Vert\displaystyle 1\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 0\right.\end{array}`);
P('Full-depth tie legs parallel to y (resist VEd,y)', R`n_{w.y}\coloneq2+2q_{b}-m_{b}`);
P('Full-width tie legs parallel to x (resist VEd,x)', R`n_{w.x}\coloneq2+2q_{h}-m_{h}`);
});
P('Full-depth tie legs parallel to y (resist VEd,y)', R`n_{w.y}=`);
P('Full-width tie legs parallel to x (resist VEd,x)', R`n_{w.x}=`);
H(3, '4.3 Concrete fibres and section');
LINK('ax_fibres', 'Concrete fibres', () => {
T('The concrete is cut into an nf × nf grid of fibres; each carries the stress at its centre strain.');
P('Fibre index (row by row)', R`f\coloneq\mathrm{seq}\left(0,n_{f}^2-1\right)`, M(fo));
P('Fibre centres', R`x_{f}\coloneq\left(f-n_{f}\mathrm{floor}\left(\frac{f}{n_{f}}\right)+0.5\right)\frac{b}{n_{f}}-\frac{b}{2}`, M(fo));
P('', R`y_{f}\coloneq\left(\mathrm{floor}\left(\frac{f}{n_{f}}\right)+0.5\right)\frac{h}{n_{f}}-\frac{h}{2}`, M(fo));
P('Area of one fibre', R`A_{f}\coloneq\frac{bh}{n_{f}^2}`, M(mm2, fr));
});

LINK('ax_ties', 'Tie drawing (data of the section figure)', () => {
T('Ties wrap the bars: each corner is an arc centred on the bar. Closed ties end in two 135°');
T('hooks at the top-left bar; cross-ties (legs) have a 135° hook at both ends.');
P('Tie centreline radius round a bar', R`\delta_{w}\coloneq\frac{\phi+\phi_{w}}{2}`, M(mm, fr));
P('Hook extension past the bend, EC2 Fig. 8.5', R`L_{w}\coloneq\max\left(5\phi_{w},50\,\mathrm{mm}\right)`, M(mm, fr));
P('Points drawn per arc', R`n_{a}\coloneq7`);
P('Inner closed ties across the depth (a middle bar is a leg)', R`Q_{b}\coloneq q_{b}-m_{b}`, M(fr));
P('Inner closed ties across the width', R`Q_{h}\coloneq q_{h}-m_{h}`, M(fr));
P('Closed ties: the outer tie and the inner ties', R`n_{T}\coloneq1+Q_{b}+Q_{h}`, M(fr));
P('Points per closed tie: 5 arcs and 2 hook ends', R`M_{T}\coloneq5n_{a}+2`, M(fr));
P('Tie t (0 = outer): half-distance between its corner bars along x', R`b_{T}\left(t\right)\coloneq\begin{array}{||l}\mathrm{if}\ t\le Q_{b}\\\quad\left\Vert\displaystyle a_{x}-2t\cdot s_{x}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle a_{x}\right.\end{array}`, M(fo));
P('Same along y', R`h_{T}\left(t\right)\coloneq\begin{array}{||l}\mathrm{if}\ t\le Q_{b}\\\quad\left\Vert\displaystyle a_{y}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle a_{y}-2\left(t-Q_{b}\right)s_{y}\right.\end{array}`, M(fo));
P('Point j: its tie and its index within the tie', R`i_{T}\left(j\right)\coloneq\mathrm{floor}\left(\frac{j}{M_{T}}\right)`, M(fo));
P('', R`u_{T}\left(j\right)\coloneq j-M_{T}i_{T}\left(j\right)`, M(fo));
P('Arc of point j: 0 top-left hook, 1 TR, 2 BR, 3 BL, 4 top-left hook', R`a_{T}\left(j\right)\coloneq\min\left(\max\left(\mathrm{floor}\left(\frac{u_{T}\left(j\right)-1}{n_{a}}\right),0\right),4\right)`, M(fo));
P('Fraction along the arc', R`w_{T}\left(j\right)\coloneq\frac{\min\left(\max\left(u_{T}\left(j\right)-1-n_{a}a_{T}\left(j\right),0\right),n_{a}-1\right)}{n_{a}-1}`, M(fo));
P('Angle round the bar in degrees (clockwise)', R`\alpha_{T}\left(j\right)\coloneq\begin{array}{||l}\mathrm{if}\ a_{T}\left(j\right)=0\\\quad\left\Vert\displaystyle 225-135w_{T}\left(j\right)\right.\\\mathrm{else}\ \mathrm{if}\ a_{T}\left(j\right)=4\\\quad\left\Vert\displaystyle -180-135w_{T}\left(j\right)\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 180-90a_{T}\left(j\right)-90w_{T}\left(j\right)\right.\end{array}`, M(fo));
P('1 at the two hook ends', R`o_{T}\left(j\right)\coloneq\begin{array}{||l}\mathrm{if}\ u_{T}\left(j\right)=0\lor u_{T}\left(j\right)=M_{T}-1\\\quad\left\Vert\displaystyle 1\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 0\right.\end{array}`, M(fo));
P('Centre of the bar the point wraps', R`X_{c}\left(j\right)\coloneq\begin{array}{||l}\mathrm{if}\ a_{T}\left(j\right)=1\lor a_{T}\left(j\right)=2\\\quad\left\Vert\displaystyle b_{T}\left(i_{T}\left(j\right)\right)\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle -b_{T}\left(i_{T}\left(j\right)\right)\right.\end{array}`, M(fo));
P('', R`Y_{c}\left(j\right)\coloneq\begin{array}{||l}\mathrm{if}\ a_{T}\left(j\right)=2\lor a_{T}\left(j\right)=3\\\quad\left\Vert\displaystyle -h_{T}\left(i_{T}\left(j\right)\right)\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle h_{T}\left(i_{T}\left(j\right)\right)\right.\end{array}`, M(fo));
P('Tie points; hook ends point at 315° into the core', R`X_{T}\left(j\right)\coloneq X_{c}\left(j\right)+\delta_{w}\cos\left(\frac{\pi\alpha_{T}\left(j\right)}{180}\right)+\frac{\sqrt{2}}{2}L_{w}o_{T}\left(j\right)`, M(fo));
P('', R`Y_{T}\left(j\right)\coloneq Y_{c}\left(j\right)+\delta_{w}\sin\left(\frac{\pi\alpha_{T}\left(j\right)}{180}\right)-\frac{\sqrt{2}}{2}L_{w}o_{T}\left(j\right)`, M(fo));
P('Points of all closed ties', R`j_{T}\coloneq\mathrm{seq}\left(0,n_{T}M_{T}-1\right)`, M(fo));
P('Legs (cross-ties to a single middle bar)', R`n_{L}\coloneq m_{b}+m_{h}`, M(fr));
P('Points per leg: 2 hook arcs and 2 hook ends', R`M_{L}\coloneq2n_{a}+2`, M(fr));
P('Point j: its leg and its index within the leg', R`i_{L}\left(j\right)\coloneq\mathrm{floor}\left(\frac{j}{M_{L}}\right)`, M(fo));
P('', R`u_{L}\left(j\right)\coloneq j-M_{L}i_{L}\left(j\right)`, M(fo));
P('Leg direction: 0 parallel to y at x = 0, 1 parallel to x at y = 0', R`k_{L}\left(j\right)\coloneq i_{L}\left(j\right)+1-m_{b}`, M(fo));
P('Arc of point j (0 first bar, 1 second bar), fraction along it', R`a_{L}\left(j\right)\coloneq\min\left(\max\left(\mathrm{floor}\left(\frac{u_{L}\left(j\right)-1}{n_{a}}\right),0\right),1\right)`, M(fo));
P('', R`w_{L}\left(j\right)\coloneq\frac{\min\left(\max\left(u_{L}\left(j\right)-1-n_{a}a_{L}\left(j\right),0\right),n_{a}-1\right)}{n_{a}-1}`, M(fo));
P('Angle round the bar in degrees (two 135° arcs)', R`\alpha_{L}\left(j\right)\coloneq90k_{L}\left(j\right)+135-135a_{L}\left(j\right)-135w_{L}\left(j\right)`, M(fo));
P('1 at the first / last hook end', R`o_{s}\left(j\right)\coloneq\begin{array}{||l}\mathrm{if}\ u_{L}\left(j\right)=0\\\quad\left\Vert\displaystyle 1\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 0\right.\end{array}`, M(fo));
P('', R`o_{e}\left(j\right)\coloneq\begin{array}{||l}\mathrm{if}\ u_{L}\left(j\right)=M_{L}-1\\\quad\left\Vert\displaystyle 1\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 0\right.\end{array}`, M(fo));
P('Hook end directions (into the core)', R`p_{x}\left(j\right)\coloneq\left(2k_{L}\left(j\right)-1\right)o_{s}\left(j\right)-o_{e}\left(j\right)`, M(fo));
P('', R`p_{y}\left(j\right)\coloneq\left(1-2k_{L}\left(j\right)\right)o_{e}\left(j\right)-o_{s}\left(j\right)`, M(fo));
P('Leg points', R`X_{L}\left(j\right)\coloneq k_{L}\left(j\right)\left(2a_{L}\left(j\right)-1\right)a_{x}+\delta_{w}\cos\left(\frac{\pi\alpha_{L}\left(j\right)}{180}\right)+\frac{\sqrt{2}}{2}L_{w}p_{x}\left(j\right)`, M(fo));
P('', R`Y_{L}\left(j\right)\coloneq\left(1-k_{L}\left(j\right)\right)\left(1-2a_{L}\left(j\right)\right)a_{y}+\delta_{w}\sin\left(\frac{\pi\alpha_{L}\left(j\right)}{180}\right)+\frac{\sqrt{2}}{2}L_{w}p_{y}\left(j\right)`, M(fo));
P('Points of all legs', R`j_{L}\coloneq\mathrm{seq}\left(0,\max\left(n_{L},1\right)M_{L}-1\right)`, M(fo));
});
GRAPH(300, { title: 'Section', xUnit: 'mm', yUnit: 'mm', equalAxes: true,
  series: [
    S('outline', '', [R`\mathrm{stack}\left(-1,1,1,-1,-1\right)\frac{b}{2}`, R`\mathrm{stack}\left(-1,-1,1,1,-1\right)\frac{h}{2}`], 'line', '#1e3a5f', 2),
    S('ties', 'Ties', [R`\mathrm{map}\left(X_{T},j_{T}\right)`, R`\mathrm{map}\left(Y_{T},j_{T}\right)`], 'segments', '#2563eb', 1.5, { r: R`\mathrm{map}\left(i_{T},j_{T}\right)` }),
    S('legs', 'Legs', [R`\mathrm{map}\left(X_{L},j_{L}\right)`, R`\mathrm{map}\left(Y_{L},j_{L}\right)`], 'segments', '#047857', 1.8, { r: R`\mathrm{map}\left(i_{L},j_{L}\right)`, show: R`n_{L}\ge1` }),
    S('bars', 'Bars', ['x_{s}', 'y_{s}'], 'circle', '#dc2626', 1, { r: R`0.5\phi` }),
  ] });
H(3, '4.4 Steel areas');
P('Area of one bar', R`A_{b}\coloneq0.25\pi\phi^2`, M(mm2));
P('Gross concrete area', R`A_{g}\coloneq bh`, M(mm2, fr));
P('Total longitudinal steel area', R`A_{s}\coloneq n_{bar}A_{b}`, M(mm2, fr));
P('Minimum steel, EC2 (9.12N)', R`A_{s}\ge\max\left(\frac{0.1N_{Ed}}{f_{yd}},0.002A_{g}\right)`, M(mm2));
P('Maximum steel, EC2 9.5.2(3)', R`A_{s}\le0.04A_{g}`, M(mm2));
// ================= 5. Flexural check =================
H(2, '5. FLEXURAL CHECK');
H(3, '5.1 Biaxial resistance: P–Mθ at the moment direction θ');
T('The neutral axis is turned (angle β of its normal) until the resisting moment points along θ;');
T('this gives the P–Mθ curve at θ. No reduction to the principal axes.');
LINK('ax_resultants', 'Strain plane, stress laws and section resultants', () => {
T('c = neutral-axis depth below the compression face; p = fibre coordinate from the centroid,');
T('positive towards the compression face; H = section depth in that direction; dt = depth of the');
T('extreme bar. The strain plane pivots about A (bar at −εud), B (face at εcu2) or C (εc2 at');
T('(1 − εc2/εcu2)·H), whichever governs for the depth c (EC2 Fig. 6.1). Compression positive.');
P('Strain at fibre p', R`\varepsilon\left(c,p,H,d_{t}\right)\coloneq\begin{array}{||l}\mathrm{if}\ c<\frac{\varepsilon_{cu2}d_{t}}{\varepsilon_{cu2}+\varepsilon_{ud}}\\\quad\left\Vert\displaystyle \varepsilon_{ud}\frac{c-\frac{H}{2}+p}{d_{t}-c}\right.\\\mathrm{else}\ \mathrm{if}\ c\le H\\\quad\left\Vert\displaystyle \varepsilon_{cu2}\frac{c-\frac{H}{2}+p}{c}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle \varepsilon_{c2}\frac{c-\frac{H}{2}+p}{c-\left(1-\frac{\varepsilon_{c2}}{\varepsilon_{cu2}}\right)H}\right.\end{array}`, M(fo));
P('Concrete stress, parabola-rectangle (EC2 3.17), no tension', R`\sigma_{c}\left(\varepsilon\right)\coloneq\begin{array}{||l}\mathrm{if}\ \varepsilon\le0\\\quad\left\Vert\displaystyle 0\,\mathrm{MPa}\right.\\\mathrm{else}\ \mathrm{if}\ \varepsilon<\varepsilon_{c2}\\\quad\left\Vert\displaystyle f_{cd}\left(1-\left(1-\frac{\varepsilon}{\varepsilon_{c2}}\right)^2\right)\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle f_{cd}\right.\end{array}`, M(fo));
P('Steel stress, elastic-plastic within ±fyd', R`\sigma_{s}\left(\varepsilon\right)\coloneq\begin{array}{||l}\mathrm{if}\ E_{s}\varepsilon<-f_{yd}\\\quad\left\Vert\displaystyle -f_{yd}\right.\\\mathrm{else}\ \mathrm{if}\ E_{s}\varepsilon>f_{yd}\\\quad\left\Vert\displaystyle f_{yd}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle E_{s}\varepsilon\right.\end{array}`, M(fo));
T('For a neutral-axis direction β (normal of the axis, towards the compression face):');
P('Section depth along β', R`H_{\beta}\left(\beta\right)\coloneq b\left|\cos\left(\beta\right)\right|+h\left|\sin\left(\beta\right)\right|`, M(fo));
P('Depth of the extreme bar', R`d_{\beta}\left(\beta\right)\coloneq\frac{H_{\beta}\left(\beta\right)}{2}-\min\left(x_{s}\cos\left(\beta\right)+y_{s}\sin\left(\beta\right)\right)`, M(fo));
P('Stress in every concrete fibre at depth c', R`\sigma_{f}\left(c,\beta\right)\coloneq\sigma_{c}\left(\varepsilon\left(c,x_{f}\cos\left(\beta\right)+y_{f}\sin\left(\beta\right),H_{\beta}\left(\beta\right),d_{\beta}\left(\beta\right)\right)\right)`, M(fo));
P('Strain in every bar', R`\varepsilon_{b}\left(c,\beta\right)\coloneq\varepsilon\left(c,x_{s}\cos\left(\beta\right)+y_{s}\sin\left(\beta\right),H_{\beta}\left(\beta\right),d_{\beta}\left(\beta\right)\right)`, M(fo));
P('Net bar stress (concrete it displaces subtracted)', R`\sigma_{b}\left(c,\beta\right)\coloneq\sigma_{s}\left(\varepsilon_{b}\left(c,\beta\right)\right)-\sigma_{c}\left(\varepsilon_{b}\left(c,\beta\right)\right)`, M(fo));
P('Axial resistance', R`N_{R}\left(c,\beta\right)\coloneq A_{f}\mathrm{sum}\left(\sigma_{f}\left(c,\beta\right)\right)+A_{b}\mathrm{sum}\left(\sigma_{b}\left(c,\beta\right)\right)`, M(fo));
P('Moment about x (lever arm y)', R`M_{Rx}\left(c,\beta\right)\coloneq A_{f}\mathrm{sum}\left(\sigma_{f}\left(c,\beta\right)y_{f}\right)+A_{b}\mathrm{sum}\left(\sigma_{b}\left(c,\beta\right)y_{s}\right)`, M(fo));
P('Moment about y (lever arm x)', R`M_{Ry}\left(c,\beta\right)\coloneq A_{f}\mathrm{sum}\left(\sigma_{f}\left(c,\beta\right)x_{f}\right)+A_{b}\mathrm{sum}\left(\sigma_{b}\left(c,\beta\right)x_{s}\right)`, M(fo));
});
P('Resultant design moment', R`M_{Ed}\coloneq\sqrt{M_{Ed.x}^2+M_{Ed.y}^2}`, M(kNm, fr));
P('Direction of the compression face (MEd,y → +x, MEd,x → +y)', R`\theta_{M}\coloneq\mathrm{angle}\left(M_{Ed.y},M_{Ed.x}\right)`, M(deg, fr));
LINK('ax_sweep', 'P–Mθ diagram data (neutral-axis sweep)', () => {
P('Angles β swept over the quadrant of θ (10° steps)', R`\beta_{v}\coloneq\left(\frac{\pi}{2}\mathrm{floor}\left(\frac{2\theta_{M}}{\pi\,\mathrm{rad}}\right)+\frac{\pi}{18}\mathrm{seq}\left(0,9\right)\right)\mathrm{rad}`, M(fo));
H(3, 'P–Mθ curve');
T('For each depth c = u·H(β) the moment direction ψ is found for every β of the sweep; the point');
T('with ψ = θM (interpolated between the β steps) is the point of the P–Mθ curve.');
gap(0.3);
P('At c = u·H(β): N, M and direction ψ', R`N_{u}\left(u,\beta\right)\coloneq N_{R}\left(uH_{\beta}\left(\beta\right),\beta\right)`, M(fo));
P('', R`M_{u}\left(u,\beta\right)\coloneq\sqrt{\left(M_{Rx}\left(uH_{\beta}\left(\beta\right),\beta\right)\right)^2+\left(M_{Ry}\left(uH_{\beta}\left(\beta\right),\beta\right)\right)^2}`, M(fo));
P('Moment direction, measured from β (no 0/360° jump)', R`\psi_{u}\left(u,\beta\right)\coloneq\beta+\arctan\left(\frac{M_{Rx}\left(uH_{\beta}\left(\beta\right),\beta\right)\cos\left(\beta\right)-M_{Ry}\left(uH_{\beta}\left(\beta\right),\beta\right)\sin\left(\beta\right)}{M_{Ry}\left(uH_{\beta}\left(\beta\right),\beta\right)\cos\left(\beta\right)+M_{Rx}\left(uH_{\beta}\left(\beta\right),\beta\right)\sin\left(\beta\right)}\right)`, M(fo));
P('Curve point for u (ψ = θM)', R`N_{\theta}\left(u\right)\coloneq\mathrm{linterp}\left(\mathrm{map}\left(\psi_{u},u,\beta_{v}\right),\mathrm{map}\left(N_{u},u,\beta_{v}\right),\theta_{M}\right)`, M(fo));
P('', R`M_{\theta}\left(u\right)\coloneq\mathrm{linterp}\left(\mathrm{map}\left(\psi_{u},u,\beta_{v}\right),\mathrm{map}\left(M_{u},u,\beta_{v}\right),\theta_{M}\right)`, M(fo));
P('', R`\beta_{\theta}\left(u\right)\coloneq\mathrm{linterp}\left(\mathrm{map}\left(\psi_{u},u,\beta_{v}\right),\beta_{v},\theta_{M}\right)`, M(fo));
P('Control points u = c/H (the ends, pure tension and uniform εc2, have M = 0)', R`u_{t}\coloneq\mathrm{stack}\left(0.02,0.05,\mathrm{seq}\left(0.1,1.1,0.1\right),1.5,3\right)`, M(fo));
P('P–Mθ curve', R`N_{\theta v}\coloneq\mathrm{stack}\left(N_{R}\left(-0.1H_{\beta}\left(\theta_{M}\right),\theta_{M}\right),\mathrm{map}\left(N_{\theta},u_{t}\right),N_{R}\left(100H_{\beta}\left(\theta_{M}\right),\theta_{M}\right)\right)`, M(fo));
P('', R`M_{\theta v}\coloneq\mathrm{stack}\left(0\,\mathrm{kN}\cdot\mathrm{m},\mathrm{map}\left(M_{\theta},u_{t}\right),0\,\mathrm{kN}\cdot\mathrm{m}\right)`, M(fo));
P('u of every curve point', R`u_{c}\coloneq\mathrm{stack}\left(-0.1,u_{t},100\right)`, M(fo));
need(1 + colTable(17));
textAt(st.page, st.row, 'P–Mθ control points', { x: 96, w: 400, size: 13, color: '#1e3a5f' });
st.row += 0.5;
ROW([[96, R`N_{\theta v}=`, cv('kN', 0)], [276, R`M_{\theta v}=`, cv('kN m', 0)]], colTable(17));
});
P('Curve scaled by its maxima (the ratio does not depend on the scale)', R`n_{v}\coloneq\frac{N_{\theta v}}{\max\left(N_{\theta v}\right)}`, M(fo));
P('', R`m_{v}\coloneq\frac{M_{\theta v}}{\max\left(M_{\theta v}\right)}`, M(fo));
T('Utilisation (as MBColumn): ray from the origin through (MEd, NEd) to the P–Mθ curve.');
P('Design point scaled the same way', R`n_{Ed}\coloneq\frac{N_{Ed}}{\max\left(N_{\theta v}\right)}`, M({ precision: 4 }, fr));
P('', R`m_{Ed}\coloneq\frac{M_{Ed}}{\max\left(M_{\theta v}\right)}`, M({ precision: 4 }, fr));
P('Distance to the curve along the ray (interpolated by direction)', R`\rho_{Rd}\coloneq\mathrm{linterp}\left(\frac{n_{v}}{\sqrt{n_{v}^2+m_{v}^2}},\sqrt{n_{v}^2+m_{v}^2},\frac{n_{Ed}}{\sqrt{n_{Ed}^2+m_{Ed}^2}}\right)`, M({ precision: 4 }, fr));
P('Radial utilisation (governs)', R`\mathrm{UR}_{M}\coloneq\frac{\sqrt{n_{Ed}^2+m_{Ed}^2}}{\rho_{Rd}}`, M({ precision: 3 }, fr));
P('Check', R`\mathrm{UR}_{M}\le1`, M({ precision: 3 }));
need(1 + 430 / 40);
H(3, '5.2 P–Mθ diagram');
GRAPH(420, {
  title: 'P–Mθ at θM', xUnit: 'kN m', yUnit: 'kN', equalAxes: false,
  series: [
    S('curve', 'NRd–MRd,θ', [R`M_{\theta v}`, R`N_{\theta v}`], 'line', '#1e3a5f', 2),
    S('mirror', '', [R`-M_{\theta v}`, R`N_{\theta v}`], 'line', '#1e3a5f', 2),
    S('ray', '', [R`\mathrm{stack}\left(0,\max\left(1,\frac{1}{\mathrm{UR}_{M}}\right)\right)M_{Ed}`, R`\mathrm{stack}\left(0,\max\left(1,\frac{1}{\mathrm{UR}_{M}}\right)\right)N_{Ed}`], 'line', '#94a3b8', 1),
    S('cap', 'Capacity on the ray', [R`\frac{M_{Ed}}{\mathrm{UR}_{M}}`, R`\frac{N_{Ed}}{\mathrm{UR}_{M}}`], 'marker', '#047857', 2),
    S('ed', 'Design (MEd, NEd)', ['M_{Ed}', 'N_{Ed}'], 'marker', '#dc2626', 2),
  ],
});

// ================= 8. Shear =================
H(2, '6. SHEAR CHECK (EN 1992-1-1:2023 §8.2.3, LINKS)');
T('Truss in stresses: τEd = VEd/(bw·z) (8.18), links τRd,sy = ρw·fywd·cotθ (8.42), strut');
T('σcd = τEd·(cotθ + tanθ) ≤ ν·fcd (8.44), ν = 0.5. cotθ: the largest value ≤ cot θmin (8.41)');
T('that keeps σcd ≤ ν·fcd; cotθ < 1 (8.2.3(11)) never adds resistance and is not used.');
gap(0.35);
P('Strength reduction for cracked concrete, 8.2.3(6)', R`\nu\coloneq0.5`, M({ constant: true }));
P('Factor on cot θmin: 0.8 for class A links, 8.2.3(4)', R`k_{A}\coloneq1-0.2\delta_{A}`, M({ precision: 2 }, fr));
P('Average axial stress, compression positive', R`\sigma_{cp}\coloneq\frac{N_{Ed}}{A_{g}}`, M(MPa, { precision: 2 }, fr));
P('Area of one link leg', R`A_{sw1}\coloneq\frac{\pi\phi_{w}^2}{4}`, M(mm2, fr));
P('Neutral-axis depth ratios for the compression chord search', R`u_{x}\coloneq\mathrm{stack}\left(-0.1,\mathrm{seq}\left(0.05,1,0.05\right),100\right)`, M(fo));
H(3, '6.1 Shear along y (web b, depth h; bending about x)');
P('Effective depth', R`d_{y}\coloneq h-c_{nom}-\phi_{w}-\frac{\phi}{2}`, M(mm, fr));
P('Lever arm, 8.2.1(3)', R`z_{y}\coloneq0.9d_{y}`, M(mm, fr));
P('Web width', R`b_{w.y}\coloneq b`, M(mm));
P('Average shear stress (8.18)', R`\tau_{Ed.y}\coloneq\frac{V_{Ed.y}}{b_{w.y}z_{y}}`, M(MPa, { precision: 2 }, FU));
P('Compression chord depth x: neutral axis at the bending resistance under NEd (§8.1)', R`x_{y}\coloneq\mathrm{linterp}\left(\mathrm{map}\left(N_{u},u_{x},\frac{\pi}{2}\,\mathrm{rad}\right),hu_{x},N_{Ed}\right)`, M(mm, fr));
P('Flattest strut allowed (8.41)', R`\mathrm{cot}_{\theta min.y}\coloneq\begin{array}{||l}\mathrm{if}\ N_{Ed}<0\,\mathrm{kN}\\\quad\left\Vert\displaystyle \max\left(1,k_{A}\left(2.5-0.1\cdot\frac{\left|N_{Ed}\right|}{V_{Ed.y}}\right)\right)\right.\\\mathrm{else}\ \mathrm{if}\ x_{y}\ge0.25d_{y}\\\quad\left\Vert\displaystyle 2.5k_{A}\right.\\\mathrm{else}\ \mathrm{if}\ \sigma_{cp}\ge3\,\mathrm{MPa}\\\quad\left\Vert\displaystyle 3.0k_{A}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle \left(2.5+0.5\cdot\frac{\sigma_{cp}}{3\,\mathrm{MPa}}\right)k_{A}\right.\end{array}`, M({ precision: 2 }, fr));
P('Design cotθ: cot θmin if the strut holds, else the root of τEd(cotθ + tanθ) = ν·fcd; 1: strut fails', R`\mathrm{cot}_{\theta.y}\coloneq\begin{array}{||l}\mathrm{if}\ \tau_{Ed.y}\left(\mathrm{cot}_{\theta min.y}+\frac{1}{\mathrm{cot}_{\theta min.y}}\right)\le\nu f_{cd}\\\quad\left\Vert\displaystyle \mathrm{cot}_{\theta min.y}\right.\\\mathrm{else}\ \mathrm{if}\ 2\tau_{Ed.y}\le\nu f_{cd}\\\quad\left\Vert\displaystyle \frac{\nu f_{cd}}{2\tau_{Ed.y}}+\sqrt{\left(\frac{\nu f_{cd}}{2\tau_{Ed.y}}\right)^2-1}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 1\right.\end{array}`, M({ precision: 2 }, fr));
P('Area of links within s', R`A_{sw.y}\coloneq n_{w.y}A_{sw1}`, M(mm2, fr));
P('Shear reinforcement ratio (8.43)', R`\rho_{w.y}\coloneq\frac{A_{sw.y}}{b_{w.y}s}`, M({ precision: 5 }, fr));
P('Link resistance (8.42)', R`\tau_{Rd.sy.y}\coloneq\rho_{w.y}f_{ywd}\mathrm{cot}_{\theta.y}`, M(MPa, { precision: 2 }, FU));
P('Strut stress (8.44)', R`\sigma_{cd.y}\coloneq\tau_{Ed.y}\left(\mathrm{cot}_{\theta.y}+\frac{1}{\mathrm{cot}_{\theta.y}}\right)`, M(MPa, { precision: 2 }, FU));
P('Shear utilisation ratio', R`\mathrm{UR}_{V.y}\coloneq\max\left(\frac{\tau_{Ed.y}}{\tau_{Rd.sy.y}},\frac{\sigma_{cd.y}}{\nu f_{cd}}\right)`, M({ precision: 3 }, fr));
P('Check', R`\mathrm{UR}_{V.y}\le1`, M({ precision: 3 }));
H(3, '6.2 Shear along x (web h, depth b; bending about y)');
P('Effective depth', R`d_{x}\coloneq b-c_{nom}-\phi_{w}-\frac{\phi}{2}`, M(mm, fr));
P('Lever arm, 8.2.1(3)', R`z_{x}\coloneq0.9d_{x}`, M(mm, fr));
P('Web width', R`b_{w.x}\coloneq h`, M(mm));
P('Average shear stress (8.18)', R`\tau_{Ed.x}\coloneq\frac{V_{Ed.x}}{b_{w.x}z_{x}}`, M(MPa, { precision: 2 }, FU));
P('Compression chord depth x: neutral axis at the bending resistance under NEd (§8.1)', R`x_{x}\coloneq\mathrm{linterp}\left(\mathrm{map}\left(N_{u},u_{x},0\,\mathrm{rad}\right),bu_{x},N_{Ed}\right)`, M(mm, fr));
P('Flattest strut allowed (8.41)', R`\mathrm{cot}_{\theta min.x}\coloneq\begin{array}{||l}\mathrm{if}\ N_{Ed}<0\,\mathrm{kN}\\\quad\left\Vert\displaystyle \max\left(1,k_{A}\left(2.5-0.1\cdot\frac{\left|N_{Ed}\right|}{V_{Ed.x}}\right)\right)\right.\\\mathrm{else}\ \mathrm{if}\ x_{x}\ge0.25d_{x}\\\quad\left\Vert\displaystyle 2.5k_{A}\right.\\\mathrm{else}\ \mathrm{if}\ \sigma_{cp}\ge3\,\mathrm{MPa}\\\quad\left\Vert\displaystyle 3.0k_{A}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle \left(2.5+0.5\cdot\frac{\sigma_{cp}}{3\,\mathrm{MPa}}\right)k_{A}\right.\end{array}`, M({ precision: 2 }, fr));
P('Design cotθ: cot θmin if the strut holds, else the root of τEd(cotθ + tanθ) = ν·fcd; 1: strut fails', R`\mathrm{cot}_{\theta.x}\coloneq\begin{array}{||l}\mathrm{if}\ \tau_{Ed.x}\left(\mathrm{cot}_{\theta min.x}+\frac{1}{\mathrm{cot}_{\theta min.x}}\right)\le\nu f_{cd}\\\quad\left\Vert\displaystyle \mathrm{cot}_{\theta min.x}\right.\\\mathrm{else}\ \mathrm{if}\ 2\tau_{Ed.x}\le\nu f_{cd}\\\quad\left\Vert\displaystyle \frac{\nu f_{cd}}{2\tau_{Ed.x}}+\sqrt{\left(\frac{\nu f_{cd}}{2\tau_{Ed.x}}\right)^2-1}\right.\\\mathrm{else}\\\quad\left\Vert\displaystyle 1\right.\end{array}`, M({ precision: 2 }, fr));
P('Area of links within s', R`A_{sw.x}\coloneq n_{w.x}A_{sw1}`, M(mm2, fr));
P('Shear reinforcement ratio (8.43)', R`\rho_{w.x}\coloneq\frac{A_{sw.x}}{b_{w.x}s}`, M({ precision: 5 }, fr));
P('Link resistance (8.42)', R`\tau_{Rd.sy.x}\coloneq\rho_{w.x}f_{ywd}\mathrm{cot}_{\theta.x}`, M(MPa, { precision: 2 }, FU));
P('Strut stress (8.44)', R`\sigma_{cd.x}\coloneq\tau_{Ed.x}\left(\mathrm{cot}_{\theta.x}+\frac{1}{\mathrm{cot}_{\theta.x}}\right)`, M(MPa, { precision: 2 }, FU));
P('Shear utilisation ratio', R`\mathrm{UR}_{V.x}\coloneq\max\left(\frac{\tau_{Ed.x}}{\tau_{Rd.sy.x}},\frac{\sigma_{cd.x}}{\nu f_{cd}}\right)`, M({ precision: 3 }, fr));
P('Check', R`\mathrm{UR}_{V.x}\le1`, M({ precision: 3 }));

// ================= 9. Summary =================
H(2, '7. SUMMARY');
P('Radial utilisation on P–Mθ (governs)', R`\mathrm{UR}_{M}=`, M({ precision: 3 }));
P('Shear along y', R`\mathrm{UR}_{V.y}=`, M({ precision: 3 }));
P('Shear along x', R`\mathrm{UR}_{V.x}=`, M({ precision: 3 }));

// Input & Results tab: load cases (N, Mx, My, Vy, Vx) → utilisation ratios and checks.
const lc = (id, name, n, mx, my, vy, vx) => ({ id, name, values: { n, mx, my, vy, vx } });
finish({
  id: 'doc_rc_rectangular_column', title: 'RC Rectangular Column Check', reference: 'CALC-COL-02', file: 'RC_Rectangular_Column_Check.mCalcCanvas',
  batch: {
    title: 'Load cases',
    inputs: [
      ['n', 'N_Ed', R`N_{Ed}\coloneq3000\,\mathrm{kN}`],
      ['mx', 'M_Ed,x', R`M_{Ed.x}\coloneq600\,\mathrm{kN}\cdot\mathrm{m}`],
      ['my', 'M_Ed,y', R`M_{Ed.y}\coloneq300\,\mathrm{kN}\cdot\mathrm{m}`],
      ['vy', 'V_Ed,y', R`V_{Ed.y}\coloneq400\,\mathrm{kN}`],
      ['vx', 'V_Ed,x', R`V_{Ed.x}\coloneq200\,\mathrm{kN}`],
    ],
    outputs: [
      ['urm', 'UR_M', R`\mathrm{UR}_{M}\coloneq\frac{\sqrt{n_{Ed}^2+m_{Ed}^2}}{\rho_{Rd}}`],
      ['urvy', 'UR_V,y', R`\mathrm{UR}_{V.y}\coloneq\max\left(\frac{\tau_{Ed.y}}{\tau_{Rd.sy.y}},\frac{\sigma_{cd.y}}{\nu f_{cd}}\right)`],
      ['urvx', 'UR_V,x', R`\mathrm{UR}_{V.x}\coloneq\max\left(\frac{\tau_{Ed.x}}{\tau_{Rd.sy.x}},\frac{\sigma_{cd.x}}{\nu f_{cd}}\right)`],
      ['cm', 'Flexure', R`\mathrm{UR}_{M}\le1`],
      ['cvy', 'Shear y', R`\mathrm{UR}_{V.y}\le1`],
      ['cvx', 'Shear x', R`\mathrm{UR}_{V.x}\le1`],
    ],
    rows: [
      lc('lc1', 'LC1 design', 3000, 600, 300, 400, 200),
      lc('lc2', 'LC2 max N', 6000, 250, 120, 250, 120),
      lc('lc3', 'LC3 max Mx', 2000, 850, 150, 450, 150),
      lc('lc4', 'LC4 max My', 2500, 250, 450, 300, 350),
      lc('lc5', 'LC5 low N', 500, 400, 200, 350, 200),
    ],
  },
});
