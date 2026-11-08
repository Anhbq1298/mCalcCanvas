export type CalculationErrorCode =
  | 'syntax'
  | 'incomplete'
  | 'undefined-variable'
  | 'defined-later'
  | 'duplicate-definition'
  | 'circular-dependency'
  | 'unit-mismatch'
  | 'unknown-unit'
  | 'division-by-zero'
  | 'not-finite'
  /** Result outside the real numbers (√ of a negative, log of 0, asin(2), …). */
  | 'domain'
  /** Unsupported operation on an absolute temperature (°C). */
  | 'temperature'
  | 'dependency-error'
  | 'display-unit'
  | 'limit-exceeded'
  | 'invalid-definition'
  /** A vector where a single value is required, or vectors of different lengths. */
  | 'vector'
  | 'evaluation';

/** An expected, user-facing calculation failure (never a crash). */
export class CalculationError extends Error {
  readonly code: CalculationErrorCode;

  constructor(code: CalculationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'CalculationError';
  }
}

export function isCalculationError(e: unknown): e is CalculationError {
  return e instanceof CalculationError;
}
