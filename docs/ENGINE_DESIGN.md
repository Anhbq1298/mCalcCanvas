# Calculation engine design (`src/engine`)

## Pipeline

`LaTeX (MathLive) → LatexParser → Statement { definition | evaluation | expression | check | empty } with JSON Expr tree → resolve names → evaluate (mathjs numbers/Units) → FormattedQuantity`

- **Expr**: `num | ident | binary(+ − * / ^) | unary | call(sin…max, sum, len, seq) | group | if | range | let`. It is JSON-serialisable and contains no mathjs objects.
- **`if(condition, value if true, value if false)`**: written as letters, `\mathrm{if}` or `\operatorname{if}`. The condition is one comparison (`< ≤ > ≥ = ≠`) and uses the same rules as a check region: strict for `< ≤ > ≥`, the equality policy for `= ≠`, and both sides must have the same dimension. Only the chosen branch is evaluated, so the other may be undefined for the current inputs (e.g. √ of a negative). Branches may nest and may have different units. Dependencies include the names in both branches.
- **Quantity** = `number | mathjs Unit`. Dimensionless results are normalised to plain numbers; angles stay as units.
- The parser bounds input length, node count and nesting depth. Unsupported syntax raises a `CalculationError` with an engineer-readable message.

## Name resolution

`resolveIdent`, applied in order:
1. An upright `\mathrm{X}` is a unit if X is registered, otherwise a variable.
2. A name defined *before* the region is a variable.
3. A built-in constant (π, e, g, ∞, %).
4. A registered unit symbol.
5. A run of italic letters (`wL`) is split into one-letter factors, each resolved by rules 2–4. `wL^2` applies the power to the last factor.

## Reading order and dependencies

- Each region has an `order` key (`OrderKey`, compared lexicographically by `compareOrderKeys`). The canvas passes `[page, y, x, id]`. A plain number is also accepted.
- A region may use only definitions that come before it, and it uses the nearest such definition (`definerBefore`). A redefinition is flagged (`redefines`, shown with a green outline).
- `DependencyGraph` stores **edges to the exact defining region**, plus **watched names**: every identifier and, for letter runs, every letter.
  - When a definition of a watched name is added, removed, renamed or moved, only the watchers are re-resolved.
  - A region whose resolution fingerprint changes is recalculated, together with its transitive dependents.
- Format-only changes (display unit, precision, unit system) re-format the region without recalculating its dependents.
- In reading order, cycles cannot form. Self-reference without an earlier value is reported, and a cycle detector remains as a safety net.
- While a region is being edited (`draft`), a parse error keeps the last valid statement, so its dependents don't flicker.

## Numerics

- Values are kept at full double precision in SI base units. Rounding happens only in `formatQuantity`.
- **Comparisons** (`ComparisonPolicy`):
  - Acceptance checks (≤ < ≥ >) are **strict**, with no tolerance.
  - `=` / `≠` use an explicit approximate policy (relative 1e-12).
  - Callers must pass an approximate check policy explicitly if they ever need one.
- Every intermediate value is checked:
  - Division by zero.
  - Domain errors: √ of a negative, log ≤ 0, asin/acos outside [−1, 1], a negative base with a non-integer exponent.
  - Overflow and NaN produce controlled errors.
- **Temperature**:
  - °C values are absolute and affine.
  - °C ± K gives °C, and °C − °C gives K.
  - Adding two °C values, scaling °C, or passing °C to a function is rejected.
  - K is treated as a linear quantity.
- **Trigonometry** takes angle units (°, rad) or a dimensionless number in radians. A dimensioned argument is rejected.

## Units

- `UnitSystem.ts` has an explicit registry (mm…km, N…MN, kip, lbf, Pa…GPa, psi, ksi, kg, tonne, s, Hz, K, °C, deg, rad). Only these are recognised.
- Results display in engineering units per dimension (kN·m, MPa, mm² for small areas, …) for SI or USCS. A display unit override is validated against the registry.

## Errors

`CalculationErrorCode`s:
- Parsing: `syntax`, `incomplete`, `invalid-definition`, `limit-exceeded`.
- Names and dependencies: `undefined-variable`, `defined-later`, `dependency-error`, `circular-dependency`.
- Units and display: `unit-mismatch`, `display-unit`.
- Numerics: `division-by-zero`, `domain`, `not-finite`, `temperature`.
- Anything else: `evaluation`.

Messages name the variable or quantity involved, e.g. `Unit mismatch: Force (kN) cannot be added to Length (m).`

## Vectors and ranges

- **Value** = `Quantity | QVector` (`src/engine/Vector.ts`). A vector is an ordered list of quantities; entries carry their own units (they may differ, e.g. mixed DOFs).
- **Ranges** (right side of a definition only): `i := 0..n−1` (step ±1, dimensionless) and `t := a, a+Δ..b` (any unit, step from the second value). The end is included when reached (tolerance 1e-9 steps). `..`, `...` and `\ldots` are accepted; the `;` key types `..`. At most `MAX_VECTOR_LENGTH` (10 000) entries.
- **Broadcasting**: `+ − × / ^`, unary minus and every built-in function apply entry by entry: scalar∘vector, or vector∘vector of the same length (otherwise error code `vector`). Unit and temperature rules are the scalar rules, per entry.
- **`seq(a, b)` / `seq(a, b, Δ)`**: the same vector as a range, usable anywhere in an expression (e.g. `2·seq(1, 3) + 1`).
- **`let(n₁, v₁, n₂, v₂, …, body)`** (Excel LET): local names, each visible to later values and the body. They shadow worksheet variables, are never references (no dependency edge, no worksheet variable) and are printed by name in substituted lines. Use it for helpers that should not clutter the worksheet.
- **Aggregates**: `min`, `max` and `sum` take every entry of every argument; `len(v)` is the number of entries (1 for a scalar). `sum` keeps units.
- **Checks need single values** (code `vector`). **if with a vector condition** is decided entry by entry: both branches are evaluated (scalars repeat, vectors must share the length) and each entry takes the branch its condition selects — e.g. the EC2 parabola-rectangle law over all fibres as one if block. With a scalar condition only the chosen branch is evaluated.
- **Display**: `[0, 1, 2, …, 20, 21] (22)` — first 3 and last 2 entries. With a common dimension all entries use one unit (the display unit or the first entry's preferred unit) and `FormattedQuantity.items` holds every number in that unit (graphs use it). In a substituted line a vector is shown by name.

## Array display

- Arrays longer than the worksheet setting **Array display** (`settings.vectorLimit`, default 10) are shown pandas-style: the first half, `…` (row) or `⋮` (column), the last half, and the length. 0 = show all.
- The ellipsis is rendered as `\class{vec-more}{…}`; double-clicking it sets `vectorExpanded` on the region (every entry, up to 1000). **Math formatting → Array** (and Properties → Vector display) sets row/column and shortened/every entry for the selected equations.
- `vectorExpanded` and the limit are display-only: no recalculation.

## User functions, map, linterp, stack

- **`f(a, b) := body`** defines a function. Parameters are locals (no dependency edge); every other name in the body resolves at the definition's position, so the definition depends on them and callers depend on `f`. Functions are stored apart from values (`functions` map in the engine); using `f` without arguments is an error. Call depth is limited (200).
- **`name(args)`** parses as an `apply` node when the parenthesis follows a name directly. It is a call when `name` is a user function at that position; otherwise it keeps the old reading `name·(arg)` (so `x(a+b)` is unchanged). `name(args)^n` (exponent right after the bracket) is `(name(args))^n` for a function and `name·(args)^n` otherwise.
- **Names.** `\Delta`/`\delta` followed directly by letters is one name (`\Delta T` → ΔT, as in Mathcad); `\Delta` alone is still Δ. Built-in functions written upright are calls when a bracket follows (`\mathrm{atan}(x)`, `\operatorname{asin}(x)`).
- **`map(f, v…)`** calls `f` once per entry (scalars repeat, vectors share a length); each call must return a scalar. Use it when the body aggregates (`sum`) over another vector, e.g. a P–M curve `N_v := map(N_R, c_v)`.
- **`linterp(xs, ys, x)`**: xs monotonic (steps back within 1e-9 of the span are accepted as round-off); outside the data it extrapolates the line through the first or last two points (as Mathcad Prime). x data that turns back (round-off wiggles in a sweep) uses the first segment containing x, without extrapolation. Broadcasts over a vector x.
- **`floor(x)`, `ceil(x)`**: plain numbers only; values within 1e-9 of an integer are taken as that integer.
- **`angle(x, y)`** (Mathcad): direction of the vector (x, y), 0 … 2π; x and y must share a unit.
- **`stack(a, b, …)`** joins scalars and vectors into one vector.
- **Cached calls.** A call whose arguments are all scalars is cached on the function object (key: exact value and unit of each argument; at most 20 000 entries). Functions are pure, and the object is replaced whenever its definition or anything it uses is recalculated, so a cached result never outlives its inputs. This makes per-angle geometry (`p_c(β)`, `A_c(β)`) cost one evaluation per angle in sweeps such as the rectangular column's neutral-axis rotation.

## Graph regions

A graph shape (`type: 'graph'`) is not a statement. `engineBridge` registers each series field (`x`, `y`, `r`, `show`) as a hidden region with id `shape::series::field`, order key `[...graphKey, seriesIndex, field]`, the axis display unit and precision 8. So a series sees exactly the definitions above the graph, uses the normal dependency graph and errors, and redraws when an input changes. A field containing a definition is never registered (it would leak a variable into the worksheet).

Series styles: `line`, `marker`, `circle` (r = radius in x units) and `segments`. For `segments` the `r` field is a plain-number group id per point (no display unit): consecutive points with the same id are joined, a change of id starts a new piece, so one series can draw several separate polylines (the rectangular column template draws all closed ties and all cross-tie legs this way). An empty `r` draws one piece.

## If blocks

Mathcad Prime layout, one column with a double bar, each value with its own bar: `\begin{array}{||l} \mathrm{if}\ c_1 \\ \quad\left\Vert a\right. \\ \mathrm{else}\ \mathrm{if}\ c_2 \\ \quad\left\Vert b\right. \\ \mathrm{else} \\ \quad\left\Vert c\right. \end{array}` (the bars are display only). A condition is a comparison, or comparisons joined by `\land` (∧) and `\lor` (∨); ∧ binds tighter, single values short-circuit, vectors combine entry by entry parses to nested `if` nodes (each keyword line is followed by its value line; "else" last). The two-column form (`a & \mathrm{if}\ c_1 \\ … \\ c & \mathrm{otherwise}`, also `\begin{cases}`) is accepted too. Inside these environments the tokenizer keeps `&` and `\\`; other environments are rejected. The formatter prints every `if` (also `if(c, a, b)`) in the Prime layout.

## Annex blocks

An annex block (an annex heading and everything below it up to the next annex heading, all below the ANNEX title) is calculated where its link stands in the main body: `engineBridge.calcKey` gives each region of a linked block the key `[...readingKey(link), ...readingKey(region)]`. The engine still sees one top-to-bottom order, so an annex can use only names defined above its link, and regions below the link use the annex results. When any link or block membership changes (`annexSignature`), every region is re-keyed. `canvas/annex.ts` computes blocks, numbers (link order, then unlinked blocks) and problems (missing target, duplicate link, link inside the annex, heading above the ANNEX title); unlinked blocks are calculated where they stand.

## Responsiveness (worker)
- In the browser the engine runs in a Web Worker (`src/engine/worker/engine.worker.ts`). The UI talks to it through `src/store/engineClient.ts`: region changes are batched into one message, results come back as plain data and are mirrored into `calculationStore`. A heavy worksheet (the rectangular column, ~3 s) no longer freezes typing or scrolling.
- `engine.idle()` resolves after everything sent so far has been calculated; `engine.inputInUnit()` is asynchronous.
- The UI thread must not import the evaluator or mathjs: use `src/engine/light.ts` (units registry, order keys, constant names). Types may come from `src/engine`.
- Without module workers the engine loads in-process on demand (`engineFallback.ts`); unit tests use the synchronous `engineFallback.sync.ts` (alias in `vite.config.ts`). The single-file build inlines the worker (`engineWorkerInline.ts`).

## Extending the value model (planned)

Matrices, user functions and solvers need a richer value type. Vectors (above) are the first step; matrices extend `Value` with a 2-D type. Matrices in structural engineering can mix units per entry (translational and rotational DOFs), so a matrix must not assume one common unit.

## Matrices

`QMatrix` extends scalar-entry vector storage with row/column dimensions. Its packed-vector fast path is disabled so no operation can accidentally discard the shape. Matrix arithmetic uses fixed scalar unit operations; numeric factorizations stay inside the worker. The parser/function registry stays lightweight for UI imports through `engine/light.ts`. See [MATRICES.md](MATRICES.md) for operators, units, numerical methods and limits.
