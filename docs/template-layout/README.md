# Calculation template layout review

All four calculation templates were inventoried and refactored. The blank worksheet is not a calculation template. Baseline and final artifacts were captured from the running application in Chrome; PDFs were rendered again with PyMuPDF to verify their actual page counts and inspect every page. No engineering formula, unit, code clause, input binding or result was removed.

## A4 portrait comparison

| Template | Before | After | Reduction | Content bounding-box utilization | Status |
|---|---:|---:|---:|---:|---|
| Steel beam | 1 | 1 | 0.0% | 64.2% | PASS |
| RC beam | 2 | 2 | 0.0% | 78.9% | PASS |
| RC rectangular column | 19 | 13 | 31.6% | 93.6% | PASS |
| RC circular column | 14 | 10 | 28.6% | 91.3% | PASS |

Total: **36 to 26 printed pages (27.8% reduction)**. The already single-page steel example stays at one page. Utilization is the mean page content bounding-box area divided by writable page area, not an ink-density estimate.

## PDFs and paper formats

| Template | A4 portrait | A4 landscape | A3 portrait | A3 landscape |
|---|---|---|---|---|
| Steel beam | [1 pages](reports/steel-beam-A4-portrait.pdf) | [1 pages](reports/steel-beam-A4-landscape.pdf) | [1 pages](reports/steel-beam-A3-portrait.pdf) | [1 pages](reports/steel-beam-A3-landscape.pdf) |
| RC beam | [2 pages](reports/rc-beam-A4-portrait.pdf) | [3 pages](reports/rc-beam-A4-landscape.pdf) | [2 pages](reports/rc-beam-A3-portrait.pdf) | [1 pages](reports/rc-beam-A3-landscape.pdf) |
| RC rectangular column | [13 pages](reports/rc-rectangular-column-A4-portrait.pdf) | [20 pages](reports/rc-rectangular-column-A4-landscape.pdf) | [9 pages](reports/rc-rectangular-column-A3-portrait.pdf) | [7 pages](reports/rc-rectangular-column-A3-landscape.pdf) |
| RC circular column | [10 pages](reports/rc-circular-column-A4-portrait.pdf) | [16 pages](reports/rc-circular-column-A4-landscape.pdf) | [7 pages](reports/rc-circular-column-A3-portrait.pdf) | [5 pages](reports/rc-circular-column-A3-landscape.pdf) |

All 16 combinations preserve every result and have zero detected collisions, clipped text blocks or out-of-margin math/text/graph regions. Print settings use the configured paper dimensions and margins. A3 landscape uses two reading columns. These are spatial reflows at readable font sizes; there is no whole-document scaling.

## Implementation

- Pure shared planner: `src/canvas/templateLayout.ts`, re-exported from `src/canvas/layout.ts`. It uses measured bounds, keeps rows and grouped sketches intact, repacks colliding columns, keeps headings with following content and removes obsolete page gaps. Annexes have a clear heading and may start in the remaining space on a page.
- Both column generators use the same planner in their shared `tools/templates/layout.mjs`; generated JSON is never hand-edited. The steel and RC beam factories hydrate browser-measured sizes through `templatePresentation.ts` and the generated `templateMetrics.json` catalog.
- Equations use 16 px body type, with 12 px dense annex tables, and smaller intrinsic padding. Long expanded column vectors use labelled continuation panels retaining every entry. The calculation LaTeX stays unchanged.
- Document → Pages → **Optimize print layout** reflows a copy of the worksheet for export. New templates enable it; older saved documents retain manual print placement until enabled. Export never writes the planned geometry into the canvas store.
- Annex structure and numbering follow the editable document; destination page references follow the print plan.
- ResizeObserver measurements are scheduled on animation frames to avoid synchronous observer feedback.

## Validation

- 337 mathematical regions compared by exact source LaTeX, raw displayed result and status against the original browser snapshots: unchanged, no errors.
- Existing independent column calculation references and batch/report tests retained.
- `npm run typecheck`, `npm run lint`, `npm test`: passed (75 unit/engine tests).
- `UI_SNAPSHOTS=1 npm run test:e2e`: 60 browser tests, including all templates, non-mutating export and A3 landscape.
- `npm run build && npm run templates:columns -- --pdf`: completed with no regions-moved warnings.
- Every final PDF was rasterized and visually reviewed; before/after page screenshots and all final A4 pages are below.

## Reproduction and limits

Serve the production app on port 4173. Run `node tools/templates/audit.mjs before` before editing sources, then `node tools/templates/audit.mjs after` and `node tools/templates/quality.mjs after` after regeneration. Additional audit flags: `--paper=A3 --orientation=landscape`. Render PDFs using `python tools/templates/render.py output/templates/after`. Publish the consolidated evidence with `node tools/templates/publish.mjs`.

The planner minimizes gaps while preserving logical row/group order. It is a deterministic greedy layout, not a proof of a globally optimal combinatorial packing. Oversized manually created blocks report an export error instead of silently clipping or shrinking the entire document. All template/paper combinations above fit without this limitation.

## Actual application screenshots

### Steel beam

Before:

![Steel beam before](screenshots/steel-beam-before.png)

After:

![Steel beam after](screenshots/steel-beam-after.png)

![All exported pages](screenshots/steel-beam-contact-1.png)

### RC beam

Before:

![RC beam before](screenshots/rc-beam-before.png)

After:

![RC beam after](screenshots/rc-beam-after.png)

![All exported pages](screenshots/rc-beam-contact-1.png)

### RC rectangular column

Before:

![RC rectangular column before](screenshots/rc-rectangular-column-before.png)

After:

![RC rectangular column after](screenshots/rc-rectangular-column-after.png)

![All exported pages](screenshots/rc-rectangular-column-contact-1.png)

![All exported pages](screenshots/rc-rectangular-column-contact-2.png)

![All exported pages](screenshots/rc-rectangular-column-contact-3.png)

### RC circular column

Before:

![RC circular column before](screenshots/rc-circular-column-before.png)

After:

![RC circular column after](screenshots/rc-circular-column-after.png)

![All exported pages](screenshots/rc-circular-column-contact-1.png)

![All exported pages](screenshots/rc-circular-column-contact-2.png)
