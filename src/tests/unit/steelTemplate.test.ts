import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { CalculationEngine } from '../../engine';
import { runBatchJob } from '../../engine/batch';
import { calcKey } from '../../canvas/engineBridge';
import { graphRegionId } from '../../canvas/graphData';
import { templateById } from '../../documents/templates';
import { sectionById, sections, validateSection } from '../../engineering/steel/sections';
import { customSectionValues, sectionDimensionError, customPropertyDefinition, sectionSymbols, type SectionDimensions } from '../../engineering/steel/customSection';
import { propertyKeys, sectionUnits } from '../../engineering/steel/sections';
import { applySteelSection, planSteelSection, savedCustomDimensions } from '../../canvas/steelSections';
import { loadShapes, undo, redo, useCanvasStore } from '../../canvas/model/canvasStore';
import { designSteel, rolledCurves, type SectionGeometry, type SteelInput } from '../reference/ec3';
import { ltbCoefficientCases } from '../reference/ltbCases';

const KNM = String.raw`\,\mathrm{kN}\cdot\mathrm{m}`;
/** Inputs are replaced by the start of their LaTeX (as the Parameters panel does). */
function evaluate(inputs: Record<string, string> = {}, custom?: SectionDimensions) {
  const tpl = templateById('steel-beam-column')!;
  const { shapes, inputResult } = tpl.instantiate!();
  if (custom) {
    const rec = Object.fromEntries(shapes.map(s => [s.id, s]));
    const section = shapes.find(s => s.type === 'math' && s.props.latex.startsWith('\\mathrm{Section}\\coloneq'))!;
    const patches = planSteelSection(rec, section.id, custom);
    for (const s of shapes) if (s.type === 'math' && patches[s.id]?.props) Object.assign(s.props, patches[s.id].props);
  }
  for (const s of shapes) {
    if (s.type !== 'math') continue;
    for (const [name, rhs] of Object.entries(inputs)) if (s.props.latex.startsWith(`${name}\\coloneq`)) s.props = { ...s.props, latex: `${name}\\coloneq ${rhs}` };
  }
  const rec = Object.fromEntries(shapes.map((x) => [x.id, x]));
  const e = new CalculationEngine({ unitSystem: 'SI' });
  const ids: string[] = [];
  const regions = shapes.flatMap((s) => (s.type === 'math' ? [{ id: s.id, latex: s.props.latex, order: calcKey(s, rec), displayUnit: s.props.displayUnit || null, precision: null }] : []));
  e.batch(() => {
    for (const r of regions) {
      e.setRegion(r.id, r);
      ids.push(r.id);
    }
    for (const s of shapes) {
      if (s.type !== 'graph') continue;
      s.props.series.forEach((ser, k) => {
        for (const f of ['x', 'y'] as const) {
          const rid = graphRegionId(s.id, ser.id, f);
          e.setRegion(rid, { latex: `${ser[f]}=`, order: [...calcKey(s, rec), k, f] as never, displayUnit: 'mm', precision: 8 });
          ids.push(rid);
        }
      });
    }
  });
  const find = (start: string) => shapes.find((x) => x.type === 'math' && x.props.latex.startsWith(start));
  /** Value of `name` in the given unit (kN, kN m; none for plain numbers), read through a probe region below the sheet. */
  const si = (name: string, unit = '') => {
    e.setRegion('probe', { latex: `${name}=`, order: [1e9] as never, displayUnit: unit || null, precision: null });
    const r = e.getResult('probe');
    if (r?.status !== 'valid') throw new Error(`${name}: ${r?.error?.message}`);
    return r.value!.number!;
  };
  const check = (start: string) => e.getResult(find(start)!.id)?.check?.pass;
  const member = () => e.getResult(inputResult.outputs.find(c => c.id === 'ok')!.regionId)?.check?.pass;
  return { e, si, check, member, regions, inputResult, errors: ids.filter((i) => e.getResult(i)?.status === 'error').map((i) => `${i}: ${e.getResult(i)?.error?.message}`) };
}
const UR = (name: string) => String.raw`\mathrm{UR}_{${name}}`;

/** The same member in the reference kernel (N, mm, MPa). */
function reference(sectionId: number, a: { N: number; My: number; Mz: number; Vz: number; Vy: number; Lcr: number; Llt: number; nLT: number; zg?: number; Cmy?: number; CmLT?: number }) {
  const s = sectionById(sectionId).values as unknown as SectionGeometry;
  const [alphaY, alphaZ, alphaLT] = rolledCurves(s)!;
  const input: SteelInput = {
    fy: 355, fu: 490, E: 210000, G: 81000, gamma0: 1, gamma1: 1, gamma2: 1.25, L: a.Lcr * 1000, Ky: 1, Kz: 1, Llt: a.Llt * 1000, Lt: a.Lcr * 1000,
    N: a.N * 1e3, My: a.My * 1e6, Mz: a.Mz * 1e6, Vy: a.Vy * 1e3, Vz: a.Vz * 1e3, alphaY, alphaZ, alphaLT,
    ltbMode: 0, loadCase: a.nLT - 1, loadHeight: a.zg ?? 0, k: 1, kw: 1, C1: 1, C2: 0, externalMcr: 0, interactionMode: 0,
    Cmy: a.Cmy ?? 1, Cmz: 1, CmLT: a.CmLT ?? 1, kyy: 1, kyz: 1, kzy: 1, kzz: 1, netArea: s.A, eta: 1.2, verifiedFactors: 1, ltbVerified: 0, curveVerified: 1, manualVerified: 0,
  };
  return designSteel(s, input);
}

describe('steel beam-column template (EN 1993-1-1)', () => {
  it('reproduces published worked examples and the reference kernel', () => {
    step('built-in section library: every record is consistent; IPE 360 against public tables', () => {
      expect(sections.flatMap((s) => validateSection(s).map((error) => `${s.name}: ${error}`))).toEqual([]);
      expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);
      expect(sectionById(1012).values.A / 7270).toBeCloseTo(1, 2);
      expect(sectionById(1012).values.Iy / 162700000).toBeCloseTo(1, 2);
    });

    step('custom I/H properties agree with independent three-rectangle integration and stay worksheet equations', () => {
      const d = { h: 600, b: 200, tf: 20, tw: 10 };
      const v = customSectionValues(d);
      // Python Fraction integration of three non-overlapping rectangles, mm / N units.
      const reference = { A: 13600, Iy: 819413333.3333334, Iz: 26713333.333333332, Wel_y: 2731377.777777778, Wel_z: 267133.3333333333,
        Wpl_y: 3104000, Wpl_z: 414000, It: 1253333.3333333333, Iw: 2242666666666.6665, Avy: 8000, Avz: 5600, mass: 106.76 };
      for (const [key, value] of Object.entries(reference)) expect(v[key as keyof typeof v], key).toBeCloseTo(value, 5);
      const e = new CalculationEngine();
      e.setRegion('section', { latex: '\\mathrm{Section}\\coloneq0', order: 0 });
      propertyKeys.forEach((key, i) => e.setRegion(key, { latex: customPropertyDefinition(key, d), order: i + 1, displayUnit: sectionUnits[key] }));
      for (const key of propertyKeys) {
        const result = e.getResult(key)!;
        expect(result.status, `${key}: ${result.error?.message}`).toBe('valid');
        if (v[key] === 0) expect(result.value?.number).toBe(0);
        else expect(result.value!.number! / v[key], sectionSymbols[key]).toBeCloseTo(1, 10);
      }
      for (const bad of [{ ...d, h: 40 }, { ...d, b: 10 }, { ...d, tf: 0 }, { ...d, tw: -1 }, { ...d, b: Infinity }, { ...d, h: NaN }]) {
        expect(sectionDimensionError(bad)).not.toBeNull();
        expect(() => customSectionValues(bad)).toThrow();
      }
    });

    step('custom selection is persistent worksheet input and one atomic, reversible change', () => {
      const shapes = templateById('steel-beam-column')!.shapes();
      loadShapes(shapes);
      const section = shapes.find(s => s.type === 'math' && s.props.latex.startsWith('\\mathrm{Section}\\coloneq'))!;
      const before = useCanvasStore.getState().shapes;
      const d = { h: 600, b: 200, tf: 20, tw: 10 };
      applySteelSection(section.id, d);
      expect(savedCustomDimensions(useCanvasStore.getState().shapes, section.id)).toEqual(d);
      undo();
      expect(useCanvasStore.getState().shapes).toEqual(before);
      redo();
      expect(savedCustomDimensions(useCanvasStore.getState().shapes, section.id)).toEqual(d);
      const custom = useCanvasStore.getState().shapes;
      expect(() => applySteelSection(section.id, { ...d, tf: 300 })).toThrow();
      expect(useCanvasStore.getState().shapes).toBe(custom);
      applySteelSection(section.id, 1015);
      expect(savedCustomDimensions(useCanvasStore.getState().shapes, section.id)).toBeNull();
      expect(useCanvasStore.getState().shapes[section.id]).toMatchObject({ props: { latex: '\\mathrm{Section}\\coloneq1015' } });
      const missing = { ...useCanvasStore.getState().shapes };
      const curve = Object.values(missing).find(s => s.type === 'math' && s.props.latex.startsWith('\\alpha_{LT}\\coloneq'))!;
      delete missing[curve.id];
      expect(() => planSteelSection(missing, section.id, d)).toThrow(/requires the section-property and buckling equations/);
      expect(useCanvasStore.getState().shapes[section.id]).toMatchObject({ props: { latex: '\\mathrm{Section}\\coloneq1015' } });
    });

    step('custom welded buckling curves follow Tables 6.2 and 6.4 at tf = 40 mm and h/b = 2', () => {
      for (const [d, expected] of [
        [{ h: 600, b: 300, tf: 40, tw: 15 }, [0.34, 0.49, 0.49]],
        [{ h: 600, b: 300, tf: 41, tw: 15 }, [0.49, 0.76, 0.49]],
        [{ h: 600, b: 200, tf: 20, tw: 10 }, [0.34, 0.49, 0.76]],
      ] as const) {
        const t = evaluate({}, d);
        expect(t.errors).toEqual([]);
        expect([t.si('\\alpha_{y}'), t.si('\\alpha_{z}'), t.si('\\alpha_{LT}')]).toEqual(expected);
        expect(t.si('A', 'mm^2')).toBeCloseTo(customSectionValues(d).A, 8);
      }
    });

    step('batch section overrides switch custom geometry and curves back to library data without leakage', () => {
      const d = { h: 600, b: 200, tf: 20, tw: 10 };
      const t = evaluate({}, d);
      const sectionId = t.inputResult.inputs.find(c => c.id === 'sec')!.regionId;
      const outputs = ['h', 'A', '\\alpha_{y}', '\\alpha_{LT}'].map(name => ({ columnId: name, regionId: t.regions.find(r => r.latex.startsWith(`${name}\\coloneq`))!.id }));
      const rows = [
        { id: 'custom', overrides: [{ regionId: sectionId, value: 0, unit: '' }] },
        { id: 'library', overrides: [{ regionId: sectionId, value: 1015, unit: '' }] },
      ];
      const job = { regions: t.regions.map(r => ({ id: r.id, input: r })), inputIds: [sectionId], rows, outputs };
      const forward = runBatchJob(job, {}), reverse = runBatchJob({ ...job, rows: [...rows].reverse() }, {});
      expect(forward).toEqual(reverse);
      expect(forward.custom.outputs['\\alpha_{y}']?.value?.number).toBe(0.34);
      expect(forward.custom.outputs['\\alpha_{LT}']?.value?.number).toBe(0.76);
      expect(forward.library.outputs['\\alpha_{y}']?.value?.number).toBe(0.21);
      expect(forward.library.outputs['\\alpha_{LT}']?.value?.number).toBe(0.34);
      for (const [row, h, area] of [['custom', d.h, customSectionValues(d).A], ['library', 500, sectionById(1015).values.A]] as const) {
        // Display units of the generated property table are mm / cm².
        expect(forward[row].outputs.h?.value?.number).toBe(h);
        expect(forward[row].outputs.A?.value?.number).toBeCloseTo(area / 100, 8);
      }
    });

    step('default Cm factors are unity with a visible conservative note and independently checked interaction sums', () => {
      const t = evaluate();
      expect(t.errors).toEqual([]);
      for (const name of ['C_{my}', 'C_{mz}', 'C_{mLT}']) expect(t.si(name)).toBe(1);
      const notes = templateById('steel-beam-column')!.shapes().filter(s => s.type === 'text').map(s => s.props.html).join(' ');
      expect(notes).toContain('Conservative defaults: Cmy = Cmz = CmLT = 1.0');
      expect(notes).toContain('Table B.3 for each relevant braced segment');
      // Independent Python arithmetic with HEB 320 catalogue geometry, N / mm / MPa.
      expect(t.si('k_{yy}')).toBeCloseTo(1.0679189408452014, 10);
      expect(t.si('k_{zy}')).toBeCloseTo(0.957128477993407, 10);
      expect(t.si(UR('6.61'))).toBeCloseTo(0.359413388769415, 10);
      expect(t.si(UR('6.62'))).toBeCloseTo(0.4617630209645871, 10);
      expect(t.si('\\delta_{scope}')).toBe(1);
      expect(t.member()).toBe(true);
    });

    step('JRC 2014 (Simões) Example 3 with published Cm factors, HEB 320 S355 beam-column: printed values', () => {
      const t = evaluate({ 'C_{my}': '0.43', 'C_{mLT}': '0.43' });
      expect(t.errors).toEqual([]);
      expect(t.si('\\mathrm{Class}')).toBe(1);
      expect(t.si('N_{c.Rd}', 'kN')).toBeCloseTo(5726, -1); // N_pl,Rd = 5726 kN
      expect(t.si('M_{c.y.Rd}', 'kN m')).toBeCloseTo(762.9, 0); // M_pl,y,Rd = 762.9 kNm
      expect(t.si('\\lambda_{y}')).toBeCloseTo(0.41, 2);
      expect(t.si('\\lambda_{z}')).toBeCloseTo(0.75, 2);
      expect(t.si('\\alpha_{y}')).toBe(0.34); // curve b
      expect(t.si('\\alpha_{z}')).toBe(0.49); // curve c
      expect(t.si('\\chi_{y}')).toBeCloseTo(0.92, 2);
      expect(t.si('\\chi_{z}')).toBeCloseTo(0.69, 2);
      expect(t.si('k_{yy}')).toBeCloseTo(0.46, 2);
      expect(t.si('k_{zy}')).toBeCloseTo(0.82, 2);
      // The example takes χLT = 1.00 (method of §6.3.2.3); the general method here gives 0.95, which moves the sums by < 0.005.
      expect(t.si(UR('6.61'))).toBeCloseTo(0.34, 2);
      expect(t.si(UR('6.62'))).toBeCloseTo(0.46, 2);
      expect(t.check('\\mathrm{UR}\\le1')).toBe(true);
    });

    step('Simões Example 1, HEB 340 S355 column, N = 3326 kN: λ, χ and N_b,Rd', () => {
      const t = evaluate({ '\\mathrm{Section}': '1212', 'N_{Ed}': String.raw`3326\,\mathrm{kN}`, 'M_{y.Ed}': `0${KNM}` });
      expect(t.errors).toEqual([]);
      expect(t.si('\\lambda_{y}')).toBeCloseTo(0.39, 2);
      expect(t.si('\\lambda_{z}')).toBeCloseTo(0.75, 2);
      expect(t.si('\\chi_{z}')).toBeCloseTo(0.69, 2);
      // Printed 4186.2 kN uses χ rounded to 0.69; unrounded χ gives 4194 kN.
      expect(Math.abs(t.si('N_{b.z.Rd}', 'kN') / 4186.2 - 1)).toBeLessThan(0.005);
      expect(t.check(`${UR('b.z')}\\le1`)).toBe(true);
    });

    step('Simões Example 2, IPE 400 S355 beam: Mcr, λLT, χLT (curve b) and M_b,Rd for both restraint cases', () => {
      const beam = { '\\mathrm{Section}': '1013', 'N_{Ed}': String.raw`0\,\mathrm{kN}`, 'M_{y.Ed}': `114.3${KNM}`, 'V_{z.Ed}': String.raw`75.9\,\mathrm{kN}`, 'n_{LT}': '0' };
      // (a) restrained at the supports only: C1 = 1.80, C2 = 1.60, load on the top flange (zg = 200 mm), L = 6 m.
      const a = evaluate({ ...beam, 'L_{LT}': String.raw`6\,\mathrm{m}`, 'C_{1.u}': '1.80', 'C_{2.u}': '1.60', 'z_{g}': String.raw`200\,\mathrm{mm}` });
      expect(a.errors).toEqual([]);
      expect(a.si('\\alpha_{LT}')).toBe(0.34); // h/b = 2.22 > 2
      expect(Math.abs(a.si('M_{cr}', 'kN m') / 164.7 - 1)).toBeLessThan(0.005);
      expect(a.si('\\lambda_{LT}')).toBeCloseTo(1.68, 2);
      expect(a.si('\\chi_{LT}')).toBeCloseTo(0.28, 2);
      expect(Math.abs(a.si('M_{b.Rd}', 'kN m') / 129.9 - 1)).toBeLessThan(0.02); // printed with χLT rounded to 0.28
      // (b) also restrained at mid-span: C1 = 2.6, L = 3 m.
      const b = evaluate({ ...beam, 'L_{LT}': String.raw`3\,\mathrm{m}`, 'C_{1.u}': '2.6', 'C_{2.u}': '0' });
      expect(Math.abs(b.si('M_{cr}', 'kN m') / 1778.8 - 1)).toBeLessThan(0.005);
      expect(b.si('\\lambda_{LT}')).toBeCloseTo(0.51, 2);
      expect(Math.abs(b.si('\\chi_{LT}') - 0.89)).toBeLessThan(0.015);
      expect(Math.abs(b.si('M_{b.Rd}', 'kN m') / 412.9 - 1)).toBeLessThan(0.015);
    });

    step('Dlubal KB 001622: Mcr = 1153.10 kNm with load height (SN003b case 10)', () => {
      const cm = (v: number, p: number) => String.raw`${v}\,\mathrm{cm}^${p}`;
      const t = evaluate({ 'I_z': cm(10140, 4), 'I_t': cm(292.5, 4), 'I_w': cm(2883000, 6), 'G': String.raw`80769.23\,\mathrm{MPa}`, 'L_{LT}': String.raw`6.5\,\mathrm{m}`, 'z_{g}': String.raw`180\,\mathrm{mm}`, 'n_{LT}': '10' });
      expect(t.si('C_{1}')).toBe(1.127);
      expect(t.si('C_{2}')).toBe(0.454);
      expect(t.si('M_{cr}', 'kN m')).toBeCloseTo(1153.1, 1);
    });

    step('C1/C2 table equals the reference transcription of SN003b Tables 3.1 and 3.2', () => {
      for (const c of ltbCoefficientCases) {
        const t = evaluate({ 'n_{LT}': String(c.id) });
        expect(t.si('C_{1}')).toBeCloseTo(c.c1, 10);
        expect(t.si('C_{2}')).toBeCloseTo(c.c2, 10);
      }
      const shapes = templateById('steel-beam-column')!.shapes();
      const diagrams = shapes.filter(s => s.type === 'image').map(s => Buffer.from(s.props.src.split(',')[1], 'base64').toString('utf8')).filter(svg => svg.includes('LTB cases'));
      expect(diagrams).toHaveLength(2);
      expect(diagrams.flatMap(svg => [...svg.matchAll(/id="ltb-case-(\d+)"/g)].map(match => Number(match[1])))).toEqual(ltbCoefficientCases.map(c => c.id));
      const t = evaluate();
      for (const [name, value] of [['C_{1.6}', '2.25'], ['C_{2.6}', '0.125']] as const) {
        const cell = t.regions.find(r => r.latex.startsWith(`${name}\\coloneq`))!;
        expect(cell).toBeDefined();
        t.e.setRegion(cell.id, { ...cell, latex: `${name}\\coloneq${value}` });
      }
      expect(t.si('C_{1}')).toBe(2.25);
      expect(t.si('C_{2}')).toBe(0.125);
    });

    step('buckling curves follow the section (regression: α was fixed at the HEB 320 values)', () => {
      const t = evaluate({ '\\mathrm{Section}': '1015' }); // IPE 500, h/b = 2.5
      expect([t.si('\\alpha_{y}'), t.si('\\alpha_{z}'), t.si('\\alpha_{LT}')]).toEqual([0.21, 0.34, 0.34]);
      for (const s of sections) {
        const curves = rolledCurves(s.values as unknown as SectionGeometry);
        if (!curves || s.id % 7) continue; // a spread of the catalogue
        const r = evaluate({ '\\mathrm{Section}': String(s.id) });
        expect([r.si('\\alpha_{y}'), r.si('\\alpha_{z}'), r.si('\\alpha_{LT}')], s.name).toEqual(curves);
      }
    });

    step('every result equals the independent reference kernel for mixed members and actions', () => {
      const cases = [
        { id: 1211, N: 1704, My: 24.8, Mz: 0, Vz: 0, Vy: 0, Lcr: 4.335, Llt: 4.335, nLT: 6, Cmy: 0.43, CmLT: 0.43 },
        { id: 1211, N: 1200, My: 150, Mz: 20, Vz: 60, Vy: 0, Lcr: 5, Llt: 5, nLT: 5 },
        { id: 1015, N: 300, My: 250, Mz: 10, Vz: 200, Vy: 0, Lcr: 4, Llt: 4, nLT: 10, zg: 250 },
        { id: 1013, N: 0, My: 110, Mz: 0, Vz: 600, Vy: 0, Lcr: 6, Llt: 6, nLT: 12 }, // high shear: ρ > 0
        { id: 1105, N: 500, My: 40, Mz: 15, Vz: 0, Vy: 30, Lcr: 3.5, Llt: 3.5, nLT: 1 },
        { id: 2206, N: 2000, My: 300, Mz: 0, Vz: 150, Vy: 0, Lcr: 4.5, Llt: 4.5, nLT: 3 }, // W14X90, r = 0
      ];
      for (const c of cases) {
        const t = evaluate({
          '\\mathrm{Section}': String(c.id), 'N_{Ed}': String.raw`${c.N}\,\mathrm{kN}`, 'M_{y.Ed}': `${c.My}${KNM}`, 'M_{z.Ed}': `${c.Mz}${KNM}`,
          'V_{z.Ed}': String.raw`${c.Vz}\,\mathrm{kN}`, 'V_{y.Ed}': String.raw`${c.Vy}\,\mathrm{kN}`, 'n_{LT}': String(c.nLT), 'z_{g}': String.raw`${c.zg ?? 0}\,\mathrm{mm}`,
          'C_{my}': String(c.Cmy ?? 1), 'C_{mLT}': String(c.CmLT ?? 1),
          ...Object.fromEntries(['L_{cr.y}', 'L_{cr.z}', 'L_{cr.T}'].map((k) => [k, String.raw`${c.Lcr}\,\mathrm{m}`])), 'L_{LT}': String.raw`${c.Llt}\,\mathrm{m}`,
        });
        const r = reference(c.id, c);
        const label = `${sectionById(c.id).name} N=${c.N}`;
        expect(t.errors, label).toEqual([]);
        expect([t.si('\\mathrm{Class}_{f}'), t.si('\\mathrm{Class}_{w}'), t.si('\\mathrm{Class}')], label).toEqual([r.flangeClass, r.webClass, r.sectionClass]);
        const same = (name: string, ref: number, unit = '') => expect(t.si(name, unit) / (unit === 'kN' ? ref / 1e3 : unit ? ref / 1e6 : ref), `${label} ${name}`).toBeCloseTo(1, 9);
        same('N_{c.Rd}', r.values.Nc, 'kN');
        same('V_{pl.z.Rd}', r.values.Vz, 'kN');
        same('V_{pl.y.Rd}', r.values.Vy, 'kN');
        expect(t.si('\\rho'), label).toBeCloseTo(r.values.rho, 10);
        if (r.sectionClass <= 3) {
          same('M_{c.y.Rd}', r.values.My, 'kN m');
          same('M_{c.z.Rd}', r.values.Mz, 'kN m');
          same(UR('sec'), r.values.sectionUr);
          for (const [name, key] of [['\\chi_{y}', 'chiY'], ['\\chi_{z}', 'chiZ'], ['\\chi_{T}', 'chiT'], ['\\chi_{LT}', 'chiLT']] as const) same(name, r.values[key]);
          same('M_{cr}', r.values.Mcr, 'kN m');
          same('M_{b.Rd}', r.values.Mb, 'kN m');
        }
        if (r.sectionClass <= 2 && c.N > 0 && t.si('\\lambda_{z}') >= 0.4) {
          for (const k of ['yy', 'yz', 'zy', 'zz']) same(`k_{${k}}`, r.values[`k${k}`]);
          same(UR('6.61'), r.values.iy);
          same(UR('6.62'), r.values.iz);
        }
      }
    });

    step('scope limits fail a check instead of passing silently', () => {
      expect(evaluate({ 'k': '0.5' }).check('\\delta_{LT}\\ge1')).toBe(false); // tabulated C1 with k ≠ 1
      expect(evaluate({ 'n_{LT}': '2.5' }).check('\\delta_{LT}\\ge1')).toBe(false); // no interpolation between cases
      expect(evaluate({ 'n_{LT}': '0', 'k': '0.5' }).check('\\delta_{LT}\\ge1')).toBe(true); // user C1, C2
      expect(evaluate({ 'f_{y}': String.raw`500\,\mathrm{MPa}` }).check('f_{y}\\le460')).toBe(false);
      expect(evaluate({ 'L_{cr.z}': String.raw`1\,\mathrm{m}` }).check('\\lambda_{z}\\ge0.4')).toBe(false);
      expect(evaluate({ '\\mathrm{Section}': '1' }).errors.join()).toMatch(/Unknown steel section/);
    });

    step('final member and batch decisions cannot pass invalid inputs or unsupported scope', () => {
      const cases: Record<string, string>[] = [
        { 'L_{cr.z}': String.raw`1\,\mathrm{m}` },
        { 'n_{LT}': '2.5' }, { 'k': '0.5' },
        { 'f_{y}': String.raw`500\,\mathrm{MPa}` },
        { 'N_{Ed}': String.raw`-100\,\mathrm{kN}` },
        { 'N_{Ed}': String.raw`0\,\mathrm{kN}`, 'M_{y.Ed}': `-1000${KNM}` },
        { 'M_{z.Ed}': `-1${KNM}` },
        { 'V_{y.Ed}': String.raw`-1\,\mathrm{kN}` },
        { 'V_{z.Ed}': String.raw`-1\,\mathrm{kN}` },
        { 'L_{cr.y}': String.raw`-4\,\mathrm{m}` },
        { 'L_{cr.T}': String.raw`-4\,\mathrm{m}` },
        { 'L_{LT}': String.raw`-4\,\mathrm{m}` },
        { 'C_{my}': '0.3' }, { 'C_{mz}': '1.1' }, { 'C_{mLT}': '0.2' },
        { 'V_{z.Ed}': String.raw`700\,\mathrm{kN}` },
        { 'V_{z.Ed}': String.raw`10\,\mathrm{kN}`, 'V_{y.Ed}': String.raw`10\,\mathrm{kN}` },
        { 'L_{cr.T}': String.raw`100\,\mathrm{m}` },
      ];
      for (const inputs of cases) {
        const t = evaluate(inputs);
        expect(t.si('\\delta_{scope}'), JSON.stringify(inputs)).toBe(0);
        expect(t.member(), JSON.stringify(inputs)).toBe(false);
      }
      const custom = evaluate({}, { h: 600, b: 200, tf: 20, tw: 10 });
      expect(custom.si('\\mathrm{Class}')).toBe(4);
      expect(custom.si('\\delta_{scope}')).toBe(0);
      expect(custom.member()).toBe(false);
      const compressionWeb = evaluate({ 'N_{Ed}': String.raw`100\,\mathrm{kN}`, 'M_{y.Ed}': `100${KNM}` }, { h: 600, b: 200, tf: 20, tw: 12 });
      expect(compressionWeb.si('\\mathrm{Class}')).toBe(1); // combined stress classification is insufficient for the compression web
      expect(compressionWeb.si('\\delta_{shear}')).toBe(1);
      expect(compressionWeb.si('\\delta_{section}')).toBe(0);
      expect(compressionWeb.member()).toBe(false);
      const beam = evaluate({ 'N_{Ed}': String.raw`0\,\mathrm{kN}` }, { h: 600, b: 200, tf: 10, tw: 15 });
      expect(beam.si('\\mathrm{Class}')).toBe(3);
      expect(beam.si('\\delta_{scope}')).toBe(1);
      expect(beam.member()).toBe(true);
      const overload = evaluate({ 'M_{y.Ed}': `1000${KNM}` });
      expect(overload.si('\\delta_{scope}')).toBe(1);
      expect(overload.si('\\mathrm{UR}')).toBeGreaterThan(1);
      expect(overload.member()).toBe(false);
      const invalidArithmetic: Record<string, string>[] = [
        { 'L_{cr.z}': String.raw`0\,\mathrm{m}` },
        { 'E': String.raw`0\,\mathrm{GPa}` },
        { '\\gamma_{M0}': '-1' },
        { 'n_{LT}': '0', 'C_{1.u}': '-1' },
      ];
      for (const inputs of invalidArithmetic) expect(evaluate(inputs).member(), JSON.stringify(inputs)).not.toBe(true);
      const t = evaluate();
      const inputId = t.inputResult.inputs.find(c => c.id === 'nlt')!.regionId;
      const rows = [{ id: 'valid', overrides: [] }, { id: 'invalid', overrides: [{ regionId: inputId, value: 2.5, unit: '' }] }];
      const r = runBatchJob({ regions: t.regions.map(r => ({ id: r.id, input: r })), inputIds: t.inputResult.inputs.map(c => c.regionId), rows, outputs: t.inputResult.outputs.filter(c => ['ok', 'scope'].includes(c.id)).map(c => ({ columnId: c.id, regionId: c.regionId })) }, {});
      expect(r.valid.outputs.ok?.check?.pass).toBe(true);
      expect(r.invalid.outputs.scope?.value?.number).toBe(0);
      expect(r.invalid.outputs.ok?.check?.pass).toBe(false);
    });

    step('section lookup rejects a dimensioned ID', () => {
      const t = evaluate();
      t.e.setRegion('bad', { latex: String.raw`\operatorname{sectionProp}(1\,\mathrm{m},0)=`, order: [1e9] as never });
      expect(t.e.getResult('bad')?.error?.code).toBe('unit-mismatch');
    });

    step('Table In&Out: section and actions per row, no leakage between rows in either order', () => {
      const t = evaluate();
      const col = (id: string) => t.inputResult.inputs.find((c) => c.id === id)!.regionId;
      const rows = [
        { id: 'a', overrides: [{ regionId: col('n'), value: 100, unit: 'kN' }, { regionId: col('sec'), value: 1012, unit: '' }] },
        { id: 'b', overrides: [{ regionId: col('n'), value: 300, unit: 'kN' }, { regionId: col('sec'), value: 1015, unit: '' }] },
      ];
      const job = { regions: t.regions.map((r) => ({ id: r.id, input: r })), inputIds: t.inputResult.inputs.map((c) => c.regionId), rows, outputs: t.inputResult.outputs.map((c) => ({ columnId: c.id, regionId: c.regionId })) };
      const forward = runBatchJob(job, {}), reverse = runBatchJob({ ...job, rows: [...rows].reverse() }, {});
      expect(forward).toEqual(reverse);
      expect(forward.a.outputs.ur?.value?.number).not.toBe(forward.b.outputs.ur?.value?.number);
    });
  });
});
