# Validation report — Rev E, 14 November 2026

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
| Studs needed per shear span (η_min governs) | 17 ≤ 24 provided | same |
| Spacing s_A / s_B | 125 / 208.3 mm (95 ≤ s ≤ 229) | same |
| Max UR along span from stud count | 0.6701 (just right of the load) | same; > 0.6405 at x_M |
| PNA case at x_M and under the load | 1 = top flange | same |
| δ_LT, δ_tr, δ_slip, δ_tot | 6.076, 3.763, 1.850, 31.055 mm | grid virtual work, within 0.0005 mm |
| Added row 6 m, 10 G + 10 Q kN | M_Ed 490.630 kNm at 3.061 m | 40 mm grid, within 0.007 kNm |
| Point load 100 G + 150 Q kN at 2 m | x_M = 2 m, s_A = 83.3 mm < 5d | spacing check fails |

## Sources opened this revision

- SCI P359 (2011): §4.2.3 Nc = ηNc,f and linear interaction conservative; §4.4.3 η_min rule.
  Its flange-PNA formula neglects the compressed flange part (conservative); the worksheet uses
  exact equilibrium. The text extract did not let the figures be checked visually.
- SCI P405 (2015) §4.2.1: studs counted from the support to the maximum moment; studs between point
  loads are not fully effective. §4.2.4: η_min is less severe for point loads (the UDL rule is kept).
- Not checked: SCI P364 Example 8; Singapore NA values.

## Inspection

`app-export/Composite_Beam_EC4_RevE_app.pdf` (22 pages) was exported by the app and every page was
inspected; `app-pages-contact.png` shows all pages.
