# Architecture

mCalcCanvas is a single-page React 19 + TypeScript app (Vite, Tailwind 4, Zustand 5). It has no server. Worksheets live in IndexedDB and in `.mCalcCanvas` files.

```text
UI (DocsHeader, panels, dialogs)        ── commands.ts ──┐
        │                                                 │
Canvas UI (CanvasView, shapes/*)  ── canvasActions.ts ── layout.ts (pure plans)
        │                                │
        └──────────► canvasStore (Zustand: shapes, order, selection, camera, undo/redo)
                                 │  subscribe
                     engineBridge.ts ── reading-order keys [page, y, x, id]
                                 │
                     CalculationEngine (src/engine, no React/DOM)
                                 │  results
                     calculationStore ──► MathView / ParametersPanel / PDF
documentController ── SaveCoordinator ── DocumentRepository (IndexedDB: DocumentManager)
```

## Modules

| Path | Responsibility |
|---|---|
| `src/engine/` | LaTeX parser → JSON AST, symbol resolution, evaluation with mathjs units, dependency graph, incremental recalculation, errors, formatting. See ENGINE_DESIGN.md. |
| `src/store/calculationStore.ts` | The single engine instance; results mirrored into Zustand keyed by region id. |
| `src/store/appStore.ts` | Document metadata, settings (unit system, precision, page mode/orientation, header/footer, fonts, `pages`, `baselineSnap`), panels, dialogs, save state. |
| `src/canvas/model/canvasStore.ts` | Shapes (math, text, image, rect, line, draw, graph), z-order, selection, editing, tool, camera, crosshair. Snapshot undo/redo and `transaction()`. A position normaliser (grid alignment) runs on every move. |
| `src/canvas/pageConstraint.ts` | Page-layout rules: printable boxes, clamping, grid origin, baseline alignment (`gridAlign`, `baselineOf`, `baselineStep`). |
| `src/canvas/layout.ts` | Pure layout service: the line model across pages, `planLineShift` (Enter/Backspace line insertion with page flow) and `planSeparation` (overlap resolution). It returns plans; it never mutates the store. |
| `src/canvas/canvasActions.ts` | User-level operations: create regions, clipboard, duplicate, nudge, camera, crosshair, and applying layout plans. |
| `src/canvas/engineBridge.ts` | One-way sync from canvas to engine. It computes reading-order keys and passes only calculation-relevant changes. A math shape is one region; a graph is one hidden region per series field (see ENGINE_DESIGN.md, Graph regions). |
| `src/canvas/graphData.ts`, `shapes/GraphView.tsx` | X-Y graphs: pure conversion of series results to drawable data (ranges, ticks, errors) and the SVG view used on the canvas and in the PDF. Series are edited in the Graph tab and the Properties panel (`math/MathInput`); `SeriesSources` lists the variables a series uses and the literal inputs behind them (from `CalculationResult.sources`), each a link to its definition. |
| `src/canvas/annex.ts`, `annexActions.ts` | Annex: blocks under annex headings below the ANNEX title, numbered in the order of their links; each linked block is calculated at its link (see ENGINE_DESIGN.md, Annex blocks). Insert → Annex link, follow link ↔ heading, Tools → Sort annex by link order (moves whole pages). Labels are rendered by `TextView` from this data, never stored. |
| `src/canvas/CanvasView.tsx`, `shapes/` | Pointer state machine (pan, move, marquee, resize, draw) and DOM rendering of shapes. MathView measures size and baseline. |
| `src/math/` | MathLive editor and Mathcad-style keys, static rendering (`MathRenderer`), display composition (`MathFormatter`), unit styling (`unitStyle`). |
| `src/documents/` | Types and version, serializer with migrations and validation, IndexedDB repository, `SaveCoordinator`, templates, controller (new/open/import/export/autosave). |
| `src/export/` | A4 geometry, header/footer, PDF via `window.print` of statically rendered pages. Each shape prints on one page. |
| `src/components/` | Google-Docs-style chrome: menus, a toolbar with Math/Text formatting and Graph tabs, Outline/Parameters panel, Properties panel, dialogs, help guide. |

## Data flow rules

1. User actions change the canvas store (and app settings). Nothing else is authoritative.
2. `engineBridge` sends `setRegion` / `removeRegion` to the engine only when the LaTeX, display unit, precision, draft state or reading key changes. Size-only changes are ignored.
3. The engine recalculates incrementally and emits the changed ids. `calculationStore` publishes those results.
4. Autosave watches `docVersion` and settings, and calls `SaveCoordinator.markDirty()`.
5. Layout (grid alignment, separation, line insertion) changes only positions. It is computed by `layout.ts` and applied in one update.

## Persistence

- `CalculationDocument` (v2): `{ id, version, title, metadata, settings, shapes[], createdAt, updatedAt }`. Results are never stored.
- `parseDocument` validates every field, migrates v0/v1, sanitises HTML, clamps numbers and renames duplicate ids.
- `SaveCoordinator` serialises saves and tracks revisions. "Saved" means the latest revision was written. Before switching documents, pending edits are flushed. On unload with unsaved changes, the browser warns.
