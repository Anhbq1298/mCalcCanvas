# Calculation engine design (`src/engine`)

## Pipeline

`LaTeX (MathLive) → LatexParser → Statement { definition | evaluation | expression | check | empty } with JSON Expr tree → resolve names → evaluate (mathjs numbers/Units) → FormattedQuantity`

- **Expr**: `num | ident | binary(+ − * / ^) | unary | call(sin…max) | group`. It is JSON-serialisable and contains no mathjs objects.
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

## Extending the value model (planned)

Matrices, user functions and solvers need a richer value type. The plan is to introduce `CalculationValue = ScalarValue | MatrixValue` *alongside* `Quantity` and migrate incrementally with compatibility tests. Matrices in structural engineering can mix units per entry (translational and rotational DOFs), so a matrix must not assume one common unit.
