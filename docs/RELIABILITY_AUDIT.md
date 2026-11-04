# Calculation engine & core architecture: reliability audit

Scope: engine (`src/engine`), canvas ↔ engine synchronisation, sanitisation, serialisation, PDF page assignment. The architecture is unchanged. React, MathLive, mathjs, the custom canvas, the document format (still v2), Mathcad reading order, shortcuts, undo/redo and print-based PDF all stay as they were. No dependencies were added.

## A. Confirmed issues

Every issue below was reproduced first with a probe test, then fixed. Each one is covered by a regression test.

| # | File | Root cause | Severity | Reproduction | Fix |
|---|------|-----------|----------|--------------|-----|
| 1 | `engine/ExpressionEvaluator.ts` `compareQuantities` | The tolerance was `1e-12 · max(|x|, |y|, 1)`. The absolute floor of 1e-12 in SI units is huge for small quantities: mm⁴ in m⁴ ≈ 1e-12, and areas in m² ≈ 1e-6. | **High**: false PASS on checks | `0.5 mm⁴ ≤ 0.4 mm⁴` gave **PASS** | Relative tolerance of 8 ulp (`COMPARISON_RELATIVE_TOLERANCE` ≈ 1.8e-15). No absolute floor. Documented in the code and the README. |
| 2 | `canvas/sanitize.ts` | Unsupported elements were unwrapped in 4 fixed passes. Allowed elements nested deeper than that kept their attributes. | **High**: script injection through imported or pasted HTML | 8 nested `<article>` around `<b onclick=…>` gave `onclick` in the output | A new DOM tree is built iteratively from an allow-list. Only allowed tags plus a validated `<font color>` are created. Script-like elements are dropped with their content. Depth and size are bounded. |
| 3 | `canvas/canvasActions.ts` `handlePasteData` | Shapes on the clipboard under the `calccanvas-shapes:` prefix were added without any validation. Any web page can put that text on the clipboard. | **High**: script injection on paste | Paste JSON with `html: '<img onerror>'` or `src: 'javascript:'` | Clipboard shapes now go through `sanitizeShape`, the same check used for imported files. |
| 4 | `canvas/shapes/TextView.tsx` | HTML pasted into a text region being edited went into the live DOM before it was sanitised. | Medium | Paste `<b onclick>` or `<img onerror>` | `onPaste` inserts only sanitised HTML. |
| 5 | `canvas/engineBridge.ts` | The reading order was packed into one number, `round(y)·100000 + round(x) + 50000`. Coordinates collided, large x values spilled into the next row, and coordinates were rounded. | Medium | y=2,x=0 had the same key as y=1,x=100000 | Key is now `[page, y, x, id]`, compared lexicographically by `compareOrderKeys`. No rounding, and ties are broken by id. The engine still knows nothing about geometry. |
| 6 | `engine/CalculationEngine.ts`, `DependencyGraph.ts` | The graph was keyed by name. Changing one definition of `x` re-evaluated every definer and user of `x`. Any move or any change to the set of defined names re-resolved every region. | Medium (performance and correctness margin) | `x:=10; A:=2x; x:=20; B:=3x`. Editing the first `x` evaluated x1, x2, A and B. | Edges now point to the exact defining region. Each region records the names that could change its resolution (`watchers`), and only those regions are re-resolved. Changes that only affect formatting do not propagate. |
| 7 | `engine/ExpressionEvaluator.ts`, `UnitSystem.ts` | °C values were treated as plain linear quantities and shown in K. | Medium: physically wrong results | `20 °C` showed as 293.15 K. `20 °C + 20 °C` gave 313.15 K. `2·20 °C` gave 313.15 K. `20 °C − 10 °C` gave 283.15 K. | Affine rules: °C ± K → °C, and °C − °C → K. Adding, scaling or dividing °C, or passing it to a function, is rejected with an explanation. Absolute temperatures display in °C. |
| 8 | `engine/ExpressionEvaluator.ts` | Only the final result was checked for finiteness, and complex or NaN results gave a generic message. | Low | `(-2)^0.5`, `asin(2)` and `10^400` all gave "The result is not a finite number." | Every intermediate value is checked. New `domain` error code. Specific messages for asin/acos, negative base with a non-integer power, 0 to a negative power, and overflow. |
| 9 | `engine/CalculationEngine.ts` | A precision above 100 made `toFixed` throw. This was reported as a `display-unit` error with a raw JavaScript message. | Low | `precision: 500` | Decimal places are clamped to 0–12. The serializer clamps precision to −1…8. |
| 10 | `documents/DocumentSerializer.ts` | Shapes with duplicate ids were silently dropped, which lost content. Coordinates, sizes and stroke widths were not bounded. | Low | Two shapes with id `a` loaded as one shape | Duplicates are kept under a new id (`dedupeIds`). Numbers are clamped to sane ranges, and shape count and id length are bounded. |
| 11 | `export/pageGeometry.ts` `shapesOnPage` | A shape that crossed a page boundary intersected two pages and was printed twice. | Low | A rect starting near the bottom of page 1 | Each shape prints on exactly one page: the page that contains its top edge. Any overflow is clipped and flagged before printing. |
| 12 | Error messages | Messages were terse. | Low (usability) | `Undefined variable: L`, `Length cannot be added to Force.` | Messages now read: `Variable "L" has not been defined above this equation.` and `Unit mismatch: Force (kN) cannot be added to Length (m).` Other messages were improved in the same way: defined below, self-reference, dependency errors, dimensioned exponents and trig arguments. |

These items were checked and found already correct:
- Full precision is kept internally.
- `η = 1.0000001 ≤ 1` fails.
- Division by zero is handled.
- √ and log of negative values are handled.
- `sin(30°)` gives 0.5.
- A length passed to `sin` is rejected.
- Draft parsing while typing works.
- Results are never persisted.
- v1 to v2 migration works.
- Fonts are awaited before printing.

## B. Code changes

- **`engine/CalculationEngine.ts`**
  - Added `OrderKey`, `compareOrderKeys` and `orderKeysEqual`. `RegionInput.order` accepts either a number (backward compatible) or a key.
  - Recalculation runs in three steps:
    1. Names whose definitions changed are re-resolved for their watchers.
    2. A region is re-resolved, and its fingerprint is updated. If the fingerprint changed, the region is recalculated.
    3. Value seeds are propagated along edges to the defining regions. Format-only seeds are not propagated.
  - Unexpected exceptions become a per-region `evaluation` error instead of aborting the pass.
- **`engine/DependencyGraph.ts`**: rewritten. Edges are keyed by definition and stored as `deps`/`dependents`; `watchers` index names to the regions that could resolve them.
- **`engine/ExpressionEvaluator.ts`**: domain and overflow checks, the temperature rules, the comparison tolerance, `UndefinedNamesError`, `describeQuantity` and `candidateNames`.
- **`engine/UnitSystem.ts`**: `isAbsoluteTemperature`; absolute temperatures display in °C; showing a difference in °C is rejected.
- **`engine/CalculationErrors.ts`**: new error codes `domain` and `temperature`.
- **`canvas/engineBridge.ts`**: `readingKey` returns `[page, y, x, id]`. Regions are re-keyed when the layout mode or orientation changes. Key equality is used for change detection.
- **`canvas/sanitize.ts`**: allow-list tree rebuild.
- **`canvas/canvasActions.ts`**: clipboard validation.
- **`canvas/shapes/TextView.tsx`**: sanitised paste.
- **`documents/DocumentSerializer.ts`**: `dedupeIds` and numeric bounds. The schema is unchanged.
- **`export/pageGeometry.ts`**: added `pageIndexOf`; each shape now prints on one page.

## C. Tests (all executed in this environment)

| Suite | Command | Result |
|-------|---------|--------|
| Typecheck | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` (oxlint) | 0 errors, 3 warnings. All three existed before this change (react fast-refresh export style). |
| Unit / engine | `npm test` | **116 passed**, 0 failed, 8 files. Before this change: 43. |
| Build | `npm run build` | OK |
| Browser | `npm run test:e2e` (Playwright, system Chrome) | **38 passed**, 0 failed |

New regression test files:
- `engine/regression.test.ts`: 44 tests covering reading order A–F, dependencies, numerics 5.1–5.8, error handling and the engineering reference values.
- `engine/performance.test.ts`
- `unit/sanitize.test.ts`
- `unit/clipboard.test.ts`
- `unit/engineBridge.test.ts`
- `unit/pageGeometry.test.ts`
- `integration/security.spec.ts`
- Additions to `unit/serializer.test.ts`

Existing expectations that changed:
- Only the wording of the four error messages in item 12. No assertion was weakened.

Engineering reference values (all pass):
- M = 225.78125 kN·m
- V = 106.25 kN
- 8500 mm = 8.5 m
- δ = 5wL⁴/(384EI) = 0.0188804 m, a Length, checked against an independent SI computation
- η = 0.9, and the check η ≤ 1 passes

## D. Performance (`performance.test.ts`, Node, median of 3 runs at 1 000 regions)

| Scenario | Before: regions evaluated / time | After: regions evaluated / time |
|----------|------------------------------|------------------------------|
| Load worksheet (100 / 500 / 1000) | 14 / 36 / ~95 ms | 14 / 37 / ~90 ms |
| Edit one input | 5 / 0.5 ms | 5 / 0.3 ms |
| Edit a redefined `x` (100 / 500 / 1000 regions) | **22 / 110 / 220** evaluated, up to 15 ms | **11 / 11 / 11** evaluated, ~0.4 ms |
| Move one region | 3 evaluated, every region re-resolved (1–12 ms) | **1** evaluated, ~0.1 ms |
| 20 keystrokes | 100 evaluated | 100 evaluated |

The evaluation counts are deterministic and asserted in the test. Timings vary from run to run. No result caching was added: a region is only skipped when nothing it resolves to has changed.

## E. Remaining limitations

- **Cycles.** With strict reading order a region can only use definitions before it, so cycles cannot form. A self-reference such as `a := a + 1` with no earlier `a` is reported explicitly. The cycle detector stays as a safety net.
- **Kelvin values.** K values are treated as linear quantities, whether differences or absolute. Only °C is affine. Comparing °C with K uses absolute Kelvin values.
- **Pages that are still clipped.** A shape that crosses a page edge is clipped on its page rather than split across pages. Before printing, a toast warns how many shapes are outside the printable area.
- **Greek-plus-letter names.** `\Delta T` (a Greek letter followed by a letter) is not joined into one variable name. This is an existing parser limitation and was left alone, since new syntax is out of scope.
- **Lint warnings.** The three pre-existing fast-refresh warnings were left as they are. Fixing them means moving exports between files, with no functional benefit.
