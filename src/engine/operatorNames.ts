/** Fixed registry: no user strings are handed to an expression interpreter. */
export const operatorFunctionNames = ['factorial', 'contains', 'conj', 'phasor', 'real', 'imag', 'compose', 'convolution', 'prod', 'derivative', 'partial', 'gradient', 'integral', 'limit', 'summation', 'product'] as const;
export type OperatorFunctionName = typeof operatorFunctionNames[number];
export const calculusNames = ['derivative', 'partial', 'gradient', 'integral', 'limit', 'summation', 'product'] as const;
export type CalculusName = typeof calculusNames[number];
