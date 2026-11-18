# Construction-stage top-flange bracing

The existing Vlasov eigenvalue solver remains authoritative. `flangeRestraints`
adds exact mesh stations and imposes `v + z phi = 0`, with z positive above the
shear centre, in mm. It leaves lateral rotation, twist and warping free unless a
separate support constrains them. The old `restraints` array still means forks.

## Sign and reduction

The existing load energy is `+ integral M v'' phi dx`. Consider two flange forces
under positive sagging moment: compression -M/(2z) at the top and tension +M/(2z)
at the bottom. With `u_top = v + z phi`, `u_bottom = v - z phi`, their geometric
energy is `-M v' phi'`. Integration by parts for constant M gives `+M v'' phi`,
matching the existing assembly. Choosing the opposite sign would restrain the
other flange. This independent flange-force energy check is pinned in the test.

At a braced node, v is eliminated as -z phi. Sparse transformation rows reconstruct
`d = Tq`; both matrices use the complete congruence `T^T K T`, `T^T B T`. No penalty
stiffness is used. Existing fixed DOFs propagate the coupled condition; a brace
at an already fork-supported station is redundant. Eigenmodes use the same T.

The independent reference uses global sine-series Ritz functions and Simpson
integration. Its constraints eliminate global coefficients, independently of the
local Hermite elements and Gaussian integration in the production solver.

## Numerical verification

Reference: L = 6000 mm, E = 210000 MPa, G = 81000 MPa, Iz = 538e4 mm4,
It = 19e4 mm4, Iw = 207e9 mm6, h = 403.2 mm, tf = 11.2 mm, tw = 6.8 mm.
UDL = 1 N/mm on the top flange; M(x) = x(L-x)/2. Fork ends, free warping.
The tapered member varies linearly from 300 to 403.2 mm, with the existing
property interpolation and the local flange offset h(x)/2 at every station.
All entries below are Mcr in kNm. Reproduce with `node tools/templates/verify_ltb_bracing.mjs`.

| Section | Restraints | FE 12 | FE 24 | FE 48 | Ritz 45 terms |
|---|---|---:|---:|---:|---:|
| Uniform | None | 76.604774 | 76.603790 | 76.603728 | 76.603724 |
| Uniform | Fork at 0.5L | 332.244828 | 332.193500 | 332.190231 | - |
| Uniform | Top flange at 0.5L | 332.244828 | 332.193500 | 332.190231 | 332.190017 |
| Uniform | Top flange at 0.2L, 0.55L, 0.8L | 962.865944 | 961.972058 | 961.891102 | 961.900274 |
| Tapered | None | 73.105620 | 73.104670 | 73.104610 | 73.104606 |
| Tapered | Fork at 0.5L | 298.651511 | 298.605804 | 298.602892 | - |
| Tapered | Top flange at 0.5L | 298.642167 | 298.596446 | 298.593533 | 298.593344 |
| Tapered | Top flange at 0.2L, 0.55L, 0.8L | 827.266032 | 826.501884 | 826.434205 | 826.442483 |

The symmetric uniform midspan case has a natural twist node, and can therefore
coincide numerically with the fork result. Unequal and off-grid stations retain
nonzero twist at the braces. Tests check the scale-normalized residual of every
coupled constraint, load-height sensitivity, exact mesh stations and convergence.
A numerical equality in this special case does not make the constraints identical.

## Application and migration

This checkout differs from the supplied repository description: it has no c_brace,
no c_NA selector and no FE-derived Singapore C1 branch. Here kLT belongs to c_prop
and sets vertical prop spacing. It never generated intermediate lateral forks.
Those existing inputs and the existing resistance calculation are preserved.
The template still flags Singapore NA verification as outstanding.

Missing bracing data selects legacy worksheet mode. Conversion is explicit in
Define Construction Stage: choose explicit mode, enable temporary braces, and
enter physical stations. No positions are inferred from kLT. Saved positions are
absolute metres; dimensions and section edits do not move them. A span edit that
leaves a station outside the beam produces a validation error.

Existing vertical props continue dividing the construction beam into its existing
fork-ended spans. Braces inside each span use local coordinates and local depth.
The in-plane construction loads and moment/shear diagrams do not change. With no
vertical props, M1 = w1 L^2 / 8. No effective-length reduction is added for braces.
Continuous transverse deck restraint retains precedence; when it governs, the
modal and report say that the worksheet/deck approximation is in use.

The modal uses a separate calculation worker for draft results. Save commits
numerical inputs and braces as one undo action; Cancel and Escape discard drafts.
Reset resets the construction inputs and returns to legacy mode. Calculations,
full optimizer workers and screening workers share the same state-transfer helper.
A worker-local cache (256 physical problems) reuses FEM results across detail
candidates. Its key includes all section properties, span and propping, loads and
load height, linear depth endpoints, and the complete bracing configuration.
Changing a station, section or loading therefore selects a different problem.

## Reports and persistence

Brace configuration is an optional validated property of the visible construction
report note. It survives the normal document sanitizer and canvas save/export path;
no extra input table is added to the two load tables. The report lists absolute
stations and normalized coordinates on additional pages.

The report carries full-precision FEM Mcr, alpha_cr, alpha_ult and the governing
imperfection factor as worksheet input definitions. Its construction slenderness
and resistance equations use these to reproduce the page utilization, including
for a tapered section. SN003b remains an explicitly labelled analytical comparison.
Editing a reopened tool model clears the old FE report snapshots before recalculation.
As with the existing Mcr.FE report mechanism, the standalone canvas displays an
exported FEM snapshot: it does not itself rerun Vlasov FEM after arbitrary worksheet
edits. Regenerate the report through the composite tool for a revised design.

## Changed files

- Solver: `src/engineering/fem/ltb.ts`.
- Application: `src/tools/composite/App.tsx`, `ConstructionStage.tsx`, `charts.tsx`,
  `model.ts`, `worker.ts`, `optimizer.ts`.
- Document validation: `src/canvas/model/types.ts`, `src/documents/DocumentSerializer.ts`.
- Worksheet: `tools/templates/gen_composite.mjs`, `sizes_composite.json`,
  `templates/Composite_Beam_EC4.mCCV` (regenerated and measured without moved regions).
- Verification: `src/tests/unit/fem/ltb.test.ts`, `ritz.ts`,
  `src/tests/unit/compositeTool.test.ts`, `src/tests/integration/composite-tool.spec.ts`,
  `tools/templates/verify_ltb_bracing.mjs`.
- Notes and tooling: this document and `knip.json` (register the composite app entry).

## Validation results

- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- `npm test`: 36 files, 97 tests passed.
- `npm run test:e2e`: 78 passed, 2 existing visual captures skipped.
- Composite browser suite: 5 passed; final construction-flow regression additionally
  verifies that a span change leaving an out-of-range brace blocks report export.
- Focused solver/model regressions passed, including independent Ritz comparison,
  mode constraints, local taper depth, worker state, disabled braces, deck precedence,
  sanitizer rejection and direct worksheet-engine reproduction of the tapered UR.
- Template regenerated and measured without moved-region warnings. The template PDF
  and a 35-page explicit-bracing tapered report were rendered and visually reviewed.
- `npm run deadcode` still exits 1 for pre-existing unused items (including the
  composite LTB re-export shim, font dependency and unused exports). The composite
  app entry is now registered so its live components are recognized by Knip.
