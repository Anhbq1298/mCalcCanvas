// @vitest-environment happy-dom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FunctionsMenu } from '../../components/ribbon/MatrixMenus';
import { describe, expect, it, vi } from 'vitest';
import { applyGridCommand, matrixLatex } from '../../canvas/matrixTableCommands';
import { loadShapes, useCanvasStore } from '../../canvas/model/canvasStore';
import { defaultTableProps, type TableShape } from '../../canvas/model/types';
import { inputTableColumns, inputNameLatex, inputUnitLatex, isVariableHeader } from '../../canvas/inputTable';
import { CalculationEngine } from '../../engine';
import { sanitizeShape } from '../../documents/DocumentSerializer';
import { step } from '../step';

vi.mock('../../math/insertTemplate', () => ({ insertTemplate: vi.fn() }));

describe('matrix and table regions', () => {
  it('matrix and table regions', () => {
    step('builds an editable MathLive matrix template', () => {
      const latex = matrixLatex(2, 3);
      expect(latex).toContain('\\begin{bmatrix}');
      expect(latex).toContain('\\end{bmatrix}');
      expect(latex.match(/\\placeholder\{\}/g)).toHaveLength(6);
    });

    step('all advertised matrix functions are enabled in the rendered menu', () => {
      const root = document.createElement('div');
      root.innerHTML = renderToStaticMarkup(createElement(FunctionsMenu));
      const buttons = [...root.querySelectorAll('button')];
      expect(buttons.length).toBeGreaterThan(50);
      expect(buttons.filter((b) => b.disabled)).toHaveLength(0);
      for (const name of ['Cholesky', 'LU', 'QR', 'svd', 'geninv', 'genvecs', 'lookup', 'deconvolve']) {
        expect(buttons.some((b) => b.textContent === name), name).toBe(true);
      }
    });

    step('sanitizes table cells and dimensions', () => {
      const shape = sanitizeShape({ id: 't', type: 'table', x: 10, y: 20, props: { ...defaultTableProps(2, 2), cells: [[{ value: 'fck' }, { value: '40 MPa' }], [{ value: 'b' }, { value: '500 mm' }]] } });
      expect(shape?.type).toBe('table');
      if (shape?.type === 'table') expect(shape.props.cells[1][1].value).toBe('500 mm');
    });

    step('input table: each named column defines a variable (names, units, blank rows)', () => {
      expect(inputNameLatex('G_k.j')).toBe('G_{k.j}');
      expect(inputNameLatex('x_{1.i}')).toBe('x_{1.i}');
      expect(isVariableHeader('Load pattern')).toBe(false);
      expect(isVariableHeader('G_k.j') && isVariableHeader('x_{1.i}') && isVariableHeader('\\eta')).toBe(true);
      expect(inputUnitLatex('kN/m^2')).toBe('\\mathrm{kN}/\\mathrm{m}^2');
      const t: TableShape = { id: 't', type: 'table', x: 0, y: 0, props: { ...defaultTableProps(5, 3), input: true, cells: [
        [{ value: 'a_j' }, { value: 'G_k.j' }, { value: 'Load pattern' }],
        [{ value: 'm' }, { value: 'kN' }, { value: '' }],
        [{ value: '3' }, { value: '30' }, { value: 'Secondary beam' }],
        [{ value: '' }, { value: '' }, { value: 'label only: skipped' }],
        [{ value: '4,5' }, { value: '1e1' }, { value: 'Plant' }],
      ] } };
      const cols = inputTableColumns(t);
      expect(cols.map(c => c.name)).toEqual(['a_j', 'G_k.j']);
      const e = new CalculationEngine({ unitSystem: 'SI' });
      cols.forEach((c, i) => e.setRegion(`c${i}`, { latex: c.latex, order: [0, i], displayUnit: null, precision: null }));
      e.setRegion('p', { latex: '\\mathrm{sum}\\left(\\mathrm{col}\\left(a_{j},0\\right)\\right)=', order: [1], displayUnit: 'm', precision: null });
      expect(e.getResult('p')?.value?.number).toBeCloseTo(7.5, 9);
      e.setRegion('s', { latex: '\\mathrm{sum}\\left(\\mathrm{col}\\left(G_{k.j},0\\right)\\right)=', order: [2], displayUnit: 'kN', precision: null });
      expect(e.getResult('s')?.value?.number).toBeCloseTo(40, 9);
      expect(inputTableColumns({ ...t, props: { ...t.props, input: false } })).toEqual([]);
      const saved = sanitizeShape({ ...t });
      expect(saved?.type === 'table' && saved.props.input).toBe(true);
    });

    step('adds and removes rows as one table operation', () => {
      loadShapes([{ id: 't', type: 'table', x: 0, y: 0, props: defaultTableProps(2, 2) }]);
      useCanvasStore.setState({ selection: ['t'], activeGridCell: { shapeId: 't', row: 0, column: 0 } });
      applyGridCommand('below');
      const added = useCanvasStore.getState().shapes.t;
      expect(added.type === 'table' && added.props.rows).toBe(3);
      applyGridCommand('delete-row');
      const removed = useCanvasStore.getState().shapes.t;
      expect(removed.type === 'table' && removed.props.rows).toBe(2);
    });
  });
});
