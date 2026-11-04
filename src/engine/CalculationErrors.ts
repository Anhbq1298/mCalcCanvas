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
  | 'dependency-error'
  | 'display-unit'
  | 'limit-exceeded'
  | 'invalid-definition'
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
