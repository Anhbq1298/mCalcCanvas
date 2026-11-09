# Roadmap

| Priority | Item | Status |
|---|---|---|
| P0 | Autosave concurrency (serialised, revision-checked saves; flush before switching documents) | Done (`SaveCoordinator`) |
| P0 | CI: typecheck, lint, unit, build, e2e; deploy only after they pass | Done (`ci.yml`) |
| P1 | Layout service: pure plans, batched updates, no fixed iteration cap | Done (`layout.ts`) |
| P1 | Transactions: a user action and its layout are one undo step | Done (`transaction()`) |
| P1 | Strict engineering comparisons; explicit approximate equality | Done (`ComparisonPolicy`) |
| P1 | Agent documentation | Done (AGENTS.md, CLAUDE.md, docs/) |
| P2 | `DocumentRepository` abstraction | Interface done; IndexedDB is the only backend |
| P2 | `CalculationValue` abstraction (scalar + matrix) introduced incrementally | Planned |
| P2 | Input & Results batch workspace: persisted bindings/rows, inherited units, explicit Calculate All | Done |
| P2 | User-defined functions `f(x) := …` | Planned |
| P2 | Matrices and vectors with per-entry units | Planned |
| P2 | Units tests: stiffness (kN/mm), rotational stiffness (kN·m/rad), thermal expansion | Planned |
| P3 | Σ / ∏ / ranges, numerical solver, plots, tables | Planned |
| P3 | Automation API | Design first |
| P3 | Spatial index for layout on very large worksheets (only if measurements show a need) | Not needed yet (500 regions re-flow in ~0.15 s) |
