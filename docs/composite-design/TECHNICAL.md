# EC4 composite beam worksheet — Rev E review draft

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
UB 406 × 178 × 60 S355 (SCI P363 rounded properties, cross-checked against published tables:
A 76.5 cm², Iy 21600 cm⁴, Iz 1200 cm⁴ (1203 unrounded), Wpl 1200 cm³, It 33.3 cm⁴, Iw 0.466 dm⁶),
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

Section example: η = 0.721624, η_min = 0.49, x_f = 79.875 mm (full connection: slab PNA, steel all in
tension), x_c = 57.640 mm, y_a = 5.985 mm (inside the 12.8 mm flange), η_f = 0.404675,
η_fr = 0.3719. M_pl,Rd = 850.74, M_Rd = 732.50 (linear), M_Rd.pl = 787.06 kNm.

Main body: one symbolic stress block (F3); the PNA case is reported numerically in section 9.4.
Annex: the general force model and branch boundaries.

## Rev E: load tables, stud spacing and PNA case

- Composite-stage loads are two matrix inputs: `W_udl` rows [x1, x2, g_k, q_k] and `P_pt` rows
  [a, G_k, Q_k]; adding a row adds a load. Self weight g_0 acts in every stage. Point loads are assumed
  to act after composite action; the construction stage keeps its UDL.
- M(x), V(x) on a 200-step grid (annex A.1, user functions with factors cG, cQ); M_Ed is the larger of
  the grid maximum and the moments under the point loads (grid error ≤ wΔx²/8). Graphs M_Ed, V_Ed.
- Studs: the shear spans run from each support to the maximum-moment section x_M (SCI P405 §4.2.1).
  n_req = ceil(max(η_min, (M_Ed − M_a,Rd)/(M_pl,Rd − M_a,Rd)) N_c,f / P_Rd) per span; uniform spacing
  s_A = x_M/n_h and s_B = (L − x_M)/n_h, checked against 5d and min(22 t_f ε, 6h_c, 800 mm).
  A large point load moves x_M, so the spacings change. M_Rd(x) is then evaluated at every grid point
  from the studs between x and the nearer support (EC4 (6.3)) and UR = max M_Ed/M_Rd(x) ≤ 1.
  Graphs: M_Ed(x) against M_Rd(x), and the stud count n(x).
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
