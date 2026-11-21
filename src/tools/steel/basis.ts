/**
 * How each piecewise worksheet value was decided, for the page's formula list: the branch in use
 * (as a formula) and the basis of the choice (clause, table, and the values that select it).
 * Only reads the sheet (q = value of a worksheet name); the numbers themselves stay the sheet's.
 */
import type { Member } from './model';
import type { Shape } from './sections';

export interface Basis { formula?: string; note: string }
type Q = (latex: string, unit?: string | null) => number;

const f = (x: number, d = 3) => (Number.isFinite(x) ? (+x.toFixed(d)).toString() : '–');
const CURVE: Record<string, string> = { '0.13': 'a0', '0.21': 'a', '0.34': 'b', '0.49': 'c', '0.76': 'd' };
const curveOf = (alpha: number) => CURVE[alpha.toFixed(2)] ?? '?';
const cls = (c: number) => (c <= 2 ? 'Class 1–2 (plastic column)' : 'Class 3 (elastic column)');

export function basisOf(name: string, shape: Shape, q: Q, m: Member, fyBasis: 0 | 1): Basis | null {
  const Class = q('\\mathrm{Class}');
  const susceptible = shape === 'I' && m.Llt > 0;
  switch (name) {
    case 'f_{y}': {
      const t = q('t_{max}', 'mm'), nom = q('f_{y.nom}', 'MPa');
      return fyBasis
        ? { note: `Product standard (EN 10025-2/-4, EN 10210-1, EN 10219-1; Singapore / UK NA): f_y,nom = ${f(nom, 0)} MPa, t_max = ${f(t, 1)} mm → step ${t <= 16 ? 't ≤ 16' : t <= 40 ? '16 < t ≤ 40' : t <= 63 ? '40 < t ≤ 63' : t <= 80 ? '63 < t ≤ 80' : '80 < t ≤ 100'} mm` }
        : { note: `EN 1993-1-1 Table 3.1: f_y,nom = ${f(nom, 0)} MPa, t_max = ${f(t, 1)} mm ${t <= 40 ? '≤ 40 mm → nominal' : '> 40 mm → reduced'}` };
    }
    case '\\mathrm{Class}': {
      if (shape === 'I') return { formula: '\\max\\left(\\mathrm{Class}_{f},\\mathrm{Class}_{w}\\right)', note: `Table 5.2: flange outstand c/(tε) = ${f(q('\\beta_{f}'), 2)} → Class ${f(q('\\mathrm{Class}_{f}'), 0)} (limits 9, 10, 14); web c/(tε) = ${f(q('\\beta_{w}'), 2)} with α = ${f(q('\\alpha_{w}'))}, ψ = ${f(q('\\psi_{w}'))} → Class ${f(q('\\mathrm{Class}_{w}'), 0)} (limits ${f(q('\\beta_{w1}'), 1)}, ${f(q('\\beta_{w2}'), 1)}, ${f(q('\\beta_{w3}'), 1)})` };
      if (shape === 'RHS') return { formula: '\\max\\left(\\mathrm{Class}_{h},\\mathrm{Class}_{b}\\right)', note: `Table 5.2, internal parts c = h − 3t, b − 3t: h walls c/(tε) = ${f(q('\\beta_{h}'), 2)} → Class ${f(q('\\mathrm{Class}_{h}'), 0)} (limits ${f(q('\\beta_{h1}'), 1)}, ${f(q('\\beta_{h2}'), 1)}, ${f(q('\\beta_{h3}'), 1)}); b walls c/(tε) = ${f(q('\\beta_{b}'), 2)} → Class ${f(q('\\mathrm{Class}_{b}'), 0)} (limits ${f(q('\\beta_{b1}'), 1)}, ${f(q('\\beta_{b2}'), 1)}, ${f(q('\\beta_{b3}'), 1)})` };
      return { note: `Table 5.2, tubular: d/(tε²) = ${f(q('\\beta_{d}'), 2)} against 50, 70, 90` };
    }
    case '\\rho': {
      const u = shape === 'CHS' ? q('\\mathrm{UR}_{V}') : Math.max(q('\\mathrm{UR}_{V.z}'), q('\\mathrm{UR}_{V.y}'));
      return u <= 0.5 ? { note: `§6.2.8(2): V_Ed / V_pl,Rd = ${f(u)} ≤ 0.5 → no reduction` } : { formula: '\\left(\\frac{2V_{Ed}}{V_{pl.Rd}}-1\\right)^2', note: `§6.2.8(3), (6.29): V_Ed / V_pl,Rd = ${f(u)} > 0.5; reduced f_y applied to the whole section` };
    }
    case 'M_{N.y.Rd}': {
      if (shape === 'I') {
        const N = Math.abs(q('N_{Ed}', 'kN')), NV = q('N_{V.Rd}', 'kN'), web = 0.5 * q('h_{w}', 'mm') * q('t_{w}', 'mm') * q('f_{y}', 'MPa') * (1 - q('\\rho')) / q('\\gamma_{M0}') / 1e3;
        return N <= 0.25 * NV && N <= web
          ? { formula: 'M_{pl.y.Rd}', note: `(6.33), (6.34): N_Ed = ${f(N, 1)} kN ≤ 0.25N_pl,Rd = ${f(0.25 * NV, 1)} and ≤ 0.5h_w t_w f_y/γ_M0 = ${f(web, 1)} → no reduction` }
          : { formula: '\\min\\left(M_{pl.y.Rd},M_{pl.y.Rd}\\frac{1-n}{1-0.5a}\\right)', note: `(6.36): N_Ed = ${f(N, 1)} kN exceeds the (6.33)/(6.34) limits (${f(0.25 * NV, 1)}, ${f(web, 1)} kN); a = ${f(q('a'))}` };
      }
      return { formula: '\\min\\left(M_{pl.y.Rd},M_{pl.y.Rd}\\frac{1-n}{1-0.5a_{w}}\\right)', note: `(6.39), rectangular hollow: a_w = (A − 2bt)/A ≤ 0.5 → ${f(q('a_{w}'))}` };
    }
    case 'M_{N.z.Rd}': {
      if (shape === 'I') {
        const N = Math.abs(q('N_{Ed}', 'kN')), web = q('h_{w}', 'mm') * q('t_{w}', 'mm') * q('f_{y}', 'MPa') * (1 - q('\\rho')) / q('\\gamma_{M0}') / 1e3, n = q('n'), a = q('a');
        return N <= web || n <= a
          ? { formula: 'M_{pl.z.Rd}', note: `(6.35) / (6.37): ${N <= web ? `N_Ed = ${f(N, 1)} kN ≤ h_w t_w f_y/γ_M0 = ${f(web, 1)} kN` : `n = ${f(n)} ≤ a = ${f(a)}`} → no reduction` }
          : { formula: 'M_{pl.z.Rd}\\left(1-\\left(\\frac{n-a}{1-a}\\right)^2\\right)', note: `(6.38): n = ${f(n)} > a = ${f(a)}` };
      }
      return { formula: '\\min\\left(M_{pl.z.Rd},M_{pl.z.Rd}\\frac{1-n}{1-0.5a_{f}}\\right)', note: `(6.40), rectangular hollow: a_f = (A − 2ht)/A ≤ 0.5 → ${f(q('a_{f}'))}` };
    }
    case 'M_{N.Rd}': return { note: 'SCI P363 §10.2.1 (Blue Book) for CHS, Class 1–2' };
    case '\\alpha': return shape === 'RHS' ? { note: `§6.2.9.1(6), rectangular hollow: α = β = 1.66/(1 − 1.13n²) ≤ 6 with n = ${f(q('n'))}` } : null;
    case '\\mathrm{UR}_{sec}': {
      const twoM = q('M_{y.Ed}', 'kN m') !== 0 && q('M_{z.Ed}', 'kN m') !== 0;
      if (Class > 2) return { formula: '\\mathrm{UR}_{el}', note: 'Class 3 → (6.42) elastic stresses' };
      if (q('n') >= 1) return { formula: 'n', note: 'n ≥ 1: the axial force alone exceeds the plastic resistance' };
      return { formula: '\\mathrm{UR}_{pl}', note: `Class 1–2 → §6.2.9.1 plastic: ${twoM ? `(6.41) with α = ${f(q('\\alpha'), 2)}, β = ${f(q('\\beta'), 2)}${shape === 'RHS' ? ', written as its α-th root' : ''}` : shape === 'CHS' ? 'resultant M_Ed / M_N,Rd ((6.41) with α = β = 2)' : '(6.31), one moment'}` };
    }
    case '\\alpha_{y}': case '\\alpha_{z}': {
      const a = q(name), ax = name.includes('y') ? 'y-y' : 'z-z';
      if (shape !== 'I') return { note: `Table 6.2, ${q('\\mathrm{CF}') >= 1 ? 'cold-formed → curve c' : `hot-finished → curve ${curveOf(a)}`} (both axes)` };
      return { note: `Table 6.2, ${q('\\mathrm{Section}') === 0 ? 'welded' : 'rolled'} I/H, h/b = ${f(q('h', 'mm') / q('b', 'mm'), 2)}, t_f = ${f(q('t_{f}', 'mm'), 1)} mm, f_y,nom = ${f(q('f_{y.nom}', 'MPa'), 0)} MPa, buckling about ${ax} → curve ${curveOf(a)}` };
    }
    case 'C_{1}': return shape === 'CHS' ? null : { note: m.c1Default ? 'Conservative default: C_1 = 1.0, C_2 = 0 (uniform moment)' : m.nLT > 0 ? `SCI NCCI SN003b Table ${m.nLT <= 9 ? '3.1' : '3.2'}, case ${m.nLT} (from the moment diagram)` : m.psi !== undefined ? `End moments ψ = ${m.psi}: SN003b Table 3.1, interpolated` : 'User value (moment diagram: other)' };
    case 'M_{cr}': {
      if (shape === 'RHS') return m.Llt > 0 ? { formula: '\\frac{C_{1}\\pi}{L_{LT}}\\sqrt{EI_{z}GI_{t}}', note: 'Closed section: warping neglected, load at the shear centre' } : { note: 'L_LT = 0: no LTB' };
      return m.Llt > 0 ? { formula: 'C_{1}N_{cr.LT}\\left(\\sqrt{\\frac{I_{w}}{I_{z}}+\\frac{GI_{t}}{N_{cr.LT}}+\\left(C_{2}z_{g}\\right)^2}-C_{2}z_{g}\\right)', note: `SCI NCCI SN003b eq. (1), fork supports, k = k_w = 1; N_cr,LT = π²EI_z/L_LT², C_2 = ${f(q('C_{2}'))}, z_g = ${f(m.zg, 1)} mm` } : { note: 'L_LT = 0: no LTB' };
    }
    case '\\lambda_{LT}': return m.Llt > 0 ? { formula: '\\sqrt{\\frac{W_{y}f_{y}}{M_{cr}}}', note: `(6.56); W_y = ${Class <= 2 ? 'W_pl,y (Class 1–2)' : 'W_el,y (Class 3)'}` } : { note: 'L_LT = 0: restrained' };
    case '\\chi_{LT}': {
      if (shape === 'CHS') return { note: '§6.3.2: circular hollow sections are not susceptible to LTB' };
      const lam = q('\\lambda_{LT}'), l0 = q('\\lambda_{LT.0}'), aLT = q('\\alpha_{LT}');
      const na = m.cNA >= 1;
      const curve = shape === 'I'
        ? (na ? `${q('\\mathrm{Section}') === 0 ? 'welded' : 'rolled'} I/H, h/b = ${f(q('h', 'mm') / q('b', 'mm'), 2)} → curve ${curveOf(aLT)}` : `Table 6.4 → curve ${curveOf(aLT)}`)
        : (na ? `${q('\\mathrm{CF}') >= 1 ? 'cold-formed' : 'hot-finished'} hollow, h/b = ${f(q('h', 'mm') / q('b', 'mm'), 2)} → curve ${curveOf(aLT)}` : 'Table 6.4, other sections → curve d');
      if (lam <= l0) return { formula: '1', note: `${na ? '§6.3.2.3' : '§6.3.2.2'}: λ_LT = ${f(lam)} ≤ λ_LT,0 = ${f(l0, 2)} → no reduction` };
      return na
        ? { formula: '\\min\\left(1,\\frac{1}{\\lambda_{LT}^2},\\frac{\\chi_{LT.0}}{f_{LT}}\\right)', note: `§6.3.2.3 with the Singapore / UK NA: λ_LT,0 = 0.4, β = 0.75, ${curve}; (6.58) f = ${f(q('f_{LT}'))} with k_c = 1/√C1 = ${f(q('k_{c}'))}; χ_LT = ${f(q('\\chi_{LT.0}'))}` }
        : { formula: '\\min\\left(1,\\frac{1}{\\Phi_{LT}+\\sqrt{\\Phi_{LT}^2-\\lambda_{LT}^2}}\\right)', note: `§6.3.2.2 general case: λ_LT,0 = 0.2, β = 1, ${curve}` };
    }
    case 'k_{yy}': return Class <= 2
      ? { formula: 'C_{my}\\left(1+\\min\\left(\\lambda_{y}-0.2,0.8\\right)n_{y}\\right)', note: `Annex B Table B.1, ${cls(Class)}: C_my(1 + (λ_y − 0.2)n_y) ≤ C_my(1 + 0.8n_y); λ_y = ${f(q('\\lambda_{y}'))}, n_y = ${f(q('n_{y}'))}, C_my = ${m.Cmy}` }
      : { formula: 'C_{my}\\left(1+\\min\\left(0.6\\lambda_{y},0.6\\right)n_{y}\\right)', note: `Annex B Table B.1, ${cls(Class)}: C_my(1 + 0.6λ_y n_y) ≤ C_my(1 + 0.6n_y); λ_y = ${f(q('\\lambda_{y}'))}, n_y = ${f(q('n_{y}'))}, C_my = ${m.Cmy}` };
    case 'k_{zz}': {
      const z = `λ_z = ${f(q('\\lambda_{z}'))}, n_z = ${f(q('n_{z}'))}, C_mz = ${m.Cmz}`;
      if (Class > 2) return { formula: 'C_{mz}\\left(1+\\min\\left(0.6\\lambda_{z},0.6\\right)n_{z}\\right)', note: `Annex B Table B.1, ${cls(Class)}: C_mz(1 + 0.6λ_z n_z) ≤ C_mz(1 + 0.6n_z); ${z}` };
      return shape === 'I'
        ? { formula: 'C_{mz}\\left(1+\\min\\left(2\\lambda_{z}-0.6,1.4\\right)n_{z}\\right)', note: `Annex B Table B.1, ${cls(Class)}, I/H: C_mz(1 + (2λ_z − 0.6)n_z) ≤ C_mz(1 + 1.4n_z); ${z}` }
        : { formula: 'C_{mz}\\left(1+\\min\\left(\\lambda_{z}-0.2,0.8\\right)n_{z}\\right)', note: `Annex B Table B.1, ${cls(Class)}, hollow: C_mz(1 + (λ_z − 0.2)n_z) ≤ C_mz(1 + 0.8n_z); ${z}` };
    }
    case 'k_{yz}': return Class <= 2 ? { formula: '0.6k_{zz}', note: `Annex B Table B.1, ${cls(Class)}: k_yz = 0.6k_zz` } : { formula: 'k_{zz}', note: `Annex B Table B.1, ${cls(Class)}: k_yz = k_zz` };
    case 'k_{zy}': {
      if (!susceptible) return Class <= 2
        ? { formula: '0.6k_{yy}', note: `Annex B Table B.1 (${shape === 'I' ? 'L_LT = 0: not susceptible to torsional deformation' : 'hollow section: not susceptible to torsional deformation'}), ${cls(Class)}: k_zy = 0.6k_yy` }
        : { formula: '0.8k_{yy}', note: `Annex B Table B.1 (${shape === 'I' ? 'L_LT = 0: not susceptible to torsional deformation' : 'hollow section: not susceptible to torsional deformation'}), ${cls(Class)}: k_zy = 0.8k_yy` };
      const z = `λ_z = ${f(q('\\lambda_{z}'))}, n_z = ${f(q('n_{z}'))}, C_mLT = ${m.CmLT}`;
      if (Class > 2) return { formula: '\\max\\left(1-\\frac{0.05\\lambda_{z}n_{z}}{C_{mLT}-0.25},1-\\frac{0.05n_{z}}{C_{mLT}-0.25}\\right)', note: `Annex B Table B.2 (I/H with L_LT > 0: susceptible to torsional deformation), ${cls(Class)}; ${z}` };
      return q('\\lambda_{z}') >= 0.4
        ? { formula: '\\max\\left(1-\\frac{0.1\\lambda_{z}n_{z}}{C_{mLT}-0.25},1-\\frac{0.1n_{z}}{C_{mLT}-0.25}\\right)', note: `Annex B Table B.2 (I/H with L_LT > 0), ${cls(Class)}, λ_z ≥ 0.4; ${z}` }
        : { formula: '\\min\\left(0.6+\\lambda_{z},1-\\frac{0.1\\lambda_{z}n_{z}}{C_{mLT}-0.25}\\right)', note: `Annex B Table B.2 (I/H with L_LT > 0), ${cls(Class)}, λ_z < 0.4; ${z}` };
    }
    case 'n_{y}': case 'n_{z}': return q('N_{Ed}', 'kN') <= 0 ? { note: 'Tension: no compression buckling, N_c,Ed = 0' } : null;
    default: return null;
  }
}
