import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { step } from '../step';
import { CalculationEngine } from '../../engine';
import { calcKey } from '../../canvas/engineBridge';
import { planSteelSection } from '../../canvas/steelSections';
import { conditionHolds, textShowRegionId } from '../../canvas/textShow';
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
    const conditional = doc.shapes.filter(s => s.type === 'text' && !!(s.props as { showWhen?: string }).showWhen);
    // Input tables register exactly as the canvas bridge does: one definition per column.
    const registerTable = (t: TableShape) => {
      for (const c of inputTableColumns(t)) e.setRegion(inputTableRegionId(t.id, c.column), { latex: c.latex, order: [...calcKey(t, rec), c.column] as never, displayUnit: null, precision: null });
    };
    e.batch(() => {
      for (const s of math) e.setRegion(s.id, {
        latex:s.props.latex, order:calcKey(s,rec), displayUnit:s.props.displayUnit || null, precision:null,
      });
      for (const t of tables) registerTable(t);
      for (const t of conditional) e.setRegion(textShowRegionId(t.id), { latex: (t.props as { showWhen: string }).showWhen, order: calcKey(t, rec), displayUnit: null, precision: null });
    });
    const shown = (fragment: string) => {
      const t = conditional.find(x => (x.props as { html: string }).html.includes(fragment));
      if (!t) throw new Error(`no conditional text ${fragment}`);
      return conditionHolds(e.getResult(textShowRegionId(t.id)) as never);
    };
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
    step('Singapore NA (default): ULS by (6.10a) / (6.10b) with ξ 0.925, ψ0 0.7 — by hand; the pins below use the recommended values', () => {
      const L = value('L','m'), g0 = value('g_0','kN/m'), sb = value('s_b','m');
      // table rows: G 1.5 kPa and Q 3 kPa over the span; G 30 kN and Q 45 kN at 3 m
      const M = (kG: number, kQ: number, x: number) => (kG * (g0 + 1.5 * sb) + kQ * 3 * sb) * x * (L - x) / 2 + (kG * 30 + kQ * 45) * (x <= 3 ? x * (L - 3) / L : 3 * (L - x) / L);
      const peak = (kG: number, kQ: number) => { let m = 0; for (let i = 0; i <= 2000; i++) m = Math.max(m, M(kG, kQ, L * i / 2000)); return m; };
      const a = peak(1.35, 1.5 * 0.7), b = peak(0.925 * 1.35, 1.5);
      expect(value('M_{a.max}','kN m')).toBeCloseTo(a, 2);
      expect(value('M_{b.max}','kN m')).toBeCloseTo(b, 2);
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(Math.max(a, b), 2);
      e.setDefinitionOverride(region('c_{NA}\\coloneq'), { value: 0 });
    });
    step('all active equations are dimensionally valid', () => {
      expect(math.flatMap(s => {
        const r=e.getResult(s.id);return r?.status === 'error' ? [`${s.props.latex}: ${r.error?.message}`] : [];
      })).toEqual([]);
      expect(tables.flatMap(t => inputTableColumns(t).flatMap(c => {
        const r = e.getResult(inputTableRegionId(t.id, c.column)); return r?.status === 'valid' ? [] : [`${c.latex}: ${r?.error?.message}`];
      }))).toEqual([]);
      expect(tables.flatMap(t => inputTableColumns(t).map(c => c.name))).toEqual(['Case c_Q.i', 'x_1.i', 'x_2.i', 'p_k.i', 'ULS \\gamma_F.i', 'Case c_Q.j', 'a_j', 'F_k.j', 'ULS \\gamma_F.j']);
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
    step('construction stability failure remains visible: Singapore NA (§6.3.2.3) and recommended values (§6.3.2.2)', () => {
      const na = region('c_{NA}\\coloneq');
      e.setDefinitionOverride(na, { value: 1 });
      expect(value('M_{cr}','kN m')).toBeCloseTo(109.43069617269316,6);
      // Singapore NA, rolled h/b = 2.29: curve c, λ0 0.4, β 0.75, k_c = 1/√1.127, f (6.58) — by hand
      const W = value('W_{pl}','mm^3'), fy = value('f_y','MPa'), lam = Math.sqrt(W * fy / (109.43069617269316e6));
      const phi = 0.5 * (1 + 0.49 * (lam - 0.4) + 0.75 * lam ** 2), chi0 = Math.min(1, 1 / lam ** 2, 1 / (phi + Math.sqrt(phi ** 2 - 0.75 * lam ** 2)));
      const f = Math.min(1, 1 - 0.5 * (1 - 1 / Math.sqrt(1.127)) * (1 - 2 * (lam - 0.8) ** 2));
      expect(value('\\alpha_{LT}')).toBe(0.49);
      expect(value('M_{b.Rd}','kN m')).toBeCloseTo((Math.min(1, 1 / lam ** 2, chi0 / f) * W * fy) / 1e6, 6);
      e.setDefinitionOverride(na, { value: 0 });
      expect(value('M_{b.Rd}','kN m')).toBeCloseTo(91.39834274475413,6);
      expect(value('\\mathrm{UR}_{LT}')).toBeCloseTo(1.8715996613080623,7);
      expect(value('\\delta_1','mm')).toBeCloseTo(18.3427102904894,6);
      // the construction deflection curve peaks at mid-span with the closed-form 5wL⁴/384EI
      expect(value('\\max\\left(\\delta_{1.v}\\right)','mm')).toBeCloseTo(18.3427102904894,6);
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
      // slab longitudinal shear (reference.json): a-a with A_t + A_b, b-b around the studs with 2A_b
      expect(value('\\mathrm{UR}_{sf}')).toBeCloseTo(0.3586896,7);
      expect(value('\\mathrm{UR}_{L}')).toBeCloseTo(0.5155067945208707,7);
      expect(value('l_b','mm')).toBeCloseTo(232,9);
      expect(value('v_{b.Ed}','MPa')).toBeCloseTo(2.815733663865721,7);
      expect(value('\\mathrm{UR}_{sf.b}')).toBeCloseTo(0.7173792,7);
      expect(value('\\mathrm{UR}_{L.b}')).toBeCloseTo(0.666603613604574,7);
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
      // the ULS factor follows the load pattern (γ_G = 1.35 on G rows, γ_Q = 1.5 on Q rows)
      if (name === 'c_{Q.i}' || name === 'c_{Q.j}') setColumn(name === 'c_{Q.i}' ? '\\gamma_{F.i}' : '\\gamma_{F.j}', values.map((v) => (v.trim().toUpperCase() === 'Q' ? '1.5' : '1.35')));
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
    step('large point load near a support: studs cannot give composite action → non-composite design governs', () => {
      // 100 G + 150 Q kN at 1.5 m: 17 studs to x_M give η 0.511 ≥ η_min, but M_Rd(x) < M_Ed(x) next to the load
      setColumn('a_{j}', [q(1.5, 'm'), q(1.5, 'm')]); setColumn('c_{Q.j}', ['G', 'Q']); setColumn('F_{k.j}', [q(100, 'kN'), q(150, 'kN')]);
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(618.52962,1);          // reference 618.530 at 2.10 m (40 mm grid)
      expect(value('n_A')).toBe(17);
      expect(value('\\mathrm{UR}_{M.x}')).toBeGreaterThan(1);
      expect(value('c_{comp}')).toBe(0);
      expect(shown('NOT DESIGNED AS COMPOSITE')).toBe(true);            // summary text box appears
      expect(shown('Design basis: COMPOSITE')).toBe(false);
      expect(value('L_{LT.nc}','mm')).toBe(200);                           // LTB length = stud spacing
      expect(value('\\chi_{LT.nc}')).toBe(1);
      expect(value('\\mathrm{UR}_{M.nc}')).toBeCloseTo(1.45337661797,3);
      expect(value('\\delta_{nc}','mm')).toBeCloseTo(61.6797314581,2);   // bare steel, maximum along the span
      expect(value('\\max\\left(\\delta_{x.d}\\right)','mm')).toBe(value('\\delta_{nc}','mm'));   // chart plots the bare steel
      expect(value('\\mathrm{UR}_{des}')).toBeCloseTo(1.927491608067,3);   // deflection of the bare UB 406 governs
      // code-compliance checks (reference: tools/templates/reference_composite.py, web_checks)
      expect(value('\\mathrm{UR}_{MV}')).toBeCloseTo(1.06017,4);           // EC4 6.2.2.4, composite M–V
      expect(value('\\mathrm{UR}_{MV.nc}')).toBeCloseTo(1.45336,4);        // EC3 6.2.8 (6.30)
      expect(value('\\mathrm{UR}_{F.P}')).toBeCloseTo(0.66122,4);          // EN 1993-1-5 §6, type (a)
      expect(value('\\mathrm{UR}_{F.S}')).toBeCloseTo(1.30398,4);          // type (c) at the support
      expect(value('\\mathrm{UR}_{FM.nc}')).toBeCloseTo(1.39986,4);        // (7.2) with M_el
      expect(passes('\\mathrm{UR}_{des}\\le')).toBe(false);
      // Browse a deeper section, UB 533x210x92: still no composite action (η < η_min), passes as non-composite
      const sec = region('\\mathrm{Section}\\coloneq');
      e.setDefinitionOverride(sec, { value: 3129 });
      expect(value('\\eta')).toBeCloseTo(0.33295021908,6);
      expect(value('c_{comp}')).toBe(0);
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(621.17806,1);
      expect(value('\\mathrm{UR}_{LT.nc}')).toBeCloseTo(0.74089958181,3);
      expect(value('\\mathrm{UR}_{MV.nc}')).toBeCloseTo(0.74090,4);        // no shear reduction at x_M
      expect(value('F_{Rd.c}','kN')).toBeCloseTo(471.92179,3);
      expect(value('\\mathrm{UR}_{FM.nc}')).toBeCloseTo(0.78573,4);
      expect(value('\\mathrm{UR}_{des}')).toBeCloseTo(0.92480,4);          // support web bearing (6.14) governs
      expect(passes('\\mathrm{UR}_{des}\\le')).toBe(true);
      e.setDefinitionOverride(sec, null);
      restore('a_{j}', 'c_{Q.j}', 'F_{k.j}');
      expect(value('c_{comp}')).toBe(1);                                   // default: composite design
      expect(shown('NOT DESIGNED AS COMPOSITE')).toBe(false);
      expect(shown('Design basis: COMPOSITE')).toBe(true);
      expect(value('\\max\\left(\\delta_{x.d}\\right)','mm')).toBe(value('\\delta_{max}','mm'));   // chart plots the composite
      expect(value('\\mathrm{UR}_{des}')).toBe(value('\\mathrm{UR}_{d.x}'));   // composite: deflection along the span governs
      // 4.9: reference deflection_curve (closed form, 1 mm steps): 31.0771 mm at 3.94 m, 29.2243 mm with η = 1
      expect(value('\\delta_{max}','mm')).toBeCloseTo(31.0770932273,2);
      expect(value('\\delta_{q.max}','mm')).toBeCloseTo(7.052628667859932,2);   // reference delta_LL_max_mm
      expect(value('\\delta_{max}','mm')).toBeGreaterThanOrEqual(value('\\delta_{tot}','mm'));
      // wider stud spacing → lower η → more slip deflection (and the reverse)
      const d0 = value('\\delta_{max}','mm'), eta0 = value('\\eta');
      for (const r of ['s_{sc.A}\\coloneq','s_{sc.B}\\coloneq']) e.setDefinitionOverride(region(r), { value: 300, unit: 'mm' });
      expect(value('\\eta')).toBeLessThan(eta0);
      expect(value('\\delta_{max}','mm')).toBeGreaterThan(d0);
      for (const r of ['s_{sc.A}\\coloneq','s_{sc.B}\\coloneq']) e.setDefinitionOverride(region(r), null);
      expect(value('\\delta_{max}','mm')).toBeCloseTo(d0,9);
      expect(value('F_{Rd.a}','kN')).toBeCloseTo(544.44972,3); expect(value('\\lambda_{F.a}')).toBeCloseTo(0.74164,4);
      expect(value('l_{y.c}','mm')).toBeCloseTo(181.17687,3);
      expect(value('\\mathrm{UR}_{MV}')).toBeCloseTo(0.66027,4);
      expect(value('\\mathrm{UR}_{F.P}')).toBeCloseTo(0.19837,4); expect(value('\\mathrm{UR}_{F.S}')).toBeCloseTo(0.62909,4);
      expect(value('\\mathrm{UR}_{FM}')).toBeCloseTo(0.50778,4); expect(value('c_{rest}')).toBe(1);
    });
    step('braced construction: LTB restraint at k_LT L only — moments, deflections and the slip factor unchanged', () => {
      const prop = region('c_{brace}\\coloneq');
      const M1 = value('M_{1.Ed}','kN m'), d1 = value('\\delta_1','mm'), dg = value('\\delta_g','mm'), Cs = value('C_s'), dtot = value('\\delta_{tot}','mm');
      e.setDefinitionOverride(prop, { value: 1 });
      expect(value('L_{LT}','m')).toBeCloseTo(4,9);
      expect(value('M_{1.Ed}','kN m')).toBeCloseTo(M1,9); // bracing does not change the moments: w L² / 8
      expect(value('\\delta_1','mm')).toBeCloseTo(d1,9);
      // SN003b on the braced length 4 m: M_cr and UR by hand from the sheet's own section values
      const Ncr = value('N_{cr}','kN'), Iw = value('I_w','cm^6'), Iz = value('I_z','cm^4'), It = value('I_t','cm^4'), zg = value('z_g','cm');
      const Mcr = 1.127 * Ncr * (Math.sqrt(Iw / Iz + (8100 * It) / Ncr + (0.454 * zg) ** 2) - 0.454 * zg) / 100; // kN, cm → kN m
      expect(Ncr).toBeCloseTo(Math.PI ** 2 * 21000 * Iz / 400 ** 2, 6);
      expect(value('M_{cr}','kN m')).toBeCloseTo(Mcr, 3);
      expect(value('\\mathrm{UR}_{LT}')).toBeCloseTo(M1 / value('M_{b.Rd}','kN m'), 9);
      expect([value('\\delta_g','mm'), value('C_s'), value('\\delta_{tot}','mm')]).toEqual([dg, Cs, dtot]); // the beam is not propped
      expect(Cs).toBe(0.3);
      e.setDefinitionOverride(prop, null);
      expect(value('\\mathrm{UR}_{LT}')).toBeCloseTo(171.06110732520006 / value('M_{b.Rd}','kN m'),7);
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

    step('four static symbolic figures and seven graphs (V, M, construction δ_1(x), M_Rd(x), δ(x); Annex A: M(x), buckled shape); explicit review status', () => {
      const texts=doc.shapes.filter(s => s.type==='text');
      expect(texts.filter(s=>/^F\d —/.test(s.props.html)).map(s=>s.props.html.slice(0,2))).toEqual(['F1','F2','F3','F4']);
      expect(texts.some(s=>s.props.html.includes('<i>h</i><sub>c</sub>'))).toBe(true);
      expect(doc.shapes.filter(s=>s.type==='graph')).toHaveLength(7);
      expect(doc.shapes.some(s=>s.type==='image')).toBe(false);
      expect(texts.some(s=>s.props.html.includes('Singapore NA verification is outstanding'))).toBe(true);
    });
  }, 120_000); // one long engine walk; CI runners need more than the 5 s default
});
