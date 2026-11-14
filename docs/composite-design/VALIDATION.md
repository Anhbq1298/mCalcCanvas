# Validation report — Rev F, 14 November 2026

## Passed

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass, 0 warnings |
| `npm test` | 32 files, 81 tests pass |
| `npm run test:e2e` (system Chrome) | 71 passed, 2 skipped (visual capture specs) |
| `python tools/templates/reference_composite.py` | identical to `reference.json` |
| `npm run templates:columns -- --only=composite --pdf` | no "regions moved by the app" warning |

## Independent reference (`reference_composite.py`)

Closed-form beam (UDL + point loads, exact maximum), closed-form midspan deflections, numerical
integration of the filleted steel width for the PNA, and an independent stud count along the span.

| Quantity | Reference | Worksheet |
|---|---|---|
| M_Ed (UDL 4.5 + 9 kN/m, P = 30 G + 45 Q kN at 3 m) | 469.188 kNm at 3.0 m | same |
| V_Ed | 209.734 kN | same |
| Studs needed per shear span (η_min governs) | 17 | same |
| Spacing inputs 125 / 200 mm → studs per span | 24 / 25, weaker span 24 | same |
| Max UR along span from stud count | 0.6601 (just right of the load) | same; > 0.6405 at x_M |
| PNA case at x_M and under the load | 1 = top flange | same |
| δ_LT, δ_tr, δ_slip, δ_tot | 6.076, 3.763, 1.850, 31.055 mm | grid virtual work, within 0.0005 mm |
| Added row 6 m, 10 G + 10 Q kN | M_Ed 490.630 kNm at 3.061 m | 40 mm grid, within 0.007 kNm |
| Point load 100 G + 150 Q kN at 2 m | x_M = 2 m, 16 studs at 125 mm | η < η_min check fails |

## SCI P364 Example 8 (2009/10), run through the worksheet with its inputs

The example uses a CF60 deck slab; the solid-slab-compatible quantities were compared (unit test
overrides the worksheet inputs; reference script `sci_p364_example_8`).

| Quantity | SCI | Worksheet | Note |
|---|---|---|---|
| P_c,Rd (6.19), solid | 73.7 kN | 73.73 kN | match |
| η_min (6.12), L = 12 m, S275 | 0.50 | 0.4965 | match (SCI rounds) |
| b_eff | 3.00 m | 3.00 m | match |
| x_c, full connection | 61.5 mm | 61.6 mm | match |
| M_pl,Rd | 952.4 kNm | 952.3 kNm | match |
| M_Rd (6.3), N_c = 1252 kN | 715.7 kNm | 715.1 kNm | SCI rounds η to 0.48; SCI needs its relaxed deck rule η_min = 0.4, the worksheet (6.12) gives bare steel |
| x_pl, PNA in flange, N_c = 2080 kN | 5.90 mm | 5.90 mm | same formula |
| M_Rd rigid-plastic, N_c = 2080 kN | 903.9 kNm | 911.8 kNm | +0.9 %; SCI expression not legible in the extract |

## Steel Buildings in Europe, multi-storey Part 4, worked example A.4 (2009)

Primary beam IPE 400 S355, L = 9 m, secondary beams as two point loads at 3 m and 6 m (G 62.78 kN,
Q 45 kN each), b_eff 2.25 m, 140 mm slab on deck, C25/30. Inputs replaced in the unit test (span, section,
concrete, ρ_c = 0 because the slab weight is inside the point loads; load tables: two point-load rows).

| Quantity | SBE | Worksheet | Note |
|---|---|---|---|
| M_Ed (point-load table) | 465.6 kNm | 465.65 kNm | match |
| V_Ed | 156.20 kN | 156.20 kN | match |
| M_pl,a,Rd | 463.98 kNm | 463.99 kNm | match |
| A_v, V_pl,Rd | 4269 mm², 874.97 kN | 874.99 kN | match |
| Shear buckling limit 72ε/1.2 | 48.6 | same rule | match |
| η_min (6.12), L_e = 9 m | 0.520 | 0.520 | match |
| b_eff | 2.25 m | 2.25 m | match |
| P_Rd solid (before deck factor k_l) | 73.73 kN | 73.73 kN | match |
| Steel PNA for N_c = 1403 kN | 12 mm below top (h_n = 388 mm) | 12.48 mm | match |
| Rigid-plastic M_Rd, N_c = 1403 kN | 738 kNm | 755.3 kNm | +2.3 %; deck slab, concrete only above the ribs; SBE lever arm not legible |

Not comparable here: SBE's construction LTB uses EC3 §6.3.2.3 with secondary-beam restraints at 3 m
(this sheet: §6.3.2.2 over L or k_LT L); deck-slab N_c,Rd and stud reduction factors (solid-slab scope).

SBE example A.3 (IPE 270, 7.5 m, propped, deck) was also read: η_min 0.475, A_v 2214 mm², V_pl,Rd 453.8 kN
and the steel PNA (h_n = 263 mm) follow the same equations; its M_Rd 301.7 kNm uses the deck geometry.

## Propped construction (c_prop = 1, k_LT = 0.5)

Reference: M_1,Ed 42.77 kNm, UR_LT 0.216, δ_1 1.15 mm, δ_g 4.75 mm (on I_L), δ_slip 3.08 mm,
δ_tot 23.12 mm — pinned in the unit test.

## Sources opened

- SCI P359 (2011): §4.2.3 Nc = ηNc,f and linear interaction conservative; §4.4.3 η_min rule.
  Its flange-PNA formula neglects the compressed flange part (conservative); the worksheet uses
  exact equilibrium. The text extract did not let the figures be checked visually.
- SCI P405 (2015) §4.2.1: studs counted from the support to the maximum moment; studs between point
  loads are not fully effective. §4.2.4: η_min is less severe for point loads (the UDL rule is kept).
- Not checked: SCI P364 Example 8; Singapore NA values.

## Inspection

`app-export/Composite_Beam_EC4_RevE_app.pdf` (22 pages) was exported by the app and every page was
inspected; `app-pages-contact.png` shows all pages.
