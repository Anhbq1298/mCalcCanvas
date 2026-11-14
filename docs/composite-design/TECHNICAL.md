# EC4 composite beam worksheet — phase-one review draft

This is an editable worksheet development draft, **not the accepted milestone**. The
actual-app size-measurement pass and PDF export could not run in the current environment.
No calculation-engine source was changed. The generator uses the existing layout helpers
and the existing equation evaluator. All numerical results remain worksheet equations.

## Files and reproduction

- `tools/templates/gen_composite.mjs`: native inputs, equations, checks, linked annexes.
- `tools/templates/compositeFigures.mjs`: eleven editable native vector diagrams.
- `templates/Composite_Beam_EC4.mCCV`: generated review worksheet; do not hand-edit.
- `tools/templates/reference_composite.py`: independent N–mm–MPa calculation.
- `docs/composite-design/reference.json`: reproducible independent reference results.
- `src/tests/unit/compositeTemplate.test.ts`: dimensional/equation and numerical pins.

```bash
python tools/templates/reference_composite.py > docs/composite-design/reference.json
node tools/templates/gen_composite.mjs
npm run build
CHROME_PATH=/usr/bin/chromium npm run templates:columns -- --only=composite --pdf
npm run typecheck
npm run lint
npm test
CHROME_PATH=/usr/bin/chromium npm run test:e2e
```

The PDF command must run before presentation approval. It measures regions in the real
app and regenerates the document; commit the resulting `sizes_composite.json` only after
checking the dimensions. Inspect every exported PDF page, including figure annotations.
The generator's provisional page count is not a verified PDF page count.

## Engineering choices and findings

Positive bending, simply supported, solid 150 mm slab, 8 m span, 3 m tributary width,
unpropped UB 406 x 178 x 60, S355, C30/37. Published rounded properties are explicit
inputs. Current repository section tables do not include UB; this draft does not pretend
to bind these inputs to the library. Section lookup is an outstanding integration task.

Wet concrete and steel self weight are carried by bare steel. Construction loads include
0.75 kPa variable load and 0.5 kPa removable formwork. Only end fork restraints are credited.
Construction LTB fails: UR = 1.874270467. This requires temporary bracing or a changed design.
Construction deflection is 18.3299 mm, below the assumed project L/250 limit of 32 mm.

One stud row, 48 studs total, 24 in each half-span, pitch 166.667 mm, first centre
83.333 mm from the end; 19 mm diameter, 100 mm height, fu = 450 MPa.
PRd = 81.6563 kN; eta = 0.7216241; eta,min = 0.49 using the standard equal-flange rule.
The full-connection concrete block is 79.875 mm deep. The partial-connection steel PNA
is 5.9853 mm below the top steel surface, **inside the upper flange**, not the web.

Main design uses the conservative straight-line interaction between steel-only resistance
426 kNm and full composite resistance 850.7426 kNm: MRd = 732.5045 kNm.
An independent top-flange stress-block equilibrium gives 787.0608 kNm and confirms
that the linear method is conservative for this example. Final demand is 284.4675 kNm.
No eta-based utilisation is used; utilisation symbols are UR, eta is degree of connection.

At partial connection the slab compression block and steel stress reversal need not have
a common neutral axis. The annex defines cumulative compressed steel area and first
moment using the actual rolled width function, including fillets. It describes top-flange,
fillet-transition and upper-web branches. For symmetric steel, Nc >= 0 and zero external
axial force imply Aac <= Aa/2. A lower-flange PNA is therefore rejected in this scope.
A general automatic branch solver and numerical branch fixtures are **not implemented**.

Longitudinal shear uses two symmetric vertical shear planes with half-transfer per outstand.
A conservative local transfer envelope of twice uniform connector flow is used. H10-150
provides 523.599 mm2/m per plane versus 563.428 mm2/m required: this check fails.
Stud-group enclosure planes, splitting, anchorage and simultaneous transverse slab bending
are review gates, not covered by a blanket pass.

SLS shows short-term and creep-transformed properties, loads by stage, free-shrinkage
elastic eigenstrain curvature and NCCI PN002a's unpropped slip allowance. Shrinkage
and creep are assumed explicit inputs, not a calculated EC2 drying-history model.
The slip expression is identified as NCCI guidance, not a Singapore National Annex rule.
Estimated total deflection = 25.1390 mm. This is not a final SLS approval: cracked-section
assessment, staged shrinkage history and adoption of the slip model remain open.

## Verified sources and limits of verification

- [BCA Approved Document](https://www1.bca.gov.sg/docs/default-source/docs-corp-regulatory/approveddoc.pdf): use SS EN 1994 with its Singapore National Annex.
- [Singapore Standards catalogue — NA to SS EN 1994-1-1:2009 (2019)](https://www.singaporestandardseshop.sg/Product/SSPdtDetail/08b79411-2cfe-4950-8aeb-43149127a4de): standard identity; catalogue does not expose the NDP values.
- [European steel partners / SCI — Technical Software Specification for Composite Beams](https://steelconstruction.info/upload/Wiki-Files/a/aa/SBE_MS10.pdf): construction/final stage structure and clause cross-checks.
- [SCI P364, worked examples](https://steelconstruction.info/upload/Wiki-Files/5/50/Sci_p364.pdf): EC4 connector methodology and ductility requirements.
- [SCI PN002a-GB](https://steelconstruction.info/upload/Wiki-Files/3/3d/PN002a.pdf), §3: supplementary unpropped slip allowance; the relaxed UK minimum-degree rules are not adopted.
- [SCI properties compendium](https://steelconstruction.info/upload/Wiki-Files/e/e4/Compendium_UK4.pdf) and [SCI Steel Designers' Manual](https://uceb.eu/DATA/CivBook/47.%20Steel%20Designer_s%20Manual%2C%206th%20Edition%2C%20Steel%20Construction%20Inst%C3%ACtute.pdf): rounded legacy UB properties.
- [European Commission JRC EC2 training](https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/11_Eurocodes_Balkan_WS_SK_Malakatas_EN_1992.pdf): flange longitudinal shear equations (6.20)–(6.22).

Factors 1.35/1.50, gammaC 1.5, gammaS 1.15, gammaV 1.25 and gammaM0/gammaM1 1.0
are explicit EN recommended review values. Singapore NDPs, execution-stage combinations,
psi2 and material/detailing provisions need confirmation against project standards.
No complete SS EN / Singapore NA compliance claim is made.

## Acceptance status

| Requirement | Status |
|---|---|
| Native editable inputs, equations and units | Implemented, all active equations evaluated in unit test |
| Independent example | Python reference and numeric pins; not a reproduced published benchmark |
| Construction steel strength and LTB | Implemented; LTB failure visible |
| Partial connection degree and resistance | Implemented for the stated scope and example |
| General PNA | Annex derivation and diagrams; automatic solver and branch fixtures pending |
| Eleven editable illustrations | Native line/rectangle/text groups; visual QA pending |
| Longitudinal shear | Selected planes checked; local splitting/anchorage review pending |
| Staged serviceability | Review model implemented; history/cracking/acceptance pending |
| UB library lookup | Explicit section inputs only; binding pending |
| Singapore NA factors and combinations | Pending source confirmation |
| Real app measurement / PDF / visual QA | Blocked by Chromium launch restrictions |

No final design pass, no presentation approval and no completed acceptance milestone
should be inferred from the successful equation tests.
