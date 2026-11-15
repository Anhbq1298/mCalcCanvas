# EC4 composite beam worksheet — Rev F review draft

Editable worksheet for engineering and native-layout review, **not an approved design**.
No calculation-engine source is changed: every result is a worksheet equation evaluated by the
existing engine. Rev D implemented the PNA review requested in
`CLAUDE_REVIEW_PROMPT.md` and was measured and exported from the real application.

## Files and reproduction

- `tools/templates/gen_composite.mjs`: inputs, equations, checks, annex blocks.
- `tools/templates/compositeFigures.mjs`: three static symbolic figures (section, loading, stress block);
  drawing-style subscripts, indicative dimensions, no numbers (values live in the regions).
- `templates/Composite_Beam_EC4.mCCV`: generated; never hand-edit.
- `tools/templates/sizes_composite.json`: region sizes measured in the built app.
- `tools/templates/reference_composite.py` → `docs/composite-design/reference.json`: independent reference.
- `src/tests/unit/compositeTemplate.test.ts`: numerical pins and branch behaviour.
- `docs/composite-design/app-export/`: PDF exported from mCalcCanvas, page contact sheet, app screenshot.
- `docs/composite-design/preview/`: superseded Rev C offline LaTeX preview (not an app export).

```bash
python tools/templates/reference_composite.py > docs/composite-design/reference.json
npm run build
CHROME_PATH=/usr/bin/google-chrome npm run templates:columns -- --only=composite --pdf
npm run typecheck && npm run lint && npm test && CHROME_PATH=/usr/bin/google-chrome npm run test:e2e
```

## Scope

Simply supported, unpropped, solid 150 mm slab, sagging UDL, 8 m span, 3 m load width,
UB 406 × 178 × 60 S355 from the section library (Rev G: `Section := 3148`, Browse to change; BS 4-1
dimensions from structuralcodes, Apache-2.0, r = 10.0 mm; properties derived from the geometry like the
IPE/HE records: A 76.48 cm², Iy 21584 cm⁴, Iz 1203 cm⁴, Wpl 1198.8 cm³, It 33.39 cm⁴, Iw 0.465 dm⁶,
60.04 kg/m — SCI P363 tables: 76.5, 21600, 1200, 1200, 33.3, 0.466, 60.1 with r = 10.2),
C30/37, 48 studs Ø19 × 100 in one row. Symmetric steel section, no applied axial force.

## Plastic neutral axes (Rev D)

The PNA positions are **results** of geometry, materials and η, not user-selected cases.

- N_c,f = min(A_a f_yd, 0.85 f_cd b_eff h_c); η = min(1, n_h P_Rd / N_c,f), n_h = studs between
  zero and maximum moment; N_c = η N_c,f (EC4 6.2.1.3(3)).
- x_c = N_c / (0.85 f_cd b_eff); A_ac = (A_a − N_c/f_yd)/2 (axial equilibrium).
- Branch from cumulative compressed area, rolled fillets included:
  - A_ac ≤ b_a t_f → top flange, y_a = A_ac/b_a;
  - b_a t_f < A_ac < A_fr → fillet transition: **not solved**; a visible check fails;
  - A_ac ≥ A_fr → web below the fillet toe, y_a = t_f + r + (A_ac − A_fr)/t_w,
    with A_fr = b_a t_f + t_w r + (2 − π/2) r² (exact area above the fillet toe).
  The sharp-corner web formula is not used with the filleted area.
- A_ac ≤ A_a/2 is shown as a check: a lower-flange PNA is inadmissible in this scope.
- Direct rigid-plastic resistance M_Rd.pl = T_a z_T − f_yd Q_ac − N_c x_c/2 (moments about the slab top,
  tension centroid area-weighted). Fillet spandrel centroid 0.2234 r from its straight edges.
- Design M_Rd = linear interaction EC4 (6.3), the conservative lower bound of the plastic curve.
  It gives composite credit only if η ≥ η_min, studs are ductile (h_sc ≥ 4d), the flange is Class 1
  and the stud pitch restrains the flange (EC4 6.6.5.5(2)); otherwise M_Rd = M_a,Rd.

Section example (library UB, Rev G): η = 0.721775, η_min = 0.49, x_f = 79.858 mm (full connection: slab
PNA, steel all in tension), x_c = 57.640 mm, y_a = 5.981 mm (inside the 12.8 mm flange), η_f = 0.404550.
M_pl,Rd = 850.59, M_Rd = 732.34 (linear), M_Rd.pl = 786.95 kNm. (Rev F with the SCI table section:
η 0.721624, y_a 5.985, M_pl,Rd 850.74, M_Rd 732.50, M_Rd.pl 787.06 kNm.)

Main body: one symbolic stress block (F3); the PNA case is reported numerically in section 9.4.
Annex: the general force model and branch boundaries.

## Rev F: layout by code, propping, SCI cross-check

- Order: 1 Inputs (pages 1–2, every input), 2 Loading (one page: construction and permanent stage,
  SFD/BMD), 3 EN 1993-1-1 construction checks, 4 EN 1994-1-1 composite checks (incl. SLS),
  5 EN 1992-1-1 slab longitudinal shear, 6 summary by code, annex. Loading and section 3 start on a new
  page: app feature `pageBreak` on a text shape, honoured by the template / print layout planner.
- Propping `c_prop` (0 = unpropped, default; 1 = propped) drives if-blocks: construction span and LTB
  length L_1 = L_LT = k_LT·L (user input k_LT) when propped; g_0 deflects the long-term composite section
  instead of the steel alone; the slip factor C_s is 0.5 instead of 0.3. Prop reactions and the prop
  removal stage are not checked.
- SCI P364 Example 8 (533×165×75 UKB S275, 12 m, C25/30, deck slab) cross-check: see VALIDATION.md.

## Rev E: load tables, stud spacing and PNA case

- Composite-stage loads are input tables (Mathcad Prime style, Rev G), one row per load. Area loads:
  load pattern c_Q,i (G or Q), x_1,i, x_2,i, p_k,i (kPa, times the load width s_b); point loads: c_Q,j,
  a_j, F_k,j (kN). One value column serves both patterns: G rows go to g, Q rows to q (G → 0, Q → 1).
  Add a row (Matrices/Tables → Insert below) for a new load; the content below moves down.
  Point loads are assumed to act after composite action; the construction stage keeps its UDL. The example splits finishes and
  imposed load (and G and Q of the point load) into two rows each.
- M(x), V(x) on a 200-step grid (annex A.1, user functions with factors cG, cQ); M_Ed is the larger of
  the grid maximum and the moments under the point loads (grid error ≤ wΔx²/8). Graphs M_Ed, V_Ed.
- Studs: the user specifies the spacing of each shear span, s_sc,A (support A to the maximum moment x_M)
  and s_sc,B (x_M to support B), checked against 5d and min(22 t_f ε, 6h_c, 800 mm). Studs per span
  n = floor(length/s + 0.5) (first stud at s/2); η uses the weaker span (SCI P405 §4.2.1). A large point
  load moves x_M, which changes the stud counts. n_req = ceil(max(η_min, (M_Ed − M_a,Rd)/(M_pl,Rd −
  M_a,Rd)) N_c,f / P_Rd) per span. M_Rd(x) from the studs between x and the nearer support (EC4 (6.3))
  is compared with M_Ed(x) at every grid point (UR check and one graph).
- Diagrams: full-width white graphs; shear force V_Ed and bending moment M_Ed (sagging drawn below,
  tension side) as filled areas with labelled support shears and peak moment. App feature added for
  this: graph option `invertY` and series styles `area` and `values` (GraphView, serializer, Properties).
- PNA case k (0 slab, 1 top flange, 2 fillet zone — not solved, 3 web) at x_M and under each point load.
- Longitudinal shear flow = P_Rd / min(s_A, s_B), half per plane a-a.
- SLS midspan deflections for table loads by virtual work on the same grid.

## Other engineering decisions in Rev D

- **Longitudinal shear (owner approval).** The draft's doubled flow 2N_c/(L h_c) had no code basis; the
  design flow is now the stud flow P_Rd / min(s_A, s_B), half per plane a-a (EC4 6.6.6.1, EC2 (6.20)/(6.21)).
  Surface b-b, splitting and anchorage remain unchecked gates.
- Construction LTB failure is retained (UR = 1.874, fork ends only, no wet-slab restraint).
- Wide full-substitution regions (A_v, w_1.Ed, M_cr, I_0/L/s, M_Rd.pl) show formula = result so they fit.
- Description + region are print-grouped (`printGroupId`) so a page break never separates them.

## Sources and verification limits

- EN 1994-1-1 clauses used: 2.4.1.2, 5.4.1.2, 5.4.2.2, 6.2.1.2, 6.2.1.3 (6.3), 6.2.2.4, 6.6.1.2 (6.12),
  6.6.1.3(3), 6.6.3.1 (6.18)/(6.19), 6.6.5, 6.6.6; EC3 5.5, 6.2.5–6.2.8, 6.3.2.2; EC2 6.2.4.
- SCI P359 (2011) and P405 (2015) were opened in Rev E (see VALIDATION.md). P364 Example 8 was not.
- Singapore NA to SS EN 1994-1-1: values not verified. γ factors, ψ2, combinations and η_min rule are EN
  recommended/EN text; UK NA / NCCI relaxations are not adopted. PN002a slip allowance is NCCI guidance.

## Acceptance status

| Item | Status |
|---|---|
| PNA from inputs, flange / web branches, fillet transition flagged | Done (worksheet + tests) |
| One governing stress block in main body; alternatives in annex | Done |
| Static symbolic figures (3) + graphs (4) | Done; owner visual approval pending |
| Load tables, stud spacing from x_M, M_Rd(x) along span, PNA case | Done (Rev E) |
| Real-app measurement, no moved regions, PDF exported and inspected | Done (22 pages) |
| SCI P359 / P405 cross-check | Done for the items in VALIDATION.md; P364 not checked |
| Singapore NA parameters and combinations | Pending |
| Surface b-b, splitting, anchorage, transverse slab bending | Pending (gates) |
| SLS shrinkage history, cracking, slip model adoption | Pending |
| Fillet-transition branch solver, UB library binding | Not implemented |

## Rev G: non-composite alternative (chapter 6) and design basis

- c_comp = 1 when η ≥ η_min, n_req ≤ n_h and M_Rd(x) ≥ M_Ed(x) along the span (UR_M.x ≤ 1); otherwise 0.
  Typical trigger: a large point load 1–2 m from a support, so few studs fit between the support and x_M.
- Chapter 6 (EN 1993-1-1): the steel beam alone carries every permanent-stage load (M_2,Ed, V_2,Ed;
  deflection of g0 + table loads on I_a). Studs are a minimum provision restraining the top flange:
  L_LT = max(s_sc,A, s_sc,B), C1 = 1, z_g = 0 (§6.3.2.2). No composite credit.
- Summary: UR_des = max of chapter 4 when c_comp = 1, of chapter 6 when c_comp = 0; one acceptance check.
  Chapter 6 shows utilisations only, so a composite design is not shown as failing there.

## Rev G: code-compliance additions

- **M–V interaction.** Composite, EN 1994-1-1 §6.2.2.4(2): where |V_Ed| > 0.5 V_pl,Rd the web yield is reduced;
  implemented as M_V,Rd = M_Rd − ρ(M_Rd − M_f,Rd), ρ = (2|V_Ed|/V_pl,Rd − 1)², with M_f,Rd the steel flanges
  alone (a lower bound: the slab's contribution to M_f,Rd is ignored). Non-composite, EN 1993-1-1 §6.2.8, (6.30).
  Checked on the 200-interval grid and 1 mm either side of every point load (M_Rd from the studs there).
- **Transverse forces on the web**, EN 1994-1-1 §6.5 → EN 1993-1-5 §6: type (a) under point loads on the top
  flange (k_F = 6, unstiffened), type (c) at a beam end bearing on its support (c = 0); l_y with m2 dropped if
  λ_F ≤ 0.5; inputs c_F,P / c_F,S switch the checks off for loads framed into the web or end connections.
  Interaction (7.2): η2 + 0.8η1 ≤ 1.4; η1 = M_Ed/M_Rd,P (composite, plastic, Class 1 — an assumption to
  confirm) and M_Ed/M_el,Rd of the steel section (non-composite, (4.14) gross section).
- **LTB of the non-composite beam**: EN 1994-1-1 §6.4.1(1) — the top flange attached to a laterally stable slab
  by connectors to §6.6 is laterally stable; applied when both stud spacings ≤ s_max (§6.6.5.5), otherwise the
  full span is taken as unrestrained.
- Still not covered: bearing stiffener design when (6.14) fails, the stud restraint force (EC3 §6.3.2.1 /
  Annex BB), and the load-position limits of type (a) close to a beam end.

## Rev G: deflection along the span

- §4.9: deflection δ(x) for 1.0 (g0 + G) + 1.0 Q plus shrinkage, split as at midspan (ψ2 Q long-term on I_L, the rest
  on I_0; g0 on I_a unpropped, I_L propped) with the partial-interaction slip rule δ = δ_c + C_s(1 − η)(δ_a − δ_c) applied at
  every point (C_s 0.3 unpropped, 0.5 propped). Virtual work on the 200-interval grid; the permanent-stage chart
  shows 1.0 DL + 1.0 LL, LL alone (7.05 mm max, same split and slip rule) and the limit (dashed). UR_d,x = max δ(x) / (L/r_lim) replaces the midspan value in UR_c. Default: 31.08 mm at 3.94 m
  (closed-form reference 31.0771 mm), of which 1.85 mm is slip. Wider stud spacing lowers η and increases δ.

## Rev G: layout of the non-composite alternative

- Chapter 6 on the main pages keeps c_comp, the basis (bare steel, L_LT = stud spacing, steel-alone deflection) and the
  key results (L_LT,nc, χ_LT,nc, δ_nc, UR_MV,nc, UR_LT,nc, UR_FM,nc, UR_d,nc); the full calculation is annex A.3.
- Summary: a one-line design-basis note under c_comp and, when c_comp = 0, a red note at the end of the summary: not
  designed as composite; bare steel to EN 1993-1-1 / EN 1993-1-5 with L_LT = stud spacing; UR from the steel-alone
  deflection. These are conditional texts (new app feature: Text → "Print only when", props.showWhen): printed only
  while the condition holds, greyed out on screen otherwise.

## Rev G: per-row ULS factor, construction deflection curve

- Both load tables carry a column `ULS factor γ_F` (defaults γ_G = 1.35 on G rows, γ_Q = 1.5 on Q rows).
  ULS internal forces use `M_U(x) = dot(w_U, k_u(x)) + dot(F_U, k_P(x))` with `w_U = γ_F p_k s_b`, `F_U = γ_F F_k`
  (and the matching `V_U`); self-weight g_0 keeps γ_G. The G/Q pattern still decides the SLS combination
  (ψ_2 and the deflection curvatures). With the default factors every result is unchanged.
- Construction stage: `δ_1(x) = w_1,k x (L_1³ − 2 L_1 x² + x³) / (24 E_a I_a)` over L_1 (100 intervals) with a chart;
  its peak equals the closed-form δ_1 (unit test).
- mCompositeBeamDesign: a blank factor takes the pattern default; switching G/Q moves a default factor with it.
- Self-weight g_0 takes a fixed ULS factor γ_G,sw = 1.35 (EN 1990 Table A1.2(B)); it is not a user input and γ_G
  no longer moves it (γ_G still applies to formwork and is the default γ_F of G rows).
- Annex "UR against η": η_v from η_min to 1; UR_M(η) = M_2,Ed / (M_a,Rd + η (M_pl,Rd − M_a,Rd)) and
  UR_δ(η) = max(δ_x,f + (1 − η) δ_x,0) / δ_lim with δ_x,f the full-interaction curve and δ_x,0 the slip term
  C_s (κ_a − κ_c). At the provided η it reproduces δ_max (unit test). Plotted on the design page only.
- Slab longitudinal shear (EC4 §6.6.6): inputs grouped in 1.7 (top bars d_s,t / s_f,t, bottom bars d_s,b / s_f,b,
  stud head d_head, cot θ_f). Surface a-a: v_f / 2 on each of two planes h_c deep, A_t + A_b (6.6.6.2(3)).
  Surface b-b: l_b = 2h_sc + d_head + b_0 (6.6.6.1(3)), the whole v_f, 2A_b. Both with EC2 (6.21) and the strut (6.22);
  UR_slab = max of the four enters UR_c. Figure F4 and the design page draw each surface in its own oblique view.
- cot θ_f is no longer an input: on each surface the worksheet takes the largest value in 1.0 … 2.0 (EC2 §6.2.4(4),
  compression flange) with v_Ed ≤ ν f_cd / (cot θ + 1/cot θ): cot θ = (ρ + √(ρ² − 4))/2, ρ = ν f_cd / v_Ed, clipped
  to [1, 2]; ρ < 2 gives cot θ = 1 and a strut UR above 1. This is the angle that needs the least transverse steel.
- The η trend (annex A.3 and the design-page charts) was removed at the user's request.
- Design page: "Optimize: lightest <family>" tries every section of the family by increasing mass and keeps the
  first with governing UR ≤ 1 over every check of the design basis in use, construction stage included
  (CompositeModel.optimizeSection; unit test checks every lighter section fails). Without one, the section is restored.
- Longitudinal shear views show the bars repeated along the span (spacing indicative).
- Optimizer speed: sections are checked by a pool of up to 4 workers (started in the background after load);
  each first runs a screening model without the four deflection curves (about 3× faster, identical other
  checks — unit test), and only survivors get the full worksheet. The lightest passing section is the same as
  the serial search (unit test). Section-independent table-load vectors (M_U,v, M_s,qp, …) are now their own
  annex regions, and the unit-load moment m_w has no IF. Default case: 6.2 s → 1.4 s on 2 cores.
