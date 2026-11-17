import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solveBeam } from '../../engineering/fem';
import { withPageDefaults, BAR_DIAMETERS, CHECKS, camberFor, CompositeModel, designSection, type DesignCriteria, DEFLECTION_CHECKS, governingCheck, governingSplit, STUD_SPACINGS } from '../../tools/composite/model';
import { sections } from '../../engineering/steel/sections';
import { step } from '../step';
import { parseDocument } from '../../documents/DocumentSerializer';

// mCompositeBeamDesign runs the worksheet itself: its results are the worksheet's (compositeTemplate.test.ts).
describe('mCompositeBeamDesign headless model', () => {
  it('finds the inputs, reads the worksheet results and follows input, section and load-table changes', () => {
    const m = new CompositeModel(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8'));
    expect(m.inputs.length).toBeGreaterThan(40);
    expect(m.inputs.find((f) => f.name === 'L')).toMatchObject({ value: 8, unit: 'm' });
    expect(m.sectionId).toBe(3148);
    expect(m.tables.map((t) => t.rows.length)).toEqual([2, 2]);
    let r = m.results();
    expect(r.errors).toEqual([]);
    expect(r.M2).toBeCloseTo(469.182, 2);
    expect(r['UR.des']).toBeCloseTo(0.97116, 4);
    expect(r.comp).toBe(1);
    expect(r.vectors.x).toHaveLength(201);
    expect(Math.max(...r.vectors.d)).toBeCloseTo(r.dmax, 6);
    expect(Math.max(...r.vectors.d1v)).toBeCloseTo(r.d1, 6); // construction deflection curve
    expect(Math.max(...r.vectors.dq)).toBeCloseTo(r.dq, 6); // LL curve against its scalar maximum
    expect(r.ga + r.gc).toBeCloseTo(r.g0, 9);
    expect(r.gsw).toBe(1.35); // fixed self-weight factor
    expect(r.vlEd ?? r.vLEd).toBeGreaterThan(0);
    expect(r.asfReq / r.asf).toBeCloseTo(r['UR.sf'], 6);
    // automatic strut angle: cot θ_f = 2 while the strut has room; dense studs push b-b to the largest angle the strut allows
    expect([r.cta, r.ctb]).toEqual([2, 2]);
    const sA = m.inputs.find((f) => f.name === 's_{sc.A}')!.id;
    const hsc = m.inputs.find((f) => f.name === 'h_{sc}')!.id;
    m.setInput(sA, 80); m.setInput(hsc, 75); // dense, short studs: full connection (flow capped at N_c,f / x_M) on a short surface b-b
    const dense = m.results();
    expect(dense.vf).toBeCloseTo(dense.Ncf / dense.xM, 6);
    expect(dense.ctb).toBeGreaterThan(1);
    expect(dense.ctb).toBeLessThan(2);
    expect(dense['UR.L.b']).toBeCloseTo(0.999, 9); // the strut is used to its limit, less the 0.1 % rounding margin
    expect(dense.asbReq).toBeCloseTo((dense.vf * 1000) / (dense.fsd * dense.ctb), 3); // (6.21), mm²/m
    m.setInput(sA, 125); m.setInput(hsc, 100);
    expect(m.inputs.some((f) => f.name.includes('G.sw'))).toBe(false); // not a user input
    m.setInput(m.inputs.find((f) => f.name === '\\gamma_G')!.id, 1.5); // γ_G no longer moves the self-weight
    expect(m.results().M2).toBeCloseTo(469.182, 2);
    m.setInput(m.inputs.find((f) => f.name === '\\gamma_G')!.id, 1.35);
    // per-row ULS factor: G rows at 1.0 instead of 1.35 lower M_Ed at 3 m by 0.35 (4.5·3·5/2 + 30·3·5/8) = 31.5 kNm
    const area = m.tables[0], pts0 = m.tables[1];
    m.setTableRows(area.id, [['G', '0', '8', '1.5', '1'], ['Q', '0', '8', '3', '1.5']]);
    m.setTableRows(pts0.id, [['G', '3', '30', '1'], ['Q', '3', '45', '1.5']]);
    expect(m.results().M2).toBeCloseTo(469.182 - 31.5, 2);
    m.setTableRows(area.id, [['G', '0', '8', '1.5', ''], ['Q', '0', '8', '3']]); // blank or missing factor: γ_G / γ_Q
    m.setTableRows(pts0.id, [['G', '3', '30'], ['Q', '3', '45']]);
    expect(m.results().M2).toBeCloseTo(469.182, 2);
    // deleting every point load really removes them (the engine gets one zero load, not the old rows)
    m.setTableRows(pts0.id, []);
    const noPoint = m.results();
    m.setTableRows(pts0.id, [['G', '4', '0']]);
    expect(noPoint.errors).toEqual([]);
    expect(noPoint.M2).toBeCloseTo(m.results().M2, 6);
    expect(noPoint.M2).toBeLessThan(469.182 - 100);
    expect(m.tables[1].rows).toEqual([['G', '4', '0', '1.35']]);
    m.setTableRows(pts0.id, [['G', '3', '30'], ['Q', '3', '45']]);
    // large point load near support A: composite action fails, bare steel governs
    const pts = m.tables[1];
    m.setTableRows(pts.id, [['G', '1.5', '100'], ['Q', '1.5', '150']]);
    r = m.results();
    expect(r.comp).toBe(0);
    expect(r['UR.des']).toBeCloseTo(1.92749, 3);
    m.setSection(3129); // UB 533x210x92
    expect(m.results()['UR.des']).toBeCloseTo(0.9248, 3);
    // an input change, and the report worksheet carries it
    m.setInput(m.inputs.find((f) => f.name === 's_{sc.A}')!.id, 150);
    const doc = m.reportDocument() as { shapes: { props: { latex?: string; cells?: { value: string }[][] } }[] };
    expect(doc.shapes.some((s) => s.props.latex === 's_{sc.A}\\coloneq 150\\,\\mathrm{mm}')).toBe(true);
    expect(doc.shapes.some((s) => s.props.latex === '\\mathrm{Section}\\coloneq3129')).toBe(true);
    expect(doc.shapes.some((s) => s.props.cells?.[2]?.[2]?.value === '100')).toBe(true);
    // the exported .mCCV is a worksheet mCalcCanvas opens, and it recalculates to the tool's numbers
    const reopened = parseDocument(JSON.parse(JSON.stringify(doc)));
    expect(reopened.shapes).toHaveLength(m.doc.shapes.length);
    const again = new CompositeModel(JSON.stringify(reopened));
    expect(again.results()['UR.des']).toBeCloseTo(m.results()['UR.des'], 9);
  }, 120_000);

  it('optimizes the section: the lightest UB that passes every check, lighter ones fail', () => {
    const m = new CompositeModel(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8'));
    const set = (n: string, v: number) => m.setInput(m.inputs.find((f) => f.name === n)!.id, v);
    set('L', 5); set('s_b', 2.5); set('h_c', 200);
    m.setTableRows(m.tables[0].id, [['G', '0', '5', '5', ''], ['Q', '0', '5', '3', '']]);
    m.setTableRows(m.tables[1].id, [['G', '0.8', '30', '']]);
    const seen: string[] = [];
    const out = m.optimizeSection('UB', { progress: (_i, _n, name) => seen.push(name) });
    expect(out.best).not.toBeNull();
    expect(m.sectionId).toBe(out.best!.id);
    const r = m.results();
    expect(governingCheck(r).ur).toBeLessThanOrEqual(1);
    expect(Math.max(out.best!.strength.ur, out.best!.deflection.ur)).toBeCloseTo(governingCheck(r).ur, 9);
    expect(seen).toHaveLength(out.tried);
    // every lighter UB is tried with every bar × spacing before the winner, and fails with the winning detail
    const lighter = sections.filter((s) => s.family === 'UB' && s.values.mass < out.best!.mass);
    const before = BAR_DIAMETERS.indexOf(out.best!.bar) * STUD_SPACINGS.length + STUD_SPACINGS.indexOf(out.best!.sc);
    expect(out.tried - 1).toBe(lighter.length * BAR_DIAMETERS.length * STUD_SPACINGS.length + before);
    expect(out.total).toBe(sections.filter((s) => s.family === 'UB').length * (BAR_DIAMETERS.length * STUD_SPACINGS.length + 1)); // + the bare-steel fallback pass
    expect(out.best!.composite).toBe(true);
    for (const s of lighter) { m.setSection(s.id); m.setDetail(out.best!); expect(governingCheck(m.results()).ur).toBeGreaterThan(1); }
    // depth limit: only sections with h ≤ h_max; the lightest of those that passes, lighter ones within the limit fail
    const lim = out.best!.id && sections.find((s) => s.id === out.best!.id)!.values.h - 1;
    const limited = m.optimizeSection('UB', { maxDepth: lim });
    expect(limited.maxDepth).toBe(lim);
    if (limited.best) {
      expect(sections.find((s) => s.id === limited.best!.id)!.values.h).toBeLessThanOrEqual(lim);
      expect(limited.best.mass).toBeGreaterThanOrEqual(out.best!.mass);
      for (const s of sections.filter((x) => x.family === 'UB' && x.values.h <= lim && x.values.mass < limited.best!.mass)) { m.setSection(s.id); m.setDetail(limited.best!); expect(governingCheck(m.results()).ur).toBeGreaterThan(1); }
    }
    expect(limited.total).toBe(sections.filter((x) => x.family === 'UB' && x.values.h <= lim).length * (BAR_DIAMETERS.length * STUD_SPACINGS.length + 1));
    // nothing passes: the section is restored
    set('L', 30);
    m.setSection(3148);
    expect(m.optimizeSection('IPE').best).toBeNull();
    expect(m.sectionId).toBe(3148);
  }, 300_000);

  it('screening model (no deflection curves) gives every other check exactly; optimizing with it picks the same section', () => {
    const raw = readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8');
    const full = new CompositeModel(raw), screen = new CompositeModel(raw, { screening: true });
    const ub = sections.filter((s) => s.family === 'UB').sort((a, b) => a.values.mass - b.values.mass);
    for (const s of ub.filter((_, i) => i % 9 === 0)) {
      full.setSection(s.id); screen.setSection(s.id);
      const a = full.results(), b = screen.results();
      expect(b.errors).toEqual([]);
      for (const [key] of CHECKS) if (!DEFLECTION_CHECKS.includes(key) && key !== 'des') expect(b[`UR.${key}`]).toBe(a[`UR.${key}`]);
    }
    full.setSection(3148);
    const t0 = performance.now(); const serial = full.optimizeSection('UB'); const t1 = performance.now();
    full.setSection(3148);
    const fast = full.optimizeSection('UB', { screen }); const t2 = performance.now();
    expect(fast).toEqual(serial);
    expect(t2 - t1).toBeLessThan((t1 - t0) * 0.75);
  }, 600_000);

  it('precamber reduces the permanent deflection (EN 1990 A1.4.3) and the optimiser honours separate targets', () => {
    const raw = readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8');
    const m = new CompositeModel(raw);
    const r0 = m.results();
    expect(r0.wc).toBe(0);
    const cam = m.inputs.find((f) => f.name === 'c_{cam}')!;
    m.setInput(cam.id, 80);
    const r = m.results();
    // w_c = 0.8 × 5 g0 L⁴ / (384 E I_a) (unpropped, steel alone)
    expect(r.wc).toBeCloseTo((0.8 * 5 * r.g0 * r.L ** 4 * 1e12) / (384 * 210000 * r.I_a * 1e4), 3);
    expect(r.dmax).toBeLessThan(r0.dmax);
    expect(r.dmax).toBeGreaterThan(r0.dmax - r.wc - 1e-9);
    expect(Math.max(...r.vectors.d)).toBeCloseTo(r.dmax, 9); // the chart shows the net curve
    expect(r.dq).toBeCloseTo(r0.dq, 9); // LL alone is not cambered
    // targets: a stricter strength target can only give a heavier (or equal) section; each criterion holds
    const screen = new CompositeModel(raw, { screening: true });
    screen.setInput(cam.id, 80);
    const loose = m.optimizeSection('UB', { screen, targets: { strength: 1, deflection: 1 } });
    const strict = m.optimizeSection('UB', { screen, targets: { strength: 0.8, deflection: 0.5 } });
    expect(strict.best!.mass).toBeGreaterThanOrEqual(loose.best!.mass);
    expect(strict.best!.strength.ur).toBeLessThanOrEqual(0.8);
    expect(strict.best!.deflection.ur).toBeLessThanOrEqual(0.5);
    for (const s of sections.filter((x) => x.family === 'UB' && x.values.mass < strict.best!.mass)) {
      m.setSection(s.id);
      const g = governingSplit(m.results());
      expect(g.strength.ur > 0.8 || g.deflection.ur > 0.5).toBe(true);
    }
  }, 600_000);

  // 4.10 natural frequency against tools/templates/reference_vibration.py: the same method (SCI P354, E_dyn 38 GPa,
  // f = 18/sqrt(delta)) with section properties integrated from the geometry; the script itself reproduces the
  // published SCI P354 worked example (I 81 745 cm4, delta 3.629 mm, f 9.282 Hz).
  it('natural frequency matches the independent reference calculation', () => {
    const ref = JSON.parse(readFileSync('docs/composite-design/reference_vibration.json', 'utf8'));
    expect(ref.published_P354_example.I_cm4 / ref.published_P354_example.I_published_cm4).toBeCloseTo(1, 3);
    expect(ref.published_P354_example.delta_mm).toBeCloseTo(ref.published_P354_example.delta_published_mm, 2);
    expect(ref.published_P354_example.f_Hz).toBeCloseTo(ref.published_P354_example.f_published_Hz, 2);
    const m = new CompositeModel(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8'));
    const set = (n: string, v: number) => m.setInput(m.inputs.find((f) => f.name === n)!.id, v);
    // default case: UB 406x178x60, L 8 m, s_b 3 m, h_c 150 mm, loads as in the template
    let r = m.results();
    const d = ref.default_UB406x178x60_L8;
    expect(r.f1 / d.f1_Hz).toBeCloseTo(1, 2);
    expect(r.f1nc / d.f1_nc_Hz).toBeCloseTo(1, 2);
    expect(r.ddyn / d.delta_dyn_mm).toBeCloseTo(1, 2);
    expect(r['UR.fn']).toBeCloseTo(r.flim / r.f1, 9);
    // second case: UB 406x140x46, L 5 m, s_b 2.5 m, h_c 200 mm, 5 kPa G + 3 kPa Q, 30 kN at 0.8 m
    set('L', 5); set('s_b', 2.5); set('h_c', 200);
    m.setSection(sections.find((x) => x.name === 'UB 406x140x46')!.id);
    m.setTableRows(m.tables[0].id, [['G', '0', '5', '5', ''], ['Q', '0', '5', '3', '']]);
    m.setTableRows(m.tables[1].id, [['G', '0.8', '30', '']]);
    r = m.results();
    const c = ref.UB406x140x46_L5_P30;
    expect(r.errors).toEqual([]);
    expect(r.f1 / c.f1_Hz).toBeCloseTo(1, 2);
    expect(r.f1nc / c.f1_nc_Hz).toBeCloseTo(1, 2);
    expect(r.ddyn / c.delta_dyn_mm).toBeCloseTo(1, 2);
  }, 120_000);

  // Profiled steel deck (EN 1994-1-1 §6.6.4, §6.6.6.4) against tools/templates/reference_deck.py (hand calculation).
  it('steel deck mode matches the independent reference; the solid slab is unchanged by the deck inputs', () => {
    const ref = JSON.parse(readFileSync('docs/composite-design/reference_deck.json', 'utf8'));
    const m = new CompositeModel(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8'));
    const set = (n: string, v: number) => m.setInput(m.inputs.find((f) => f.name === n)!.id, v);
    const solid = m.results();
    expect([solid.cdeck, solid.hpe, solid.kd, solid.nre, solid.cbb, solid.ccc, solid['UR.sf.c'], solid['UR.L.c']]).toEqual([0, 0, 1, 1, 1, 0, 0, 0]);
    expect(solid.ctop).toBe(1); // a solid slab always has top and bottom bars
    // §6.6.5.1(1): bottom bars 30 mm clear below the stud head; 100 − 10 − (0 + 20 + 10) = 60 mm in the solid slab
    expect(solid.chd).toBeCloseTo(60, 9);
    { // a deck slab has one bar layer by default (on the deck, counted as A_b); two layers on request
      const d = new CompositeModel(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8'));
      const put = (n: string, v: number) => d.setInput(d.inputs.find((f) => f.name === n)!.id, v);
      put('c_{deck}', 1);
      let q = d.results();
      expect([q.ctop, q.at]).toEqual([0, 0]);
      expect(q.chd).toBeCloseTo(100 - 10 - (55 + 20 + 10), 9); // RF55 with 100 mm studs: 5 mm, not met
      expect(q.asf).toBeCloseTo(q.ab, 9);
      put('n_{lay}', 2);
      q = d.results();
      expect(q.ctop).toBe(1);
      expect(q.asf).toBeCloseTo(q.at + q.ab, 9);
    }
    set('h_p', 80); set('n_r', 2); set('c_{par}', 1); // deck inputs do nothing while c_deck = 0
    expect(m.results()['UR.des']).toBeCloseTo(solid['UR.des'], 12);
    set('h_p', 60); set('c_{par}', 0); set('n_r', 2);
    set('c_{re}', 0); set('b_r', 150); set('e_r', 300); set('g_p', 0.13); // open trapezoidal 60 mm deck of the reference (defaults are RF55)
    m.setSection(sections.find((x) => x.name === 'UB 406x140x46')!.id);
    set('c_{deck}', 1); set('h_c', 130); set('c_{pe}', 1);
    const cmp = (r: Record<string, number>, c: Record<string, number>) => {
      const pairs: [number, number][] = [[r.kd, c.k_d], [r.PRd, c.P_Rd_kN], [r.g0, c.g_0_kN_m], [r.xM, c.x_M_m], [r.M2, c.M_Ed_kNm], [r.nh, c.n_h], [r.NcRd, c.N_cRd_kN], [r.Ncf, c.N_cf_kN],
        [r.eta, c.eta], [r.MplRd, c.M_plRd_kNm], [r.MaRd, c.M_aRd_kNm], [r.MRd, c.M_Rd_kNm], [r.I_0, c.I_0_cm4], [r.Idyn, c.I_dyn_cm4], [r.vf, c.v_f_kN_m], [r.vLEd, c.v_LEd_MPa], [r.lb, c.l_b_mm]];
      for (const [a, b] of pairs) expect(a / b).toBeCloseTo(1, 3);
    };
    let r = m.results();
    expect(r.errors).toEqual([]);
    cmp(r, ref.transverse_2_per_rib);
    expect([r.sA, r.sB, r.cbb, r.comp]).toEqual([300, 300, 0, 1]); // studs at the rib pitch; b-b not required (§6.6.6.4(2))
    expect(r['UR.sf.b']).toBe(0);
    expect(r.LLT).toBeCloseTo(0.3, 9); // transverse deck restrains the beam in construction
    set('n_r', 1); // one stud in every rib: (6.16) applies, eta_min 0.4 at L = 8 m
    r = m.results();
    expect([r.c16, r.etaMin]).toEqual([1, 0.4]);
    set('c_{par}', 1);
    r = m.results();
    expect(r.errors).toEqual([]);
    cmp(r, ref.parallel);
    expect([r.sA, r.sB, r.cbb, r.ape, r.LLT]).toEqual([125, 200, 1, 0, 8]);
  }, 120_000);

  // Published example: Steel Buildings in Europe, Multi-storey Part 4, A.3 (secondary beam, IPE 270 S355, L 7.5 m,
  // 120 slab on a 58 mm transverse deck, b_0 82 mm, 19 x 100 studs, C25/30). Slab weight set to its 7.2 kN/m.
  it('steel deck mode reproduces the published SBE Part 4 example A.3', () => {
    const m = new CompositeModel(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8'));
    const set = (n: string, v: number) => m.setInput(m.inputs.find((f) => f.name === n)!.id, v);
    m.setSection(sections.find((x) => x.name === 'IPE 270')!.id);
    set('L', 7.5); set('s_b', 3); set('h_c', 120); set('c_{deck}', 1); set('c_{re}', 0); set('h_p', 58); set('b_r', 82); set('e_r', 207); set('n_r', 1);
    set('f_{ck}', 25); set('E_{cm}', 31); set('g_p', 0); set('\\rho_c', 7.2 / (3 * (0.12 - 0.058 * (1 - 82 / 207))));
    set('s_{sc.A}', 207); set('s_{sc.B}', 207); // 36 studs on the beam, 18 per shear span
    m.setTableRows(m.tables[0].id, [['G', '0', '7.5', '0.75', ''], ['Q', '0', '7.5', '2.5', '']]);
    m.setTableRows(m.tables[1].id, []);
    const r = m.results();
    expect(r.errors).toEqual([]);
    expect(r.M2).toBeCloseTo(172.2, 1); // M_Ed
    expect(r.kt).toBeCloseTo(0.717, 3); // (6.23)
    expect(r.PRd).toBeCloseTo(52.86, 1);
    expect(r.nh).toBe(18);
    expect(r.NcRd).toBeCloseTo(1647, 0); // 0.85 f_cd b_eff (h - h_p)
    expect(r.Ncf).toBeCloseTo(1631, 0); // N_pl,a governs
    expect(r.Nc / 952).toBeCloseTo(1, 2);
    expect(r.etaMin).toBeCloseTo(0.475, 9);
    expect(r.eta).toBeCloseTo(0.583, 3); // published 0.578 = 952 / 1647 (concrete force, not the smaller N_pl,a)
    expect(r.ya).toBeCloseTo(7, 0); // PNA 263 mm above the bottom of the 270 mm section
    expect(r.vLEd).toBeCloseTo(2.05, 1); // a-a, h_f = 62 mm
    // published M_Rd 301.7 kNm puts N_c at mid-depth of the 62 mm topping; here N_c acts at x_c / 2 (§6.2.1.3)
    expect(r.MRdpl).toBeCloseTo(314.9, 0);
    expect((r.MRdpl - (r.Nc * (62 / 2 - r.xc / 2)) / 1000) / 301.7).toBeCloseTo(1, 2); // 302.4, +0.2 %
    expect(r.MRd).toBeLessThan(301.7); // design value: linear interaction (6.3), conservative
  }, 120_000);

  it('fixed precamber adds to the % share, in the shape of the self-weight deflection', () => {
    const m = new CompositeModel(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8'));
    const set = (n: string, v: number) => m.setInput(m.inputs.find((f) => f.name === n)!.id, v);
    const r0 = m.results();
    expect(r0.wc).toBe(0);
    set('w_{c.0}', 10);
    const r1 = m.results();
    expect(r1.wc).toBeCloseTo(10, 9);
    expect(r0.dmax - r1.dmax).toBeGreaterThan(9.5); // the peak is near mid-span, where the full 10 mm applies
    expect(r0.dmax - r1.dmax).toBeLessThanOrEqual(10 + 1e-9);
    set('c_{cam}', 50);
    const r2 = m.results();
    expect(r2.wc).toBeGreaterThan(10);
    expect(r2['UR.d.1']).toBeCloseTo(r0['UR.d.1'], 12); // construction deflection is not cambered
  }, 120_000);

  // Design engine (RAM-style): fewest studs from the demand, camber by rule, per section.
  it('designs a section with the fewest studs, a rule camber and the degree of connection within its range', () => {
    const raw = readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8');
    const m = new CompositeModel(raw), screen = new CompositeModel(raw, { screening: true });
    const id = (name: string) => sections.find((x) => x.name === name)!.id;
    const base: DesignCriteria = { strength: 1, deflection: 1, etaMin: 0, etaMax: 1, studs: 'segmented', bars: [10, 12, 13], camber: null };
    expect(camberFor({ pct: 80, min: 20, max: 100, step: 5, minSpan: 7.5 }, 8, 33)).toBe(25); // 26.4 → 25
    expect(camberFor({ pct: 80, min: 20, max: 100, step: 5, minSpan: 7.5 }, 8, 20)).toBe(0); // 16 → 15 < minimum
    expect(camberFor({ pct: 80, min: 20, max: 100, step: 5, minSpan: 7.5 }, 7, 33)).toBe(0); // short span
    expect(camberFor({ pct: 80, min: 20, max: 30, step: 5, minSpan: 7.5 }, 12, 90)).toBe(30); // capped
    expect(designSection(m, screen, id('UB 406x178x60'), base, 'composite').pass).toBe(false); // construction LTB
    const seg = designSection(m, screen, id('UB 457x191x89'), base, 'composite');
    expect(seg.pass && seg.composite).toBe(true);
    // the result is what the worksheet gives for these details, and it passes there
    m.setDetail(seg);
    let r = m.results();
    expect(r['UR.des']).toBeLessThanOrEqual(1);
    expect([r.nA + r.nB, r.eta]).toEqual([seg.studs, seg.eta]);
    expect(r.nA).toBe(r.nB); // segmented: the same count on each side of the maximum moment
    expect(seg.eta).toBeGreaterThanOrEqual(r.etaMin);
    // one stud position fewer on each side no longer passes (fewest studs)
    m.setDetail({ ...seg, sc: Math.ceil((r.xM * 1000) / (r.nA - 1) / 5) * 5, scB: Math.ceil(((r.L - r.xM) * 1000) / (r.nB - 1) / 5) * 5 });
    r = m.results();
    expect(r.nA + r.nB).toBeLessThan(seg.studs);
    expect(r.comp < 1 || r['UR.des'] > 1).toBe(true);
    // transverse bars: the lightest diameter and spacing that pass; one step lighter fails a bar check
    const rb = designSection(m, screen, id('UB 457x191x89'), { ...base, barSpacings: [200, 175, 150, 125, 100] }, 'composite');
    expect(rb.pass).toBe(true);
    expect(rb.studs).toBe(seg.studs);
    const area = (d: { bar: number; sf?: number }) => (Math.PI * d.bar ** 2) / 4 / d.sf!;
    m.setDetail(rb);
    expect(Math.max(m.results()['UR.sf'], m.results()['UR.sf.b'])).toBeLessThanOrEqual(1);
    const lighter = [10, 12, 13].flatMap((bar) => [200, 175, 150, 125, 100].map((sf) => ({ bar, sf }))).filter((d) => area(d) < area(rb) - 1e-9).sort((p, q) => area(q) - area(p))[0];
    if (lighter) { m.setDetail({ ...rb, ...lighter }); expect(Math.max(m.results()['UR.sf'], m.results()['UR.sf.b'])).toBeGreaterThan(1); }
    const uni = designSection(m, screen, id('UB 457x191x89'), { ...base, studs: 'uniform' }, 'composite');
    expect(uni.pass).toBe(true);
    expect(uni.scB).toBe(uni.sc);
    expect(uni.studs).toBeGreaterThan(seg.studs); // uniform spacing over-provides the longer shear span
    // prefer-uniform: the uniform layout when one passes; segmented only where uniform cannot work
    const pref = designSection(m, screen, id('UB 457x191x89'), { ...base, studs: 'prefer-uniform' }, 'composite');
    expect([pref.layout, pref.sc, pref.studs]).toEqual(['uniform', uni.sc, uni.studs]);
    expect(seg.layout).toBe('segmented');
    // a cap below what the section needs rejects it; a rule camber is applied per section
    expect(designSection(m, screen, id('UB 457x191x89'), { ...base, etaMax: 0.45 }, 'composite').pass).toBe(false);
    const cam = designSection(m, screen, id('UB 457x191x89'), { ...base, camber: { pct: 100, min: 1, max: 100, step: 1, minSpan: 6 } }, 'composite');
    expect(cam.pass).toBe(true);
    expect(cam.camber).toBe(7); // self-weight deflection 7.5 mm on the steel alone
    expect(cam.deflection.ur).toBeLessThanOrEqual(seg.deflection.ur);
  }, 300_000);

  // Longitudinal shear, deck ribs parallel (EC4 §6.6.6.4 and Figure 6.16, EC2 §6.2.4), against a hand calculation:
  // a-a through the concrete above the deck, b-b around the studs from the flange, c-c from the rib edges at the crest inclined to the stud head.
  it('parallel deck: surfaces a-a, b-b and c-c match the hand calculation; the flow is capped at full connection', () => {
    const m = new CompositeModel(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8'));
    const set = (n: string, v: number) => m.setInput(m.inputs.find((f) => f.name === n)!.id, v);
    set('c_{deck}', 1); set('c_{par}', 1);
    m.setSection(sections.find((x) => x.name === 'UB 457x152x52')!.id);
    let r = m.results();
    // RF55, one layer Ø10 @ 150 on the deck, studs 19 x 100 at 125 / 200 mm, C30/37
    const PRd = Math.min((0.8 * 450 * Math.PI * 19 ** 2) / 4 / 1.25, (0.29 * 19 ** 2 * Math.sqrt(30 * 33000)) / 1.25) / 1000; // k_l = 1
    const vf = PRd / 0.125, ht = 95, lb = 2 * 100 + 32, lc = 2 * Math.hypot(100 - 55, (168 - 32) / 2) + 32, fsd = 500 / 1.15, nuf = 0.6 * (1 - 30 / 250) * 20, ab = (Math.PI * 100) / 4 / 0.15;
    const surf = (v: number) => { const rho = (0.999 * nuf) / v, cot = Math.min(2, Math.max(1, (rho + Math.sqrt(Math.max(rho * rho - 4, 0))) / 2)); return { cot, vRd: (nuf * cot) / (1 + cot * cot) }; };
    const va = vf / (2 * ht), a = surf(va), vb = vf / lb, b = surf(vb), vc = vf / lc, c = surf(vc);
    expect([r.lb, r.ccc]).toEqual([232, 1]);
    expect(r.lc).toBeCloseTo(195.08, 2); // inclined from the rib edges at the crest to the stud head (Figure 6.16)
    expect(r.vf).toBeCloseTo(vf, 6);
    expect(r['UR.L']).toBeCloseTo(va / a.vRd, 6); // 0.814
    expect(r['UR.sf']).toBeCloseTo(((va * ht) / a.cot / fsd) * 1000 / ab, 6); // 0.717: one layer, A_b only
    expect(r['UR.L.b']).toBeCloseTo(vb / b.vRd, 6); // 0.667
    expect(r['UR.sf.b']).toBeCloseTo(((vb * lb) / b.cot / fsd) * 1000 / (2 * ab), 6); // 0.717: the layer crossed twice
    expect(r['UR.L.c']).toBeCloseTo(vc / c.vRd, 6); // 0.793: shorter than b-b, so c-c governs the strut
    expect(r['UR.sf.c']).toBeCloseTo(((vc * lc) / c.cot / fsd) * 1000 / (2 * ab), 6); // 0.717
    expect(r['UR.des']).toBeLessThan(1); // passes with one layer Ø10 @ 150
    // studs beyond full connection add no shear: the flow stops at N_c,f over the shorter shear span
    set('s_{sc.A}', 95); set('s_{sc.B}', 95);
    r = m.results();
    expect(r.eta).toBe(1);
    expect(r.vf).toBeCloseTo(r.Ncf / r.xM, 6);
    expect(r.vf).toBeLessThan(PRd / 0.095);
  }, 120_000);

  it('tapered beam: section properties at a reduced depth match the geometry; checks combine at the critical sections', () => {
    const m = new CompositeModel(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8'));
    const set = (n: string, v: number) => m.setInput(m.inputs.find((f) => f.name === n)!.id, v);
    const base = m.results();
    const hl = base.h_a, b = base.b_a, tf = base.t_f, tw = base.t_w, rr = base.r;
    // independent I-section with four root fillets (fillet: area (1 − π/4) r², own I about its centroid 0.2234 r from the corner)
    const Af = (1 - Math.PI / 4) * rr ** 2, Iown = 0.0075 * rr ** 4;
    const Igeo = (h: number) => 2 * ((b * tf ** 3) / 12 + b * tf * ((h - tf) / 2) ** 2) + (tw * (h - 2 * tf) ** 3) / 12 + 4 * (Iown + Af * (h / 2 - tf - 0.2234 * rr) ** 2);
    const Wgeo = (h: number) => b * tf * (h - tf) + (tw * (h - 2 * tf) ** 2) / 4 + 4 * Af * (h / 2 - tf - 0.2234 * rr);
    expect(Igeo(hl) / 1e4 / base.I_a).toBeCloseTo(1, 2); // the library values come from the same geometry
    const h1 = 350;
    set('c_{tap}', 1); set('h_{A.in}', h1); set('h_{B.in}', h1); // uniform at the reduced depth
    const u1 = m.results();
    expect(u1.taper).toBeUndefined();
    expect(u1.h_a).toBeCloseTo(h1, 9);
    expect(u1.A_a).toBeCloseTo(base.A_a - (tw * (hl - h1)) / 100, 6);
    expect(u1.I_a / (base.I_a + (Igeo(h1) - Igeo(hl)) / 1e4)).toBeCloseTo(1, 3);
    expect(u1.W_pl / (base.W_pl + (Wgeo(h1) - Wgeo(hl)) / 1e3)).toBeCloseTo(1, 3);
    expect(u1.I_a).toBeLessThan(base.I_a);
    expect(u1['UR.des']).toBeGreaterThan(base['UR.des']);
    // tapered from h1 at A to the library depth at B
    set('h_{B.in}', 0);
    const t = m.results();
    expect(t.errors).toEqual([]);
    expect([t.taper, t.hA, t.hB]).toEqual([1, h1, hl]);
    // bending at x_M is the uniform result at the depth of x_M
    set('h_{A.in}', t['hat.M.2']); set('h_{B.in}', t['hat.M.2']);
    const uM = m.results();
    expect(t['UR.M.2']).toBeCloseTo(uM['UR.M.2'], 9);
    expect(t['at.M.2']).toBeCloseTo(t.xM, 9);
    // shear governs at the shallow end; the tapered beam sits between the uniform shallow and deep beams
    expect(t['at.V.2']).toBe(0);
    expect(t['UR.V.2']).toBeCloseTo(u1['UR.V.2'] * Math.abs(t.vectors.V[0]) / Math.max(Math.abs(t.vectors.V[0]), Math.abs(t.vectors.V.at(-1)!)), 9);
    for (const k of ['M.2', 'V.2', 'd.x', 'fn', 'UR.des'].map((k) => (k.startsWith('UR') ? k : `UR.${k}`))) {
      expect(t[k]).toBeLessThanOrEqual(u1[k] + 1e-9);
      expect(t[k]).toBeGreaterThanOrEqual(base[k] - 1e-9);
    }
    expect(governingCheck(t).ur).toBeGreaterThanOrEqual(t['UR.des'] - 1e-9);
  }, 300_000);

  it('page default case: UB 406x140x46 tapered to 300 mm, L = 5.2 m at 2 m, 200 mm slab, 60 kN SDL at 1 m', () => {
    const m = new CompositeModel(withPageDefaults(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8')));
    expect(sections.find((x) => x.id === m.sectionId)!.name).toBe('UB 406x140x46');
    expect(m.tables.map((t) => t.rows)).toEqual([[['G', '0', '5.2', '3', '1.35'], ['Q', '0', '5.2', '1.5', '1.5']], [['G', '1', '60', '1.35']]]);
    const r = m.results();
    expect(r.errors).toEqual([]);
    expect([r.taper, r.hA, r.L, r.h_c, r.comp]).toEqual([1, 300, 5.2, 200, 1]);
    expect(r['UR.des']).toBeCloseTo(0.717, 3);
    expect(governingCheck(r)).toMatchObject({ key: 'LT' });
    // §6.3.4, α_cr of the tapered beam, welded curve d (Table 6.4, h/b > 2 at the critical section)
    expect(governingCheck(r).ur).toBeCloseTo(1.028, 3);
    expect([r['alpha.LT'], r['at.LT']]).toEqual([0.76, expect.any(Number)]);
    expect(r['at.LT']).toBeCloseTo(2.34, 2); // the shallow side of mid-span: least W_pl f_y / M_Ed
    // hand check: λ̄ = √(α_ult,k / α_cr), χ (6.56), UR = 1 / (χ α_ult,k)
    const lam = Math.sqrt(r['aul.LT'] / r['acr.LT']), phi = 0.5 * (1 + 0.76 * (lam - 0.2) + lam ** 2);
    expect(r['UR.LT']).toBeCloseTo(1 / ((1 / (phi + Math.sqrt(phi ** 2 - lam ** 2))) * r['aul.LT']), 9);
    // the finite-element LTB reproduces the sheet's SN003b formula for a (nearly) uniform beam (same curve)
    const set = (n: string, v: number) => m.setInput(m.inputs.find((f) => f.name === n)!.id, v);
    set('c_{weld}', 0);
    const rolled = m.results();
    expect(rolled['UR.LT']).toBeCloseTo(0.848, 3); // rolled curve b
    set('h_{A.in}', 402.2);
    const near = m.results();
    set('c_{tap}', 0);
    const uni = m.results();
    expect(near.taper).toBe(1);
    expect(uni.taper).toBeUndefined();
    expect(near['UR.LT'] / uni['UR.LT']).toBeCloseTo(1, 2);
    // the worst-depth bound it replaces is higher
    expect(rolled['UR.LT']).toBeLessThan(0.912);
    expect(r['UR.LT']).toBeGreaterThan(uni['UR.LT']);
    // web under the 60 kN point load at the depth there, h(1 m) = 300 + 103.2 / 5.2 = 319.8 mm (not the worst depth):
    // EN 1993-1-5 (6.5), (6.10), (6.4), (6.3), independent of the sheet; F_Ed = 1.35 × 60 = 81 kN
    const ha = 300 + 103.2 / 5.2, bf = 142.2, tf = 11.2, tw = 6.8, fy = 355, Es = 210000, ss = 100;
    const hw = ha - 2 * tf, Fcr = (0.9 * 6 * Es * tw ** 3) / hw;
    let ly = ss + 2 * tf * (1 + Math.sqrt(bf / tw + 0.02 * (hw / tf) ** 2));
    if (Math.sqrt((ly * tw * fy) / Fcr) <= 0.5) ly = ss + 2 * tf * (1 + Math.sqrt(bf / tw));
    const FRd = (Math.min(1, 0.5 / Math.sqrt((ly * tw * fy) / Fcr)) * fy * ly * tw) / 1000; // 429.5 kN
    expect(r['UR.F.P']).toBeCloseTo(81 / FRd, 6); // 0.189
    expect([r['at.F.P'], r['at.FM'], r['at.FM.nc']]).toEqual([1, 1, 1]);
    expect(r['hat.F.P']).toBeCloseTo(ha, 9);
    // (7.2) with M_Rd,P and M_el,Rd of a run at that depth, M_P of the beam
    set('c_{tap}', 1); set('h_{A.in}', ha); set('h_{B.in}', ha);
    const atP = m.results();
    expect(atP.FRda).toBeCloseTo(FRd, 6);
    expect(r['UR.FM']).toBeCloseTo((81 / FRd + (0.8 * r.vectors.MP[0]) / atP.vectors.MRdP[0]) / 1.4, 9); // 0.328
    expect(r['UR.FM.nc']).toBeCloseTo((81 / FRd + (0.8 * r.vectors.MP[0]) / atP.MelRd) / 1.4, 9); // 0.472
  }, 120_000);

  it('LTB by finite elements for a uniform beam: FE internal forces = the sheet; M_cr used directly, close to SN003b', () => {
    const m = new CompositeModel(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8'));
    const set = (n: string, v: number) => m.setInput(m.inputs.find((f) => f.name === n)!.id, v);
    let r = m.results();
    step('construction, UDL on the top flange: FE M_cr within 1 % of SN003b (C1 1.127, C2 0.454)', () => {
      expect(r['Mcr.LT'] / r.McrSN).toBeGreaterThan(0.99);
      expect(r['Mcr.LT'] / r.McrSN).toBeLessThan(1.01);
      expect(r['UR.LT']).toBeCloseTo(1.872, 1);
    });
    step('FE internal forces of the design loads = the moment diagram of the sheet', () => {
      const L = r.L * 1000, b = solveBeam({ L, EI: () => 1, supports: [{ x: 0, w: true }, { x: L, w: true }], loads: m.feLoads(r)! });
      r.vectors.x.forEach((x, i) => expect(b.M(x * 1000) / 1e6).toBeCloseTo(r.vectors.M[i], 6));
    });
    step('bare steel unrestrained (studs too far apart): LT.nc by FE with the real moment diagram and point loads', () => {
      set('s_{sc.A}', 1200); set('s_{sc.B}', 1200);
      r = m.results();
      expect(r.LLTnc).toBeCloseTo(r.L * 1000, 6);
      expect(r['Mcr.LT.nc']).toBeGreaterThan(0);
      expect(r['UR.LT.nc']).toBeCloseTo(1 / (r['chi.LT.nc'] * r['aul.LT.nc']), 9);
    });
    step('the report carries the FE M_cr and reproduces the page UR', () => {
      const doc = m.reportDocument() as { shapes: { type: string; props: { latex?: string } }[] };
      const lat = doc.shapes.find((x) => x.type === 'math' && x.props.latex?.startsWith('M_{cr.FE}\\coloneq'))!.props.latex!;
      expect(Number(/coloneq ([\d.]+)/.exec(lat)![1])).toBeCloseTo(r['Mcr.LT'], 2);
      const rep = new CompositeModel(JSON.stringify(doc)).results();
      expect(rep.McrSheet).toBeCloseTo(r['Mcr.LT'], 2); // the sheet's own M_cr is now the FE value
    });
    step('braced construction (propped, k_LT): fork restraints at k_LT L, the moment of the span L unchanged', () => {
      const unbraced = m.results();
      set('c_{brace}', 1); set('k_{LT}', 0.5);
      const q = m.results();
      expect(q.M1).toBeCloseTo(unbraced.M1, 9); // w L² / 8 either way
      expect(q.LLT).toBeCloseTo(q.L / 2, 9);
      // FE M_cr of the whole span with a fork at mid-span: the half-span value with the mid-span part of the diagram
      expect(q['Mcr.LT']).toBeGreaterThan(2 * unbraced['Mcr.LT']);
      expect(q['UR.LT']).toBeLessThan(unbraced['UR.LT']);
      expect(q['Mcr.LT'] / q.McrSN).toBeGreaterThan(0.9); // SN003b on the braced segment (UDL C1, C2) is an approximation here
      set('c_{brace}', 0);
    });
    step('load position: shear centre and bottom flange raise M_cr, top flange is the default', () => {
      const top = r['Mcr.LT'];
      set('c_{zg}', 0); const sc = m.results()['Mcr.LT'];
      set('c_{zg}', -1); const bot = m.results()['Mcr.LT'];
      expect(top).toBeLessThan(sc);
      expect(sc).toBeLessThan(bot);
    });
  }, 120_000);
});

