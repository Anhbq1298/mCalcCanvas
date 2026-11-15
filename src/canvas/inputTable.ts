/**
 * Input tables (Mathcad Prime style): a table shape with `input: true` defines
 * one variable per column. Row 1 holds the variable name, row 2 its unit and
 * every following row one value. A column becomes the hidden engine region
 *   name := [v1 unit; v2 unit; …]   (an n×1 matrix, read with col(name, 0))
 * keyed at the table's reading position, so the sheet below sees it.
 * Blank value rows (every cell empty) are skipped; a column without a name, or
 * whose header is not a variable name (a label column such as "Load pattern"),
 * is not calculated. Pure module: shared by the canvas bridge, templates and tests.
 */
import type { TableShape } from './model/types';

export const INPUT_TABLE_HEADER_ROWS = 2;

export function inputTableRegionId(shapeId: string, column: number): string {
  return `${shapeId}#col${column}`;
}

/** `G_k.j` → `G_{k.j}`; braces, Greek commands and plain names are kept. */
export function inputNameLatex(name: string): string {
  const t = headerParts(name).variable ?? name.trim();
  const m = /^([^_]+)_(.+)$/.exec(t);
  if (!m || m[2].startsWith('{')) return t;
  return `${m[1]}_{${m[2]}}`;
}

/** `kN/m^2` → `\mathrm{kN}/\mathrm{m}^2`; empty for dimensionless. */
export function inputUnitLatex(unit: string): string {
  return unit.trim().replace(/\s+/g, '\\,').replace(/·|\*/g, '\\cdot ').replace(/[A-Za-zµΩ°]+/g, (u) => `\\mathrm{${u}}`);
}

/** Unit row `G/Q`: a load-pattern column, G (permanent) → 0, Q (variable) → 1. */
export function isPatternUnit(unit: string): boolean {
  return /^\s*G\s*\/\s*Q\s*$/i.test(unit);
}

function patternLatex(v: string): string {
  const t = v.trim().toUpperCase();
  return t === 'G' ? '0' : t === 'Q' ? '1' : v.trim() || '\\placeholder{}';
}

/** Value cell: numbers only (comma decimal accepted); anything else is left for the engine to reject. */
function valueLatex(v: string): string {
  const t = v.trim().replace(/^(-?\d+),(\d+)$/, '$1.$2');
  const m = /^(-?\d*\.?\d+)(?:e([+-]?\d+))?$/i.exec(t);
  if (!m) return t || '\\placeholder{}';
  return m[2] ? `${m[1]}\\cdot10^{${m[2]}}` : m[1];
}

const VARIABLE = /^\\?[A-Za-z][A-Za-z0-9]*(_(\{[^{}\s]+\}|[A-Za-z0-9.,]+))?$/;

/**
 * Header parts: `a_j` → variable only; `Load pattern c_Q.i` → caption plus the
 * variable (last word); `Load pattern` → caption only (a label column).
 */
export function headerParts(name: string): { caption: string; variable: string | null } {
  const t = name.trim();
  if (VARIABLE.test(t)) return { caption: '', variable: t };
  const m = /^(.*\S)\s+(\S+)$/.exec(t);
  if (m && VARIABLE.test(m[2]) && /[_\\]/.test(m[2])) return { caption: m[1], variable: m[2] };
  return { caption: t, variable: null };
}

/** A header that names a variable (`a_j`, `G_k.j`, `Load pattern c_Q.i`); otherwise a label column. */
export function isVariableHeader(name: string): boolean {
  return headerParts(name).variable !== null;
}

export interface InputColumn { column: number; name: string; latex: string }

/** The definitions an input table contributes, one per named column. */
export function inputTableColumns(shape: TableShape): InputColumn[] {
  if (!shape.props.input) return [];
  const { cells } = shape.props;
  const vars = cells[0]?.map((c, i) => (isVariableHeader(c.value) ? i : -1)).filter((i) => i >= 0) ?? [];
  // A row counts when any variable cell is filled (a label alone does not make a load).
  const rows = cells.slice(INPUT_TABLE_HEADER_ROWS).filter((row) => vars.some((i) => row[i]?.value.trim()));
  const out: InputColumn[] = [];
  for (let c = 0; c < shape.props.columns; c++) {
    const name = cells[0]?.[c]?.value.trim() ?? '';
    if (!name || !isVariableHeader(name) || !rows.length) continue;
    const unitText = cells[1]?.[c]?.value ?? '';
    const pattern = isPatternUnit(unitText);
    const unit = pattern ? '' : inputUnitLatex(unitText);
    const entries = rows.map((row) => (pattern ? patternLatex(row[c]?.value ?? '') : `${valueLatex(row[c]?.value ?? '')}${unit ? `\\,${unit}` : ''}`));
    out.push({ column: c, name, latex: `${inputNameLatex(name)}\\coloneq\\begin{bmatrix}${entries.join('\\\\')}\\end{bmatrix}` });
  }
  return out;
}
