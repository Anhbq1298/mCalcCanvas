// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyGridCommand, matrixLatex } from '../../canvas/matrixTableCommands';
import { loadShapes, useCanvasStore } from '../../canvas/model/canvasStore';
import { defaultTableProps } from '../../canvas/model/types';
import { sanitizeShape } from '../../documents/DocumentSerializer';

describe('matrix and table regions', () => {
  beforeEach(() => loadShapes([]));

  it('builds an editable MathLive matrix template', () => {
    const latex = matrixLatex(2, 3);
    expect(latex).toContain('\\begin{bmatrix}');
    expect(latex).toContain('\\end{bmatrix}');
    expect(latex.match(/\\placeholder\{\}/g)).toHaveLength(6);
  });

  it('sanitizes table cells and dimensions', () => {
    const shape = sanitizeShape({ id: 't', type: 'table', x: 10, y: 20, props: { ...defaultTableProps(2, 2), cells: [[{ value: 'fck' }, { value: '40 MPa' }], [{ value: 'b' }, { value: '500 mm' }]] } });
    expect(shape?.type).toBe('table');
    if (shape?.type === 'table') expect(shape.props.cells[1][1].value).toBe('500 mm');
  });

  it('adds and removes rows as one table operation', () => {
    const table = { id: 't', type: 'table' as const, x: 0, y: 0, props: defaultTableProps(2, 2) };
    loadShapes([table]);
    useCanvasStore.setState({ selection: ['t'], activeGridCell: { shapeId: 't', row: 0, column: 0 } });
    applyGridCommand('below');
    const added = useCanvasStore.getState().shapes.t;
    expect(added.type === 'table' && added.props.rows).toBe(3);
    applyGridCommand('delete-row');
    const removed = useCanvasStore.getState().shapes.t;
    expect(removed.type === 'table' && removed.props.rows).toBe(2);
  });
});
