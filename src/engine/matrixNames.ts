/** Lightweight shared function registry (safe for the UI and parser). */
export const matrixFunctionNames = [
  'Cholesky', 'LU', 'QR', 'svd', 'svds', 'geninv', 'eigenvals', 'eigenvec', 'eigenvecs', 'genvals', 'genvecs',
  'norm1', 'norm2', 'norme', 'normi', 'cond1', 'cond2', 'conde', 'condi', 'tr',
  'IsArray', 'IsScalar', 'last', 'length', 'Rank', 'logpts', 'logspace',
  'convolve', 'crosscorr', 'deconvolve', 'lookup', 'hlookup', 'vlookup', 'vhlookup', 'match', 'kronecker',
  'matrix', 'zeros', 'ones', 'identity', 'diag', 'rows', 'cols', 'at', 'row', 'col',
  'submatrix', 'augment', 'transpose', 'det', 'inv', 'trace', 'rank', 'rref',
  'lsolve', 'dot', 'cross', 'norm', 'hadamard', 'divideElements', 'powerElements',
] as const;
export type MatrixFunctionName = typeof matrixFunctionNames[number];


/** Required arguments used by the menu; optional arguments are described in help. */
export const matrixArgumentCounts: Partial<Record<MatrixFunctionName, number>> = {
  matrix: 3, zeros: 2, ones: 2, at: 3, row: 2, col: 2, submatrix: 5,
  augment: 2, lsolve: 2, dot: 2, cross: 2, hadamard: 2, divideElements: 2, powerElements: 2,
  eigenvec: 2, genvals: 2, genvecs: 2, logpts: 3, logspace: 3, convolve: 2, crosscorr: 2,
  deconvolve: 2, lookup: 3, hlookup: 3, vlookup: 3, vhlookup: 3, match: 2, kronecker: 2,
};
