import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAR_DIAMETERS, CHECKS, CompositeModel, DEFLECTION_CHECKS, governingCheck, governingSplit, STUD_SPACINGS } from '../../tools/composite/model';
import { sections } from '../../engineering/steel/sections';
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
    m.setInput(sA, 80);
    const dense = m.results();
    expect(dense.ctb).toBeGreaterThan(1);
    expect(dense.ctb).toBeLessThan(2);
    expect(dense['UR.L.b']).toBeCloseTo(0.999, 9); // the strut is used to its limit, less the 0.1 % rounding margin
    expect(dense.asbReq).toBeCloseTo((dense.vf * 1000) / (dense.fsd * dense.ctb), 3); // (6.21), mm²/m
    m.setInput(sA, 125);
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
    expect([solid.cdeck, solid.hpe, solid.kd, solid.nre, solid.cbb]).toEqual([0, 0, 1, 1, 1]);
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
});

