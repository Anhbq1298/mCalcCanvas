# CalcCanvas

A browser-based engineering calculation workspace inspired by Mathcad Prime, built on its own canvas engine: type equations anywhere on a free canvas, define variables with units, and every dependent result updates automatically. The same canvas lays out as A4 pages and exports a vector PDF calculation sheet.

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

- **Create a region**: click the canvas and start typing, double-click empty space, or use the Σ tool and click.
- **Define**: `L:=8.5m` (`:=` turns into ≔). **Evaluate**: `M=`. **Check**: `eta_M<=1` → PASS/FAIL.
- `/` makes a fraction, `^` and `_` for exponent/subscript, `Enter` or `Esc` to finish. Typing `=` always evaluates the whole region, even if the caret is still in a denominator.
- Drag, resize, marquee select, copy/paste (incl. screenshots), drag-and-drop images, duplicate (`Ctrl+D`), group (`Ctrl+G`), undo/redo, arrow-key nudge, `Ctrl+wheel` zoom, wheel or `Space`+drag pan, double-click empty canvas for a new region.
- Select a region to change its display mode (formula / result / formula + result / full calculation), result unit (e.g. `kN·mm`), decimals, size and colour in the properties panel.
- **Page layout** mode shows A4 sheets, margins and flags objects outside the print area. **Export PDF** prints each page as vector output with a title block and page numbers (choose *Save as PDF*).
- File menu: new, open, save, JSON import/export.

## Architecture

```
src/
  engine/        Pure TypeScript calculation engine (no React, no tldraw)
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

**Position independence.** Evaluation order is topological over variable names, never canvas coordinates. Each variable has exactly one definition per worksheet; duplicates and cycles (`A → B → A`) are reported, not resolved by position.

**Incremental.** A change re-evaluates only the edited region and its transitive dependents; each region subscribes to its own result, so unrelated regions don't re-render.

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

## Tests

- **Unit (35)**: parser, units and dimension errors, display-unit conversion, symbol resolution, cycles, duplicates, drafts, beam sample values, serializer migrations.
- **Browser (15)**: acceptance tests A–I plus canvas tests (text, undo/redo, clipboard, marquee, resize, zoom) — — free positioning and dragging, definitions/evaluations, dependent recalculation, position independence, mm→kN·m, unit mismatch, undefined/circular errors, type-to-create, persistence across reload, and the full demo flow including PDF generation.

## Known limitations

- Default precision is 2 decimals (≥ 3 significant figures below 1), so V_Ed shows 121.13 kN; set 3 decimals to see 121.125.
- PDF export uses the browser print dialog (vector output); multi-page is supported by stacking pages vertically. Pages don't yet repeat a title block template beyond the header/footer.
- Single-letter units typed bare (`8.5m`) render italic; multi-letter units render upright.
- Variables are document-scoped; no local scopes, user-defined functions, matrices, ranges or iteration yet.
- Text formatting uses the browser's contentEditable commands (bold, italic, underline, heading, lists); pasted HTML is reduced to a safe whitelist.
- No rotation or z-order controls yet; multi-selection moves but doesn't resize.
- Table regions are not implemented.
- Evaluation runs on the main thread (bounded per the safety notes above).

## Single-file build

`npm run build:single` writes `dist-single/index.html` (~2.5 MB): the whole app with fonts inlined, no server or network needed. Open it directly in Chrome or Edge.

## Licensing

All dependencies are MIT/Apache-licensed (React, MathLive, mathjs, Zustand, lucide). The canvas is CalcCanvas's own code, so there is no canvas SDK license or watermark.
