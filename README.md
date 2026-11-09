# CalcCanvas

**Live app:** https://anhbq1298.github.io/mCalcCanvas/

A browser-based engineering calculation workspace built on its own canvas engine: type equations anywhere on a free canvas, define variables with units, and every dependent result updates automatically. The same canvas lays out as A4 pages and exports a vector PDF calculation sheet.

```
L := 8.5 m           w := (1.35G + 1.5Q)·b = 28.5 kN/m
M_Ed := wL²/8 = 257.39 kN·m
η_M = 0.858 ≤ 1   PASS
```

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

On first launch the **Simply Supported Steel Beam Calculation** sample opens. Worksheets autosave to the browser (IndexedDB).

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and production build (`dist/`) |
| `npm test` | Engine + serializer unit tests (Vitest) |
| `npm run test:e2e` | Browser acceptance tests (Playwright) |
| `npm run typecheck` / `npm run lint` | |

Playwright needs a Chromium: `npx playwright install chromium`, or point it at an installed Chrome with `CHROME_PATH=/path/to/chrome npm run test:e2e`.

## Using it

The interface follows Google Docs: menus and one toolbar, white A4 pages with an engineering grid inside the margins (20 px light-grey squares, a major line every 2 × 2; equations and text sit with their baseline on a major line like ruled paper (or on every grid line: View → *Snap equations to minor grid lines*, or *Snap: squares* in Math formatting) — click to place the **+** cross; **Enter** inserts a line and pushes everything below down — content flows onto the next page — **Backspace** removes the blank line above, arrow keys move the cross). Units are shown in light blue with a dot before them (`25 · kN/m`); this is display only, a title block (header/footer) on every page, an **Outline / Parameters** side panel on the left (Outline: headings as a navigation pane — click to jump, double-click to rename, **+ Section / + Sub-section**; paragraph styles Normal / Heading 1–3 from the toolbar or `Ctrl+Alt+0–3`) and a properties panel on the right. The toolbar has **Math formatting** (operator gallery laid out like Mathcad Prime — operators the engine can't evaluate yet are shown greyed out — symbols, constants, units, display format, result unit, decimals, size, colour, worksheet unit system and precision) and **Text formatting** (style, font, size, bold/italic/underline, sub/superscript, colour, alignment, lists) tabs that follow the selection. **Help → Display formats & units guide** shows a live example of every display format and unit feature.

- **Create a region**: click the page (a blue **+** marks the spot) and start typing. `"` starts a text region. Double-click empty space for a new math region.
- **Equation keys**: `:` definition ≔ · `=` evaluate · `/` fraction · `^` power · `.` after a name = literal subscript (`M.Ed` → M_Ed) · `\` √ · `Ctrl+\` ⁿ√ · `|` absolute value · `'` parentheses · `Ctrl+G` Greek (a → α) · `Ctrl+Shift+P` π · `Ctrl+9 / 0 / 3` ≤ ≥ ≠ · `Enter` finishes and moves the + below, ready for the next line.
- **Built-in constants**: π, e, g = 9.80665 m/s², ∞ = 10³⁰⁷, % = 0.01. A worksheet definition with the same name overrides them (with a warning).
- **Palettes** on the Math tab insert operators, Greek symbols, constants and units at the cursor of the equation you're editing.
- **Checks**: `eta_M <= 1` (or Ctrl+9) shows the value with a PASS/FAIL badge.
- Text regions: font (Inter, Arial, Segoe UI, Calibri, Times New Roman, Georgia, Cambria, Courier New), size, alignment, bold/italic/underline/heading/lists, and any colour (swatches, picker or hex) for the whole text or just the selection.
- Drag, resize, marquee select, copy/paste (incl. screenshots), drag-and-drop images, duplicate (`Ctrl+D`), group (`Ctrl+G` on regions), undo/redo, arrow-key nudge, `Ctrl+wheel` zoom, wheel or `Space`+drag pan.
- **Templates**: File → New from template → *RC beam – bending (EN 1992-1-1)* (two pages: headings/outline, inputs, full calculations, result units, PASS/FAIL checks, section sketch, summary) or *Steel beam – simply supported*. A first visit opens the RC beam template; a link with `?template=rc-beam` or `?template=steel-beam` always starts a new worksheet from that template.
- **Files**: worksheets auto-save in the browser (IndexedDB). **File → Save to file** (`Ctrl+Shift+S`) writes a `.mCalcCanvas` file (plain JSON, schema-versioned) to share or back up; **File → Open file** (`Ctrl+Shift+O`), the Open dialog, or dragging the file onto the page loads it again. `.json` works too.
- **Input & Results**: map existing worksheet definitions, calculated results and checks into a compact batch table. Units come from the bound regions, cells accept numbers only, and results remain unchanged until **Calculate All**. The table definition and draft input rows are stored in the `.mCalcCanvas` file; calculated outputs are recomputed on demand.
- **Document** tab: page/free canvas, grid, header & footer, orientation, zoom, export PDF. Double-click the header to edit the worksheet details.

## Architecture

```
src/
  engine/        Pure TypeScript calculation engine (no React, no canvas code)
    LatexParser.ts        LaTeX (MathLive subset) → JSON expression tree, recursive descent
    ExpressionEvaluator   symbol resolution + evaluation on mathjs numbers/Units
    UnitSystem.ts         explicit unit registry, dimension names, display units, formatting
    DependencyGraph.ts    name-based graph (definers/referrers), affected-set expansion
    CalculationEngine.ts  incremental recalculation, cycles, duplicates, drafts
    LatexFormatter.ts     tree → LaTeX (result-only and substituted "full calculation" lines)
  canvas/        Own canvas engine (no third-party canvas SDK)
    model/              shape types, geometry, document store with snapshot undo/redo
    CanvasView.tsx      pan/zoom viewport, select/marquee/move/resize, drawing tools
    shapes/             math, rich text, image, rectangle, line/arrow, freehand renderers
    canvasActions.ts    clipboard, duplicate, group, images, zoom
    engineBridge.ts     canvas store → calculation engine sync
  math/          MathLive editor, static renderer, display composition
  documents/     IndexedDB storage, JSON (de)serialisation with migrations, demo sheet
  export/        page geometry, print/PDF export
  components/    menu bar, toolbar, properties panel, dialogs, status bar
  store/         Zustand stores (app UI state, per-region results)
```

**Single source of truth.** Math regions store only JSON props (LaTeX, display options) in the canvas store. The engine is derived: every store change — typing, undo, paste, load — flows one way through `engineBridge.ts`. Results are never persisted; they're recomputed on load.

**Evaluation order.** Regions are evaluated in reading order. The canvas layer (`engineBridge.ts`) gives every math region a key `[page, y, x, id]`; the engine compares keys lexicographically (`compareOrderKeys`) and knows nothing about geometry. Coordinates are used exactly — no rounding or numeric packing — so large and negative positions order correctly, and the id makes equal positions deterministic. A region can only use definitions before it (a name defined only below is reported as "defined below"), and uses the nearest definition before it when a name is defined more than once; redefinitions are outlined in green.

**Dependencies.** Every referenced name is resolved to the exact *defining region* it uses, and the graph (`DependencyGraph.ts`) stores those region-to-region edges. Two definitions of `x` therefore feed two independent sets of regions: editing the first `x` recalculates only the regions that use it. Each region also records the names that could change its resolution (each identifier and, for letter runs like `wL`, each letter); adding, removing, renaming or moving a definition of such a name re-resolves just those regions. Display-only changes (result unit, precision, unit system) re-format the region without recalculating dependents. Recalculation is incremental: changing an input in a 1 000-region worksheet evaluates only its dependency chain.

**Numerics.** Values are kept at full double precision in SI base units; rounding happens only when a value is formatted for display. Checks compare unrounded values under an explicit `ComparisonPolicy`: acceptance checks (≤ < ≥ >) are **strict** — no tolerance at all, so η = 1.0000001 (or 1 + 2⁻⁵²) against 1 fails although it displays as 1; floating-point noise can only make a borderline check fail, never pass. Only numerical equality (= ≠) is approximate, with an explicit 10⁻¹² relative tolerance. Every intermediate result is checked: division by zero, results outside the real numbers (√ of a negative, log ≤ 0, asin(2), negative base with a non-integer power) and overflow are reported as errors, never as NaN/∞. Trigonometric functions take an angle unit (°, rad) or a dimensionless number in radians. Absolute temperatures in °C are affine: °C ± K → °C, °C − °C → K, while adding, scaling or applying functions to °C is rejected with an explanation.

**Incremental.** A change re-evaluates only the edited region and its transitive dependents; each region subscribes to its own result, so unrelated regions don't re-render.

**Rich-text and file safety.** Text from typing, pasting, the clipboard and imported files is rebuilt by an allow-list sanitiser (`sanitize.ts`): a new DOM tree is created containing only allowed tags (b, i, u, lists, headings, …) and a validated colour on `<font>`, at any nesting depth; script-like elements are dropped with their content. Clipboard shapes and imported documents go through the same validation (`sanitizeShape`), with numbers clamped to sane ranges and duplicate ids renamed rather than dropped.

**Safety.** Expressions are untrusted input. There is no `eval` and no `math.evaluate` on strings: the parser builds a JSON tree and the evaluator calls a fixed set of mathjs functions on numbers and Unit objects. Input length, tree size, nesting depth and exponents are bounded, so evaluation is linear in expression size and cannot loop — which is why evaluation runs on the main thread rather than a worker for now.

### Symbol resolution

Deterministic, documented rules so `m` (metre) and `m` (a variable) are never ambiguous:

1. Upright names (`\mathrm{kN}`) are units if registered, otherwise variables.
2. A name defined in the worksheet is a variable (defining a unit's name shows a "shadows the unit" warning).
3. `π` is the constant. 4. A registered unit symbol is a unit.
5. A run of italic letters splits into factors: `wL^2` = w·L² (the power binds to the last factor, as in TeX), while `mm^2` stays (mm)².

Multi-letter units (kN, kPa, mm…) are converted to upright form while typing. Supported: mm cm m km in ft · N kN MN lbf kip · Pa kPa MPa GPa psi ksi · kg tonne · s Hz K °C · ° rad.

### Why not Compute Engine for parsing?

CortexJS Compute Engine (0.173) parses `25kN/m` as `25·k·N/m`, losing the unit. A dedicated parser for the MathLive LaTeX subset gives unit-aware tokenisation and precise error messages, and keeps the engine free of a large dependency. MathLive is used for editing and rendering.

## Design

UI tokens come from [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (vendored at `.claude/skills/ui-ux-pro-max`, MIT): *Minimalism & Swiss Style*, navy/blue professional palette, Inter. The generated system is in `design-system/calccanvas/MASTER.md`; tokens live in `src/styles/global.css`. Regenerate or query it with:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "engineering calculation tool" --design-system -p CalcCanvas
```

## Contributing

See **AGENTS.md** and `docs/` (ARCHITECTURE, ENGINE_DESIGN, PROJECT_MEMORY, ROADMAP). CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit and browser tests; GitHub Pages deploys only after they pass.

## Tests

`npm test` (Vitest) and `npm run test:e2e` (Playwright; set `CHROME_PATH` to use a system Chrome).

- **Engine**: parser, units and dimension errors, display units, symbol resolution, reading order (same row, defined below, moves, equal and very large coordinates, multiple pages), definition-level dependencies (independent redefinitions, deletion, insertion, chains, unrelated regions not re-evaluated), numerical safeguards (precision, strict checks, division by zero, domain errors, powers with units, temperatures, trigonometry), error messages and engineering reference values (bending, shear, deflection, utilisation).
- **Performance** (`performance.test.ts`): 100 / 500 / 1 000 regions; asserts how many regions an edit or move re-evaluates and logs timings.
- **Unit**: sanitiser (malicious input, deep nesting, formatting preserved), serializer (round trip of every shape type, migrations, duplicate ids, invalid numbers, unknown types), clipboard paste validation, canvas→engine synchronisation with the real stores (create, edit, move across pages, undo/redo, delete, load, display units), PDF page assignment.
- **Browser**: acceptance tests A–I, canvas, Mathcad keys, page layout, grid, panels, templates, files, and pasting HTML into a text region.

## Known limitations

- Default precision is 2 decimals (≥ 3 significant figures below 1), so V_Ed shows 121.13 kN; set 3 decimals to see 121.125.
- PDF export uses the browser print dialog (vector output); multi-page is supported by stacking pages vertically. Each object prints on the page that contains its top edge; anything extending past that page's edge is clipped (and flagged before printing).
- Single-letter units typed bare (`8.5m`) render italic; multi-letter units render upright.
- Variables are document-scoped; no local scopes, user-defined functions, matrices, ranges or iteration yet.
- Text formatting uses the browser's contentEditable commands (bold, italic, underline, heading, lists); pasted HTML is reduced to a safe whitelist.
- No rotation or z-order controls yet; multi-selection moves but doesn't resize.
- Free-positioned table regions on the calculation canvas are not implemented; batch Input & Results uses its own document workspace.
- Evaluation runs on the main thread (bounded per the safety notes above).

## Single-file build

`npm run build:single` writes `dist-single/index.html` (~2.5 MB): the whole app with fonts inlined, no server or network needed. Open it directly in Chrome or Edge.

## Licensing

All dependencies are MIT/Apache-licensed (React, MathLive, mathjs, Zustand, lucide). The canvas is CalcCanvas's own code, so there is no canvas SDK license or watermark.
