import { describe, expect, it } from 'vitest';
import { cmOf, cmValues } from '../../tools/steel/cm';

// EN 1993-1-1 Table B.3 rows, hand values
describe('C_m, EN 1993-1-1 Table B.3', () => {
  const c = (d: Parameters<typeof cmOf>[0]) => cmOf(d).cm;
  it('linear diagram', () => {
    expect(c({ kind: 'linear', MA: 100, MB: 100 })).toBeCloseTo(1.0, 6);
    expect(c({ kind: 'linear', MA: 100, MB: 0 })).toBeCloseTo(0.6, 6);
    expect(c({ kind: 'linear', MA: 100, MB: -50 })).toBeCloseTo(0.4, 6);
    expect(c({ kind: 'linear', MA: -20, MB: 80 })).toBeCloseTo(0.6 + 0.4 * -0.25, 6); // larger end decides M_h
  });
  it('span moment governs (row 3)', () => {
    expect(c({ kind: 'udl', MA: 0, MB: 0, Ms: 125 })).toBeCloseTo(0.95, 6);
    expect(c({ kind: 'point', MA: 0, MB: 0, Ms: 100 })).toBeCloseTo(0.9, 6);
    // propped: M_h = −50 at one end, M_s = 80 → α_h = −0.625, ψ = 0
    expect(c({ kind: 'udl', MA: -50, MB: 0, Ms: 80 })).toBeCloseTo(0.95 + 0.05 * -0.625, 6);
    // ψ = −1 with α_h < 0: factor (1 + 2ψ) = −1
    expect(c({ kind: 'point', MA: -40, MB: 40, Ms: 100 })).toBeCloseTo(0.9 + 0.1 * -0.4 * -1, 6); // EN 1993-1-1:2022: 0.90 + 0.10α_h(1 + 2ψ)
    // continuous with the ψ ≥ 0 row at ψ = 0
    expect(c({ kind: 'point', MA: -40, MB: -1e-9, Ms: 100 })).toBeCloseTo(c({ kind: 'point', MA: -40, MB: 0, Ms: 100 }), 6);
    expect(c({ kind: 'udl', MA: -40, MB: 40, Ms: 100 })).toBeCloseTo(0.95 + 0.05 * -0.4 * -1, 6);
  });
  it('end moment governs (row 2)', () => {
    // fixed ends, UDL: M_h = −wL²/12, M_s = +wL²/24 → α_s = −0.5, ψ = 1
    expect(c({ kind: 'udl', MA: -100, MB: -100, Ms: 50 })).toBeCloseTo(0.5, 6);
    // fixed ends, mid-point load: α_s = −1
    expect(c({ kind: 'point', MA: -100, MB: -100, Ms: 100 })).toBeCloseTo(0.8, 6);
    expect(c({ kind: 'udl', MA: 100, MB: 40, Ms: 60 })).toBeCloseTo(0.2 + 0.8 * 0.6, 6);
    expect(c({ kind: 'udl', MA: 100, MB: 40, Ms: 10 })).toBeCloseTo(0.4, 6); // floor
    // ψ < 0, α_s < 0
    expect(c({ kind: 'udl', MA: -100, MB: 50, Ms: 30 })).toBeCloseTo(Math.max(0.4, 0.1 * 1.5 + 0.8 * 0.3), 6);
    expect(c({ kind: 'point', MA: -100, MB: 50, Ms: 60 })).toBeCloseTo(Math.max(0.4, 0.2 * 0.5 + 0.8 * 0.6), 6);
  });
  it('fixed values', () => {
    expect(c({ kind: 'sway' })).toBe(0.9);
    expect(c({ kind: 'one' })).toBe(1);
  });
});

describe('C_m applied values', () => {
  it('calc off → all 1.0; on → per factor, C_mLT may follow C_my', () => {
    expect(cmValues(undefined)).toEqual({ Cmy: 1, Cmz: 1, CmLT: 1 });
    expect(cmValues({ calc: false, y: { kind: 'linear', MA: 1, MB: 0 } })).toEqual({ Cmy: 1, Cmz: 1, CmLT: 1 });
    expect(cmValues({ calc: true, y: { kind: 'one' }, z: { kind: 'sway' }, LT: { kind: 'linear', MA: 100, MB: 0 } })).toEqual({ Cmy: 1, Cmz: 0.9, CmLT: 0.6 });
    expect(cmValues({ calc: true, y: { kind: 'udl', MA: -100, MB: -100, Ms: 50 }, LT: 'y' })).toEqual({ Cmy: 0.5, Cmz: 1, CmLT: 0.5 });
  });
});

