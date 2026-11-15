import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { step } from '../step';
import { CalculationEngine } from '../../engine';
import { calcKey } from '../../canvas/engineBridge';
import { planSteelSection } from '../../canvas/steelSections';
import { sectionById } from '../../engineering/steel/sections';
import type { Shape, TableShape } from '../../canvas/model/types';
import { INPUT_TABLE_HEADER_ROWS, inputNameLatex, inputTableColumns, inputTableRegionId } from '../../canvas/inputTable';

// Independent references: tools/templates/reference_composite.py (docs/composite-design/reference.json) and,
// for the PNA branches, a numerical integration of the rolled width with circular root fillets
// (see docs/composite-design/VALIDATION.md). None of these re-uses the worksheet formulas.
describe('EC4 phase-one composite worksheet', () => {
  it('evaluates existing operators and pins the independent N-mm-MPa reference', () => {
    const doc = JSON.parse(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8')) as { shapes: Shape[] };
    const rec = Object.fromEntries(doc.shapes.map(s => [s.id, s]));
    const e = new CalculationEngine({ unitSystem:'SI' });
    const math = doc.shapes.filter(s => s.type === 'math');
    const tables = doc.shapes.filter((s): s is TableShape => s.type === 'table' && !!s.props.input);
    // Input tables register exactly as the canvas bridge does: one definition per column.
    const registerTable = (t: TableShape) => {
      for (const c of inputTableColumns(t)) e.setRegion(inputTableRegionId(t.id, c.column), { latex: c.latex, order: [...calcKey(t, rec), c.column] as never, displayUnit: null, precision: null });
    };
    e.batch(() => {
      for (const s of math) e.setRegion(s.id, {
        latex:s.props.latex, order:calcKey(s,rec), displayUnit:s.props.displayUnit || null, precision:null,
      });
      for (const t of tables) registerTable(t);
    });
    const value = (name:string, unit:string|null = null) => {
      e.setRegion('probe',{latex:`${name}=`,order:[1e9] as never,displayUnit:unit,precision:null});
      const r=e.getResult('probe');
      if(r?.status!=='valid') throw new Error(`${name}: ${r?.error?.message}`);
      return r.value!.number!;
    };
    const region = (start:string) => {
      const s = math.find(m => m.props.latex.startsWith(start));
      if (!s) throw new Error(`no region ${start}`);
      return s.id;
    };
    const passes = (start:string) => e.getResult(region(start))?.check?.pass;
    const studs = region('n_h\\coloneq');
    step('all active equations are dimensionally valid', () => {
      expect(math.flatMap(s => {
        const r=e.getResult(s.id);return r?.status === 'error' ? [`${s.props.latex}: ${r.error?.message}`] : [];
      })).toEqual([]);
      expect(tables.flatMap(t => inputTableColumns(t).flatMap(c => {
        const r = e.getResult(inputTableRegionId(t.id, c.column)); return r?.status === 'valid' ? [] : [`${c.latex}: ${r?.error?.message}`];
      }))).toEqual([]);
      expect(tables.flatMap(t => inputTableColumns(t).map(c => c.name))).toEqual(['Load pattern c_Q.i', 'x_1.i', 'x_2.i', 'p_k.i', 'Load pattern c_Q.j', 'a_j', 'F_k.j']);
    });
    step('reference forces, connection and bending resistance', () => {
      expect(value('P_{Rd}','kN')).toBeCloseTo(81.6562762521,7);
      expect(value('\\eta')).toBeCloseTo(0.7217750522987195,8);
      expect(value('\\eta_{min}')).toBeCloseTo(0.49,10);
      expect(value('M_{1.Ed}','kN m')).toBeCloseTo(171.06110732520003,6);
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(469.182288117375,6);
      expect(value('M_{pl.Rd}','kN m')).toBeCloseTo(850.5873810305293,6);
      expect(value('M_{Rd}','kN m')).toBeCloseTo(732.3400307180946,6);
      expect(value('M_{Rd.pl}','kN m')).toBeCloseTo(786.9487843372331,5);
    });
    step('neutral axes follow from the inputs: slab depth and steel PNA differ', () => {
      expect(value('x_f','mm')).toBeCloseTo(79.85829411764705,9);
      expect(value('x_c','mm')).toBeCloseTo(57.6397244133,8);
      expect(value('y_a','mm')).toBeCloseTo(5.980819814498238,7);
      expect(value('y_a','mm')).toBeLessThan(value('t_f','mm'));
      expect(value('\\eta_f')).toBeCloseTo(0.40454997123581393,9);
      expect(Math.abs(value('R_N','kN'))).toBeLessThan(1e-9);
      expect(passes('A_{ac}\\le')).toBe(true);
      expect(passes('\\min\\left(A_{ac}-A_f')).toBe(true);
    });
    step('reduced connection moves the steel PNA down, through the flange into the web', () => {
      // n_h = 14: eta = 0.4209 > eta_f, flange branch; n_h = 8: eta = 0.2405, web below the fillet toe.
      e.setDefinitionOverride(studs, { value: 14 });
      expect(value('y_a','mm')).toBeCloseTo(12.445622500934352,7);
      expect(value('M_{Rd.pl}','kN m')).toBeCloseTo(694.2021382787664,5);
      e.setDefinitionOverride(studs, { value: 8 });
      expect(value('y_a','mm')).toBeCloseTo(86.73530561340525,3);
      expect(value('M_{Rd.pl}','kN m')).toBeCloseTo(611.9928142486898,2);
      expect(passes('\\eta_{min}\\le')).toBe(false);
      expect(value('M_{Rd}','kN m')).toBeCloseTo(425.5811,9); // eta < eta_min: no composite credit
      // n_h = 13: eta = 0.391 lies between the fillet-toe and flange boundaries: the unimplemented branch is flagged.
      e.setDefinitionOverride(studs, { value: 13 });
      expect(passes('\\min\\left(A_{ac}-A_f')).toBe(false);
      e.setDefinitionOverride(studs, null);
      expect(value('y_a','mm')).toBeCloseTo(5.980819814498238,7);
    });
    step('construction stability failure remains visible', () => {
      expect(value('M_{cr}','kN m')).toBeCloseTo(109.43069617269316,6);
      expect(value('M_{b.Rd}','kN m')).toBeCloseTo(91.39834274475413,6);
      expect(value('\\mathrm{UR}_{LT}')).toBeCloseTo(1.8715996613080623,7);
      expect(value('\\delta_1','mm')).toBeCloseTo(18.3427102904894,6);
    });
    step('load tables: internal forces, stud spacing from the max-moment position, PNA case, staged deflection', () => {
      expect(value('V_{2.Ed}','kN')).toBeCloseTo(209.7305536626,6);
      expect(value('x_M','m')).toBeCloseTo(3,9);
      expect(value('\\eta_{req}')).toBeCloseTo(0.49,10);
      expect(value('n_{req}')).toBe(17);
      expect(value('n_A')).toBe(24);
      expect(value('n_B')).toBe(25);
      expect(value('n_h')).toBe(24);
      expect(value('\\mathrm{UR}_{M.x}')).toBeCloseTo(0.6602693244038408,8); // just right of the load, 24 studs at 200 mm reach support B
      expect(value('n_{P}')).toBe(24);
      expect(value('k_M')).toBe(1);
      expect(value('k_P')).toBe(1);
      expect(value('v_f','kN/m')).toBeCloseTo(653.250210016847,6);
      expect(value('\\mathrm{UR}_{sf}')).toBeCloseTo(0.7173792,7);
      // virtual-work sum on the 200-step grid vs closed-form midspan deflections
      expect(value('\\delta_{LT}','mm')).toBeCloseTo(6.0781879315026375,3);
      expect(value('\\delta_{tr}','mm')).toBeCloseTo(3.7643549939359073,3);
      expect(value('\\delta_{slip}','mm')).toBeCloseTo(1.8508975757883905,3);
      expect(value('\\delta_{sh}','mm')).toBeCloseTo(5.4456150748999255,7);
      expect(value('\\delta_{tot}','mm')).toBeCloseTo(31.069346760047296,2);
      expect(value('\\sigma_{c.bot}','MPa')).toBeCloseTo(0.2110624338244728,7);
      expect(value('I_L','mm^4')).toBeCloseTo(633118674.3617084,3);
    });
    // Load tables: input-table columns, edited cell by cell as a user would (one row per load).
    const live = new Map(tables.map(t => [t.id, t]));
    const columnOf = (name: string) => {
      for (const t of tables) for (let c = 0; c < t.props.columns; c++) if (inputNameLatex(t.props.cells[0][c].value) === name) return { id: t.id, c };
      throw new Error(`no table column ${name}`);
    };
    const setColumn = (name: string, entries: string[] | null) => {
      const { id, c } = columnOf(name);
      const orig = tables.find(t => t.id === id)!, cur = live.get(id)!;
      const values = entries ?? orig.props.cells.slice(INPUT_TABLE_HEADER_ROWS).map(r => r[c].value);
      const n = Math.max(cur.props.rows - INPUT_TABLE_HEADER_ROWS, values.length);
      const cells = Array.from({ length: n + INPUT_TABLE_HEADER_ROWS }, (_, r) => Array.from({ length: cur.props.columns }, (_, k) =>
        ({ value: k === c && r >= INPUT_TABLE_HEADER_ROWS ? values[r - INPUT_TABLE_HEADER_ROWS] ?? '' : cur.props.cells[r]?.[k]?.value ?? '' })));
      const next: TableShape = { ...cur, props: { ...cur.props, rows: cells.length, cells } };
      live.set(id, next);
      registerTable(next);
    };
    const restore = (...names: string[]) => names.forEach((n) => setColumn(n, null));
    const q = (v: number, _unit: string) => String(v); // the unit sits in the table's unit row
    step('adding a table row adds a load', () => {
      setColumn('a_{j}', [q(3, 'm'), q(3, 'm'), q(6, 'm'), q(6, 'm')]);
      setColumn('c_{Q.j}', ['G', 'Q', 'G', 'Q']);
      setColumn('F_{k.j}', [q(30, 'kN'), q(45, 'kN'), q(10, 'kN'), q(10, 'kN')]);
      // closed form: maximum 490.624 kNm at x = 3.061 m; the 40 mm grid is within w·Δx²/8 = 0.007 kNm
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(490.630293556811,1);
      expect(value('V_{2.Ed}','kN')).toBeCloseTo(216.8555536626,6);
      expect(value('M_P','kN m')).toBeCloseTo(490.557288117375, 6); // first row: moment under the 3 m load
      restore('a_{j}', 'c_{Q.j}', 'F_{k.j}');
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(469.182288117375,6);
    });
    step('area-load rows are pressures times the load width', () => {
      expect(value('g_u','kN/m')).toBeCloseTo(4.5,9); // 1.5 kPa × 3 m
      setColumn('x_{1.i}', [q(0, 'm'), q(0, 'm'), q(0, 'm')]);
      setColumn('x_{2.i}', [q(8, 'm'), q(8, 'm'), q(8, 'm')]);
      setColumn('c_{Q.i}', ['G', 'Q', 'G']);
      setColumn('p_{k.i}', [q(1.5, 'kPa'), q(3, 'kPa'), q(1, 'kPa')]);
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(499.557288117375,6); // closed form, extra 1 kPa × 3 m permanent
      expect(value('V_{2.Ed}','kN')).toBeCloseTo(225.9305536626,6);
      restore('x_{1.i}', 'x_{2.i}', 'c_{Q.i}', 'p_{k.i}');
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(469.182288117375,6);
    });
    step('a large point load moves the maximum moment and the stud spacing with it', () => {
      setColumn('a_{j}', [q(2, 'm'), q(2, 'm')]);
      setColumn('c_{Q.j}', ['G', 'Q']);
      setColumn('F_{k.j}', [q(100, 'kN'), q(150, 'kN')]);
      expect(value('x_M','m')).toBeCloseTo(2,9);
      expect(value('n_A')).toBe(16); // 125 mm spacing over 2 m: too few studs for eta_min
      expect(passes('\\eta_{min}\\le')).toBe(false);
      restore('a_{j}', 'c_{Q.j}', 'F_{k.j}');
      expect(value('x_M','m')).toBeCloseTo(3,9);
    });
    step('propped construction: span and LTB length k_LT L, g0 on the composite section, slip factor 0.5', () => {
      const prop = region('c_{prop}\\coloneq');
      e.setDefinitionOverride(prop, { value: 1 });
      expect(value('L_{LT}','m')).toBeCloseTo(4,9);
      expect(value('M_{1.Ed}','kN m')).toBeCloseTo(42.76527683130001,6);
      expect(value('\\mathrm{UR}_{LT}')).toBeCloseTo(0.215929288170264,7);
      expect(value('\\delta_1','mm')).toBeCloseTo(1.1464193931555875,7);
      expect(value('\\delta_g','mm')).toBeCloseTo(4.749074859401146,7);
      expect(value('C_s')).toBeCloseTo(0.5,10);
      expect(value('\\delta_{slip}','mm')).toBeCloseTo(3.084829292980651,3);
      expect(value('\\delta_{tot}','mm')).toBeCloseTo(23.122062152720268,2);
      e.setDefinitionOverride(prop, null);
      expect(value('\\mathrm{UR}_{LT}')).toBeCloseTo(1.8715996613080623,7);
    });
    step('SCI P364 Example 8 (533×165×75 UKB S275, L = 12 m, C25/30): same equations, same results', () => {
      const set: [string, number, string | null][] = [['L\\coloneq',12,'m'],['s_b\\coloneq',3.5,'m'],['h_c\\coloneq',130,'mm'],['f_y\\coloneq',275,'MPa'],
        ['f_{ck}\\coloneq',25,'MPa'],['E_{cm}\\coloneq',31,'GPa'],['h_a\\coloneq',529.1,'mm'],['b_a\\coloneq',165.9,'mm'],['t_f\\coloneq',13.6,'mm'],
        ['t_w\\coloneq',9.7,'mm'],['r\\coloneq',12.7,'mm'],['A_a\\coloneq',9520,'mm^2'],['W_{pl}\\coloneq',1810000,'mm^3']];
      for (const [start, v, u] of set) e.setDefinitionOverride(region(start), { value: v, unit: u });
      expect(value('P_{c.Rd}','kN')).toBeCloseTo(73.7303062899,6);  // SCI 73.7
      expect(value('\\eta_{min}')).toBeCloseTo(0.496545454545,9);    // SCI 0.50
      expect(value('b_{eff}','mm')).toBeCloseTo(3000,9);              // SCI 3.00 m
      expect(value('x_f','mm')).toBeCloseTo(61.6,9);                  // SCI 61.5
      expect(value('M_{pl.Rd}','kN m')).toBeCloseTo(952.2975,6);       // SCI 952.4
      const eta = region('\\eta\\coloneq');
      e.setDefinitionOverride(eta, { value: 1252 / 2618 });
      // η = 0.478 < η_min 0.497 of (6.12): no composite credit here, as in SCI's standard rule
      expect(value('M_{Rd}','kN m')).toBeCloseTo(497.75,6);
      // SCI accepts it with the relaxed deck rule η_min = 0.4 (not in this solid-slab sheet): same (6.3)
      const etaMin = region('\\eta_{min}\\coloneq');
      e.setDefinitionOverride(etaMin, { value: 0.4 });
      expect(value('M_{Rd}','kN m')).toBeCloseTo(715.127184873950,6);  // SCI 715.7 (η rounded to 0.48)
      e.setDefinitionOverride(etaMin, null);
      e.setDefinitionOverride(eta, null);
      for (const [start] of set) e.setDefinitionOverride(region(start), null);
      expect(value('M_{pl.Rd}','kN m')).toBeCloseTo(850.5873810305293,6);
    });
    step('SBE Part 4 example A.4 (IPE 400 S355, L = 9 m, two point loads): load tables and resistances', () => {
      const set: [string, number, string | null][] = [['L\\coloneq',9,'m'],['s_b\\coloneq',6,'m'],['h_c\\coloneq',140,'mm'],['\\rho_c\\coloneq',0,'kN/m^3'],
        ['f_{ck}\\coloneq',25,'MPa'],['E_{cm}\\coloneq',31,'GPa'],['h_a\\coloneq',400,'mm'],['b_a\\coloneq',180,'mm'],['t_f\\coloneq',13.5,'mm'],
        ['t_w\\coloneq',8.6,'mm'],['r\\coloneq',21,'mm'],['A_a\\coloneq',8446,'mm^2'],['W_{pl}\\coloneq',1307000,'mm^3'],['m_a\\coloneq',66.3,'kg/m']];
      for (const [start, v, u] of set) e.setDefinitionOverride(region(start), { value: v, unit: u });
      // slab and secondary beams arrive as two point loads; no area loads (slab weight is inside the point loads)
      setColumn('x_{2.i}', [q(9, 'm')]); setColumn('x_{1.i}', [q(0, 'm')]); setColumn('c_{Q.i}', ['G']); setColumn('p_{k.i}', [q(0, 'kPa')]);
      setColumn('a_{j}', [q(3, 'm'), q(6, 'm'), q(3, 'm'), q(6, 'm')]); setColumn('c_{Q.j}', ['G', 'G', 'Q', 'Q']); setColumn('F_{k.j}', [q(62.78, 'kN'), q(62.78, 'kN'), q(45, 'kN'), q(45, 'kN')]);
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(465.649196006250,6); // SBE 465.6
      expect(value('V_{2.Ed}','kN')).toBeCloseTo(156.204198225,6);     // SBE 156.20
      expect(value('M_{a.Rd}','kN m')).toBeCloseTo(463.985,9);         // SBE 463.98
      expect(value('V_{pl.Rd}','kN')).toBeCloseTo(874.99194214009,6);   // SBE 874.97
      expect(value('\\eta_{min}')).toBeCloseTo(0.52,10);                  // SBE 0.520
      expect(value('b_{eff}','mm')).toBeCloseTo(2250,9);                // SBE 2.25 m
      expect(value('P_{c.Rd}','kN')).toBeCloseTo(73.7303062899,6);       // SBE 73.73 (solid value, before k_l)
      // SBE: 31 deck studs (45.27 kN) to the point load give N_c = 1403 kN; same slab force here
      const eta = region('\\eta\\coloneq');
      e.setDefinitionOverride(eta, { value: 1403 / (8446 * 0.355) });
      expect(value('y_a','mm')).toBeCloseTo(12.483020344288,7);          // SBE h_n = 388 mm, i.e. 12 mm below the top
      expect(value('M_{Rd.pl}','kN m')).toBeCloseTo(755.251727655505,5); // SBE 738 (deck slab; +2.3 %, see VALIDATION.md)
      e.setDefinitionOverride(eta, null);
      for (const [start] of set) e.setDefinitionOverride(region(start), null);
      restore('x_{1.i}', 'x_{2.i}', 'c_{Q.i}', 'p_{k.i}', 'a_{j}', 'c_{Q.j}', 'F_{k.j}');
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(469.182288117375,6);
    });
    step('solid-slab example (HK notes, UB 457×152×52 S355, L = 12 m, h_c = 125 mm): PNA in the slab, full connection', () => {
      // section from the BS 4-1 table: 449.8 × 152.4 × 7.6 × 10.9, r 10.2, A 66.6 cm², W_pl 1096 cm³
      const set: [string, number, string | null][] = [['L\\coloneq',12,'m'],['s_b\\coloneq',2.8,'m'],['h_c\\coloneq',125,'mm'],
        ['h_a\\coloneq',449.8,'mm'],['b_a\\coloneq',152.4,'mm'],['t_f\\coloneq',10.9,'mm'],['t_w\\coloneq',7.6,'mm'],['r\\coloneq',10.2,'mm'],
        ['A_a\\coloneq',6660,'mm^2'],['W_{pl}\\coloneq',1096000,'mm^3'],['m_a\\coloneq',52.3,'kg/m'],['s_{sc.A}\\coloneq',150,'mm'],['s_{sc.B}\\coloneq',150,'mm']];
      for (const [start, v, u] of set) e.setDefinitionOverride(region(start), { value: v, unit: u });
      setColumn('x_{2.i}', [q(12, 'm'), q(12, 'm')]); setColumn('x_{1.i}', [q(0, 'm'), q(0, 'm')]); setColumn('c_{Q.i}', ['G', 'Q']); setColumn('p_{k.i}', [q(1.5, 'kPa'), q(3, 'kPa')]);
      setColumn('a_{j}', [q(6, 'm')]); setColumn('c_{Q.j}', ['G']); setColumn('F_{k.j}', [q(0, 'kN')]);
      expect(value('b_{eff}','mm')).toBeCloseTo(2800,9);                 // notes 2800 (L/4 = 3000 > b)
      expect(value('x_f','mm')).toBeCloseTo(49.670168067227,8);           // N_a 2364 kN, PNA in the slab
      expect(value('M_{a.Rd}','kN m')).toBeCloseTo(389.08,9);              // notes 389.0
      expect(value('M_{pl.Rd}','kN m')).toBeCloseTo(768.550980819328,6);   // notes 768.5 (lever 325.1 mm)
      expect(value('\\eta')).toBeCloseTo(1,10);                            // 40 studs per half span: full connection
      expect(value('M_{Rd}','kN m')).toBeCloseTo(768.550980819328,6);
      expect(value('k_M')).toBe(0);                                        // PNA case 0: in the slab
      for (const [start] of set) e.setDefinitionOverride(region(start), null);
      restore('x_{1.i}', 'x_{2.i}', 'c_{Q.i}', 'p_{k.i}', 'a_{j}', 'c_{Q.j}', 'F_{k.j}');
      expect(value('M_{pl.Rd}','kN m')).toBeCloseTo(850.5873810305293,6);
    });
    step('section from the library: Browse changes only the Section ID; properties follow', () => {
      const sec = region('\\mathrm{Section}\\coloneq');
      expect(sectionById(3148).name).toBe('UB 406x178x60');
      const patches = planSteelSection(rec as Record<string, Shape>, sec, 1013); // IPE 400
      const changed = Object.keys(patches).map(id => (rec[id] as Shape & { props: { latex?: string } }).props.latex ?? '');
      expect(changed.some(l => l.startsWith('\\alpha_{LT}'))).toBe(false);                       // composite's own input kept
      expect(changed.every(l => l.startsWith('\\mathrm{Section}') || l.includes('\\operatorname{sectionProp}'))).toBe(true);
      e.setDefinitionOverride(sec, { value: 1013 });
      expect(value('h_a','mm')).toBe(400);
      expect(value('W_{pl}','mm^3')).toBeCloseTo(1307150,6);
      expect(value('M_{a.Rd}','kN m')).toBeCloseTo(1307150 * 355e-6,9);
      expect(() => planSteelSection(rec as Record<string, Shape>, sec, { h: 400, b: 180, tf: 13.5, tw: 8.6 })).toThrow(); // custom I/H: steel worksheet only
      e.setDefinitionOverride(sec, null);
      expect(value('h_a','mm')).toBe(406.4);
    });

    step('three static symbolic figures and three graphs; explicit review status', () => {
      const texts=doc.shapes.filter(s => s.type==='text');
      expect(texts.filter(s=>/^F\d —/.test(s.props.html)).map(s=>s.props.html.slice(0,2))).toEqual(['F1','F2','F3']);
      expect(texts.some(s=>s.props.html.includes('<i>h</i><sub>c</sub>'))).toBe(true);
      expect(doc.shapes.filter(s=>s.type==='graph')).toHaveLength(3);
      expect(doc.shapes.some(s=>s.type==='image')).toBe(false);
      expect(texts.some(s=>s.props.html.includes('Singapore NA verification is outstanding'))).toBe(true);
    });
  });
});
