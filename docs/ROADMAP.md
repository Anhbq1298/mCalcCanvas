# Roadmap

| Priority | Item | Status |
|---|---|---|
| P0 | Autosave concurrency (serialised, revision-checked saves; flush before switching documents) | Done (`SaveCoordinator`) |
| P0 | CI: typecheck, lint, unit, build, e2e; deploy only after they pass | Done (`ci.yml`) |
| P0 | Calculation does not block the UI on heavy worksheets | See `docs/ENGINE_DESIGN.md` (Responsiveness) |
| P1 | Layout service: pure plans, batched updates, no fixed iteration cap | Done (`layout.ts`) |
| P1 | Transactions: a user action and its layout are one undo step | Done (`transaction()`) |
| P1 | Strict engineering comparisons; explicit approximate equality | Done (`ComparisonPolicy`) |
| P1 | Agent documentation | Done (AGENTS.md, CLAUDE.md, GEMINI.md, docs/) |
| P1 | Column templates generated from `tools/templates`, checked in CI against the generator | Done |
| P2 | `DocumentRepository` abstraction | Interface done; IndexedDB is the only backend |
| P2 | `CalculationValue` abstraction (scalar + matrix) | Vectors done (`Value = Quantity \| QVector`); matrices planned |
| P2 | User-defined functions `f(x) := …`, `map`, `linterp`, `stack`, `let` | Done |
| P2 | If blocks (Mathcad Prime layout), ∧ / ∨ conditions, element-wise `if` on vectors | Done |
| P2 | Annex blocks calculated at their link | Done |
| P2 | Changing an input's unit converts its value | Done |
| P2 | Input & Results batch workspace: persisted bindings/rows, inherited units, explicit Calculate All | Done |
| P2 | Matrices and vectors with per-entry units | Planned |
| P2 | Units tests: stiffness (kN/mm), rotational stiffness (kN·m/rad), thermal expansion | Planned |
| P3 | Ranges, `sum`/`len`, X-Y graphs (lines, markers, segments) | Done |
| P3 | Σ / ∏ notation, indexing `x[i]`, numerical solver, tables | Planned |
| P3 | Automation API | Design first |
| P3 | Spatial index for layout on very large worksheets (only if measurements show a need) | Not needed yet (500 regions re-flow in ~0.15 s) |
