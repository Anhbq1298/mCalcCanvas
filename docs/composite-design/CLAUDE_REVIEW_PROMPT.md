# Claude task: review and finish the EC4 composite beam worksheet

Repository: Anhbq1298/mCalcCanvas. Work on the head branch of the EC4 review PR, preserving unrelated work. Read AGENTS.md and the existing EC3 template architecture first. The user's immediate milestone is engineering content and native worksheet layout approval, not a new calculation engine. Review and fix the implementation; do not stop at listing findings. Commit and push fixes to this PR; do not merge.

## Current files and honest status

- tools/templates/gen_composite.mjs, compositeFigures.mjs: draft native worksheet generator.
- templates/Composite_Beam_EC4.mCCV: generated draft. Never edit its JSON manually.
- tools/templates/reference_composite.py; docs/composite-design/reference.json: independent numerical reference.
- src/tests/unit/compositeTemplate.test.ts: existing checks.
- docs/composite-design/TECHNICAL.md and VALIDATION.md: assumptions and outstanding gates.
- docs/composite-design/preview/: Rev C PDF, contact image of eleven figures, and editable LaTeX source. This PDF was rendered offline from worksheet calculations, NOT exported from mCalcCanvas. Its figure corrections and presentation are NOT yet implemented in the native generator. Treat it as a review reference, not evidence of canvas fidelity or a certified design.

## Highest priority: correct the PNA logic and presentation

The owner correctly identified that PNA position is an OUTPUT of geometry, materials and degree of shear connection, not a user-selected case. Do not present slab/top-flange/web diagrams as three simultaneous checks for one input set.

For the scoped solid slab, symmetric I-section, sagging bending and no applied axial force, verify the rigid-plastic equilibrium formulation:
- N_full = min(A_a f_yd, 0.85 f_cd b_eff h_c).
- In admissible partial shear connection, N_c = eta N_full, limited by the available connector resistance between zero and maximum moment.
- A_ac = (A_a - N_c/f_yd)/2; x_c = N_c/(0.85 f_cd b_eff).
- Determine steel PNA from cumulative compressed steel area, including rolled root fillets. Do not combine a sharp-corner web formula with an area including fillets.
- Reduced eta reduces concrete force and increases compressed steel area. Distinguish concrete compression depth from the steel stress reversal axis; do not impose a single full-interaction PNA on partial connection.
- A_ac <= A_a/2 in this scope: a lower-flange PNA is inadmissible.
- eta is connection degree, never a utilization ratio. Enforce minimum eta, stud ductility, section class and method applicability before accepting a resistance.
- Distinguish the direct stress-block resistance from the conservative EC4 linear-interaction result. Do not label an illustration of the former as the exact stress field corresponding to the latter.

For the draft inputs, independently verify: eta approximately 0.721624; x_c approximately 57.640 mm; steel PNA approximately 5.985 mm below top steel (inside the 12.8 mm flange). Full connection gives x_c approximately 79.875 mm and all steel in tension. The flange-underside boundary eta = 1 - 2 b_a t_f/A_a is approximately 0.404675. The web branch is a general alternative, not the governing branch for this example. These values are audit targets, not authority to hardcode outputs or bypass limits.

Display ONE governing stress-block illustration in the main calculation, with dimensions, force magnitudes, centroids and applicable branch. Retain a clearly labelled full-connection reference only if needed to explain the linear-interaction baseline. Put alternative branches and selection derivations in the linked annex. First phase may use the selected worked example with explicit scope; do not falsely claim an automatic general solver exists. Any proposed engine extension requires a separately described future scope.

## Sources to inspect, not just cite

1. SCI P359, sections 4.2.2–4.2.3, printed pages 31–32, Figure 4.4; EC4 6.2.1.3 reference:
   https://steelconstruction.info/images/c/c7/SCI_P359.pdf
2. SCI P405, section 1.1, Figure 1.1, force-transfer limits:
   https://steelconstruction.info/upload/Wiki-Files/5/5d/SCI_P405.pdf
3. SCI P364, Example 8: compare full-connection slab PNA with partial-connection steel PNA and the two resistance methods. Obtain the actual publication from SCI/SteelConstruction.info and verify the edition.
4. Verify applicable SS EN 1994-1-1 clauses and Singapore National Annexes. SCI documents use UK provisions; do not silently adopt UK NCCI or NA parameters for Singapore. Identify any source you cannot access.

## Engineering review and correction

Review all thirteen worksheet sections, dimensional consistency and loading stages. Verify section properties against a traceable source. Separate construction steel-only ULS/SLS/LTB from post-curing composite action, including locked-in deflection, creep and shrinkage. Wet concrete does not automatically restrain the beam. Verify stud resistance, count, spacing and force-transfer length; effective width versus tributary load width; vertical shear interaction; longitudinal shear, transverse reinforcement and anchorage.

Preserve genuine failed checks: the current reference has construction LTB and transverse reinforcement failures. Do not change loads/restraints/rebar merely to make the example pass without explicitly identifying the revised design assumptions. Review the SLS slip allowance, shrinkage/cracking model and incomplete local splitting/anchorage checks. Do not describe unverified release gates as complete.

## Figures and native layout

Audit all eleven figures in Rev C before porting them; the owner rejected earlier figure quality. Rev C improves drawings but is not an approved reference. Use editable native shapes or supported vectors and the existing layout helpers. Correct dimension extension lines, arrow direction, label clearance, geometric proportions, centroid locations and stress amplitudes. Separate stress diagrams from force resultants; steel force centroids require area weighting, not simply the midpoint of the entire stress rectangle. Use consistent tension/compression sign conventions. Draw 48 studs if the figure claims 48, or explicitly use a justified schematic. Distinguish transverse section, plan and elevation. Do not imply schematic anchorage is a verified detail.

Regenerate the .mCCV through the generator; open it in the real app, measure regions and resolve overlap/moved-region warnings. Export the PDF from the actual application and inspect EVERY page and each figure at readable scale. Do not substitute the offline LaTeX PDF for this acceptance check. If blocked, report the exact blocker and leave acceptance pending.

## Verification and deliverables

Run typecheck, lint, unit tests, production build, e2e tests and the independent Python reference. Follow the repository's small-test-suite conventions. Verify branch boundaries, force equilibrium, connector limits and the numerical example without tests that merely repeat implementation formulas. Distinguish pass/fail/blocked; do not claim a browser test passed if the browser cannot launch.

Deliver corrected generator + generated native worksheet + actual-app PDF/screenshots + updated technical/validation notes. Summarize findings by severity, fixes, remaining engineering limitations, tests and precise commit hashes. Keep changes focused and reviewable.
