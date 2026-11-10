# Matrix calculations

The nine operators in **Matrices/Tables → Operators** now calculate in the worker. The matching entries in the general Operators palette are enabled too. Insert a literal with the existing matrix dimension picker; complete every cell before calculating.

| Operator | Input | Meaning |
|---|---|---|
| Multiply | `A·B` | Matrix product; inner dimensions must match. A scalar scales every entry. |
| Power | `A^n` | Integer power of a square matrix, including zero and negative powers. |
| Index | `at(A,r,c)` | Entry at zero-based row `r`, column `c`. `at(v,i)` indexes a vector. |
| Inverse | `A^(-1)` or `inv(A)` | Inverse of a nonsingular square matrix. |
| Transpose | `A^T` or `transpose(A)` | Rows become columns; also accepts vector input. |
| Determinant | `det(A)` or `\|A\|` | Determinant of a square matrix. Single bars mean determinant for matrices, absolute value for scalars. |
| Norm | `norm(A)` or double bars | Euclidean norm for vectors; Frobenius norm for matrices. |
| Vectorize | `vec(expression)` or an arrow over the expression | Arithmetic inside the expression operates entry by entry, including multiplication and powers. |
| Cross product | `cross(v,w)` or `v×w` | Cross product of two three-entry vectors. Scalar `a×b` remains scalar multiplication. |

Literal subscripts such as `M_Ed` keep their existing variable-name meaning. The index button deliberately inserts `at` so index access cannot be confused with a literal subscript. Literal matrix rows retain their shape in the formatted result, including after saving and reopening a worksheet. Results remain derived values, never document data.

## Functions

All names below can be typed as ordinary function names or upright `\operatorname{…}`/`\mathrm{…}` calls. The function menu inserts the required number of argument placeholders.

| Group | Functions |
|---|---|
| Construction | `matrix(rows,cols[,fillOrData])`, `zeros(rows,cols)`, `ones(rows,cols)`, `identity(n)` |
| Access | `rows(A)`, `cols(A)`, `at(A,r,c)`, `at(v,i)`, `row(A,r)`, `col(A,c)` |
| Rearrangement | `transpose(A)`, `diag(v)`, `diag(A)`, `submatrix(A,r0,r1,c0,c1)`, `augment(A,B,…)`, `stack(A,B,…)` |
| Linear algebra | `det(A)`, `inv(A)`, `trace(A)`, `rank(A)`, `rref(A)`, `lsolve(A,b)` |
| Vector arithmetic | `dot(v,w)`, `cross(v,w)`, `norm(v)` |
| Entry-wise arithmetic | `hadamard(A,B)`, `divideElements(A,B)`, `powerElements(A,B)`; the second argument may also be scalar |

- `matrix` accepts a scalar fill (default zero) or a vector containing exactly `rows*cols` entries in row-major order.
- `row` and `col` return existing worksheet vectors. A vector passed to a matrix operation is treated as a column. Use transpose when row orientation matters.
- `diag(v)` builds a square diagonal matrix; `diag(A)` extracts the diagonal of a matrix with multiple rows and columns.
- `submatrix` bounds are inclusive and zero-based.
- `augment` joins horizontally; `stack` joins vertically when at least one argument is a matrix. The existing scalar/vector-only `stack` behavior stays unchanged.
- `lsolve` requires a square coefficient matrix; right-hand sides may be vectors or matrices. It returns a vector for a vector right-hand side and a matrix for a matrix right-hand side.
- Addition, subtraction, negation, scalar scaling, scalar division and scalar functions preserve matrix shape. Entry-wise operations require equal shapes. `map(f,A)` applies a scalar user function to every matrix entry and preserves shape.
- Existing vector-only arithmetic keeps its entry-wise semantics. Use `dot` for a vector dot product.
- Matrix division is rejected: choose `lsolve`, multiplication by an inverse, or `divideElements` explicitly.
- Conditions must select a scalar entry or vector row/column first; a whole matrix condition is rejected rather than flattened.

## Units, numerical methods and limits

Each cell carries an ordinary engine quantity. Matrix products use the existing dimensional addition and multiplication rules. Determinants, inverses, solves and norms require entries of one common dimension in each array. Enter a dimensioned matrix conveniently as a numeric literal multiplied by its common unit, for example `K := [4,1;2,3] kN/m`.

`lsolve(K,[6;8] kN)` gives `[1;2] m`. Independently, `det([4,1;2,3]) = 10`, its inverse is `[0.3,-0.1;-0.2,0.4]`, and its square is `[18,7;14,11]`. These references are pinned in the engine tests, including display-unit conversion.

Determinants, inverses and linear solves call the fixed mathjs numeric APIs directly, never a text evaluator. Row reduction uses partial pivoting. Rank uses the threshold `Number.EPSILON * max(rows,cols) * max(abs(A))` on pivot magnitudes; it is a numerical rank and can change for nearly dependent rows. This tolerance does not affect engineering comparisons or acceptance checks.

- At most 10,000 entries per array; existing LaTeX length, node and nesting limits also apply to literals.
- Factorization and row reduction: at most 100 × 100.
- Matrix multiplication: at most 1,000,000 scalar products per multiplication.
- Matrix powers: integer exponents from −1000 to 1000, computed by repeated squaring.
- Long displayed results are shortened independently along each dimension. Expansion is capped at 32 rows/columns for rendering; every entry remains available for calculation.
- Incompatible dimensions, out-of-range or fractional indices, singular matrices, division by zero and non-real/overflow results produce controlled calculation errors.

## Complete function gallery

Every entry in the Matrices/Tables function menu is now implemented and enabled, including the previously disabled entries:

| Group | Functions |
|---|---|
| Factorization | `LU(A)`, `QR(A[,p])`, `Cholesky(A[,p[,u]])`, `svd(A)`, `svds(A)` |
| Pseudo-inverse and spectrum | `geninv(A)`, `eigenvals(A)`, `eigenvec(A,z)`, `eigenvecs(A[,side])`, `genvals(A,B)`, `genvecs(A,B[,side])`, `tr(A)` |
| Norms and conditioning | `norm1`, `norm2`, `norme`, `normi`, `cond1`, `cond2`, `conde`, `condi` |
| Array helpers | `IsArray(x)`, `IsScalar(x)`, `length(v)`, `last(v)`, `Rank(v)`, `logpts(minexp,dec,dnpts)`, `logspace(min,max,npts)`, `kronecker(A,B)` |
| Lookup | `lookup(z,A,B[,modifierOrPredicate])`, `hlookup(z,A,row[,modifierOrPredicate])`, `vlookup(z,A,col[,modifierOrPredicate])`, `vhlookup(z1,z2,A[,modifierOrPredicate])`, `match(z,A[,modifierOrPredicate])` |
| Signal/array operations | `convolve(S,K[,BC[,OV]])`, `crosscorr(S,K[,BC[,OV]])`, `deconvolve(z,k)` |

### Factor results

Factorizations return nested arrays. Extract each factor with **zero-based** `at(result,index)`; the extracted array can be used in further calculations. Arithmetic on the unextracted factor bundle gives an explicit error.

| Call | Result | Reconstruction |
|---|---|---|
| `D := LU(A)` | `[P,L,U]` | `P·A = L·U` |
| `D := QR(A)` | `[P,Q,R]`, column pivoting | `A·P = Q·R` |
| `D := QR(A,0)` | `[Q,R]` | `A = Q·R` |
| `D := Cholesky(A)` | `[P,L]`, diagonal pivoting | `Pᵀ·A·P = L·Lᵀ` |
| `D := Cholesky(A,0)` | `L` | `A = L·Lᵀ` |
| `D := Cholesky(A,0,1)` | `U` | `A = Uᵀ·U` |
| `D := svd(A)` | `[s,U,Vᵀ]`, thin factors | `A = U·diag(s)·Vᵀ` |

`LU` and `QR` accept rectangular matrices. `Cholesky` checks symmetry and positive definiteness. SVD also accepts wide matrices as an extension. Singular values are descending and nonnegative. SVD uses a scaled, one-sided Jacobi iteration with a 100-sweep limit; a failure to converge gives an error. The pseudo-inverse uses an SVD cutoff of `EPSILON * max(rows,cols) * largestSingularValue`. It supports rank-deficient and wide matrices, and returns the minimum-norm least-squares inverse.

Eigenvalues are sorted descending; columns of the eigenvector result follow the same order. `eigenvecs` and `genvecs` accept a final upright `L`/`R` (`\mathrm{L}` or `\mathrm{R}`), or numeric 1/0, to select left/right vectors. Symmetric definite generalized problems use a Cholesky transformation. Other generalized problems require a nonsingular second matrix. The entire engine remains **real-valued**: genuinely complex eigenvalues/vectors give an explicit domain error. A defective matrix can return eigenvalues but cannot return a complete eigenvector basis.

`norm1` is maximum absolute column sum, `normi` maximum absolute row sum, `norm2` largest singular value and `norme` Frobenius norm. Each condition function uses the corresponding norm of `A` times that of `A⁻¹`; `cond2` uses the singular-value ratio. A numerically singular matrix produces an explicit infinite-condition error, rather than a finite placeholder.

### Array, lookup and signal details

- `matrix(rows,cols,f)` additionally accepts a worksheet function `f(row,col)`; indices passed to the function start at zero.
- `Rank` returns one-based sorted ranks, averaging tied ranks. It differs from lowercase `rank` (matrix rank). `last` uses zero-based indexing.
- `logspace` uses **positive endpoint values**, not exponents, and requires at least two points. Compatible endpoint units are retained. `logpts` uses equally spaced points within each decade, excluding that decade's upper endpoint.
- Lookups return all matches, scanning columns before rows for a whole matrix. `match` returns nested `[row,col]` vectors for a matrix and indices for a vector. No match gives an explicit error.
- Optional lookup modifiers are entered upright, for example `\mathrm{gt}`: `eq`, `near`, `gt`, `lt`, `geq`, `leq`, `not`, `range`. Their numeric codes are 0–7 in that order. Equality uses a relative tolerance of 1e-12, independent of engineering acceptance checks. `near` selects the nearest matching-unit values. `range` requires a two-entry bound vector. A worksheet comparison function `f(key,value)` can be supplied instead, returning zero/ nonzero.
- Convolution and correlation return the **same shape as the signal**, with centered kernel overlap by default. `BC=0/1/2/3` selects zero padding / periodic wrap / edge reflection / edge continuation. `OV` is a valid one-based initial overlap (scalar in 1D or a two-entry row/column overlap vector in 2D). Correlation uses the kernel directly; convolution reverses it.
- `deconvolve` inverts the same-size centered zero-padded 1D convolution operator. It returns a unique reconstructed signal; a singular operator gives an explicit error. This finite-boundary implementation is not an FFT-based periodic deconvolution. It is limited to 100 entries. Other convolution modes remain limited to 1,000,000 scalar products.
- Factor units are retained: SVD singular values and LU/QR upper factors have the input unit; orthogonal factors are dimensionless; Cholesky factors have its square-root unit; pseudo-inverses have the reciprocal unit; generalized eigenvalues have the unit ratio of the two inputs.

### References

Function names, default factor order, pivot flags and selector meanings were checked against the official PTC references:

- [LU](https://support.ptc.com/help/engineering_notebook/r12.0/en/PTC_Mathcad_Help/lu_decomposition.html), [QR](https://support.ptc.com/help/engineering_notebook/r12.0/en/PTC_Mathcad_Help/qr_decomposition.html), [Cholesky](https://support.ptc.com/help/engineering_notebook/r11.0/en/PTC_Mathcad_Help/cholesky_decomposition.html), [SVD](https://support.ptc.com/help/engineering_notebook/r12.0/en/PTC_Mathcad_Help/singular_value_decomposition.html).
- [Eigenvalues](https://support.ptc.com/help/mathcad/r11.0/en/PTC_Mathcad_Help/eigenvectors_and_eigenvalues.html), [lookup](https://support.ptc.com/help/engineering_notebook/r11.0/en/PTC_Mathcad_Help/lookup_functions.html), [ranking](https://support.ptc.com/help/mathcad/r11.0/en/PTC_Mathcad_Help/ranking_vectors.html), [spacing](https://support.ptc.com/help/engineering_notebook/r12.0/en/PTC_Mathcad_Help/logarithmically_spaced_points.html), [convolution](https://support.ptc.com/help/engineering_notebook/r11.0/en/PTC_Mathcad_Help/convolution_and_cross_correlation.html).

This is a real-quantity implementation with the explicit boundary, index and tolerance choices above, not a claim of complete Mathcad complex/string-engine compatibility.
