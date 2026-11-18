# Validation report — Rev G, 15 November 2026

Rev G: the steel section comes from the library (UB 406x178x60, ID 3148, Browse); the reference uses the
same geometry-derived properties (r = 10.0 mm). All Rev F comparisons below were re-run.

## Passed

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass, 0 warnings |
| `npm test` | 32 files, 81 tests pass |
| `npm run test:e2e` (system Chrome) | 72 passed, 2 skipped (visual capture specs) |
| `python tools/templates/reference_composite.py` | identical to `reference.json` |
| `npm run templates:columns -- --only=composite --pdf` | no "regions moved by the app" warning |

## Independent reference (`reference_composite.py`)

Closed-form beam (UDL + point loads, exact maximum), closed-form midspan deflections, numerical
integration of the filleted steel width for the PNA, and an independent stud count along the span.

| Quantity | Reference | Worksheet |
|---|---|---|
| M_Ed (UDL 4.5 + 9 kN/m, P = 30 G + 45 Q kN at 3 m) | 469.182 kNm at 3.0 m | same |
| V_Ed | 209.731 kN | same |
| Studs needed per shear span (η_min governs) | 17 | same |
| Spacing inputs 125 / 200 mm → studs per span | 24 / 25, weaker span 24 | same |
| Max UR along span from stud count | 0.6603 (just right of the load) | same; > 0.6407 at x_M |
| PNA case at x_M and under the load | 1 = top flange | same |
| δ_LT, δ_tr, δ_slip, δ_tot | 6.078, 3.764, 1.851, 31.069 mm | grid virtual work, within 0.0005 mm |
| Added row 6 m, 10 G + 10 Q kN | M_Ed 490.624 kNm at 3.061 m | 40 mm grid, within 0.007 kNm |
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

## Solid-slab example: UB 457×152×52 S355 (Hong Kong university lecture notes "CompB-I")

Solid slab 125 mm, C30/37 (f_cd = 20 MPa), L = 12 m, beam spacing 2.8 m, 19 mm studs at 150 mm,
full shear connection. Section properties checked against the BS 4-1 / BS EN 1993-1-1 UB table
(449.8 × 152.4 × 7.6 × 10.9, r = 10.2, A = 66.6 cm², W_pl = 1096 cm³). Inputs replaced in the unit test;
load tables set to one UDL over 12 m and no point load.

| Quantity | Notes | Worksheet | Note |
|---|---|---|---|
| b_eff = min(L/4, b) | 2800 mm | 2800 mm | match |
| N_a = A f_y | 2364 kN | 2364.3 kN | match |
| PNA | in slab | k_M = 0, x = 49.7 mm | match |
| Lever arm | 325.1 mm | 325.06 mm | match |
| M_pl,a,Rd | 389.0 kNm | 389.08 kNm | match |
| M_pl,Rd | 768.5 kNm | 768.55 kNm | match |
| η | full (80 studs) | 1.0 | match |

Not compared: the notes use a tabulated P_Rk = 76.3 kN (older code); the sheet uses EN 1994 (6.18)/(6.19).
This is the only solid-slab source here; it covers the slab-PNA branch that SBE A.4 (steel PNA) does not.

## Large point load near a support: non-composite design basis (Rev G)

Point load 100 G + 150 Q kN at 1.5 m (default area loads, studs 125/200 mm). Reference: closed-form beam,
studs to x_M, EC3 LTB over the stud spacing (`non_composite_point_load_1_5m` in reference.json).

| Quantity | UB 406x178x60 (default) | UB 533x210x92 (Browse, ID 3129) |
|---|---|---|
| M_Ed at x_M | 618.53 kNm at 2.10 m | 621.18 kNm at 2.12 m |
| Studs to x_M, η | 17, 0.511 (≥ η_min) | 17, 0.333 (< η_min) |
| Composite: UR_M.x | 1.059 → c_comp = 0 | gate fails → c_comp = 0 |
| L_LT = stud spacing, χ_LT | 200 mm, 1.0 | 200 mm, 1.0 |
| UR_M.nc = UR_LT.nc | 1.453 | 0.741 |
| δ_nc, UR_d.nc | 61.36 mm, 1.917 | 24.11 mm, 0.753 |
| UR_des, acceptance (Rev G) | 1.917, fails | 0.925, passes (support web bearing governs) |

Rev G code-compliance checks on the same cases (reference `web_and_shear_checks`, worksheet within 1e-4):

| Check | Default | 1.5 m, UB 406 | 1.5 m, UB 533 |
|---|---|---|---|
| UR_MV, EC4 §6.2.2.4 | 0.660 | 1.060 | 0.622 |
| UR_MV,nc, EC3 (6.30) | 1.102 | 1.453 | 0.741 |
| F_Rd type (a) / type (c) | 544.4 / 333.4 kN | same | 832.3 / 471.9 kN |
| UR_F,P (6.14) | 0.198 | 0.661 | 0.433 |
| UR_F,S (6.14), support | 0.629 | **1.304** | **0.925** |
| UR_FM (7.2), composite / steel | 0.508 / 0.853 | 1.076 / 1.400 | 0.664 / 0.786 |
| UR_des | 0.971 (deflection) | 1.917 | 0.925 (support bearing) |

Worksheet matches to the 40 mm grid (unit test). PDFs of both cases: `app-export/CaseA_PointLoad_UB406.pdf`,
`app-export/CaseB_PointLoad_UB533.pdf`.

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

## Profiled steel deck: SBE Part 4, example A.3 (published)

IPE 270 S355, L 7.5 m, spacing 3 m, 120 slab on a 58 mm transverse deck (b_0 82 mm), one 19 x 100 stud per rib, 36 studs, C25/30.
Run through the worksheet in deck mode (compositeTool.test.ts).

| Quantity | Published | Worksheet | Note |
|---|---|---|---|
| M_Ed | 172.2 kNm | 172.16 kNm | match |
| k_t (6.23) | 0.717 | 0.7166 | match (published limit 0.75 is for holed sheeting; not governing) |
| P_Rd | 52.86 kN | 52.84 kN | match |
| N_c,Rd / N_pl,a | 1647 / 1631 kN | 1646.9 / 1631.0 kN | match |
| N_c (18 studs) | 952 kN | 951.1 kN | match |
| η | 0.578 | 0.583 | published divides by 1647; worksheet by min(N_c,Rd, N_pl,a) |
| η_min (6.12) | 0.475 | 0.475 | match |
| Steel PNA | 263 mm from the bottom | 7.1 mm below the top (262.9) | match |
| v_Ed on a-a, h_f 62 mm | 2.05 MPa | 2.06 MPa | match (published averages over the shear span) |
| M_Rd rigid-plastic | 301.7 kNm | 314.9 kNm | published puts N_c at mid-depth of the topping; with that lever the worksheet gives 302.4 (+0.2 %) |
| M_Rd used in design | – | 285.0 kNm | linear interaction (6.3), conservative |

Clause wording checked against published text: k_t / Table 6.2 limits (0.85, 1.0, 0.70 through-deck), h_p ≤ 85 mm, b_0 ≥ h_p, and the §6.6.1.2(3) conditions for (6.16).


## Tapered beam LTB: published taper effect (2026-11-17)

Raftoyiannis & Adamakos, "Critical lateral-torsional buckling moments of steel web-tapered I-beams", Open Constr.
Build. Technol. J. 4 (2010) 105–112, Fig. 18 and text: IPE 300 flanges and web, depth h1 → h2 = 3 h1 (mean 300 mm),
L = 10 h0, fork ends, end moments M1 at the shallow end and ψ M1; J and C_w by their (11), (12). Their method is a
three-term sine Rayleigh–Ritz (published results are diagrams; the text gives the end points). Run through `ltb.ts`
(ltb.test.ts):

| Drop of M_cr, taper ratio 1 → 3 | Published | ltb.ts |
|---|---|---|
| ψ = 1 | "only 4 %" | 3.9 % |
| ψ = −0.5 (largest of ψ = 1 … −1) | "maximum value 12 %" | 12.7 %, also the largest |

## LTB solver against SN003b Tables 3.1 and 3.2 (2026-11-17)

SN003b (NCCI, Elastic critical moment for LTB), k = k_w = 1, tables computed with μ = EI_w / (G I_t L²) = 0, so the
test runs `ltb.ts` with I_w = 0 (ltb.test.ts).

| Case | SN003b C1 | ltb.ts C1 |
|---|---|---|
| End moments ψ = 1, 0.75, 0.5, 0.25, 0 | 1.00, 1.14, 1.31, 1.52, 1.77 | 1.000, 1.139, 1.312, 1.522, 1.770 |
| ψ = −0.25, −0.5, −0.75, −1 | 2.05, 2.33, 2.57, 2.55 | 2.047, 2.331, 2.574, 2.555 |
| UDL, in-plane simply supported / fixed | 1.127 / 2.578 | 1.127 / 2.576 |
| Mid-span point load, simply supported / fixed | 1.348 / 1.683 | 1.348 / 1.683 |

Load height, z_g = 200 mm on the top flange (destabilising): M_cr by SN003b (2) with the tabulated C1, C2 within 2 %
for all four transverse cases (UDL 0.1 %, fixed UDL 0.5 %, point load 1.9 %, fixed point load 1.1 %).
Bottom flange (stabilising, z_g = −200 mm): (2) with the tabulated C2 overestimates M_cr (point load, real I_w: FE / (2)
= 0.96; I_w = 0, fixed point load: 0.64). An independent Ritz sine series (20 + 20 terms) gives the FE value (point load
within 1 %, UDL within 0.1 %), so the difference is the 3-factor formula, not the solver. The page applies loads at the
top flange (construction) or the shear centre (LT.nc), never below it.

## Sources searched for a tapered-beam benchmark (2026-11-17)

| Source | Outcome |
|---|---|
| Raftoyiannis & Adamakos 2010 (open) | used above (taper effect, text values) |
| Kucukler & Gardner, Eng. Struct. 190 (2019) 246–261 (Imperial Spiral, open) | no tabulated M_cr. Important finding, citing Andrade & Camotim (2005), Yang & Yau (1987): beam models that ignore the flange inclination (the second-order torsion T_w from warping stresses in inclined flanges) overestimate M_cr of tapered beams; large for doubly-tapered and short beams with steep tapers, accurate for singly-tapered beams under uniform bending. `ltb.ts` neglects this term: fine for mild tapers (page default 300 → 403 mm over 5.2 m: flange slope 0.57°). Kucukler & Gardner limit their method to web-tapering angles ≤ 15°. |
| Papp & Szalai, Eurosteel 2011 (ConSteel, open) | tapered cantilever (Andrade) and beam-columns only; `ltb.ts` has no cantilever ends |
| Andrade, Camotim & Dinis, Comput. Struct. 85 (2007) (Coimbra repository) | server refused the connection |
| Yang & Yau 1987, Kitipornchai & Trahair 1972, Benyamina et al. 2013, LTBWTB (Appl. Sci. 2025), Trahair R939, UCSD thesis (Laiman 2014) | paywalled, HTTP 403 or connection reset from here |

Still open: absolute M_cr of a published simply supported web-tapered beam (Yang & Yau's doubly-tapered beam,
L = 6.096 m, h = 609.6 mm at mid-span, b = 152.4, t_f = 12.7, t_w = 9.5 mm, mid-span point load at the shear centre,
tabulated by Andrade & Camotim 2005), and an LTBeamN run of the page default case.


## Published LTBeamN comparisons (2026-11-18)

Sixteen published online LTBeamN results are now reproduced by the production
solver and pinned in the existing LTB unit suite. See
[LTBEAM_COMPARISON.md](LTBEAM_COMPARISON.md) for sources, inputs, mesh results,
comparison bands and the distinction between published-property and nominal
section reproductions. The references cover eight IPE300 cases, six intermediate
fork/lateral-brace cases, and two constant-moment tapered members. No desktop
LTBeamN execution is claimed. A direct LTBeamN run of the exact composite-page
default case, and a matched-property tapered case with discrete top-flange braces,
remain outside this verification.
