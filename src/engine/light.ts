/**
 * What the UI thread may import from the engine without loading mathjs or the
 * evaluator (those run in the calculation worker). Types can come from '../engine'.
 */
export { UNITS, UNIT_SYMBOLS, isUnitSymbol, parseDisplayUnit, type UnitDef, type UnitSystemName } from './units';
export { compareOrderKeys, orderKeysEqual, type OrderKey } from './orderKey';
export { BUILTIN_CONSTANT_INFO } from './constantsInfo';
// The parser is JSON-tree-only and has no evaluator/mathjs dependency. UI code
// uses it for non-destructive interaction checks such as Math → Text.
export { parseLatex } from './LatexParser';
