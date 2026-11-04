# AGENTS.md — working on mCalcCanvas

Instructions for coding agents (and humans). Read `docs/ARCHITECTURE.md` and `docs/PROJECT_MEMORY.md` before larger changes.

## Commands

```bash
npm ci                 # install (Node 22)
npm run dev            # Vite dev server
npm run typecheck      # tsc -b (strict)
npm run lint           # oxlint src  — 0 errors expected (3 known fast-refresh warnings)
npm test               # Vitest: engine + unit tests
npm run build          # typecheck + production build
npm run test:e2e       # Playwright (builds and serves on :4173; CHROME_PATH=… to use a system Chrome)
npm run build:single   # single-file offline HTML in dist-single/
```

CI (`.github/workflows/ci.yml`) runs all of these; GitHub Pages deploys only after they pass.

## Ground rules

- **The canvas store is the source of truth.** The calculation engine is derived from it through `src/canvas/engineBridge.ts`. Never write results into the canvas store or persist them.
- **The engine stays independent of React, the DOM and canvas geometry.** It receives LaTeX and an opaque reading-order key per region.
- **No string evaluation.** Never use `eval`, `new Function`, or `math.evaluate`/`math.parse` on user text. The parser builds a JSON tree; the evaluator calls a fixed set of mathjs functions.
- **Engineering checks are strict.** Do not add tolerances to ≤ < ≥ > (see `ComparisonPolicy` in `ExpressionEvaluator.ts`). Never compare or round displayed values.
- **Untrusted input:** imported files, the clipboard and pasted HTML go through `sanitizeShape` / `sanitizeHtml`. New shape props must be validated in `DocumentSerializer.sanitizeShape`.
- **Layout changes are planned, then applied.** Use `src/canvas/layout.ts` (pure plans) and apply with one `updateShapes`; group a user action and its consequences with `transaction()` so they form one undo step.
- **Saving goes through `SaveCoordinator`.** Don't call the repository directly from UI code.
- **Document format:** `DOCUMENT_VERSION` in `DocumentTypes.ts`. Optional new fields are fine; breaking changes need a migration in `DocumentSerializer.MIGRATIONS` and a test.
- Keep changes small and focused; don't rewrite subsystems. Strict TypeScript, avoid `any`.

## Tests to add with every change

- Engine behaviour → `src/tests/engine/*.test.ts` (pure, fast).
- Stores, layout, serializer, sanitizer → `src/tests/unit/*.test.ts` (`// @vitest-environment happy-dom` when the DOM is needed).
- User-visible flows → `src/tests/integration/*.spec.ts` (Playwright). `openFresh(page)` opens the steel-beam sample.
- Bug fix → a regression test that fails without the fix.
- Don't weaken assertions to make a test pass.

## Where things are

See `docs/ARCHITECTURE.md`. Engine internals: `docs/ENGINE_DESIGN.md`. Decisions and conventions: `docs/PROJECT_MEMORY.md`. What's next: `docs/ROADMAP.md`.
