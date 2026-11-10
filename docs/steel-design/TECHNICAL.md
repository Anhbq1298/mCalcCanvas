# EC3 steel beam-column implementation

## Edition and scope

EN 1993-1-1:2005 + A1:2014, straight prismatic doubly symmetric rolled I/H sections. No 2022 provisions are used. All model inputs are quantities; the pure engineering kernel uses explicit N, mm, MPa. National Annex inputs (gamma0, gamma1, gamma2, alphaY, alphaZ, alphaLT, eta) are editable. There is no claim of preapproved country presets. General LTB §6.3.2.2 only; alternative §6.3.2.3 is deferred. No load combinations or frame imperfections are generated: the designer supplies simultaneous actions including relevant second-order effects from the structural analysis.

The previous preliminary template has been replaced by `steel-beam-column`; `steel-beam` retains the original simple teaching example used by the existing app regression suite. Neither is a separate calculation engine.

## Traceability / calculation methods

| Calculation | Reference | Applicability and conservative choices |
|---|---|---|
| epsilon, flange class | §5.5 / Table 5.2 sheet 2 | Compression outstand limits 9/10/14 epsilon. Uniform compression used as conservative bound for a flange stress gradient; no benefit from tension is taken. |
| Web class | §5.5 / Table 5.2 sheet 1 | c=h−2(tf+r). For N+My, alpha follows equilibrium of a plastic web block; class 3 uses the elastic stress ratio. For biaxial bending the uniform compression limits are used conservatively. This can flag Class 4 where a more detailed stress analysis would permit a better class. |
| Tension | §6.2.3 (6.5)/(6.6) | Gross yield and 0.9 Anet fu/gamma2 fracture. Anet=A explicitly assumes no holes. Connections, block tearing, shear lag and fatigue are excluded. |
| Compression | §6.2.4 (6.10) | A fy/gamma0 for Classes 1–3. Class 4 effective sections are NOT VERIFIED. |
| Bending | §6.2.5 | Wpl for Classes 1/2; Wel for Class 3; Class 4 NOT VERIFIED. |
| Shear | §6.2.6 | Av fy/(sqrt(3) gamma0). For catalogue rolled sections, Avy=2 b tf is a conservative flange-only area; Avz retains source rule. W Avz=hw tw conservatively omits fillet contribution. |
| Shear buckling gate | §6.2.6(6), EN 1993-1-5 §5 | hw/tw > 72 epsilon/eta with nonzero Vz returns NOT VERIFIED. No plated-web resistance is invented. eta is an explicit designer input. |
| High shear | §§6.2.8, 6.2.10 | rho=(2 V/Vpl−1)^2 above V/Vpl=0.5, capped at 1. Global reduction (1−rho) applied to axial and moment yield capacities conservatively, rather than crediting unaffected material. Both shear directions use the larger reduction. Simultaneous nonzero Vy/Vz requires separate biaxial shear verification and is explicitly NOT VERIFIED. Individual plastic shear checks do not establish combined shear resistance. High-shear beam-column stability remains NOT VERIFIED. |
| Section N–My–Mz | §6.2.1(7) | Explicitly permitted conservative summation, with class-appropriate reduced resistances, rather than an unvalidated nonlinear plastic interaction. |
| Flexural Ncr | §6.3.1.2 | Euler pi² EI/(KL)² independently for y and z. Ky/Kz editable, never inferred from annex diagrams. |
| Buckling reduction | §6.3.1.2 (6.49)/(6.50) | phi=0.5[1+alpha(lambda−0.2)+lambda²], chi<=1. No rounded comparisons. |
| Rolled buckling curves | Tables 6.1/6.2 | Automatic curves restricted to rolled I/H, tf<=100 mm, known fy<=420 MPa. Advanced overrides require CurvesVerified=1. Defaults correspond to HEB320 S355. |
| Torsional Ncr | §6.3.1.4 / elastic torsion theory | (GIt+pi² EIw/Lt²)/i0², i0²=(Iy+Iz)/A; weak-axis curve. Doubly symmetric uncoupled mode only. If this mode governs under combined loading, member interaction is NOT VERIFIED. |
| Mcr | NCCI SN003b §2 eq.(1) | Full expression includes k, kw, It, Iw, C1, C2 and signed zg. C3=0 for doubly symmetric sections. Requires lateral and twist restraint at both ends. No arbitrary end/free or intermediate-restraint eigenanalysis. |
| Automatic Mcr coefficients | NCCI SN003b Tables 3.1/3.2 | k=kw=1 only: uniform end moment 1/0, simply supported full UDL 1.127/0.454, simply supported central point load 1.348/0.630. No arbitrary interpolation or replacement for combined/custom loads. |
| LTB resistance | §6.3.2.2, Table 6.3 | Wy fy/gamma1 reduced using general-method chiLT. Rolled alphaLT=0.21 if h/b<=2, otherwise 0.34; editable and guarded by CurvesVerified. Slabs do not automatically establish restraint. |
| Beam-column | §6.3.3 (6.61)/(6.62), Annex B Tables B.1/B.2 | Automatic plastic I/H branch only, lambdaZ>=0.4. Cmy/Cmz/CmLT are explicit independently verified inputs (default uniform moments=1). kyy=Cmy[1+min(lambdaY−0.2,0.8)ny]; kzz=Cmz[1+min(2lambdaZ−0.6,1.4)nz]; kyz=0.6kzz; kzy=max[1−0.1lambdaZ nz/(CmLT−0.25),1−0.1nz/(CmLT−0.25)]. Other branches/manual inputs require independently verified kij and a separate ManualFactorsVerified=1 (default 0). Method 1 is not mixed in. |

## Coefficients and restraints

LTB picker operates on one unrestrained segment. Actual end lateral restraint, twist restraint, warping conditions and load sign must match the supplied factors. Top/bottom height options use +/-h/2; positive zg assumes transverse loading acting towards the shear centre (destabilizing), as in SN003b Figure 2.1. For upward/reversed loads, enter the actual signed zg directly. Unsupported loads/restraints produce NOT VERIFIED; manual coefficients require LTBverified=1. External Mcr requires a positive supplied value; its traceable source can be entered in the picker.

Annex B automatic factors are not a moment-diagram solver. FactorsVerified=1 confirms Cm values in automatic mode only. ManualFactorsVerified is a separate default-zero acknowledgement and is required for every manual kij set. The designer has checked Cm factors for the actual member and relevant unrestrained lengths. Defaults=1 represent uniform moments. Changing the picker to a nonuniform loading clears this acknowledgement. Editing ordinary inputs is deliberately possible; designers remain responsible for actual boundary conditions and coefficient provenance.

The K annex illustrates ideal elastic modes. Fixed-guided K=1 assumes restrained end rotations with relative translation permitted; it is not the non-sway fixed-fixed condition. Reference diagrams never update Ky/Kz.

## Data provenance, conversion and rights

No Dlubal catalogue data are redistributed: a licence for wholesale redistribution was not established. UB/UC catalogue families are shown as unavailable with custom section entry, pending a verified redistributable source. This is a remaining scope limitation, not a complete UB/UC library.

* IPE/HEA/HEB/HEM: [Steel_Section_Database](https://github.com/ulmewix/Steel_Section_Database), commit `524172a3fff6a2c4da03f56a577402aa3a88876a`, MIT notice included. Source JSON snapshots preserve geometry, original mm-based units, supported-property methods and unsupported fields. Properties are geometry-derived (including documented torsion/warping approximations), not claimed to be manufacturer-certified catalogue values. EN 10365:2017 dimensions; not claimed verified to the 2026 edition.
* W: [steelpy](https://github.com/evanfaler/steelpy), commit `060dcd913a67d82ddf1b528e1739f1580161ed5b`, Apache-2.0 notice included. Original CSV retained in inch/lb units; Ix→EC3 Iy, Iy→EC3 Iz. Length factor 25.4, powers 2/3/4/6 for A/W/I/Iw, mass 0.45359237/0.3048. The upstream AISC source edition is not declared. k is not interpreted as a root radius: r=0 explicitly takes no fillet credit. Review against project section tables before issue.

379 offline records. No per-evaluation fetches. IDs and property-order contracts must never be renumbered: 1000+ IPE, 1100+ HEA, 1200+ HEB, 1300+ HEM, 2000+ W. Catalogue changes need new immutable IDs or an explicit migration; old documents must not silently acquire different properties. Import validation checks all properties finite/positive, geometric feasibility and A/mass, I/Wel, I/A/radius consistency within 3.5% (source-table precision only, never a design-acceptance tolerance). IPE360 properties and HEB320 buckling are checked against independent published examples; not every source record has an independent manufacturer verification.

Numeric worksheet functions match the existing parser and batch contracts:

```
Section := 1211
A := sectionProp(Section, 5)  // mm² quantity, no implicit unit assumption
Iy := sectionProp(Section, 6)
R := steelDesign(S, I)       // explicit unit-aware input vectors, contract.ts
entry(R, 4)                 // numeric state: 1 PASS, 0 FAIL, -1 NOT VERIFIED
```

String-valued section names are not implemented; the UI and generic batch valueLabels display human-readable names. `sectionUnits` and `propertyKeys` are the authoritative ID map. Catalogue input definitions can be individually replaced by verified literal properties. Custom sections use the same quantity-vector API; every property is embedded in .mCCV, so localStorage is only a convenience catalogue. Optional steelFigure and batch valueLabels are sanitized. Document version/extension remain unchanged; old files continue to parse. Results are never persisted.

## Independent validation

* [Dlubal KB 001622](https://www.dlubal.com/en/support-and-learning/support/knowledge-base/001622): Mcr=1153.10 kNm for Iz=10140 cm4, It=292.5 cm4, Iw=2883000 cm6, L=650 cm, zg=18 cm, C1=1.127/C2=0.454. Absolute tolerance 0.05 kNm covers published rounding and G precision.
* [JRC workshop, Rui Simões, 2014, example 3](https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/05_Eurocodes_Steel_Workshop_SIMOES.pdf), HEB320 S355, A=161.3 cm2, Iy=30820 cm4, Iz=9239 cm4, Lcr=4.335 m, N=1704 kN: lambdaY~0.41, lambdaZ~0.75, chiY~0.92, chiZ~0.69, kyy~0.46, kzy~0.82. Tolerances 0.005 on printed two-decimal quantities; the JRC example uses alternative LTB, so its chiLT is intentionally not compared with the general method.
* [SCI NCCI SN003b](https://www.steelconstruction.info/images/0/0f/SN003b.pdf), pages 2–6: Mcr expression, boundary conditions and standard coefficient cases. Uniform moment and central point cases checked as distinct cases; top/bottom zg sensitivity checked.

Tests cover section classes 1–4, pure N compression/tension, both bending axes, biaxial actions, shear, high shear/failure, K scaling, unsupported LTB conditions, missing acknowledgements, simultaneous batch cases in both orders, units, serialization and all default template regions.

Browser test `steelDesign.spec.ts` exercises the actual production UI and worksheet/batch workers, custom section embedding, save/reopen, K edits, unsupported LTB, external Mcr, annex navigation and PDF export. Existing CI uploads `.mCCV`, screenshots and PDF to `ui-snapshots`. Local Chromium launch is blocked by AF_UNIX socket permissions in this managed executor; the shared browser could not connect to the local preview. Therefore only a completed CI run establishes browser validation; do not describe an unexecuted test as passed or a PDF as visually verified.

Browser regression found that the batch UI disabled Run for inherited (null) cells even though the worker correctly clears overrides. `canRunBatch` now allows a blank only when its bound worksheet input has a finite default; report summaries show the inherited number. Unit coverage pins this behavior.

## Readable worked-report presentation

The template now separates seven design pages from two technical annex pages. A physically consistent reference case uses HEB320, L=5 m, NEd=100 kN, uniform My=50 kNm, uniform Mz=5 kNm and zero transverse shear. Opposing end couples produce the uniform moment diagrams. Selecting a different LTB coefficient case is explicitly a segment idealization, not a fabricated global analysis.

The main report uses named, editable scalar equations for flange/web classification, capacities, Euler loads, relative slenderness, Phi/chi, critical moment, Annex B factors and both interaction equations. Important equations include actual unit-aware numerical substitutions via the existing full display mode. Lookup indices and the vector contract are confined to a technical annex. The guarded kernel independently determines compliance states; indicative equations do not bypass unsupported-scope gates. Regression coverage compares these scalar equations with the kernel, including Ky edits and a uniaxial stress-gradient classification case.

SVG figures show end couples at their actual endpoints, pin and roller symbols, separate moment baselines, unrestrained length and signed load-level inset. Unknown loading configurations deliberately have no invented moment curve. Reference K shapes satisfy the idealized end displacement/rotation conditions (fixed–pinned root tan(beta)=beta). Figure math regions display the drawing normally and reveal their ordinary editable definition while editing. Older worksheets retain their source expressions and remain evaluable; the section picker recognizes legacy section-property definition names.
