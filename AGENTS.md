# AGENTS.md — working on mCalcCanvas

Instructions for every coding agent (Claude, Codex, Gemini, …) and humans. Read this file fully; it is short on purpose. Background: `docs/ARCHITECTURE.md`, `docs/ENGINE_DESIGN.md`, `docs/PROJECT_MEMORY.md`.

mCalcCanvas is a browser app in the style of Mathcad Prime. You write engineering calculations (LaTeX math regions, text, graphs) on A4 pages, and they calculate top to bottom. The owner is a structural engineer, and the main content is Eurocode calculation templates.

## 1. Working agreement (always)

- **Branch:** work on the current feature branch (now `feature/if-function`). Commit when a task is done; **never push** unless asked.
- **Language with the owner:** reply in Vietnamese, casual and short. Code, comments, docs and template text are in English.
- **No silent assumptions in engineering content.** If a code clause, value or rule is not verified, search for it. If you still cannot verify it, say so explicitly in the reply; never present a guess as the code.
- **Cite clauses** (e.g. "EN 1992-1-1:2023 (8.41)") in template labels, using the code's own symbols.
- **Check numbers independently** (hand calculation or a short Python script) before claiming a result, and pin them in tests.
- **Show the result.** After layout or template changes, export the PDF (section 4) and look at the pages for overlaps before reporting.
- Before finishing: `npm run typecheck && npm run lint && npm test && npm run test:e2e`.

## 2. Commands

```bash
npm ci                     # install (Node 22)
npm run dev                # Vite dev server
npm run typecheck          # tsc -b (strict)
npm run lint               # oxlint src — 0 errors (3 known fast-refresh warnings)
npm test                   # Vitest: engine + unit tests
npm run build              # typecheck + production build (needed before e2e / template tools)
npm run test:e2e           # Playwright (serves the build on :4173; CHROME_PATH=… for a system Chrome)
npm run build:single       # single-file offline HTML in dist-single/
npm run templates:columns  # regenerate the column templates (section 4); add -- --pdf for PDFs
```

CI (`.github/workflows/ci.yml`) runs all of these; GitHub Pages deploys only after they pass.

## 3. Ground rules (code)

- **The canvas store is the source of truth.** The engine is derived from it through `src/canvas/engineBridge.ts`. Never write results into the canvas store or persist them.
- **The engine is independent of React, the DOM and canvas geometry.** It receives LaTeX plus an opaque reading-order key per region.
- **No string evaluation.** Never use `eval`, `new Function`, or `math.evaluate`/`math.parse` on user text. The parser builds a JSON tree, and the evaluator calls a fixed set of functions.
- **Strict checks.** No tolerances on ≤ < ≥ > (`ComparisonPolicy`). Never compare or round displayed values.
- **Untrusted input:** files, clipboard and pasted HTML go through `sanitizeShape` / `sanitizeHtml`. New shape props must be validated in `DocumentSerializer.sanitizeShape`.
- **Layout changes:** plan them in `src/canvas/layout.ts` (pure), then apply them with one `updateShapes`. Wrap the user action and its consequences in `transaction()` so they form one undo step.
- **Saving** goes through `SaveCoordinator`.
- **Document format:** `DOCUMENT_VERSION` in `DocumentTypes.ts`. Optional new fields are fine; a breaking change needs a migration plus a test.
- Small focused changes, strict TypeScript, no `any`.

**Tests to add with every change:**

| What changed | Where the test goes |
|---|---|
| Engine | `src/tests/engine/*.test.ts` |
| Stores, layout, serializer | `src/tests/unit/*.test.ts` (add `// @vitest-environment happy-dom` if needed) |
| User flows | `src/tests/integration/*.spec.ts` (`openFresh(page)` = steel-beam sample) |
| Bug fix | A regression test that fails without the fix |

Never weaken an assertion to make a test pass.

## 4. Calculation templates (column checks)

The files are `templates/RC_Rectangular_Column_Check.mCalcCanvas` and `templates/RC_Circular_Column_Check.mCalcCanvas`.

**Never hand-edit the `.mCalcCanvas` JSON.** It is generated.

To change a template:

1. Edit `tools/templates/gen_rect.mjs` or `tools/templates/gen_col.mjs`.
2. Run `npm run build && npm run templates:columns`. This generates the file, measures the real region sizes in the built app (into `sizes_*.json`), and generates it again.
   - It must print no "regions moved by the app" warning. A warning means regions overlapped, or snapped away from where the generator put them.
3. Run `npm run templates:columns -- --pdf`, then look at the PDF pages (`tools/templates/*.pdf`, git-ignored).
4. Update `src/tests/unit/columnTemplates.test.ts`. It pins key results (UR values, cotθ branches, b_w and so on) against hand or Python references. Tests find a region by the start of its LaTeX (e.g. `'\\mathrm{UR}_{V.y}\\coloneq'`), so a renamed symbol means an updated test.

### Generator helpers (both files)

| Helper | What it places |
|---|---|
| `H(level, text)` | Heading |
| `T(text)` | One line of note text. Keep it to about 95 characters at 13 px, otherwise it wraps and overlaps the next line. |
| `P(desc, latex, opts)` | Description on the left and a math region on the right. A long formula goes on its own line under the description. Options: `M(unit, fr / FU / fo)`. `fr` = formula = result, `FU` = full substitution, `fo` = formula only. |
| `ROW(items, h)` | Side-by-side regions (tables) |
| `GRAPH(size, props)` | A graph |
| `gap(n)` | Vertical space |
| `need(rows)` | Page break if the block doesn't fit |
| `LINK(id, title, fn)` | An annex block: a link here, content in the annex |

- **Grid:** 20 px squares; the page writable area starts at x = 76, y = 60. Regions are placed so that their first baseline is on a grid line (`alignTop`), and they never overlap (`floorY`).
  - x positions must be 76 + 20k (76, 96, 396, …).
  - Rows advance in steps of 0.5 (20 px).
- **Overlaps:** the app pushes an overlapping region (and everything after it) down by 40 px, so overlaps must be avoided in the generator.

### Content rules (agreed with the owner)

**Main body vs annex**
- **Main body** holds: inputs, design values, key results, every code check, the section figure, the P–M diagram, shear, and the summary.
- **Annex** holds: algorithms and arrays (bar coordinates, tie-leg arrangement, fibres or strips, strain plane, stress laws, section resultants, P–M sweep data, tie drawing data). Use `LINK`.
  - An annex block is calculated at its link, so the top-to-bottom chain is kept.
  - The main body shows the results with `name=` (e.g. `s_{x}=`, `n_{w.y}=`).

**Checks and symbols**
- **Section checks are utilisation ratios:** `\mathrm{UR}_{M}` (flexure) and `\mathrm{UR}_{V.y}`, `\mathrm{UR}_{V.x}`, `\mathrm{UR}_{V}` (shear), each followed by a check `UR ≤ 1`. Do not use η for a utilisation. Detailing checks (spacing, diameters, steel ratios) stay as direct comparisons.
- **Symbols follow the code definition**, e.g. τ_Ed, ρ_w, τ_Rd,sy, σ_cd, ν, cot θ_min, η_cc, k_tc, γ_C, γ_S. Do not invent short names like `t_y`.

**Writing style**
- **If statements use the Mathcad Prime layout.** `if` and `else if` go on their own lines, each value sits under its keyword with a bar, and the whole block has a double bar on the left. Write it as `\begin{array}{||l}\mathrm{if}\ c\\\quad\left\Vert\displaystyle v\right.\\ … \mathrm{else}\\\quad\left\Vert\displaystyle v\right.\end{array}` (copy an existing block in `tools/templates/gen_*.mjs`, or the "if block" entry in `src/components/ribbon/palettes.ts`). Conditions may use `\land` / `\lor`.
- **Keep the reader in mind:** few user-defined functions in the main body, short notes (≤ 3 lines per block), no repeated explanations.
- **Inputs** are definitions from literals only (`f_{ck}\coloneq35\,\mathrm{MPa}`). They are highlighted light yellow with blue text automatically. A constant that is not a user input (e.g. ν = 0.5) also highlights; that is accepted for now.

**Removed on request — do not add back**
- the hand check at the capacity point
- the M_x/M_y split charts
- the ψ–β chart
- axial-limit checks
- the constant-N moment ratio

### Engineering model (current state)

**Flexure**
- Fibre (rectangle, 30×30) or strip (circle, n_c) integration.
- EC2 strain pivots A/B/C, parabola-rectangle, elastic–plastic steel. Flexure labels still cite EN 1992-1-1:2004 clauses.
- Rectangle: biaxial bending without reduction to the principal axes. The neutral axis is rotated (β sweep in 10° steps) until the moment points along θ_M, which gives the P–Mθ curve.
- UR_M is the radial ratio along the ray from the origin through (M_Ed, N_Ed), like MBColumn.

**f_cd** = η_cc·k_tc·f_ck/γ_C (EN 1992-1-1:2023 (5.3), (5.4)), with input `k_tc` = 0.85 (1.0 if loaded after 90 days).

**Shear, EN 1992-1-1:2023 §8.2.3**
- Stresses: τ_Ed = V_Ed/(b_w·z) (8.18), z = 0.9d (8.2.1(3)).
- Links: ρ_w = A_sw/(b_w·s) (8.43), τ_Rd,sy = ρ_w·f_ywd·cotθ (8.42).
- Strut: σ_cd = τ_Ed(cotθ + tanθ) ≤ ν·f_cd (8.44), ν = 0.5 (8.2.3(6)).
- cot θ_min (8.41):

  | Case | cot θ_min |
  |---|---|
  | Tension | max(1, 2.5 − 0.1·\|N_Ed\|/V_Ed) |
  | x ≥ 0.25d | 2.5 |
  | σ_cp ≥ 3 MPa (and x < 0.25d) | 3.0 |
  | Otherwise | 2.5 + 0.5·σ_cp/3 MPa (linear; the code only says "interpolate") |

  - All cases are multiplied by k_A = 0.8 for ductility class A links (input `δ_A`).
  - x = neutral-axis depth at the bending resistance under N_Ed.
- Design cotθ = the largest value ≤ cot θ_min with σ_cd ≤ ν·f_cd.
- cotθ < 1 (8.2.3(11), σ_swd (8.56)) is not used, because it never adds resistance.
- **Circle:**
  - b_w is the least chord width between the compression chord (centroid of the concrete compression) and the tension chord (d).
  - A_sw = 2·A_w per spiral set (each spiral crosses the shear plane twice).
  - The exact text of 8.2.3(9) (b_w of circular sections) has **not** been verified; tell the owner if you touch it.
- **Sources used:** the Blueprints library (`fpr_en_1992_1_1_2023`, formula docstrings) and fib `structuralcodes` (`ec2_2023`). These are the fallback when the code text is not available.

**Default results (pinned in the tests)**

| | Value |
|---|---|
| Rectangle UR_M | ≈ 0.642 |
| Rectangle UR_V,y | 0.529 |
| Rectangle UR_V,x | 0.223 |
| Circle UR_M | 0.769 |
| Circle UR_V | 0.872 (strut governs) |

## 5. Engine gotchas (save yourself the debugging)

- **Functions:** `\arctan`, `\mathrm{atan}` and `\operatorname{atan}` all work; `f(x)^2` is the power of the call (for a plain variable `a(x)^2` = a·(x)²). `\Delta T` / `\delta x` are single names.
- **Angles:** an angle that should be dimensionless needs `\mathrm{rad}`, e.g. `β_v` is built `(…)\mathrm{rad}`; `90^{\circ}` and `\frac{\pi}{2}\,\mathrm{rad}` both work.
- **`linterp(xs, ys, x)`** extrapolates outside the data (first/last two points, like Mathcad). xs must be monotonic. Extrapolation is silent, so guard x when it matters.
- **`map(f, v, s)`** maps over every vector argument; scalar arguments are broadcast.
- **Calls with scalar arguments are cached** (max 20 000 entries). Sweeps rely on this for speed.
- **`if` with a vector condition works element-wise:** both branches are evaluated, so both must be valid for every element.
- **Names:** subscripts are part of the name. Watch for clashes (`a_{y}` geometry vs `a_{V.y}`).
- **Performance:** keep the 30×30 fibre grid and 10° β steps. A 20×20 grid made ψ(β) non-monotonic, and the curve broke.
- **Annex:** text props `annex: {kind: 'start' | 'heading' | 'link'}`. Numbers and page references are computed; Tools → *Sort annex by link order* reorders pages.

## 6. Where things are

- `src/engine` — parser (`LatexParser.ts`), evaluator (`ExpressionEvaluator.ts`), units, formatter.
- `src/canvas` — store, shapes, layout, annex (`annex.ts`, `annexActions.ts`), engine bridge.
- `src/export` — PDF via the browser print pipeline.
- `src/components` — menus, ribbon palettes, dialogs, panels.
- `tools/templates` — template generators (section 4).
- Docs: `docs/ARCHITECTURE.md`, `docs/ENGINE_DESIGN.md`, `docs/PROJECT_MEMORY.md`, `docs/ROADMAP.md`, `docs/RELIABILITY_AUDIT.md`.
