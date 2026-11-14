# EC4 composite beam worksheet — Rev D review draft

Editable worksheet for engineering and native-layout review, **not an approved design**.
No calculation-engine source is changed: every result is a worksheet equation evaluated by the
existing engine. Rev D (this revision) implements the PNA review requested in
`CLAUDE_REVIEW_PROMPT.md` and was measured and exported from the real application.

## Files and reproduction

- `tools/templates/gen_composite.mjs`: inputs, equations, checks, annex blocks.
- `tools/templates/compositeFigures.mjs`: eleven native vector figures (line / rect / draw / text).
- `tools/templates/compositeExample.mjs`: example inputs and the plastic state used only to draw and
  label the figures (figures are generated for the example inputs; the worksheet regions govern).
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

Example: η = 0.721624, η_min = 0.49, x_f = 79.875 mm (full connection: slab PNA, steel all in
tension), x_c = 57.640 mm, y_a = 5.985 mm (inside the 12.8 mm flange), η_f = 0.404675,
η_fr = 0.3719. M_pl,Rd = 850.74, M_Rd = 732.50 (linear), M_Rd.pl = 787.06 kNm.

Main body: one stress block (D05, governing branch, dimensions, stress amplitudes, force magnitudes at
area-weighted centroids). Annex: full-connection reference (D06), web-branch illustration at a
hypothetical η = 0.30 (D07), lower-flange rejection (D08), the general force model and boundaries.

## Other engineering decisions in Rev D

- **Longitudinal shear (changed, for owner approval).** The draft used v_Ed = 2N_c/(L h_c), a doubled
  flow with no code basis, and failed. Rev D uses the connector flow for uniformly spaced ductile studs,
  v_Ed = P_Rd/(2 s h_c) per plane a-a (equal to N_c/(L h_c)), consistent with EC4 6.6.6.1 and
  EC2 (6.20)/(6.21). Required A_sf = 281.7 mm²/m vs 523.6 provided, UR = 0.538. Loads, bars and
  restraints are unchanged. Surface b-b around the stud (needs bottom bars), splitting and anchorage
  remain unchecked gates. If the owner wants an extra local-concentration factor, it must be stated as
  a project rule.
- Construction LTB failure is retained (UR = 1.874, fork ends only, no wet-slab restraint).
- Wide full-substitution regions (A_v, w_1.Ed, M_cr, I_0/L/s, M_Rd.pl) show formula = result so they fit.
- Description + region are print-grouped (`printGroupId`) so a page break never separates them.

## Sources and verification limits

- EN 1994-1-1 clauses used: 2.4.1.2, 5.4.1.2, 5.4.2.2, 6.2.1.2, 6.2.1.3 (6.3), 6.2.2.4, 6.6.1.2 (6.12),
  6.6.1.3(3), 6.6.3.1 (6.18)/(6.19), 6.6.5, 6.6.6; EC3 5.5, 6.2.5–6.2.8, 6.3.2.2; EC2 6.2.4.
- SCI P359 §4.2.2–4.2.3, P405 §1.1 and P364 Example 8 could **not** be opened in this Rev D session
  (web access needed approval that was not given). The formulation above follows EN 1994-1-1 directly;
  the SCI cross-check, and the P364 edition, remain to be done.
- Singapore NA to SS EN 1994-1-1: values not verified. γ factors, ψ2, combinations and η_min rule are EN
  recommended/EN text; UK NA / NCCI relaxations are not adopted. PN002a slip allowance is NCCI guidance.

## Acceptance status

| Item | Status |
|---|---|
| PNA from inputs, flange / web branches, fillet transition flagged | Done (worksheet + tests) |
| One governing stress block in main body; alternatives in annex | Done |
| Native figures corrected and drawn to scale where stated | Done; owner visual approval pending |
| Real-app measurement, no moved regions, PDF exported and inspected | Done (21 pages) |
| SCI P359/P405/P364 cross-check | Blocked (sources not accessed) |
| Singapore NA parameters and combinations | Pending |
| Surface b-b, splitting, anchorage, transverse slab bending | Pending (gates) |
| SLS shrinkage history, cracking, slip model adoption | Pending |
| Fillet-transition branch solver, UB library binding | Not implemented |
