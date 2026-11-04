# Project memory — decisions and conventions

## Product decisions
- **Own canvas, not tldraw.** tldraw was replaced (licence/watermark constraints). Shapes are DOM elements in a transformed layer.
- **Google Docs look.** Menus, one toolbar with Math/Text formatting tabs that follow the selection, an Outline/Parameters panel on the left, a Properties panel on the right, white A4 pages.
- **Mathcad behaviour:**
  - Calculations run top to bottom, then left to right.
  - `:` defines, `=` evaluates.
  - Mathcad keyboard shortcuts.
  - The red + insertion cross: Enter inserts a line and pushes content down; Backspace removes a blank line.
- **Ruled-paper grid.** 10 px squares, a major line every 4 (40 px). Math and text snap their *first baseline* onto a major line by default; View → "Snap equations to minor grid lines" changes this to 10 px. The math baseline is measured from the DOM (`props.baseline`, not persisted as authoritative).
- **No overlaps.** When a region would overlap an equation, the later region in reading order, and everything after it, moves down by whole lines (`layout.planSeparation`).
- **Units display.** Light blue (`UNIT_COLOR`), with a `·` between number and unit (display only, `unitStyle.ts`). Temperatures keep `20 °C`.
- **Templates.** The RC beam (EN 1992-1-1) template is the default on first visit; the steel beam is the test fixture. `?template=<id>` starts a new worksheet from a template.
- **Files.** `.mCalcCanvas` is the JSON document. Results are never stored.
- **Operators gallery.** It mirrors Mathcad Prime. Operators the engine can't evaluate yet are shown disabled, not hidden.

## Engineering policies
- Acceptance checks are strict (no tolerance).
- Intermediate values are never rounded.
- Absolute temperatures are affine.
- Error messages must be understandable to engineers.

## Conventions
- Test IDs (`data-testid`) are part of the test contract; keep them stable.
- `openFresh(page)` in e2e tests opens the steel-beam sample through `?template=steel-beam`.
- Single-file build for offline use: `npm run build:single`. When publishing it as an artifact, U+FFFD must be escaped.
- The deploy target is GitHub Pages (`gh-pages` branch) via CI after tests pass. The base path is relative (`base: './'`).

## Known limitations
- Kelvin values are linear; only °C is affine.
- `\Delta T` (a Greek letter followed by a letter) is not joined into one variable name.
- A shape that crosses a page edge is clipped on its page when printed (a warning is shown first).
- There are no matrices, user-defined functions, solvers, plots or tables yet.
