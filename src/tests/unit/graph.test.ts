// @vitest-environment happy-dom
/**
 * X-Y graphs: series fields evaluated by the engine at the graph's reading
 * position, drawable data, axis helpers and file sanitising.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import '../../canvas/canvasActions';
import { newGraphSeries } from '../../canvas/canvasActions';
import { connectEngine, graphRegionId } from '../../canvas/engineBridge';
import { buildGraphData, dataRange, niceStep, seriesSources } from '../../canvas/graphData';
import { addShapes, deleteShapes, loadShapes, updateShapes, useCanvasStore } from '../../canvas/model/canvasStore';
import { DEFAULT_GRAPH_STYLE, DEFAULT_MATH_PROPS, type GraphProps, type GraphSeries, type GraphShape, type Shape } from '../../canvas/model/types';
import { parseDocument } from '../../documents/DocumentSerializer';
import { DOCUMENT_VERSION } from '../../documents/DocumentTypes';
import { engine, useCalculationStore } from '../../store/calculationStore';
import { useAppStore } from '../../store/appStore';

const math = (id: string, y: number, latex: string): Shape => ({ id, type: 'math', x: 100, y, props: { ...DEFAULT_MATH_PROPS, latex } });
const series = (patch: Partial<GraphSeries>): GraphSeries => ({ ...newGraphSeries([]), ...patch });
const graph = (id: string, y: number, s: GraphSeries[], props: Partial<GraphProps> = {}): GraphShape => ({
  id,
  type: 'graph',
  x: 100,
  y,
  props: { w: 300, h: 240, title: '', xLabel: '', yLabel: '', xUnit: '', yUnit: '', equalAxes: false, ...DEFAULT_GRAPH_STYLE, series: s, ...props },
});
const results = (id: string) => useCalculationStore.getState().results[id];
const dataOf = (id: string) => buildGraphData(useCanvasStore.getState().shapes[id] as GraphShape, results);

let disconnect: (() => void) | null = null;
beforeEach(() => {
  disconnect?.();
  useAppStore.getState().updateSettings({ canvasMode: 'page', pageOrientation: 'portrait' });
  loadShapes([]);
  disconnect = connectEngine();
});

describe('graph series in the engine', () => {
  const ring = [
    math('n', 100, 'n\\coloneq4'),
    math('r', 140, 'r\\coloneq500\\,\\mathrm{mm}'),
    math('i', 180, 'i\\coloneq0..n-1'),
    math('x', 220, 'x\\coloneq r\\cos\\left(\\frac{2\\pi i}{n}\\right)'),
    math('y', 260, 'y\\coloneq r\\sin\\left(\\frac{2\\pi i}{n}\\right)'),
  ];

  it('plots vectors defined above the graph, in the axis unit', () => {
    addShapes([...ring, graph('g', 400, [series({ id: 'a', x: 'x', y: 'y', style: 'marker' })], { xUnit: 'mm', yUnit: 'mm' })]);
    const d = dataOf('g');
    expect(d.errors).toEqual([]);
    expect(d.plots[0].xs.map((v) => Math.round(v) || 0)).toEqual([500, 0, -500, 0]);
    expect(d.xUnit).toBe('mm');
  });

  it('redraws when an input changes', () => {
    addShapes([...ring, graph('g', 400, [series({ id: 'a', x: 'x', y: 'y', style: 'marker' })])]);
    updateShapes({ n: { props: { latex: 'n\\coloneq6' } } });
    expect(dataOf('g').plots[0].xs).toHaveLength(6);
  });

  it('sees only variables above it (reading order)', () => {
    addShapes([graph('g', 50, [series({ id: 'a', x: 'x', y: 'y' })]), ...ring]);
    expect(dataOf('g').errors[0]).toMatch(/below/);
  });

  it('circles use r in x units; show hides a series', () => {
    addShapes([
      ...ring,
      math('k', 300, 'k\\coloneq1'),
      graph('g', 400, [series({ id: 'a', x: 'x', y: 'y', style: 'circle', r: '16\\,\\mathrm{mm}', show: 'k\\ge2' }), series({ id: 'b', x: 'x', y: 'y', style: 'circle', r: '16\\,\\mathrm{mm}' })], { xUnit: 'mm', yUnit: 'mm', equalAxes: true }),
    ]);
    const d = dataOf('g');
    expect(d.plots.map((p) => p.series.id)).toEqual(['b']);
    expect(d.plots[0].rs).toEqual([16, 16, 16, 16]);
    updateShapes({ k: { props: { latex: 'k\\coloneq2' } } });
    expect(dataOf('g').plots).toHaveLength(2);
  });

  it('stretches a single value and reports length mismatches', () => {
    addShapes([...ring, math('z', 300, 'z\\coloneq0..2'), graph('g', 400, [series({ id: 'a', x: 'x', y: '0', label: 'axis' }), series({ id: 'b', x: 'x', y: 'z' })])]);
    const d = dataOf('g');
    expect(d.plots[0].ys).toEqual([0, 0, 0, 0]);
    expect(d.errors[0]).toMatch(/x has 4 values but y has 3/);
  });

  it('never lets a series define a variable', () => {
    addShapes([graph('g', 100, [series({ id: 'a', x: 'q\\coloneq5', y: '1' })]), math('m', 300, 'm\\coloneq q')]);
    expect(engine.getResult(graphRegionId('g', 'a', 'x'))).toBeUndefined();
    expect(results('m')?.error).toBeTruthy();
    expect(dataOf('g').errors[0]).toMatch(/cannot define a variable/);
  });

  it('removes its regions when the graph or a series is deleted', () => {
    addShapes([...ring, graph('g', 400, [series({ id: 'a', x: 'x', y: 'y' }), series({ id: 'b', x: 'x', y: 'y' })])]);
    expect(engine.getResult(graphRegionId('g', 'b', 'x'))).toBeDefined();
    updateShapes({ g: { props: { series: [series({ id: 'a', x: 'x', y: 'y' })] } } });
    expect(engine.getResult(graphRegionId('g', 'b', 'x'))).toBeUndefined();
    deleteShapes(['g']);
    expect(engine.getResult(graphRegionId('g', 'a', 'x'))).toBeUndefined();
  });

  it('lists where a series gets its data: used variables and the inputs behind them', () => {
    addShapes([...ring, graph('g', 400, [series({ id: 'a', x: 'x', y: 'y', style: 'marker' })])]);
    const src = seriesSources('g', 'a', useCalculationStore.getState().results);
    expect(src.direct.map((s) => [s.name, s.regionId, s.input])).toEqual([
      ['x', 'x', false],
      ['y', 'y', false],
    ]);
    expect(src.inputs.map((s) => [s.name, s.regionId])).toEqual([
      ['n', 'n'],
      ['r', 'r'],
    ]);
  });

  it('follows the nearest definition above the graph', () => {
    addShapes([...ring, graph('g', 400, [series({ id: 'a', x: 'x', y: 'y' })]), math('r2', 500, 'r\\coloneq1\\,\\mathrm{m}')]);
    expect(seriesSources('g', 'a', useCalculationStore.getState().results).inputs.find((s) => s.name === 'r')?.regionId).toBe('r');
  });

  it('equal axes require the same unit', () => {
    addShapes([...ring, graph('g', 400, [series({ id: 'a', x: 'x', y: 'i' })], { equalAxes: true })]);
    expect(dataOf('g').errors.join()).toMatch(/same unit/);
  });
});

describe('graph helpers', () => {
  it('nice steps are 1, 2 or 5 × 10ⁿ', () => {
    expect(niceStep(1000)).toBe(200);
    expect(niceStep(7)).toBe(1);
    expect(niceStep(0.3)).toBe(0.05);
  });

  it('data range includes circle radii', () => {
    const r = dataRange([{ series: series({}), xs: [0, 10], ys: [0, 0], rs: [2, 2] }]);
    expect(r).toEqual({ x: { min: -2, max: 12 }, y: { min: -2, max: 2 } });
  });

  it('new series get unique ids', () => {
    const a = newGraphSeries([]);
    const b = newGraphSeries([a]);
    expect(a.id).not.toBe(b.id);
  });
});

describe('graph files', () => {
  it('keeps the column layout of a math region and drops unknown values', () => {
    const doc = parseDocument({
      format: 'calccanvas',
      version: DOCUMENT_VERSION,
      id: 'd',
      title: 't',
      shapes: [
        { id: 'a', type: 'math', x: 0, y: 0, props: { latex: 'x', vectorLayout: 'column' } },
        { id: 'b', type: 'math', x: 0, y: 40, props: { latex: 'y', vectorLayout: 'diagonal' } },
      ],
    });
    expect((doc.shapes[0] as { props: { vectorLayout?: string } }).props.vectorLayout).toBe('column');
    expect((doc.shapes[1] as { props: { vectorLayout?: string } }).props.vectorLayout).toBeUndefined();
  });

  it('keeps a saved style and rejects unknown fonts', () => {
    const doc = parseDocument({
      format: 'calccanvas',
      version: DOCUMENT_VERSION,
      id: 'd',
      title: 't',
      shapes: [{ id: 'g', type: 'graph', x: 0, y: 0, props: { grid: true, axesAtOrigin: false, font: 'Comic', background: '#ffffff', series: [] } }],
    });
    expect((doc.shapes[0] as GraphShape).props).toMatchObject({ grid: true, axesAtOrigin: false, font: 'Roboto', background: '#ffffff' });
  });

  it('sanitises graph shapes', () => {
    const doc = parseDocument({
      format: 'calccanvas',
      version: DOCUMENT_VERSION,
      id: 'd',
      title: 't',
      shapes: [
        {
          id: 'g',
          type: 'graph',
          x: 10,
          y: 10,
          props: { w: 'x', h: 1e9, equalAxes: 'yes', series: [{ x: 'x', y: 'y', style: 'bogus', color: 'javascript:alert(1)', width: 99 }, 'junk'] },
        },
      ],
    });
    const g = doc.shapes[0] as GraphShape;
    expect(g.type).toBe('graph');
    expect(g.props.w).toBe(360);
    expect(g.props.equalAxes).toBe(false);
    // House style when a file has no style fields.
    expect(g.props).toMatchObject({ grid: false, axesAtOrigin: true, font: 'Roboto', background: '#fff9c4' });
    expect(g.props.series).toHaveLength(1);
    expect(g.props.series[0]).toMatchObject({ id: 's0', style: 'line', color: '#1e3a5f', width: 20 });
  });
});
