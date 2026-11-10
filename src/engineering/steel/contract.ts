/** Numeric worksheet contract v1. Units are mandatory, never inferred from magnitudes. */
export const inputFields = [
 ['fy','MPa'],['fu','MPa'],['E','MPa'],['G','MPa'],['gamma0',''],['gamma1',''],['gamma2',''],
 ['L','mm'],['Ky',''],['Kz',''],['Llt','mm'],['Lt','mm'],
 ['N','N'],['My','N*mm'],['Mz','N*mm'],['Vy','N'],['Vz','N'],
 ['alphaY',''],['alphaZ',''],['alphaLT',''],['ltbMode',''],['loadCase',''],['loadHeight','mm'],['k',''],['kw',''],
 ['C1',''],['C2',''],['externalMcr','N*mm'],['interactionMode',''],['Cmy',''],['Cmz',''],['CmLT',''],
 ['kyy',''],['kyz',''],['kzy',''],['kzz',''],['slsMode',''],['q','N/mm'],['P','N'],['displacement','mm'],['limitRatio',''],
 ['netArea','mm^2'],['eta',''],['verifiedFactors',''],['ltbVerified',''],['curveVerified',''],['manualVerified',''],
] as const;
export const outputFields = [
 ['sectionClass',''],['flangeClass',''],['webClass',''],['governingUr',''],['state',''],['governing',''],
 ['Nc','N'],['Nt','N'],['My','N*mm'],['Mz','N*mm'],['Vy','N'],['Vz','N'],
 ['NcrY','N'],['NcrZ','N'],['NcrT','N'],['ly',''],['lz',''],['lt',''],['chiY',''],['chiZ',''],['chiT',''],
 ['NbY','N'],['NbZ','N'],['NbT','N'],['Mcr','N*mm'],['lambdaLT',''],['chiLT',''],['Mb','N*mm'],
 ['C1',''],['C2',''],['kyy',''],['kyz',''],['kzy',''],['kzz',''],['iy',''],['iz',''],['delta','mm'],['rho',''],['sectionUr',''],['flags',''],
] as const;
export const checkNames = ['Compression / tension','Major bending','Minor bending','Shear Y','Shear Z','Section interaction','Buckling Y','Buckling Z','Torsional buckling','LTB','Interaction 6.61','Interaction 6.62','Deflection'];
export const stateNumber = { 'NOT VERIFIED': -1, FAIL: 0, PASS: 1 } as const;

export const symbol = (name: string): string => {
  const standard:Record<string,string>={N:'N_{Ed}',fy:'f_{y}',fu:'f_{u}',gamma0:'\\gamma_{M0}',gamma1:'\\gamma_{M1}',gamma2:'\\gamma_{M2}',My:'M_{y.Ed}',Mz:'M_{z.Ed}',Vy:'V_{y.Ed}',Vz:'V_{z.Ed}',alphaY:'\\alpha_{y}',alphaZ:'\\alpha_{z}',alphaLT:'\\alpha_{LT}',chiY:'\\chi_{y}',chiZ:'\\chi_{z}',chiLT:'\\chi_{LT}',kyy:'k_{yy}',kyz:'k_{yz}',kzy:'k_{zy}',kzz:'k_{zz}'};
  Object.assign(standard, {
    A:'A', h:'h', b:'b', r:'r', tw:'t_w', tf:'t_f', Iy:'I_y', Iz:'I_z',
    It:'I_t', Iw:'I_w', Avy:'A_{v.y}', Avz:'A_{v.z}', Wel_y:'W_{el.y}', Wel_z:'W_{el.z}',
    Wpl_y:'W_{pl.y}', Wpl_z:'W_{pl.z}', Wy:'W_y', Wz:'W_z',
    epsilon:'\\epsilon', cf:'c_f', cw:'c_w', lambdaF:'\\lambda_f', lambdaW:'\\lambda_w',
    limitF:'c_{f.1}', alphaWeb:'\\alpha_w', alphaUsed:'\\alpha_{w.used}',
    webLimit1:'c_{w.1}', webLimit2:'c_{w.2}', webLimit3:'c_{w.3}',
    stressMean:'\\sigma_N', stressBend:'\\sigma_M', psiW:'\\psi_w',
    flangeClass:'\\mathrm{Class}_f', webClass:'\\mathrm{Class}_w', sectionClass:'\\mathrm{Class}',
    NcRd:'N_{c.Rd}', NuRd:'N_{u.Rd}', NtRd:'N_{t.Rd}', NAxRd:'N_{Rd.V}',
    MyRd:'M_{y.Rd}', MzRd:'M_{z.Rd}', VyRd:'V_{pl.y.Rd}', VzRd:'V_{pl.z.Rd}',
    vY:'v_y', vZ:'v_z', rho:'\\rho', rhoY:'\\rho_y', rhoZ:'\\rho_z', URsection:'\\mathrm{UR}_{section}',
    LcrY:'L_{cr.y}', LcrZ:'L_{cr.z}', NcrY:'N_{cr.y}', NcrZ:'N_{cr.z}', NcrT:'N_{cr.T}',
    lambdaY:'\\lambda_y', lambdaZ:'\\lambda_z', lambdaT:'\\lambda_T', lambdaLT:'\\lambda_{LT}',
    phiY:'\\Phi_y', phiZ:'\\Phi_z', phiT:'\\Phi_T', phiLT:'\\Phi_{LT}',
    chiT:'\\chi_T', NbY:'N_{b.y.Rd}', NbZ:'N_{b.z.Rd}', NbT:'N_{b.T.Rd}',
    iZero:'i_{0.sq}', Mcr:'M_{cr}', McrCalc:'M_{cr.calc}', Tcr:'T_{cr}', Bcr:'B_{cr}', Mb:'M_{b.Rd}',
    Cused1:'C_{1.used}', Cused2:'C_{2.used}', nY:'n_y', nZ:'n_z',
    kyyAuto:'k_{yy.B}', kzzAuto:'k_{zz.B}', kzyAuto:'k_{zy.B}', MzRk:'M_{z.Rk}', MzStability:'M_{z.Rd.1}',
    mY:'m_y', mZ:'m_z', Jy:'J_y', Jz:'J_z',
    deltaSimple:'\\delta_{SS}', deltaCantilever:'\\delta_{cant}', delta:'\\delta', deltaAllow:'\\delta_{lim}',
  });
  if(standard[name])return standard[name];
  const m=/^([A-Za-z]+)(.*)$/.exec(name)!;
  return `\\mathrm{${m[1]}}${m[2]?'_{'+m[2].replace(/^_/, '')+'}':''}`;
};
export const definition = (name: string) => `${symbol(name)}\\coloneq`;
