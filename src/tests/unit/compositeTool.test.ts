import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CompositeModel } from '../../tools/composite/model';
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
    // per-row ULS factor: G rows at 1.0 instead of 1.35 lower M_Ed at 3 m by 0.35 (4.5·3·5/2 + 30·3·5/8) = 31.5 kNm
    const area = m.tables[0], pts0 = m.tables[1];
    m.setTableRows(area.id, [['G', '0', '8', '1.5', '1'], ['Q', '0', '8', '3', '1.5']]);
    m.setTableRows(pts0.id, [['G', '3', '30', '1'], ['Q', '3', '45', '1.5']]);
    expect(m.results().M2).toBeCloseTo(469.182 - 31.5, 2);
    m.setTableRows(area.id, [['G', '0', '8', '1.5', ''], ['Q', '0', '8', '3']]); // blank or missing factor: γ_G / γ_Q
    m.setTableRows(pts0.id, [['G', '3', '30'], ['Q', '3', '45']]);
    expect(m.results().M2).toBeCloseTo(469.182, 2);
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
});
