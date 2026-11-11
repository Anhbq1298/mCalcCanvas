# Extended worksheet operators

The Math operator palette contains functional entries instead of disabled placeholders. Vector/matrix operations and range templates live in Matrices/Tables → Operators. Engine implementation uses a fixed registry and JSON AST, never string evaluation.

## Numerical calculus

`derivative(expr,x,point)`, `partial(expr,x,point)`, `gradient(expr,variables,point)`, `integral(expr,x,a,b)` and `limit(expr,x,point[,direction])` bind their variables locally. References from the body exclude those variables; bounds and evaluation points use the surrounding worksheet scope. Prime notation calls a declared one-argument function. Standard bounded sum/product, integral and limit notation is parsed as the same operators.

Derivatives use a five-point centered stencil with step refinement and a one-sided consistency check. Integrals use adaptive Simpson quadrature, relative scaling, explicit convergence failure, depth 18 and at most 8192 samples. Limits use shrinking neighborhoods (or reciprocal coordinates for a literal ±∞ target), checking agreement between sides and successive samples. These are numerical approximations, not error certificates; highly oscillatory or discontinuous expressions should be split or assessed independently. Coordinates beyond |SI value| = 10^100 are rejected. Absolute-temperature coordinates/integrands are rejected in favor of linear K differences. Improper integrals and complex calculus are outside the implemented scope.

Method references: [NIST DLMF §3.4](https://dlmf.nist.gov/3.4), [§3.5(ii), Simpson’s rule](https://dlmf.nist.gov/3.5.ii). Approximation warnings are published with results; strict full-precision engineering comparisons are unchanged. A shared 100000-evaluation budget bounds nested numerical operators. Sums/products require integer bounds, at most 10000 terms and |index| ≤ 10^9. Empty sums/products return 0/1.

Continuous `convolution(f,g,t,a,b)` integrates f(τ)g(t−τ) over explicit finite bounds, retaining units. Discrete `convolve` retains the existing same-size, centered, zero-padded matrix/vector implementation.

## Scope and symbolic results

`global(name,value)` (also a function name with parameters) adds an explicit global definition. Globals are visible above their position and may depend only on other globals, built-in units/constants and their parameters. Duplicate globals fail. A preceding ordinary local definition overrides the global for later regions. Updates, removal, and conversion between local/global definitions re-resolve name watchers and dependent regions. Existing top-to-bottom behavior for ordinary definitions is unchanged.

The symbolic arrow returns `symbolicLatex`, not a numeric value. The bounded real-algebra simplifier supports exact rational arithmetic, basic identities and elementary symbolic differentiation, plus expansion of declared functions. Substitution uses full-precision stored values, not displayed/rounded numbers. It avoids capturing calculus/let dummy variables. It is not a general CAS, symbolic equation solver or domain proof; unsupported differentiation returns a clear error. Symbolic results cannot silently participate in numeric checks or graphs.

## Logic and complex arithmetic

Membership accepts vectors/matrices; logical operators return numeric 0/1 and scalar AND/OR short-circuit. Existing comparison policies remain unchanged.

Complex scalar values have explicit real/imaginary components and no physical unit. They support arithmetic, conjugation, phasors and elementary complex functions. `real`, `imag` and `abs` extract real results. Ordering rejects complex operands, and real square-root/domain checks retain their prior behavior. Imaginary literals such as `4i` fall back to the imaginary unit only when no variable named i is in scope. A bare i remains an ordinary variable; `\imaginaryI` is the explicit constant. Complex formatting publishes components plus a NaN numeric sentinel (as with empty arrays), preventing accidental use as real graph/check values.

Regression coverage is in `src/tests/engine/operators.test.ts` and `src/tests/integration/operators.spec.ts`; the latter passes each formerly disabled template through MathLive canonicalization and the calculation worker.
