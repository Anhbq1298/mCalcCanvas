import { describe, expect, it } from 'vitest';
import { CalculationEngine, parseLatex } from '../../engine';

function setup(regions: Record<string, string>) {
  const engine = new CalculationEngine();
  engine.batch(() => {
    for (const [id, latex] of Object.entries(regions)) engine.setRegion(id, { latex });
  });
  return engine;
}

const num = (engine: CalculationEngine, id: string) => engine.getResult(id)?.value?.number;

describe('parser', () => {
  it('parses definitions, evaluations and checks', () => {
    expect(parseLatex('L\\coloneq8.5m')).toMatchObject({ kind: 'definition', name: 'L' });
    expect(parseLatex('L:=8.5\\,\\mathrm{m}')).toMatchObject({ kind: 'definition', name: 'L' });
    expect(parseLatex('M=')).toMatchObject({ kind: 'evaluation' });
    expect(parseLatex('M=\\placeholder{}')).toMatchObject({ kind: 'evaluation' });
    expect(parseLatex('\\eta_{M}\\le1.0')).toMatchObject({ kind: 'check', op: '<=' });
    expect(parseLatex('')).toEqual({ kind: 'empty' });
  });

  it('binds subscripts to the last letter of a run', () => {
    const st = parseLatex('x\\coloneq wM_{Ed}');
    expect(st.kind).toBe('definition');
    if (st.kind !== 'definition') return;
    expect(st.expr).toMatchObject({
      type: 'binary',
      op: '*',
      left: { type: 'ident', name: 'w' },
      right: { type: 'ident', name: 'M_Ed' },
    });
  });

  it('treats L^23 as L^2 · 3 like TeX', () => {
    const st = parseLatex('L^23');
    expect(st).toMatchObject({ kind: 'expression', expr: { type: 'binary', op: '*', left: { op: '^' } } });
  });

  it('reports syntax errors without throwing raw errors', () => {
    expect(() => parseLatex('\\frac{1}{')).toThrow();
    expect(() => parseLatex('3+')).toThrow(/Incomplete/);
    expect(() => parseLatex('M=5')).toThrow(/:=/);
  });

  it('rejects oversized input', () => {
    expect(() => parseLatex('1+'.repeat(3000) + '1')).toThrow(/too long/);
  });
});

describe('Test B/C/D: definitions, dependencies, recalculation', () => {
  it('evaluates a defined variable', () => {
    const e = setup({ a: 'L\\coloneq8.5m', b: 'L=' });
    expect(e.getResult('b')?.value?.text).toBe('8.5 m');
  });

  it('computes M = wL²/8 with units', () => {
    const e = setup({
      l: 'L\\coloneq8.5m',
      w: 'w\\coloneq25kN/m',
      m: 'M\\coloneq\\frac{wL^2}{8}',
      r: 'M=',
    });
    expect(num(e, 'r')).toBeCloseTo(225.78125, 6);
    expect(e.getResult('r')?.value?.unitText).toBe('kN·m');
  });

  it('recalculates dependents when an input changes', () => {
    const e = setup({ l: 'L\\coloneq8.5m', w: 'w\\coloneq25kN/m', m: 'M\\coloneq\\frac{wL^2}{8}', r: 'M=' });
    const changed: string[][] = [];
    e.subscribe((ids) => changed.push(ids));
    e.setRegion('l', { latex: 'L\\coloneq10m' });
    expect(num(e, 'r')).toBeCloseTo(312.5, 9);
    // w was not affected and must not be recomputed
    expect(changed[0]).not.toContain('w');
    expect(changed[0]).toEqual(expect.arrayContaining(['l', 'm', 'r']));
  });

  it('is independent of insertion order (position independence)', () => {
    const e = setup({ r: 'M=', m: 'M\\coloneq\\frac{wL^2}{8}', w: 'w\\coloneq25kN/m', l: 'L\\coloneq8.5m' });
    expect(num(e, 'r')).toBeCloseTo(225.78125, 6);
  });
});

describe('Test F/G: units', () => {
  it('handles mm input and displays kN·m', () => {
    const e = setup({ l: 'L\\coloneq8500mm', w: 'w\\coloneq25\\mathrm{kN}/\\mathrm{m}', m: 'M\\coloneq\\frac{wL^2}{8}' });
    const v = e.getResult('m')?.value;
    expect(v?.number).toBeCloseTo(225.78125, 6);
    expect(v?.unitText).toBe('kN·m');
  });

  it('converts to a chosen display unit without changing the quantity', () => {
    const e = setup({ l: 'L\\coloneq8.5m', w: 'w\\coloneq25kN/m', m: 'M\\coloneq\\frac{wL^2}{8}' });
    e.setRegion('m', { latex: 'M\\coloneq\\frac{wL^2}{8}', displayUnit: 'kN·mm' });
    expect(num(e, 'm')).toBeCloseTo(225781.25, 4);
    expect(e.getResult('m')?.value?.text).toBe('225781.25 kN·mm');
  });

  it('rejects incompatible display units', () => {
    const e = setup({ l: 'L\\coloneq8.5m' });
    e.setRegion('l', { latex: 'L\\coloneq8.5m', displayUnit: 'kN' });
    expect(e.getResult('l')?.error?.code).toBe('display-unit');
  });

  it('reports a unit mismatch on addition', () => {
    const e = setup({ a: 'A\\coloneq10m+5kN' });
    expect(e.getResult('a')?.error?.message).toBe('Unit mismatch: Length cannot be added to Force.');
  });

  it('names engineering dimensions (Length + Moment)', () => {
    const e = setup({ l: 'L\\coloneq8500mm', m: 'M\\coloneq250kN\\cdot m', r: 'R\\coloneq L+M' });
    expect(e.getResult('r')?.error?.message).toContain('Length cannot be added to Moment');
  });

  it('supports imperial units and ksi', () => {
    const e = setup({ f: 'f\\coloneq36ksi', g: 'g\\coloneq f/\\mathrm{psi}' });
    expect(num(e, 'g')).toBeCloseTo(36000, 6);
  });

  it('cancels units to a plain number', () => {
    const e = setup({ a: 'a\\coloneq225kN\\cdot m', b: 'b\\coloneq300kN\\cdot m', u: 'u\\coloneq a/b' });
    expect(num(e, 'u')).toBeCloseTo(0.75, 12);
    expect(e.getResult('u')?.value?.unitText).toBe('');
  });

  it('accepts degrees in trig functions', () => {
    const e = setup({ a: 'a\\coloneq\\sin\\left(30\\degree\\right)', b: 'b\\coloneq\\cos 60^{\\circ}' });
    expect(num(e, 'a')).toBeCloseTo(0.5, 12);
    expect(num(e, 'b')).toBeCloseTo(0.5, 12);
  });
});

describe('symbol resolution', () => {
  it('splits letter runs into variables and units', () => {
    const e = setup({ w: 'w\\coloneq2kN/m', l: 'L\\coloneq3m', m: 'M\\coloneq wL' });
    expect(num(e, 'm')).toBeCloseTo(6, 12);
    expect(e.getResult('m')?.value?.unitText).toBe('kN');
  });

  it('prefers a defined multi-letter variable over splitting', () => {
    const e = setup({ a: 'wL\\coloneq7', w: 'w\\coloneq2', l: 'L\\coloneq3', m: 'M\\coloneq wL' });
    expect(num(e, 'm')).toBe(7);
  });

  it('re-resolves when a name becomes defined', () => {
    const e = setup({ w: 'w\\coloneq2', l: 'L\\coloneq3', m: 'M\\coloneq wL' });
    expect(num(e, 'm')).toBe(6);
    e.setRegion('a', { latex: 'wL\\coloneq7' });
    expect(num(e, 'm')).toBe(7);
  });

  it('warns when a variable shadows a unit', () => {
    const e = setup({ s: 's\\coloneq150mm' });
    expect(e.getResult('s')?.warnings[0]).toMatch(/shadows the unit/);
  });

  it('keeps upright \\mathrm units unambiguous even when shadowed', () => {
    const e = setup({ m: 'm\\coloneq5', x: 'x\\coloneq2\\mathrm{m}' });
    expect(e.getResult('x')?.value?.text).toBe('2 m');
  });
});

describe('errors', () => {
  it('reports undefined variables', () => {
    const e = setup({ l: 'L\\coloneq8.5m', m: 'M\\coloneq\\frac{wL^2}{8}' });
    expect(e.getResult('m')?.error?.message).toBe('Undefined variable: w');
  });

  it('detects circular dependencies without hanging', () => {
    const e = setup({ a: 'A\\coloneq B+1', b: 'B\\coloneq A+2', c: 'C\\coloneq A' });
    expect(e.getResult('a')?.error?.message).toBe('Circular dependency detected: A → B → A');
    expect(e.getResult('b')?.error?.code).toBe('circular-dependency');
    expect(e.getResult('c')?.error?.code).toBe('dependency-error');
  });

  it('reports duplicate definitions', () => {
    const e = setup({ a: 'L\\coloneq1m', b: 'L\\coloneq2m', c: 'L=' });
    expect(e.getResult('a')?.error?.code).toBe('duplicate-definition');
    expect(e.getResult('c')?.error?.message).toMatch(/Ambiguous/);
    e.removeRegion('b');
    expect(e.getResult('a')?.status).toBe('valid');
    expect(e.getResult('c')?.value?.text).toBe('1 m');
  });

  it('reports division by zero', () => {
    const e = setup({ r: 'R\\coloneq10/0' });
    expect(e.getResult('r')?.error?.code).toBe('division-by-zero');
  });

  it('keeps the last valid expression while drafting', () => {
    const e = setup({ l: 'L\\coloneq8.5m', r: 'L=' });
    e.setRegion('l', { latex: 'L\\coloneq8.5+', draft: true });
    expect(e.getResult('r')?.value?.text).toBe('8.5 m');
    expect(e.getResult('l')?.draftError).toBeTruthy();
    e.setRegion('l', { latex: 'L\\coloneq8.5+' });
    expect(e.getResult('l')?.status).toBe('error');
    expect(e.getResult('r')?.status).toBe('error');
  });
});

describe('steel beam demonstration worksheet', () => {
  const beam = {
    L: 'L\\coloneq8.5m',
    b: 'b\\coloneq2m',
    G: 'G\\coloneq5kPa',
    Q: 'Q\\coloneq5kPa',
    w: 'w\\coloneq\\left(1.35G+1.5Q\\right)b=',
    M: 'M_{Ed}\\coloneq\\frac{wL^2}{8}=',
    V: 'V_{Ed}\\coloneq\\frac{wL}{2}=',
    R: 'M_{Rd}\\coloneq300kN\\cdot m',
    eta: '\\eta_{M}\\coloneq\\frac{M_{Ed}}{M_{Rd}}=',
    chk: '\\eta_{M}\\le1',
  };

  it('computes expected values', () => {
    const e = setup(beam);
    expect(e.getResult('w')?.value?.text).toBe('28.5 kN/m');
    expect(num(e, 'M')).toBeCloseTo(257.390625, 6);
    expect(e.getResult('M')?.value?.text).toBe('257.39 kN·m');
    expect(num(e, 'V')).toBeCloseTo(121.125, 9);
    expect(e.getResult('eta')?.value?.text).toBe('0.858');
    expect(e.getResult('chk')?.check?.pass).toBe(true);
  });

  it('updates the check when the span changes', () => {
    const e = setup(beam);
    e.setRegion('L', { latex: 'L\\coloneq10m' });
    expect(num(e, 'M')).toBeCloseTo(356.25, 9);
    expect(e.getResult('chk')?.check?.pass).toBe(false);
  });

  it('produces a substituted calculation line from real values', () => {
    const e = setup(beam);
    const sub = e.getResult('M')?.substitutionLatex ?? '';
    expect(sub).toContain('28.5');
    expect(sub).toContain('8.5');
    expect(sub).toContain('\\frac');
  });
});

describe('Mathcad built-in constants', () => {
  it('provides π, e, g, ∞ and %', () => {
    const e = setup({
      a: 'a\\coloneq2\\pi',
      b: 'b\\coloneq\\ln\\left(e\\right)',
      w: 'W\\coloneq10\\,\\mathrm{kg}\\cdot g',
      p: 'p\\coloneq5\\%\\cdot200',
      i: 'i\\coloneq\\frac{1}{\\infty}',
    });
    expect(num(e, 'a')).toBeCloseTo(2 * Math.PI, 12);
    expect(num(e, 'b')).toBeCloseTo(1, 12);
    expect(e.getResult('w')?.value?.number).toBeCloseTo(0.0980665, 9); // kN
    expect(e.getResult('w')?.value?.unitText).toBe('kN');
    expect(num(e, 'p')).toBeCloseTo(10, 12);
    expect(num(e, 'i')).toBeCloseTo(0, 12);
  });

  it('lets a worksheet redefine a constant, with a warning', () => {
    const e = setup({ g: 'g\\coloneq10\\,\\mathrm{m}/\\mathrm{s}^2', f: 'F\\coloneq2\\,\\mathrm{kg}\\cdot g' });
    expect(e.getResult('f')?.value?.number).toBeCloseTo(0.02, 12);
    expect(e.getResult('g')?.warnings[0]).toMatch(/built-in constant/);
  });
});

describe('editor unit macro', () => {
  it('reads \\unit{…} as an upright unit', () => {
    const e = setup({ w: 'W\\coloneq10\\unit{kg}\\cdot g', f: 'f\\coloneq25\\frac{\\unit{kN}}{\\unit{m}}' });
    expect(e.getResult('w')?.value?.text).toBe('0.0981 kN');
    expect(e.getResult('f')?.value?.text).toBe('25 kN/m');
  });
});

describe('engineering display units', () => {
  it('shows small areas in mm² and section moduli in mm³', () => {
    const e = setup({ a: 'A\\coloneq\\frac{\\pi\\cdot\\left(20\\unit{mm}\\right)^2}{4}', w: 'W\\coloneq\\frac{200\\unit{mm}\\cdot\\left(400\\unit{mm}\\right)^2}{6}' });
    expect(e.getResult('a')?.value?.text).toBe('314.16 mm²');
    expect(e.getResult('w')?.value?.text).toBe('0.00533 m³');
  });
});

describe('check without a value', () => {
  it('explains instead of "unsupported command"', () => {
    const e = setup({ c: '\\le1' });
    expect(e.getResult('c')?.error?.code).toBe('incomplete');
    expect(e.getResult('c')?.error?.message).toMatch(/value to check/);
  });
});
