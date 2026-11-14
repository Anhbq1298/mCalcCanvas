# Validation report — Rev D, 14 November 2026

## Passed

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 errors, 0 warnings |
| `npm test` | 32 files, 81 tests pass |
| `npm run build` | pass |
| `npm run test:e2e` (system Chrome, `CHROME_PATH=/usr/bin/google-chrome`) | 71 passed, 2 skipped (visual capture specs) |
| `python tools/templates/reference_composite.py` | output identical to `reference.json` |
| `npm run templates:columns -- --only=composite --pdf` | no "regions moved by the app" warning |
| Worksheet opened in the built app | 192 math regions, all valid; 1 failed check (construction LTB, intended) |

## Independent numerical reference

`reference_composite.py` finds the steel PNA by midpoint integration of the rolled width with circular
root fillets (pieces split at the flange underside and the fillet toe), not by the worksheet branch
formulas. The unit test pins the worksheet against it:

| Case | η | y_a (mm) | M_Rd.pl (kNm) | Branch |
|---|---|---|---|---|
| n_h = 24 (example) | 0.7216 | 5.9853 | 787.061 | top flange |
| n_h = 14 | 0.4209 | 12.4501 | 694.310 | top flange (near η_f = 0.4047) |
| n_h = 8 | 0.2405 | 86.617 | 612.146 | web; η < η_min so M_Rd = M_a,Rd = 426 |
| n_h = 13 | 0.3909 | — | — | fillet transition: check fails visibly |

Also pinned: x_c 57.640 mm, x_f 79.875 mm, η_f 0.404675, force residual ≈ 0, M_Rd 732.505 kNm,
LTB UR 1.874 (fail retained), transverse UR 0.538 (Rev D shear-flow change, see TECHNICAL.md).

## PDF inspection

`app-export/Composite_Beam_EC4_RevD_app.pdf` is exported by the application (`tools/templates/pdf.mjs`).
All 21 pages were rendered and inspected at readable scale; label/line clashes found during the
review (truncated labels, dimension text over extension lines, orphaned descriptions at page breaks,
an annex formula block shown with error badges) were fixed and the PDF re-exported.
`app-pages-contact.png` shows every page; `app-D05-governing-stress-block.png` is the app view.

## Not done / blocked

- SCI P359, P405, P364 pages not opened in this session (web access approval not given).
- Singapore NA values, surface b-b / splitting / anchorage, SLS acceptance: open engineering gates.
- Owner's visual approval of the eleven figures.
