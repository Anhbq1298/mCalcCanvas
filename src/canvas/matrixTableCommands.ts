import { createMathRegion, createTableRegion, insertionPoint } from './canvasActions';
import { transaction, updateShape, useCanvasStore } from './model/canvasStore';
import type { MathShape, TableCell, TableShape } from './model/types';

export function matrixLatex(rows: number, columns: number): string {
  const row = Array.from({ length: columns }, () => '\\placeholder{}').join('&');
  return `\\begin{bmatrix}${Array.from({ length: rows }, () => row).join('\\\\')}\\end{bmatrix}`;
}

export function insertMatrix(rows: number, columns: number): string {
  const id = createMathRegion(insertionPoint(), matrixLatex(rows, columns));
  useCanvasStore.setState({ activeGridCell: { shapeId: id, row: 0, column: 0 } });
  return id;
}

export function insertTable(rows: number, columns: number): string {
  return createTableRegion(insertionPoint(), rows, columns);
}

function selectedTable(): TableShape | null {
  const state = useCanvasStore.getState();
  const id = state.activeGridCell?.shapeId ?? (state.selection.length === 1 ? state.selection[0] : null);
  const shape = id ? state.shapes[id] : null;
  return shape?.type === 'table' ? shape : null;
}

function selectedMatrix(): MathShape | null {
  const state = useCanvasStore.getState();
  const id = state.activeGridCell?.shapeId ?? (state.selection.length === 1 ? state.selection[0] : null);
  const shape = id ? state.shapes[id] : null;
  return shape?.type === 'math' && /\\begin\{bmatrix\}/.test(shape.props.latex) ? shape : null;
}

function parseMatrix(latex: string): { prefix: string; suffix: string; cells: string[][] } | null {
  const match = latex.match(/^(.*?\\begin\{bmatrix\})([\s\S]*?)(\\end\{bmatrix\}[\s\S]*)$/);
  if (!match) return null;
  const cells = match[2].split('\\\\').map((row) => row.split('&'));
  const columns = Math.max(...cells.map((row) => row.length));
  if (!columns) return null;
  cells.forEach((row) => { while (row.length < columns) row.push('\\placeholder{}'); });
  return { prefix: match[1], suffix: match[3], cells };
}

function applyMatrixCommand(matrix: MathShape, command: GridCommand): boolean {
  const parsed = parseMatrix(matrix.props.latex);
  if (!parsed) return false;
  const active = useCanvasStore.getState().activeGridCell;
  const row = Math.min(parsed.cells.length - 1, active?.row ?? 0);
  const column = Math.min(parsed.cells[0].length - 1, active?.column ?? 0);
  let nextRow = row;
  let nextColumn = column;
  if (command === 'above' || command === 'below') {
    const at = command === 'above' ? row : row + 1;
    parsed.cells.splice(at, 0, Array.from({ length: parsed.cells[0].length }, () => '\\placeholder{}'));
    nextRow = at;
  } else if (command === 'left' || command === 'right') {
    const at = command === 'left' ? column : column + 1;
    parsed.cells.forEach((cells) => cells.splice(at, 0, '\\placeholder{}'));
    nextColumn = at;
  } else if (command === 'delete-row' && parsed.cells.length > 1) {
    parsed.cells.splice(row, 1);
    nextRow = Math.min(row, parsed.cells.length - 1);
  } else if (command === 'delete-column' && parsed.cells[0].length > 1) {
    parsed.cells.forEach((cells) => cells.splice(column, 1));
    nextColumn = Math.min(column, parsed.cells[0].length - 1);
  } else if (command === 'clear') parsed.cells[row][column] = '\\placeholder{}';
  else return false;
  const latex = parsed.prefix + parsed.cells.map((cells) => cells.join('&')).join('\\\\') + parsed.suffix;
  updateShape(matrix.id, { props: { latex } }, { history: false });
  useCanvasStore.setState({ activeGridCell: { shapeId: matrix.id, row: nextRow, column: nextColumn } });
  return true;
}

function blankRow(columns: number): TableCell[] {
  return Array.from({ length: columns }, () => ({ value: '' }));
}

export type GridCommand = 'above' | 'below' | 'left' | 'right' | 'delete-row' | 'delete-column' | 'clear';

export function applyGridCommand(command: GridCommand): void {
  const table = selectedTable();
  const matrix = selectedMatrix();
  if (!table && !matrix) return;
  transaction(() => {
    if (matrix) {
      applyMatrixCommand(matrix, command);
      return;
    }
    if (!table) return;
    const active = useCanvasStore.getState().activeGridCell;
    const row = Math.min(table.props.rows - 1, active?.row ?? 0);
    const column = Math.min(table.props.columns - 1, active?.column ?? 0);
    let cells = table.props.cells.map((r) => r.map((cell) => ({ ...cell })));
    let widths = [...table.props.columnWidths];
    let nextRow = row;
    let nextColumn = column;
    if (command === 'above' || command === 'below') {
      const at = command === 'above' ? row : row + 1;
      cells.splice(at, 0, blankRow(table.props.columns));
      nextRow = at;
    } else if (command === 'left' || command === 'right') {
      const at = command === 'left' ? column : column + 1;
      cells.forEach((r) => r.splice(at, 0, { value: '' }));
      widths.splice(at, 0, 112);
      nextColumn = at;
    } else if (command === 'delete-row' && cells.length > 1) {
      cells.splice(row, 1);
      nextRow = Math.min(row, cells.length - 1);
    } else if (command === 'delete-column' && widths.length > 1) {
      cells.forEach((r) => r.splice(column, 1));
      widths.splice(column, 1);
      nextColumn = Math.min(column, widths.length - 1);
    } else if (command === 'clear') {
      cells[row][column] = { value: '' };
    }
    const rows = cells.length;
    const columns = widths.length;
    updateShape(table.id, { props: { cells, rows, columns, columnWidths: widths, w: widths.reduce((sum, width) => sum + width, 0), h: rows * 32 } }, { history: false });
    useCanvasStore.setState({ activeGridCell: { shapeId: table.id, row: nextRow, column: nextColumn } });
  });
}

export function hasGridSelection(): boolean {
  const state = useCanvasStore.getState();
  const shape = state.selection.length === 1 ? state.shapes[state.selection[0]] : null;
  return shape?.type === 'table' || (shape?.type === 'math' && /\\begin\{bmatrix\}/.test(shape.props.latex));
}
