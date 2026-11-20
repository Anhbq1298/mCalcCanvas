/**
 * Published worked examples that the mSteelBeamColumn worksheets reproduce. Each example is the page input
 * (section, material, member, one load combination) and the values printed in the source, read back
 * from the worksheet by name. Used by the page ("Verification examples"), its report, and the unit test.
 */
import { sections } from '../../engineering/steel/sections';
import { DEFAULT_MEMBER, type Combo, type Member } from './model';
import type { Shape } from './sections';

/** [label, worksheet name, display unit or null, printed value, compared (false: the source uses another method, shown only)] */
export type Published = [label: string, latex: string, unit: string | null, value: string, compared?: boolean];

export interface Example {
  id: string; title: string; source: string; url: string; note?: string;
  shape: Shape; section?: string; hollow?: { h?: number; b?: number; t: number; d?: number; cf: 0 | 1 };
  fyNom: number; fyBasis: 0 | 1; member: Partial<Member>; combo: Combo; published: Published[];
}

const P364 = 'https://www.steelconstruction.info/images/5/50/Sci_p364.pdf';
const P374 = 'https://www.steelconstruction.info/images/6/6b/SCI_P374.pdf';
const UR = (k: string) => `\\mathrm{UR}_{${k}}`;
const combo = (name: string, c: Partial<Combo>): Combo => ({ name, N: 0, My: 0, Mz: 0, Vz: 0, Vy: 0, ...c });

export const EXAMPLES: Example[] = [
  {
    id: 'p364-9', title: 'I/H compression: UC 356x368x129 S355 (Class 3), L = 6 m', shape: 'I', section: 'UC 356x368x129', fyNom: 355, fyBasis: 1,
    source: 'SCI P364 (2013), Example 9: Pinned column using Class 3 section', url: P364,
    member: { Ly: 6, Lz: 6, Llt: 6 }, combo: combo('P364 Ex 9', { N: 3500 }),
    published: [['f_y (16 < t ≤ 40 mm)', 'f_{y}', 'MPa', '345'], ['Class', '\\mathrm{Class}', null, '3'], ['N_c,Rd', 'N_{pl.Rd}', 'kN', '5658'], ['λ_z', '\\lambda_{z}', null, '0.82'], ['χ_z', '\\chi_{z}', null, '0.65'],
      ['N_b,z,Rd', 'N_{b.z.Rd}', 'kN', '3678'], ['λ_T', '\\lambda_{T}', null, '0.72'], ['χ_T', '\\chi_{T}', null, '0.71'], ['N_b,T,Rd', 'N_{b.T.Rd}', 'kN', '4017'], ['N_Ed / N_b,z,Rd', UR('b.z'), null, '0.95'], ['N_Ed / N_b,T,Rd', UR('b.T'), null, '0.87']],
  },
  {
    id: 'p364-10', title: 'I/H compression: UC 305x305x97 S275, pinned, intermediate z restraint', shape: 'I', section: 'UC 305x305x97', fyNom: 275, fyBasis: 1,
    source: 'SCI P364 (2013), Example 10: Pinned column with intermediate restraints', url: P364,
    member: { Ly: 6, Lz: 3, Llt: 3 }, combo: combo('P364 Ex 10', { N: 2850 }),
    published: [['Class', '\\mathrm{Class}', null, '2'], ['N_c,Rd', 'N_{pl.Rd}', 'kN', '3383'], ['λ_y', '\\lambda_{y}', null, '0.52'], ['χ_y', '\\chi_{y}', null, '0.87'],
      ['N_b,y,Rd', 'N_{b.y.Rd}', 'kN', '2943'], ['λ_z', '\\lambda_{z}', null, '0.45'], ['χ_z', '\\chi_{z}', null, '0.88'], ['N_b,T,Rd', 'N_{b.T.Rd}', 'kN', '2977'], ['N_Ed / N_b,y,Rd', UR('b.y'), null, '0.97']],
  },
  {
    id: 'p364-3', title: 'I/H bending + LTB: UB 457x191x67 S275, L_LT = 9 m, C1 = 2.65', shape: 'I', section: 'UB 457x191x67', fyNom: 275, fyBasis: 1,
    source: 'SCI P364 (2013), Example 3: Unrestrained beam with end bending moments', url: P364,
    note: 'C1 = M_cr / M_cr,uniform from LTBeam (355.7 / 134.2), entered as a user C1; k_c = 1/√C1.',
    member: { Ly: 9, Lz: 9, Llt: 9, nLT: 0, C1: 2.65, C2: 0 }, combo: combo('P364 Ex 3', { My: 260, Vz: 137 }),
    published: [['Class', '\\mathrm{Class}', null, '1'], ['V_c,Rd', 'V_{pl.z.Rd}', 'kN', '650'], ['M_c,Rd', 'M_{c.y.Rd}', 'kN m', '404'], ['M_cr', 'M_{cr}', 'kN m', '355.7'],
      ['λ_LT', '\\lambda_{LT}', null, '1.07'], ['χ_LT', '\\chi_{LT.0}', null, '0.60'], ['f', 'f_{LT}', null, '0.83'], ['χ_LT,mod', '\\chi_{LT}', null, '0.72'],
      ['M_b,Rd', 'M_{b.Rd}', 'kN m', '291'], ['M_Ed / M_b,Rd', UR('LT'), null, '0.89']],
  },
  {
    id: 'p364-11', title: 'I/H combined: UC 203x203x46 S275, N + My + Mz, L = 5 m', shape: 'I', section: 'UC 203x203x46', fyNom: 275, fyBasis: 1,
    source: 'SCI P364 (2013), Example 11: Biaxial bending and compression of a Class 1/2 section', url: P364,
    note: 'The source takes λ_LT from the simplified SCI P362 expression (0.76); the sheet uses M_cr from SN003b (λ_LT = 0.62, χ_LT = 1), so the LTB-dependent values are shown, not compared.',
    member: { Ly: 5, Lz: 5, Llt: 5, nLT: 5, Cmy: 0.6, Cmz: 0.6, CmLT: 0.6 }, combo: combo('P364 Ex 11', { N: 590, My: 30, Mz: 1 }),
    published: [['Class', '\\mathrm{Class}', null, '1'], ['N_pl,Rd', 'N_{pl.Rd}', 'kN', '1614.3'], ['M_pl,y,Rd', 'M_{pl.y.Rd}', 'kN m', '136.7'], ['M_pl,z,Rd', 'M_{pl.z.Rd}', 'kN m', '63.5'],
      ['a', 'a', null, '0.24'], ['M_N,y,Rd', 'M_{N.y.Rd}', 'kN m', '97.9'], ['M_N,z,Rd', 'M_{N.z.Rd}', 'kN m', '61.6'], ['(6.41)', UR('sec'), null, '0.09'],
      ['χ_y', '\\chi_{y}', null, '0.80'], ['χ_z', '\\chi_{z}', null, '0.47'], ['λ_LT', '\\lambda_{LT}', null, '0.76', false], ['χ_LT,mod', '\\chi_{LT}', null, '0.94', false],
      ['k_yy', 'k_{yy}', null, '0.73'], ['k_yz', 'k_{yz}', null, '0.75'], ['k_zy', 'k_{zy}', null, '0.78'], ['k_zz', 'k_{zz}', null, '1.25'], ['(6.61)', UR('6.61'), null, '0.64', false], ['(6.62)', UR('6.62'), null, '0.98', false]],
  },
  {
    id: 'nsc-2018', title: 'I/H combined: UB 457x152x82 S355, N = 800 kN, L = 4 m', shape: 'I', section: 'UB 457x152x82', fyNom: 355, fyBasis: 1,
    source: 'NSC Technical Digest 2018, p. 9: Interaction of axial force and bending (Annex B, full method)', url: 'https://newsteelconstruction.com/wp/wp-content/uploads/digi/NSCTechnicalDigest2018/page_9.html',
    member: { Ly: 4, Lz: 4, Llt: 4, nLT: 5, Cmy: 0.6, Cmz: 0.6, CmLT: 0.6 }, combo: combo('NSC 2018', { N: 800, My: 60, Mz: 15 }),
    published: [['N_b,y,Rd', 'N_{b.y.Rd}', 'kN', '3560'], ['N_b,z,Rd', 'N_{b.z.Rd}', 'kN', '1200'], ['M_b,Rd', 'M_{b.Rd}', 'kN m', '518'], ['M_c,z,Rd', 'M_{z.Rk1}', 'kN m', '82.8'],
      ['k_yy', 'k_{yy}', null, '0.61'], ['k_yz', 'k_{yz}', null, '0.70'], ['k_zy', 'k_{zy}', null, '0.81'], ['k_zz', 'k_{zz}', null, '1.16'], ['(6.61)', UR('6.61'), null, '0.42'], ['(6.62)', UR('6.62'), null, '0.97']],
  },
  {
    id: 'p374-2', title: 'SHS compression: 200x200x6.3 HF S355, L = 6 m', shape: 'RHS', hollow: { h: 200, b: 200, t: 6.3, cf: 0 }, fyNom: 355, fyBasis: 1,
    source: 'SCI P374 (2009), Example 2: Pin-ended column', url: P374, member: { Ly: 6, Lz: 6, Llt: 6 }, combo: combo('P374 Ex 2', { N: 920 }),
    published: [['Class', '\\mathrm{Class}', null, '2'], ['N_c,Rd', 'N_{pl.Rd}', 'kN', '1718'], ['λ', '\\lambda_{y}', null, '1.00'], ['χ', '\\chi_{y}', null, '0.67'], ['N_b,Rd', 'N_{b.y.Rd}', 'kN', '1151'], ['N_Ed / N_b,Rd', UR('b.y'), null, '0.80']],
  },
  {
    id: 'p374-3', title: 'RHS bending + LTB: 250x150x16 HF S355, span 5 m', shape: 'RHS', hollow: { h: 250, b: 150, t: 16, cf: 0 }, fyNom: 355, fyBasis: 1,
    source: 'SCI P374 (2009), Examples 3 and 4: Simply supported beam, restrained and unrestrained', url: P374,
    member: { Ly: 5, Lz: 5, Llt: 5, C1: 1.127 }, combo: combo('P374 Ex 3/4', { My: 182, Vz: 83 }),
    published: [['Class', '\\mathrm{Class}', null, '1'], ['V_pl,Rd', 'V_{pl.z.Rd}', 'kN', '1473'], ['M_c,Rd', 'M_{c.y.Rd}', 'kN m', '322'], ['M_Ed / M_c,Rd', UR('M.y'), null, '0.57'],
      ['I_T', 'I_{t}', 'cm^4', '8870'], ['λ_LT', '\\lambda_{LT}', null, '0.24'], ['χ_LT (λ_LT ≤ 0.4)', '\\chi_{LT}', null, '1']],
  },
  {
    id: 'p374-5', title: 'SHS combined: 150x150x6.3 HF S355, N + My + Mz, L = 3.5 m', shape: 'RHS', hollow: { h: 150, b: 150, t: 6.3, cf: 0 }, fyNom: 355, fyBasis: 1,
    source: 'SCI P374 (2009), Example 5: SHS subject to compression and bi-axial bending', url: P374,
    note: 'The sheet reports (6.41) as its α-th root; the printed left side is UR^α.',
    member: { Ly: 3.5, Lz: 3.5, Llt: 3.5, Cmy: 0.6, Cmz: 0.6 }, combo: combo('P374 Ex 5', { N: 600, My: 20, Mz: 5 }),
    published: [['Class', '\\mathrm{Class}', null, '1'], ['N_pl,Rd', 'N_{pl.Rd}', 'kN', '1271'], ['n', 'n', null, '0.47'], ['a_w', 'a_{w}', null, '0.47'], ['M_N,y,Rd', 'M_{N.y.Rd}', 'kN m', '47'],
      ['α = β', '\\alpha', null, '2.21'], ['(6.41) left side', `${UR('sec')}^{\\alpha}`, null, '0.16'], ['λ', '\\lambda_{y}', null, '0.79'], ['χ', '\\chi_{y}', null, '0.81'], ['N_b,Rd', 'N_{b.y.Rd}', 'kN', '1014'],
      ['k_yy = k_zz', 'k_{yy}', null, '0.81'], ['k_yz = k_zy', 'k_{yz}', null, '0.49'], ['(6.61)', UR('6.61'), null, '0.86'], ['(6.62)', UR('6.62'), null, '0.79']],
  },
  {
    id: 'p374-6', title: 'SHS combined: 150x150x5 HF S355 (Class 2), L_y = 3.6 m, L_z = 1.8 m', shape: 'RHS', hollow: { h: 150, b: 150, t: 5, cf: 0 }, fyNom: 355, fyBasis: 1,
    source: 'SCI P374 (2009), Example 6: Top chord in a lattice girder', url: P374,
    member: { Ly: 3.6, Lz: 1.8, Llt: 1.8, Cmy: 0.8 }, combo: combo('P374 Ex 6', { N: 525, My: 10.1, Vz: 11.2 }),
    published: [['Class', '\\mathrm{Class}', null, '2'], ['N_pl,Rd', 'N_{pl.Rd}', 'kN', '1019'], ['n', 'n', null, '0.52'], ['a_w', 'a_{w}', null, '0.48'], ['M_pl,y,Rd', 'M_{pl.y.Rd}', 'kN m', '55'],
      ['M_N,y,Rd', 'M_{N.y.Rd}', 'kN m', '35'], ['M_Ed / M_N,Rd', UR('sec'), null, '0.29'], ['χ_y', '\\chi_{y}', null, '0.80'], ['χ_z', '\\chi_{z}', null, '0.95'],
      ['k_yy', 'k_{yy}', null, '1.11'], ['k_zy', 'k_{zy}', null, '0.67'], ['(6.61)', UR('6.61'), null, '0.85'], ['(6.62)', UR('6.62'), null, '0.67']],
  },
  {
    id: 'dg-6-7', title: 'CHS compression: 244.5x10 S355, L = 4 m', shape: 'CHS', hollow: { d: 244.5, t: 10, cf: 0 }, fyNom: 355, fyBasis: 1,
    source: "Designers' Guide to EN 1993-1-1, Example 6.7, as reproduced by SDC Verifier", url: 'https://sdcverifier.com/benchmarks/eurocode-3-buckling-resistance-of-a-compression-member/',
    member: { Ly: 4, Lz: 4 }, combo: combo('DG Ex 6.7', { N: 1630 }),
    published: [['Class', '\\mathrm{Class}', null, '1'], ['N_c,Rd', 'N_{pl.Rd}', 'kN', '2616'], ['N_cr', 'N_{cr.y}', 'kN', '6571'], ['λ', '\\lambda_{y}', null, '0.63'], ['χ', '\\chi_{y}', null, '0.88'], ['N_b,Rd', 'N_{b.y.Rd}', 'kN', '2297']],
  },
  {
    id: 'staad-chs', title: 'CHS bending: 114.3x8 S275, span 6 m (EN recommended values)', shape: 'CHS', hollow: { d: 114.3, t: 8, cf: 0 }, fyNom: 275, fyBasis: 1,
    source: 'Bentley STAAD.Pro verification: EC3 Pipe Section with Concentrated Load', url: 'https://docs.bentley.com/LiveContent/web/STAAD.Pro%20Help-v2024/en/topics/Verification/09%20Steel%20Design/v-stpst_EC3_Pipe_Section_w_Conc_Load.html',
    member: { Ly: 6, Lz: 6 }, combo: combo('STAAD pipe', { My: 20, Vz: 10 }),
    published: [['Class', '\\mathrm{Class}', null, '1'], ['N_b,Rd', 'N_{b.y.Rd}', 'kN', '191.7'], ['M_c,Rd', 'M_{c.Rd}', 'kN m', '24.92'], ['V_pl,Rd', 'V_{pl.Rd}', 'kN', '269.9'],
      ['M_Ed / M_c,Rd', UR('M'), null, '0.803'], ['V_Ed / V_c,Rd', UR('V'), null, '0.037'], ['LTB (χ_LT = 1)', UR('LT'), null, '0.803']],
  },
];

export const exampleSectionId = (e: Example) => (e.section ? sections.find((s) => s.name === e.section)!.id : 0);
export const exampleMember = (e: Example): Member => ({ ...DEFAULT_MEMBER, ...e.member });

/** Agreement: within half a unit of the last printed digit, or 1.5 % (sources round intermediate values and use tabulated properties). */
export const TOLERANCE = 'half a unit of the last printed digit, or 1.5 %';
export function agrees(value: number, printed: string): boolean {
  const p = Number(printed), dec = printed.includes('.') ? printed.split('.')[1].length : 0;
  return Math.abs(value - p) <= Math.max(0.5 * 10 ** -dec + 1e-9, 0.015 * Math.abs(p));
}
