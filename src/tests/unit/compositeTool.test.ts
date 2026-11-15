import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECKS, CompositeModel, DEFLECTION_CHECKS, governingCheck } from '../../tools/composite/model';
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
    expect(dense['UR.L.b']).toBeCloseTo(1, 9); // the strut is used exactly at the chosen angle
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
    const out = m.optimizeSection('UB', (_i, _n, name) => seen.push(name));
    expect(out.best).not.toBeNull();
    expect(m.sectionId).toBe(out.best!.id);
    const r = m.results();
    expect(governingCheck(r).ur).toBeLessThanOrEqual(1);
    expect(out.best!.ur).toBeCloseTo(governingCheck(r).ur, 9);
    expect(seen).toHaveLength(out.tried);
    // every lighter UB tried before it fails (or cannot be evaluated)
    const lighter = sections.filter((s) => s.family === 'UB' && s.values.mass < out.best!.mass);
    expect(lighter.length).toBe(out.tried - 1);
    for (const s of lighter) { m.setSection(s.id); expect(governingCheck(m.results()).ur).toBeGreaterThan(1); }
    // depth limit: only sections with h ≤ h_max; the lightest of those that passes, lighter ones within the limit fail
    const lim = out.best!.id && sections.find((s) => s.id === out.best!.id)!.values.h - 1;
    const limited = m.optimizeSection('UB', undefined, lim);
    expect(limited.maxDepth).toBe(lim);
    if (limited.best) {
      expect(sections.find((s) => s.id === limited.best!.id)!.values.h).toBeLessThanOrEqual(lim);
      expect(limited.best.mass).toBeGreaterThanOrEqual(out.best!.mass);
      for (const s of sections.filter((x) => x.family === 'UB' && x.values.h <= lim && x.values.mass < limited.best!.mass)) { m.setSection(s.id); expect(governingCheck(m.results()).ur).toBeGreaterThan(1); }
    }
    expect(limited.total).toBe(sections.filter((x) => x.family === 'UB' && x.values.h <= lim).length);
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
    const fast = full.optimizeSection('UB', undefined, null, screen); const t2 = performance.now();
    expect(fast).toEqual(serial);
    expect(t2 - t1).toBeLessThan((t1 - t0) * 0.75);
  }, 600_000);
});

