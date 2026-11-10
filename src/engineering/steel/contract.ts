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
  if(standard[name])return standard[name];
  const m=/^([A-Za-z]+)(.*)$/.exec(name)!;
  return `\\mathrm{${m[1]}}${m[2]?'_{'+m[2].replace(/^_/, '')+'}':''}`;
};
export const definition = (name: string) => `${symbol(name)}\\coloneq`;
