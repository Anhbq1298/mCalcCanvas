# Published LTBeamN comparisons

The unchanged production solver was run against 16 published LTBeamN results.
These are reproductions of online examples, not new desktop LTBeamN runs.
No stiffness or result was calibrated to make a reference match.

Reproduce the tables with:

```sh
node tools/templates/verify_ltb_bracing.mjs --ltbeam
```

The inputs and published reference values live in
`src/tests/unit/fem/ltbeamReferences.ts`. One step in the existing LTB unit test
checks all cases and meshes, retaining the single-test-per-area convention.

## Published section properties: eight IPE300 cases

Source: *The Effect of Steel Beam Elastic Restraint on the Critical Moment of
Lateral Torsional Buckling*, Materials 15 (2022), 1275,
[doi:10.3390/ma15041275](https://doi.org/10.3390/ma15041275),
[full text, Tables 6 and 7](https://pmc.ncbi.nlm.nih.gov/articles/PMC8874481/).

Inputs: L = 5 m; h = 300 mm; E = 210 GPa; G = 81 GPa;
Iy = 8360 cm4; Iz = 604 cm4; It = 20.7 cm4; Iw = 125900 cm6.
Loads act at z_g = +150 mm. The section properties are those explicitly given
in the paper, not a potentially different steel-section catalogue entry.

The in-plane moment diagram is calculated with `solveBeam`. At both ends,
lateral displacement and twist are fixed. Lateral bending rotation stays free.
`kw = 1` below means fixed warping derivative; `kv = 1` fixes only the IN-PLANE
bending rotation. Zero means free. Only endpoint fixities (0 and 1) are reproduced;
no intermediate elastic-spring fixities are claimed.

The reference is the LTBeamN column, not the paper's approximate equation column.
All results below are Mcr in kNm; error = 100 (FE100 / reference - 1).

| Source row | Load | kw | kv | LTBeamN | FE24 | FE48 | FE100 | Error % |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| T6-1 | Midspan point | 0 | 0 | 111.19 | 111.192945 | 111.192905 | 111.192903 | +0.00261 |
| T6-6 | Midspan point | 0 | 1 | 87.76 | 87.745957 | 87.745842 | 87.745835 | -0.01614 |
| T6-31 | Midspan point | 1 | 0 | 191.80 | 191.834849 | 191.834644 | 191.834631 | +0.01806 |
| T6-36 | Midspan point | 1 | 1 | 167.43 | 167.367721 | 167.367404 | 167.367384 | -0.03740 |
| T7-1 | UDL | 1 | 0 | 177.22 | 177.193123 | 177.192733 | 177.192708 | -0.01540 |
| T7-6 | UDL | 0 | 1 | 124.34 | 124.348764 | 124.348406 | 124.348383 | +0.00674 |
| T7-7 | Triangular | 1 | 0 | 180.60 | 180.658358 | 180.657939 | 180.657912 | +0.03207 |
| T7-12 | Triangular | 0 | 1 | 146.70 | 146.926794 | 146.926318 | 146.926287 | +0.15425 |

Maximum absolute difference: 0.15426%. This supports the solver, boundary
conditions and transverse-load-height implementation for these eight examples.
It is not a bound on all possible designs. The tests use a 0.2% comparison band.

## Nominal section reproduction: intermediate braces

Source: CTICM, A. Beyer, *LTBeamN v1.0.0 - Report on Validation Tests*,
DRV/08-R-107/1.0.0, 18 June 2013, section 2.3, Set 80
([public report text](https://www.scribd.com/document/350976654/LTBeamN-ValidationReport)).

Reference geometry: L = 18 m; total depth 500 mm; flange width 280 mm;
flange thickness 19 mm; web thickness 12.5 mm; no root radii.
UDL = 3 kN/m at the shear centre; fork ends, free warping.
The unamplified peak moment is independently w L2 / 8 = 121.5 kNm.
The downward-negative load convention in the report becomes downward-positive
in `solveBeam`, preserving positive sagging and the physical flange locations.

The report gives dimensions rather than the numerical section stiffnesses for
this set. The reproduction explicitly uses nominal thin-wall properties:

- hw = h - 2tf; G = E / [2(1 + nu)], with E = 210000 MPa, nu = 0.3.
- Iz = 2tf b3/12 + hw tw3/12 = 69589861.979167 mm4.
- It = (2b tf3 + hw tw3)/3 = 1581127.916667 mm4.
- Iw = tf b3(h-tf)2/24 = 4020745698666.667 mm6.
- Flange restraint heights are +h/2 and -h/2 relative to the shear centre.

These properties were checked independently in Python. They are not claimed to
be the exact internal section-property values used by LTBeamN. The residual
differences below have not been isolated to a specific cause; mesh refinement
alone does not remove them. This is a qualified geometry-based comparison.

The table compares critical LOAD FACTORS, not kNm. Multiply by 121.5 to obtain Mcr.
An interior fork fixes both v and phi; a lateral brace fixes only v + z phi.

| CTICM test | Intermediate restraint | LTBeamN | FE24 | FE48 | FE100 | Error % |
|---|---|---:|---:|---:|---:|---:|
| 80 | Fork at L/2 | 6.9985 | 7.039541 | 7.039470 | 7.039466 | +0.58535 |
| 82 | Fork at L/4 | 5.1275 | 5.161976 | 5.161949 | 5.161948 | +0.67182 |
| 83 | Forks at L/4, 3L/4 | 10.0969 | 10.134935 | 10.134693 | 10.134678 | +0.37415 |
| 84-1 | Top-flange lateral at L/4 | 5.1275 | 5.161886 | 5.161859 | 5.161858 | +0.67007 |
| 84-2 | Shear-centre lateral at L/4 | 4.7482 | 4.786647 | 4.786624 | 4.786622 | +0.80920 |
| 84-3 | Bottom-flange lateral at L/4 | 2.9840 | 2.975613 | 2.975605 | 2.975605 | -0.28133 |

This checks the ordering and magnitude of top/centre/bottom restraint effects.
The top-flange brace and fork happen to give nearly the same eigenvalue in this
example; that equality does not establish identical kinematic conditions.
The separate mode tests verify that a lateral brace does not impose twist fixity.

## Nominal tapered-member comparisons

The same CTICM report, section 5, supplies P1-6A: linear WEB depth 400 -> 800 mm,
b = 250 mm, tf = 20 mm, tw = 14 mm, equal end moments of 200 kNm.
The reproduction uses the above E/nu convention and the corresponding local
thin-wall plate properties; total depth is web depth + 2tf. Fork ends are assumed,
consistent with the source's simply-supported member.

| P1-6A length | LTBeamN factor | FE24 | FE48 | FE100 | Error % |
|---|---:|---:|---:|---:|---:|
| 5 m | 7.722 | 7.704114 | 7.704110 | 7.704110 | -0.23167 |
| 10 m | 2.611 | 2.606594 | 2.606593 | 2.606593 | -0.16878 |

These remain qualified comparisons: the report states that LTBeamN uses Vilette's
torsion formula; the reproduction uses the explicitly stated thin-wall formula.
Our existing Vlasov model also omits flange-inclination terms. Small differences
in these two examples do not validate steep tapers, other moment distributions,
or a tapered member with intermediate top-flange braces against LTBeamN.

For all eight nominal-section cases the test band is 1%. All 16 cases also check
24/100-element convergence within 0.01% and 48/100 within 0.001%. These are
numerical benchmark checks, not tolerance allowances on engineering inequalities.

## Repository checks

After adding the references: `npm run typecheck` and `npm run lint` passed;
`npm test` passed 36 files / 97 tests, including the existing single LTB test
with its new 16-case step; `npm run test:e2e` passed 78 tests with 2 existing
visual-capture tests skipped (and rebuilt the production app). Knip continues
to report the pre-existing unused items recorded in CONSTRUCTION_BRACING.md.
No production solver, model, UI or template was changed for this comparison.
