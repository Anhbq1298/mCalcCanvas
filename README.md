# CalcCanvas

**Live app:** https://anhbq1298.github.io/mCalcCanvas/

A browser-based engineering calculation workspace in the style of Mathcad Prime, built on its own canvas engine. You type equations anywhere on A4/A3 pages, define variables with units, and every dependent result updates automatically. A worksheet prints to a vector PDF calculation sheet. The same worksheet can be run for many load cases (Input & Results), and each case can be printed as a report.

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

On a first visit the **RC beam** template opens. Worksheets autosave to the browser (IndexedDB).

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and production build (`dist/`) |
| `npm run build:single` | One offline HTML file (`dist-single/index.html`) |
| `npm test` | Engine and unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) |
| `npm run typecheck` / `npm run lint` | |
| `npm run templates:columns` | Regenerate the column templates (needs a build; see AGENTS.md) |

Playwright needs a Chromium. Run `npx playwright install chromium`, or point it at an installed Chrome with `CHROME_PATH=/path/to/chrome npm run test:e2e`.

## Using it

**Layout.** The menu row holds File, Templates, Edit, View, Insert, Tools and Help. Next to it are the workspaces (**Calculation**, **Input & Results**) and the ribbon tabs, in Mathcad Prime order: **Math**, **Calculation**, **Plots**, **Math Formatting**, **Text Formatting**, **Document**, **Help**. Undo and redo sit next to the title.

The ribbon follows Mathcad Prime: each group has large buttons (icon above the label) for its main commands and small labelled buttons stacked three high, with the group name underneath. Math holds Clipboard, Regions, Operators and Symbols, and Draw; Calculation holds Calculate and the worksheet unit system, decimals and snap; Document holds Page Setup, Show (page boundaries, grid, ruler, header & footer), Zoom and Pages. The tab stays where you put it; selecting a region does not switch it. The Outline, Parameters and Properties toggles sit at the right end of the ribbon.

The left side panel has the **Outline** (headings, click to jump) and **Parameters**. The right side panel holds the properties.

**Writing on the page.** Pages carry an engineering grid: 20 px squares, with a major line every 2 squares. Equations and text sit on the lines like ruled paper.

- **Place the cross**: click the page; a **+** cross marks the spot.
- **Type**: start typing to create a math region at the cross, or press `"` to start a text region.
- **Lines**: `Enter` inserts a line and pushes everything below down (content flows onto the next page). `Delete` removes the blank line the cross is on, and `Backspace` removes the blank line above it. Deleting regions also closes the lines they leave empty.
- **Units** are shown in a colour, with a dot before them (`25 · kN/m`). The colour is a document label style.

**Equations**:
- **Keys**: `:` definition ≔ · `=` evaluate · `/` fraction · `^` power · `.` after a name gives a literal subscript (`M.Ed` → M_Ed) · `\` √ · `Ctrl+\` ⁿ√ · `|` absolute value · `'` parentheses · `Ctrl+G` Greek (a → α) · `Ctrl+Shift+P` π · `Ctrl+9 / 0 / 3` ≤ ≥ ≠.
- **Functions**: user functions `f(x) := …`, ranges `i := 0..n−1`, vectors with `map`, `linterp` and `stack`, if blocks laid out like Mathcad Prime, and checks (`η ≤ 1` shows PASS/FAIL).
- **Constants**: π, e, g, ∞ and %. A worksheet definition with the same name overrides a constant (with a warning).

**Tabs**:
- **Document**:
  - Page setup: paper A4 or A3, portrait or landscape, margins in mm (Standard 20/16, Normal 25, Narrow 12.7, Wide 30, or custom). The Page setup dialog shows a preview of the paper and its printable area.
  - Page view: page boundaries, millimetre rulers (they follow zoom and scrolling, and shade the margins), grid, header & footer, and pages on or off.
  - Zoom: zoom level, 100 %, fit page and fit width.
  - Insert: math or text region, page break (`Ctrl+Shift+Enter`), blank page (`Ctrl+Enter`).
  - Page settings only move the page frames. Regions keep their positions and nothing is recalculated. A region left outside the printable area is marked in red.
- **Math Formatting**:
  - Operators & Symbols: operator, symbol, constant and unit palettes.
  - Display: formula only, result only, formula = result, or the full calculation with values substituted; result unit; how arrays are shown.
  - Results: number format (general, decimal, scientific, engineering), decimal places, trailing zeros. These apply to the selected equations, or are the worksheet default when nothing is selected. They change only how a number is written; the value keeps full precision.
  - Math Font: size, colour, highlight.
  - Label Styles: colours of units and of inputs.
  - Worksheet: unit system (SI or USCS), default decimal places, snap.
- **Text Formatting**:
  - Font, size, bold/italic/underline, sub/superscript, colour, highlight and clear formatting. These apply to the selected characters, or to the whole region.
  - Alignment (including justify), lists and indent.
  - Styles: Normal, Title, Subtitle, Heading 1–3. Headings appear in the outline (`Ctrl+Alt+0–3`).
  - Links: http, https and mailto only.
- **Graph**: X-Y graphs with series, axis units, equal axes and grid.
- **Help**: the Help center (`F1`), with guides and a searchable list of every keyboard shortcut; the display-formats guide; the math syntax reference.

**Templates** (Templates menu, or a link such as `?template=rc-beam`):
- *RC beam – bending (EN 1992-1-1)*.
- *Steel beam – simply supported*.
- *RC rectangular column check (EN 1992-1-1)* and *RC circular column check (EN 1992-1-1)*. These cover a P–Mθ interaction curve from fibres, shear to EN 1992-1-1:2023 §8.2.3, and an annex with the derivations. The rectangular column comes with 5 load cases.

**Input & Results** (workspace tab):
- **Load cases**: bind worksheet inputs and results to columns, enter numbers for each case, then press **Calculate All**. Cases run off the UI thread on a small pool of workers. Each worker sets up the worksheet once and changes only the bound inputs from case to case.
- **Outdated results**: results are marked *Outdated* as soon as anything they depend on changes.
- **Right-click a case** to show it on the calculation sheet (its values go into the inputs as one undo step), print its report, or delete it.
- **Print reports** prints a summary page of all cases, then the full worksheet for each case with that case's values and results.

**Files**:
- **Autosave**: worksheets save automatically in the browser.
- **Save and open files**: **File → Save to file** (`Ctrl+Shift+S`) writes a `.mCalcCanvas` file (plain JSON, schema-versioned). **File → Open file** (`Ctrl+Shift+O`) opens it again, and so does dropping the file onto the page. `.json` files also work.
- **PDF**: **File → Download PDF / Print** (`Ctrl+P`) prints with the document's paper size, orientation and margins, without the grid, rulers or selection marks.

## Architecture

```
src/
  engine/        Pure TypeScript calculation engine (no React, no canvas code)
    LatexParser.ts        LaTeX (MathLive subset) → JSON expression tree, recursive descent
    ExpressionEvaluator   symbol resolution + evaluation; packed-vector fast paths
    UnitSystem.ts         unit registry, dimension names, display units, number formats
    DependencyGraph.ts    region-to-region dependency edges, affected-set expansion
    CalculationEngine.ts  incremental recalculation, overrides (batch), progressive results
    batch.ts              Input & Results: one engine per worker, cases via definition overrides
    worker/               the calculation Web Worker and its message protocol
  canvas/        Own canvas engine (no third-party canvas SDK)
    model/              shape types, geometry, document store with snapshot undo/redo
    CanvasView.tsx      pan/zoom viewport, select/marquee/move/resize, drawing tools, rulers
    layout.ts           ruled-line model: insert/remove lines, separation, page flow
    engineBridge.ts     canvas store → calculation engine sync (reading-order keys)
  app/           commands, keyboard shortcut registry (shortcuts.ts) and actions
  math/          MathLive editor, Mathcad keys, static renderer, display composition
  documents/     IndexedDB storage, (de)serialisation with migrations, templates
  export/        page geometry (paper, margins), print/PDF, case reports
  components/    header + ribbon, Input & Results, panels, dialogs (Help center, Page setup)
  store/         Zustand stores, engine client (worker), batch worker pool
tools/templates/ generators for the column templates
```

**Single source of truth.** Math regions store only JSON props (LaTeX, display options) in the canvas store. The engine is derived from them: every store change (typing, undo, paste, load) flows one way through `engineBridge.ts`. Results are never saved; they are recalculated on load.

**Off the UI thread.** The engine runs in a Web Worker (`src/engine/worker`). The UI thread loads only the light parts it needs (units, order keys).
- **Progressive results**: a long recalculation sends results as they finish, inputs first, so a sheet fills in from the top.
- **Loading**: when a worksheet loads, its regions go to the worker before the canvas renders, so calculating and drawing happen at the same time.
- **Lazy drawing**: equations far outside the view are typeset only when they come near it.

**Evaluation order.** Regions are evaluated in reading order. Each region gets a key `[y, x, id]`; pages are stacked vertically, so the key also orders pages and does not change with the paper size. A region can only use definitions before it (a name defined only further down is reported as "defined below"). When a name is defined more than once, a region uses the nearest definition before it, and redefinitions are outlined in green. Annex blocks are calculated at their link.

**Dependencies.** Every name is resolved to the exact *defining region* it uses, so two definitions of `x` feed two independent sets of regions. Display-only changes (result unit, precision, number format, unit system) re-format a region without recalculating its dependents. Recalculation is incremental.

**Numerics.** Values keep full double precision in SI base units; rounding happens only when a value is written out. Acceptance checks (≤ < ≥ >) are **strict**, with no tolerance. Only = and ≠ use a 10⁻¹² relative tolerance. Division by zero, non-real results and overflow are reported as errors, never as NaN or ∞. Absolute temperatures in °C are affine.

**Speed.**
- **Packed vectors**: vectors whose entries share one dimension are stored as SI numbers (`Float64Array`) plus one unit. Arithmetic, comparisons, element-wise `if` and aggregates work on the numbers directly. Anything unusual falls back to the per-entry path.
- **Measured result**: a rectangular column (900 fibres × 150 neutral-axis positions) calculates in about 0.3 s, and 100 load cases in about 1 s.

**Shortcuts.** `src/app/shortcuts.ts` is the single list of keyboard shortcuts. It drives the keyboard handler, the Help center, tooltips and a conflict test, and it does not claim keys the browser keeps for itself (`Ctrl+T`, `Ctrl+W`, …).

**Safety.** Expressions are untrusted input. There is no `eval` and no `math.evaluate` on strings: the parser builds a JSON tree, and the evaluator calls a fixed set of mathjs functions. Input length, tree size, nesting depth and exponents are bounded. Rich text from typing, pasting and imported files is rebuilt by an allow-list sanitiser (`sanitize.ts`), which keeps safe links (http, https, mailto), validated colours and highlights only. Imported documents and pasted shapes go through `sanitizeShape`.

### Symbol resolution

1. Upright names (`\mathrm{kN}`) are units if registered, otherwise variables.
2. A name defined in the worksheet is a variable (shadowing a unit gives a warning).
3. `π` is the constant.
4. A registered unit symbol is a unit.
5. A run of italic letters splits into factors: `wL^2` = w·L², while `mm^2` stays (mm)².

Supported units: mm cm m km in ft · N kN MN lbf kip · Pa kPa MPa GPa psi ksi · kg tonne · s Hz K °C · ° rad.

### Why not Compute Engine for parsing?

CortexJS Compute Engine parses `25kN/m` as `25·k·N/m`, losing the unit. A dedicated parser for the MathLive LaTeX subset gives unit-aware tokenisation and precise error messages. MathLive is used for editing and rendering.

## Design

UI tokens come from [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (vendored at `.claude/skills/ui-ux-pro-max`, MIT): *Minimalism & Swiss Style*, a navy/blue professional palette and the Inter font. The generated system is in `design-system/calccanvas/MASTER.md`, and the tokens live in `src/styles/global.css`. The ribbon follows the compact layout of Mathcad Prime.

## Contributing

See **AGENTS.md** (the rules for every agent and contributor) and `docs/` (ARCHITECTURE, ENGINE_DESIGN, PROJECT_MEMORY, ROADMAP). CI (`.github/workflows/ci.yml`) runs the typecheck, lint, unit and browser tests; GitHub Pages deploys only after they pass. Keep the unit suite small: one test per behaviour area, with each case written as a `step`.

## Tests

`npm test` (Vitest) and `npm run test:e2e` (Playwright; set `CHROME_PATH` to use a system Chrome).

- **Engine**:
  - parser, units, display units and number formats;
  - reading order and dependencies;
  - numerical safeguards;
  - functions, vectors and if blocks;
  - batch overrides and progressive results;
  - engineering reference values.
- **Unit**:
  - column templates against hand calculations, and that they match their generators;
  - Input & Results: every case equals a fresh engine, in either order;
  - layout (lines, separation, deleting regions);
  - shortcut registry, sanitiser, serializer and annex.
- **Browser**:
  - acceptance tests, canvas, Mathcad keys, grid and lines;
  - panels and templates;
  - load cases, case reports and the right-click menu.

## Known limitations

- PDF export uses the browser's print dialog. Each object prints on the page that contains its top edge; anything past that page's edge is clipped (and flagged before printing).
- The math font family is set by the renderer: equations can change size and colour, not font.
- Changing a text style does not update text already formatted with it; the style's size and colour are copied when it is applied.
- There are no matrices, solvers or symbolic algebra yet, and no free-positioned table regions on the canvas (Input & Results is a separate workspace).
- No rotation or z-order controls; multi-selection moves but doesn't resize.

## Licensing

All dependencies are MIT- or Apache-licensed (React, MathLive, mathjs, Zustand, lucide). The canvas is CalcCanvas's own code, so there is no canvas SDK license or watermark.
