/**
 * EN 1993-1-1:2005 + A1:2014 only. N in N, lengths in mm, stresses in MPa.
 * No React, hidden worksheet state, rounding or relaxed acceptance comparisons.
 * Sources/applicability: docs/steel-design/TECHNICAL.md.
 */
export type DesignState = 'PASS' | 'FAIL' | 'NOT VERIFIED';
export interface SectionGeometry {
  h: number; b: number; tw: number; tf: number; r: number; A: number;
  Iy: number; Iz: number; Wel_y: number; Wel_z: number; Wpl_y: number; Wpl_z: number;
  It: number; Iw: number; Avy: number; Avz: number;
}
export interface SteelInput {
  fy: number; fu: number; E: number; G: number; gamma0: number; gamma1: number; gamma2: number;
  L: number; Ky: number; Kz: number; Llt: number; Lt: number;
  N: number; My: number; Mz: number; Vy: number; Vz: number;
  alphaY: number; alphaZ: number; alphaLT: number;
  ltbMode: number; loadCase: number; loadHeight: number; k: number; kw: number;
  C1: number; C2: number; externalMcr: number;
  interactionMode: number; Cmy: number; Cmz: number; CmLT: number;
  kyy: number; kyz: number; kzy: number; kzz: number;
  slsMode: number; q: number; P: number; displacement: number; limitRatio: number;
  netArea: number; eta: number; verifiedFactors: number; ltbVerified: number; curveVerified: number; manualVerified: number;
}
export interface DesignCheck {
  name: string; clause: string; demand: number; resistance: number | null;
  ur: number | null; state: DesignState; reason?: string;
}
export interface SteelResult {
  checks: DesignCheck[]; state: DesignState; governing: string; governingUr: number;
  sectionClass: number; flangeClass: number; webClass: number;
  values: Record<string, number>; limitations: string[];
}
const positive = (x: number) => Number.isFinite(x) && x > 0;
const classify = (ratio: number, limits: number[]) => 1 + limits.filter(x => ratio > x).length;
/** §6.3.1.2 (6.49)-(6.50); also general LTB §6.3.2.2. */
export function reduction(lambda: number, alpha: number): number {
  if (!Number.isFinite(lambda) || lambda < 0 || !positive(alpha)) throw new Error('Invalid buckling slenderness or imperfection factor');
  const phi = 0.5 * (1 + alpha * (lambda - 0.2) + lambda ** 2);
  return Math.min(1, 1 / (phi + Math.sqrt(Math.max(0, phi ** 2 - lambda ** 2))));
}
/** NCCI SN003b, doubly symmetric sections, fork ends; zg positive destabilizing. */
export function criticalMoment(s: SectionGeometry, a: Pick<SteelInput, 'E'|'G'|'Llt'|'k'|'kw'|'C1'|'C2'|'loadHeight'>): number {
  for (const v of [a.E, a.G, a.Llt, a.k, a.kw, a.C1, s.Iz, s.It, s.Iw]) if (!positive(v)) throw new Error('Mcr requires positive stiffness, lengths, C1 and boundary factors');
  const t = Math.PI ** 2 * a.E * s.Iz / (a.k * a.Llt) ** 2;
  const z = a.C2 * a.loadHeight;
  return a.C1 * t * (Math.sqrt((a.k / a.kw) ** 2 * s.Iw / s.Iz + a.G * s.It / t + z ** 2) - z);
}
/** Tables 6.2 and 6.3, rolled I/H, S235-S420. Other branches require explicit inputs. */
export function rolledCurves(s: SectionGeometry): [number, number, number] | null {
  if (s.tf > 100) return null;
  const yz: [number, number] = s.h / s.b > 1.2 ? (s.tf <= 40 ? [0.21, 0.34] : [0.34, 0.49]) : [0.34, 0.49];
  return [...yz, s.h / s.b <= 2 ? 0.21 : 0.34];
}
/** Annex B Tables B.1/B.2 plastic I sections, lambdaZ >= 0.4 branch. */
export function method2(ny: number, nz: number, ly: number, lz: number, cmy: number, cmz: number, cmLT: number): [number, number, number, number] | null {
  if (lz < 0.4 || cmLT <= 0.25 || [cmy, cmz, cmLT].some(v => v < 0.4 || v > 1)) return null;
  const kyy = cmy * (1 + Math.min(ly - 0.2, 0.8) * ny);
  const kzz = cmz * (1 + Math.min(2 * lz - 0.6, 1.4) * nz);
  const kzy = Math.max(1 - 0.1 * lz / (cmLT - 0.25) * nz, 1 - 0.1 / (cmLT - 0.25) * nz);
  return [kyy, 0.6 * kzz, kzy, kzz];
}
export function designSteel(s: SectionGeometry, a: SteelInput): SteelResult {
  for (const [k, v] of Object.entries({...s, ...a})) if (!Number.isFinite(v)) throw new Error(`Non-finite steel input ${k}`);
  for (const k of ['h','b','tw','tf','A','Iy','Iz','Wel_y','Wel_z','Wpl_y','Wpl_z','It','Iw','Avy','Avz'] as const) if (!positive(s[k])) throw new Error(`Positive ${k} required`);
  for (const k of ['fy','fu','E','G','gamma0','gamma1','gamma2','L','Ky','Kz','Llt','Lt','alphaY','alphaZ','alphaLT','limitRatio','eta'] as const) if (!positive(a[k])) throw new Error(`Positive ${k} required`);
  if (s.r < 0 || s.h <= 2 * (s.tf + s.r) || s.b <= s.tw + 2 * s.r || a.netArea <= 0 || a.netArea > s.A) throw new Error('Invalid section geometry or net area');
  if (a.fy > a.fu || a.fy > 460) throw new Error('fy must not exceed fu or the steel strength scope (460 MPa)');
  const checks: DesignCheck[] = [], limitations: string[] = [], values: Record<string, number> = {};
  const check = (name: string, clause: string, demand: number, resistance: number | null, reason?: string) => {
    const ur = resistance !== null && resistance > 0 ? Math.abs(demand) / resistance : resistance === 0 && demand !== 0 ? 1e100 : resistance === 0 ? 0 : null;
    checks.push({ name, clause, demand, resistance, ur, state: reason || ur === null ? 'NOT VERIFIED' : ur <= 1 ? 'PASS' : 'FAIL', ...(reason ? {reason} : {}) });
    if (reason) limitations.push(`${name}: ${reason}`);
  };
  const eps = Math.sqrt(235 / a.fy), c = s.h - 2 * (s.tf + s.r);
  // Uniform compression flange is conservative for every stress gradient (Table 5.2 sheet 2).
  const flangeClass = classify((s.b - s.tw - 2 * s.r) / (2 * s.tf), [9,10,14].map(x => x * eps));
  // Plastic web stress-block alpha; uniform compression when biaxial bending requires a conservative bound.
  const alpha = Math.min(1, Math.max(0, (1 + a.N / (c * s.tw * a.fy)) / 2));
  const bend = Math.abs(a.My) > 0 && a.Mz === 0;
  const al = bend ? alpha : 1;
  const l1 = al > 0.5 ? 396 / (13 * al - 1) : 36 / Math.max(al, 1e-12);
  const l2 = al > 0.5 ? 456 / (13 * al - 1) : 41.5 / Math.max(al, 1e-12);
  const stress = a.N / s.A, gradient = Math.abs(a.My) * c / (2 * s.Iy);
  const maxStress = stress + gradient;
  const psi = maxStress > 0 ? Math.max(-3, (stress - gradient) / maxStress) : -3;
  const l3 = bend ? (psi > -1 ? 42 / (0.67 + 0.33 * psi) : 62 * (1 - psi) * Math.sqrt(-psi)) : 42;
  const webClass = maxStress <= 0 && a.Mz === 0 ? 1 : classify(c / s.tw, [l1,l2,l3].map(x => x * eps));
  const sectionClass = Math.max(flangeClass, webClass);
  const unsupported = sectionClass === 4 && (a.N > 0 || a.My !== 0 || a.Mz !== 0) ? 'CLASS 4 SECTION — effective section not implemented' : undefined;
  const Wy = sectionClass <= 2 ? s.Wpl_y : s.Wel_y, Wz = sectionClass <= 2 ? s.Wpl_z : s.Wel_z;
  const Nc = s.A * a.fy / a.gamma0, Nt = Math.min(Nc, 0.9 * a.netArea * a.fu / a.gamma2);
  const Vy = s.Avy * a.fy / Math.sqrt(3) / a.gamma0, Vz = s.Avz * a.fy / Math.sqrt(3) / a.gamma0;
  const vy = Math.abs(a.Vy) / Vy, vz = Math.abs(a.Vz) / Vz;
  const shearSlender = (s.h - 2 * s.tf) / s.tw > 72 * eps / a.eta;
  const shearReason = shearSlender && a.Vz !== 0 ? 'EN 1993-1-5 shear buckling required' : undefined;
  // §6.2.8/6.2.10: reduce all yield resistance by rho, conservative global reduction.
  const rho = Math.max(vy > 0.5 ? Math.min(1, (2 * vy - 1) ** 2) : 0, vz > 0.5 ? Math.min(1, (2 * vz - 1) ** 2) : 0);
  const My = Wy * a.fy / a.gamma0 * (1 - rho), Mz = Wz * a.fy / a.gamma0 * (1 - rho);
  check(a.N < 0 ? 'Tension' : 'Compression', '6.2.3 / 6.2.4', a.N, a.N < 0 ? Nt : Nc, a.N < 0 ? undefined : unsupported);
  check('Major bending','6.2.5 / 6.2.8', a.My, My, unsupported || shearReason);
  check('Minor bending','6.2.5 / 6.2.8', a.Mz, Mz, unsupported || shearReason);
  check('Shear Y','6.2.6', a.Vy, Vy);
  check('Shear Z','6.2.6 / EN 1993-1-5', a.Vz, Vz, a.Vz !== 0 ? shearReason : undefined);
  const ratio = (x: number, y: number) => x === 0 ? 0 : Math.min(1e100, Math.abs(x) / Math.max(y, 1e-100));
  // Explicit conservative §6.2.1(7) summation; shear reduction also applied to axial capacity.
  const sectionUr = ratio(a.N, (a.N < 0 ? Nt : Nc) * (1 - rho)) + ratio(a.My, My) + ratio(a.Mz, Mz);
  check('Section interaction','6.2.1(7) / 6.2.10', sectionUr, 1, unsupported || shearReason);
  const NcrY = Math.PI ** 2 * a.E * s.Iy / (a.Ky * a.L) ** 2;
  const NcrZ = Math.PI ** 2 * a.E * s.Iz / (a.Kz * a.L) ** 2;
  const NcrT = (a.G * s.It + Math.PI ** 2 * a.E * s.Iw / a.Lt ** 2) / ((s.Iy + s.Iz) / s.A);
  const ly = Math.sqrt(s.A * a.fy / NcrY), lz = Math.sqrt(s.A * a.fy / NcrZ), lt = Math.sqrt(s.A * a.fy / NcrT);
  const chiY = reduction(ly, a.alphaY), chiZ = reduction(lz, a.alphaZ);
  // §6.3.1.4: take weak-axis curve for torsional buckling of doubly symmetric open sections.
  const chiT = reduction(lt, a.alphaZ);
  const NbY = chiY * s.A * a.fy / a.gamma1, NbZ = chiZ * s.A * a.fy / a.gamma1, NbT = chiT * s.A * a.fy / a.gamma1;
  const curveReason=a.curveVerified===1?undefined:'Buckling curve selection not verified';
  check('Buckling Y','6.3.1.1–6.3.1.3',Math.max(0,a.N),NbY, a.N > 0 ? unsupported || curveReason : undefined);
  check('Buckling Z','6.3.1.1–6.3.1.3',Math.max(0,a.N),NbZ, a.N > 0 ? unsupported || curveReason : undefined);
  check('Torsional buckling','6.3.1.4',Math.max(0,a.N),NbT, a.N > 0 ? unsupported || curveReason : undefined);
  let Mcr: number | null = null, C1 = a.C1, C2 = a.C2;
  if (a.ltbMode === 2) { if (positive(a.externalMcr)) Mcr = a.externalMcr; }
  else if (a.ltbMode === 1) { if (a.ltbVerified === 1 && positive(C1)) Mcr = criticalMoment(s,a); }
  else if (a.ltbMode === 0 && a.k === 1 && a.kw === 1 && [0,1,2].includes(a.loadCase)) {
    // SN003b uniform moment, UDL and central point load, fork ends and free warping only.
    [C1,C2] = [[1,0],[1.127,0.454],[1.348,0.630]][a.loadCase];
    Mcr = criticalMoment(s,{...a,C1,C2});
  }
  const lambdaLT = Mcr ? Math.sqrt(Wy * a.fy / Mcr) : null;
  const chiLT = lambdaLT !== null ? reduction(lambdaLT,a.alphaLT) : null;
  const Mb = chiLT !== null ? chiLT * Wy * a.fy / a.gamma1 : null;
  const ltbReason = unsupported || curveReason || (!Mcr ? 'Unvalidated LTB configuration: provide verified manual coefficients or external Mcr' : undefined);
  check('LTB','6.3.2.2 (general method)',a.My,a.My === 0 ? 1 : Mb,a.My !== 0 ? ltbReason : undefined);
  // No favourable axial tension credit in the LTB check.
  let factors: [number,number,number,number] | null = null;
  if (a.interactionMode === 1 && a.manualVerified === 1 && [a.kyy,a.kyz,a.kzy,a.kzz].every(v => v >= 0)) factors=[a.kyy,a.kyz,a.kzy,a.kzz];
  if (a.interactionMode === 0 && sectionClass <= 2 && a.verifiedFactors === 1) factors=method2(Math.max(0,a.N)/NbY,Math.max(0,a.N)/NbZ,ly,lz,a.Cmy,a.Cmz,a.CmLT);
  const needsInteraction = a.N > 0 && (a.My !== 0 || a.Mz !== 0);
  const interactionReason = needsInteraction ? unsupported || curveReason || shearReason || (NbT < Math.min(NbY,NbZ) ? 'Torsional mode governs: combined stability requires separate verification' : undefined) || (rho > 0 ? 'High-shear member interaction requires separate verification' : undefined) || (!factors ? 'Annex B branch/factors not verified; supply independently verified kij' : undefined) || (a.My !== 0 ? ltbReason : undefined) : undefined;
  const [kyy,kyz,kzy,kzz] = factors ?? [0,0,0,0];
  const iy = ratio(Math.max(0,a.N),NbY) + kyy * ratio(a.My,Mb ?? 0) + kyz * ratio(a.Mz,Wz*a.fy/a.gamma1);
  const iz = ratio(Math.max(0,a.N),NbZ) + kzy * ratio(a.My,Mb ?? 0) + kzz * ratio(a.Mz,Wz*a.fy/a.gamma1);
  check('Interaction 6.61','6.3.3 / Annex B',needsInteraction ? iy : 0,1,interactionReason);
  check('Interaction 6.62','6.3.3 / Annex B',needsInteraction ? iz : 0,1,interactionReason);
  // SLS loads are separate from ULS simultaneous actions. Euler-Bernoulli prismatic beams.
  const q=Math.abs(a.q), P=Math.abs(a.P), L=a.L, EI=a.E*s.Iy;
  const delta = a.slsMode === 0 ? 5*q*L**4/(384*EI)+P*L**3/(48*EI) : a.slsMode === 1 ? q*L**4/(8*EI)+P*L**3/(3*EI) : Math.abs(a.displacement);
  check('Deflection','EN 1990 serviceability; project limit',delta,L/a.limitRatio,![0,1,2].includes(a.slsMode) ? 'Unknown SLS loading model' : undefined);
  Object.assign(values,{Nc,Nt,My,Mz,Vy,Vz,NcrY,NcrZ,NcrT,ly,lz,lt,chiY,chiZ,chiT,NbY,NbZ,NbT,Mcr:Mcr??0,lambdaLT:lambdaLT??0,chiLT:chiLT??0,Mb:Mb??0,C1,C2,kyy,kyz,kzy,kzz,iy,iz,delta,rho,sectionUr});
  const known=checks.filter(c=>c.ur!==null);
  const governing=known.reduce((m,c)=>c.ur!>m.ur! ? c : m,known[0]);
  values.flags=(unsupported?1:0)|(shearReason?2:0)|(!Mcr&&a.My!==0?4:0)|(curveReason?8:0)|(needsInteraction&&!factors?16:0)|(needsInteraction&&rho>0?32:0)|(needsInteraction&&NbT<Math.min(NbY,NbZ)?64:0)|(![0,1,2].includes(a.slsMode)?128:0);
  const state: DesignState = checks.some(c=>c.state==='FAIL') ? 'FAIL' : checks.some(c=>c.state==='NOT VERIFIED') ? 'NOT VERIFIED' : 'PASS';
  return {checks,state,governing:governing.name,governingUr:governing.ur!,sectionClass,flangeClass,webClass,values,limitations};
}
