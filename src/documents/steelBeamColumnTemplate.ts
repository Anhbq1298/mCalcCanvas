/** Human-readable EC3 report. Every design step uses ordinary editable math regions.
 * The existing steel kernel remains an independent guarded audit in the technical annex.
 */
import { newShapeId } from '../canvas/model/canvasStore';
import { DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS, type Shape, type MathProps, type AnnexRole } from '../canvas/model/types';
import { escapeHtml } from '../canvas/sanitize';
import { A4, PAGE_GAP } from '../export/pageGeometry';
import { propertyKeys, sectionUnits, sections } from '../engineering/steel/sections';
import { ltbCoefficientCases } from '../engineering/steel/ltbCases';
import { checkNames, definition, inputFields, outputFields, symbol } from '../engineering/steel/contract';
import type { InputResultConfig } from './DocumentTypes';

export function steelBeamColumnTemplate(): { shapes: Shape[]; inputResult: InputResultConfig } {
  const shapes: Shape[] = [], bound = new Map<string, string>();
  const t = String.raw, v = symbol;
  // Page 2 is intentionally omitted: each check is shown in its own worked section.
  const page = (p:number) => p > 2 ? p - 1 : p;
  const y = (p: number, row: number) => (page(p) - 1) * (A4.h + PAGE_GAP) + 60 + row * 40;
  const note = (p: number, row: number, content: string, heading: 0|1|2 = 0, annex?: AnnexRole, x = 76, w = 640) => {
    shapes.push({ id: newShapeId(), type: 'text', x, y: y(p,row), props: { ...DEFAULT_TEXT_PROPS, w, h: heading ? 28 : 24, html: escapeHtml(content), fontSize: heading === 1 ? 19 : heading === 2 ? 14 : 11, color: heading ? '#1e3a5f' : '#475569', ...(heading ? {heading} : {}), ...(annex ? {annex} : {}) } });
  };
  const math = (p: number, row: number, latex: string, x = 96, props: Partial<MathProps> = {}) => {
    const id = newShapeId();
    shapes.push({ id, type: 'math', x, y: y(p,row), props: { ...DEFAULT_MATH_PROPS, latex, fontSize: 13, w: 600, h: 32, baseline: 20, displayMode: 'formulaResult', ...props } });
    return id;
  };
  const calculationLabels: Record<string,string> = {
    epsilon:'Material factor ε = √(235 MPa / fy)',
    webLimit1:'Web limit for Class 1', webLimit2:'Web limit for Class 2', webBendLimit3:'Web limit for Class 3 (bending)',
    sectionClass:'Governing cross-section class',
    NcRd:'Compression resistance Nc,Rd', rho:'High-shear reduction ρ (6.2.8)',
    MyRd:'Major-axis resistance My,Rd', MzRd:'Minor-axis resistance Mz,Rd',
    NAxRd:'Axial resistance after shear reduction', URsection:'Section interaction (6.2.1(7))',
    NcrY:'Euler load Ncr,y', chiY:'Buckling reduction χy', NbY:'Buckling resistance Nb,y,Rd',
    NcrZ:'Euler load Ncr,z', chiZ:'Buckling reduction χz', NbZ:'Buckling resistance Nb,z,Rd',
    iZero:'Polar radius i0', NcrT:'Torsional critical load Ncr,T',
    chiT:'Torsional reduction χT', NbT:'Torsional resistance Nb,T,Rd',
    Tcr:'Elastic bending term Tcr', Bcr:'Torsion and warping term Bcr', McrCalc:'Elastic critical moment Mcr',
    lambdaLT:'Relative LTB slenderness λLT', Mb:'LTB resistance Mb,Rd (6.3.2.2)',
    kyyAuto:'Interaction factor kyy (Annex B, Method 2)', kzzAuto:'Interaction factor kzz (Annex B, Method 2)',
    Jy:'Interaction check about y–y (6.61)', Jz:'Interaction check about z–z (6.62)',
  };
  const calc = (p: number, row: number, key: string, rhs: string, props: Partial<MathProps> = {}, x = 96) => {
    const label=calculationLabels[key];
    if(label&&x===96){
      note(p,row,label,0,undefined,76,210);
      props={...props,w:Math.min(props.w??410,410),fontSize:props.fontSize??12};
      x=300;
    }
    const id = math(p,row,definition(key)+' '+rhs,x,props); bound.set(key,id); return id;
  };
  const input = (p: number, row: number, key: string, rhs: string, x = 96) => calc(p,row,key,rhs,{displayMode:'formula',w:280},x);
  const pairWithLabels = (p:number,row:number,leftLabel:string,left:[string,string],rightLabel:string,right:[string,string]) => {
    note(p,row,leftLabel,0,undefined,76,136);
    calc(p,row,left[0],left[1],{displayMode:'formula',w:160,fontSize:12},220);
    const rightLabelIndex=shapes.length;
    note(p,row,rightLabel,0,undefined,400,125);
    if(shapes[rightLabelIndex]?.type==='text')shapes[rightLabelIndex].props.fontSize=11;
    calc(p,row,right[0],right[1],{displayMode:'formula',w:150,fontSize:12},530);
  };
  const q = (n: number, unit: string) => `${n}\\,\\mathrm{${unit}}`;
  const abs = (key: string) => t`\operatorname{abs}(${v(key)})`;
  const get = (key: string) => t`\operatorname{entry}(${v('R')},${outputFields.findIndex(([n])=>n===key)})`;
  const zeroMoment = t`0\,\mathrm{N}\cdot\mathrm{mm}`;
  const compression = t`\operatorname{max}(0\,\mathrm{N},${v('N')})`;
  const reduction = (lambda: string, alpha: string) => t`0.5\left(1+${v(alpha)}(${v(lambda)}-0.2)+${v(lambda)}^2\right)`;
  const chi = (phi: string, lambda: string) => t`\operatorname{min}\left(1,\frac{1}{${v(phi)}+\sqrt{\operatorname{max}(0,${v(phi)}^2-${v(lambda)}^2)}}\right)`;

  // 1 — One physically consistent example. Equal end couples => uniform moments and zero shear.
  note(1,0,'STEEL BEAM–COLUMN DESIGN',1);
  note(1,0.8,'EN 1993-1-1:2005 + A1:2014 · LC1 · Straight, prismatic rolled I/H member');
  note(1,1.5,'1  DESIGN BASIS — EN 1993-1-1:2005 + A1:2014; compression positive; y major / z minor.');
  input(1,2.3,'Section','1211');
  note(1,3.1,'Section properties and data source are listed in Annex A.1.');
  note(1,4,'2  INPUTS',2);
  pairWithLabels(1,5,'Yield strength fy',['fy',q(355,'MPa')],'Ultimate strength fu',['fu',q(510,'MPa')]);
  pairWithLabels(1,6,'Elastic modulus E',['E',q(210,'GPa')],'Shear modulus G',['G',q(80.76923,'GPa')]);
  pairWithLabels(1,7,'Section factor γM0',['gamma0','1'],'Buckling factor γM1',['gamma1','1']);
  pairWithLabels(1,8,'Tension factor γM2',['gamma2','1.25'],'Member length L',['L',q(5,'m')]);
  pairWithLabels(1,9,'Ky (effective length)',['Ky','1'],'Kz (effective length)',['Kz','1']);
  pairWithLabels(1,10,'LTB length Lb',['Llt',q(5,'m')],'LTB case no. — Annex B',['LTBcase','1']);
  pairWithLabels(1,11,'Load height zg',['zg',q(0,'mm')],'Lateral factor k',['k','1']);
  note(1,12,'Warping factor kw',0,undefined,76,136);
  input(1,12,'kw','1',220);
  note(1,12,'See Annex B for the selected case diagram and its C1/C2 coefficients.',0,undefined,76,640);
  note(1,13,'The LTB case selects coefficients only; it does not change the ULS actions. Use cases 1–13.',0,undefined,76,640);
  note(1,14,'2.1  DESIGN ACTIONS — LC1, simultaneous at same position',2);
  pairWithLabels(1,15,'Compression NEd',['N',q(100,'kN')],'Major-axis My,Ed',['My',q(50,'kN')+t`\cdot\mathrm{m}`]);
  pairWithLabels(1,16,'Minor-axis Mz,Ed',['Mz',q(5,'kN')+t`\cdot\mathrm{m}`],'Shear Vy,Ed',['Vy',q(0,'kN')]);
  note(1,17,'Shear Vz,Ed',0,undefined,76,136);
  input(1,17,'Vz',q(0,'kN'),220);
  note(1,19,'Technical inputs and independent verification audit',0,{kind:'link',target:'ec3'});
  note(1,21.7,'Automatic table cases assume fork-end lateral / twist restraint, free warping, k = kw = 1.');
  note(1,22.5,'For other restraints, use independently verified manual coefficients or external Mcr in Annex A.');
  note(1,23.3,'No slab restraint is assumed.');

  // 3 — Source properties are named; lookup indices are confined to the technical annex.
  note(3,0,'2  SECTION AND CLASSIFICATION',1);
  note(3,0.9,'HEB/I/H geometry and properties for the selected section.');
  calc(3,1.5,'SectionDrawing',t`\operatorname{stack}(${v('h')}/\mathrm{mm},${v('b')}/\mathrm{mm},${v('tw')}/\mathrm{mm},${v('tf')}/\mathrm{mm})`,{steelFigure:'section',w:260,h:190});
  (['h','b','tw','tf','A','Iy','Iz','Wpl_y','Wpl_z','It','Iw'] as const).forEach((key,i)=>math(3,1.5+i*0.43,`${v(key)}=`,396,{displayMode:'result',fontSize:12,w:290,h:18,displayUnit:sectionUnits[key]}));
  note(3,6.4,'EN 1993-1-1 §5.5 / Table 5.2. Biaxial loading: uniform web compression is conservative.');
  calc(3,6.7,'epsilon',t`\sqrt{\frac{235\,\mathrm{MPa}}{${v('fy')}}}`,{displayMode:'full',h:86});
  calc(3,9,'cf',t`\frac{${v('b')}-${v('tw')}-2${v('r')}}{2}`,{w:280});
  calc(3,9,'lambdaF',`${v('cf')}/${v('tf')}`,{w:290},396);
  calc(3,10.1,'limitF',t`9${v('epsilon')}`,{w:280});
  calc(3,10.1,'flangeClass',t`\operatorname{if}(${v('lambdaF')}\le9${v('epsilon')},1,\operatorname{if}(${v('lambdaF')}\le10${v('epsilon')},2,\operatorname{if}(${v('lambdaF')}\le14${v('epsilon')},3,4)))`,{displayMode:'result',w:290},396);
  note(3,11.2,'Flange Class 1 / 2 / 3 limits: 9ε / 10ε / 14ε. Uniform compression is conservative.');
  calc(3,12.2,'cw',`${v('h')}-2(${v('tf')}+${v('r')})`,{w:280});
  calc(3,12.2,'lambdaW',`${v('cw')}/${v('tw')}`,{w:290},396);
  calc(3,13.3,'stressMean',`${v('N')}/${v('A')}`,{w:280});
  calc(3,13.3,'stressBend',`${abs('My')}${v('cw')}/(2${v('Iy')})`,{w:290,fontSize:12},396);
  calc(3,14.4,'psiW',t`\operatorname{if}(${v('stressMean')}+${v('stressBend')}>0\,\mathrm{MPa},\operatorname{max}(-3,(${v('stressMean')}-${v('stressBend')})/(${v('stressMean')}+${v('stressBend')})),-3)`,{displayMode:'result',w:280});
  calc(3,14.4,'alphaWeb',t`\operatorname{min}(1,\operatorname{max}(0,(1+${v('N')}/(${v('cw')}${v('tw')}${v('fy')}))/2))`,{displayMode:'result',w:290},396);
  note(3,15.4,'ψ=(σN−σM)/(σN+σM); α=min[1,max(0,(1+NEd/(cw tw fy))/2)].');
  calc(3,16.4,'alphaUsed',t`\operatorname{if}(${v('Mz')}=${zeroMoment},\operatorname{if}(${abs('My')}>${zeroMoment},${v('alphaWeb')},1),1)`,{displayMode:'result',w:280});
  note(3,16.4,'Biaxial case: use α=1 (uniform compression).',0,undefined,396,290);
  calc(3,17.4,'webLimit1',t`\operatorname{if}(${v('alphaUsed')}>0.5,396/(13${v('alphaUsed')}-1),36/\operatorname{max}(${v('alphaUsed')},10^{-12}))${v('epsilon')}`,{fontSize:11});
  calc(3,18.5,'webLimit2',t`\operatorname{if}(${v('alphaUsed')}>0.5,456/(13${v('alphaUsed')}-1),41.5/\operatorname{max}(${v('alphaUsed')},10^{-12}))${v('epsilon')}`,{fontSize:11});
  calc(3,19.6,'webBendLimit3',t`\operatorname{if}(${v('psiW')}>-1,42/(0.67+0.33${v('psiW')}),62(1-${v('psiW')})\sqrt{-${v('psiW')}})${v('epsilon')}`,{fontSize:11});
  calc(3,20.7,'webLimit3',t`\operatorname{if}(${v('Mz')}=${zeroMoment},\operatorname{if}(${abs('My')}>${zeroMoment},${v('webBendLimit3')},42${v('epsilon')}),42${v('epsilon')})`,{displayMode:'result',w:280});
  const webClass=t`\operatorname{if}(${v('lambdaW')}\le ${v('webLimit1')},1,\operatorname{if}(${v('lambdaW')}\le ${v('webLimit2')},2,\operatorname{if}(${v('lambdaW')}\le ${v('webLimit3')},3,4)))`;
  calc(3,20.7,'webClass',t`\operatorname{if}(${v('Mz')}=${zeroMoment},\operatorname{if}(${v('stressMean')}+${v('stressBend')}\le0\,\mathrm{MPa},1,${webClass}),${webClass})`,{displayMode:'result',w:290},396);
  calc(3,21.8,'sectionClass',t`\operatorname{max}(${v('flangeClass')},${v('webClass')})`);
  note(3,23,'Class 1/2 → Wpl; Class 3 → Wel. Class 4 requires a separate effective-section verification.');
  note(3,23.8,'For the uniform-compression web, the limits above reduce to 33ε / 38ε / 42ε.');

  // 4 — Transparent resistance equations, including the exact conservative high-shear method used.
  note(4,0,'3  CROSS-SECTION RESISTANCE',1);
  note(4,0.9,'EN 1993-1-1 §§6.2.3–6.2.10. Net area assumes no holes unless Anet is overridden.');
  calc(4,1.8,'NcRd',t`\frac{${v('A')}${v('fy')}}{${v('gamma0')}}`,{displayMode:'full',h:86});
  calc(4,4.1,'NuRd',t`\frac{0.9${v('Anet')}${v('fu')}}{${v('gamma2')}}`,{w:280});
  calc(4,4.1,'Wz',t`\operatorname{if}(${v('sectionClass')}<3,${v('Wpl_z')},${v('Wel_z')})`,{w:290,fontSize:12},396);
  calc(4,5.1,'NtRd',t`\operatorname{min}(${v('NcRd')},${v('NuRd')})`,{w:280,fontSize:12});
  calc(4,5.1,'Wy',t`\operatorname{if}(${v('sectionClass')}<3,${v('Wpl_y')},${v('Wel_y')})`,{w:290,fontSize:12},396);
  calc(4,6.2,'VyRd',t`\frac{${v('Avy')}${v('fy')}}{\sqrt{3}${v('gamma0')}}`,{w:280});
  calc(4,6.2,'VzRd',t`\frac{${v('Avz')}${v('fy')}}{\sqrt{3}${v('gamma0')}}`,{w:290},396);
  calc(4,7.5,'vY',`${abs('Vy')}/${v('VyRd')}`,{w:280});
  calc(4,7.5,'vZ',`${abs('Vz')}/${v('VzRd')}`,{w:290},396);
  calc(4,8.6,'rhoY',t`\operatorname{if}(${v('vY')}>0.5,\operatorname{min}(1,(2${v('vY')}-1)^2),0)`,{w:280,displayMode:'result'});
  calc(4,8.6,'rhoZ',t`\operatorname{if}(${v('vZ')}>0.5,\operatorname{min}(1,(2${v('vZ')}-1)^2),0)`,{w:290,displayMode:'result'},396);
  calc(4,9.6,'rho',t`\operatorname{max}(${v('rhoY')},${v('rhoZ')})`);
  note(4,10.6,'ρ=0 for V/Vpl ≤ 0.5; otherwise ρ=(2V/Vpl−1)². Global yield reduction is conservative.');
  calc(4,11.6,'MyRd',t`\frac{(1-${v('rho')})${v('Wy')}${v('fy')}}{${v('gamma0')}}`,{displayMode:'full',h:86});
  calc(4,13.9,'MzRd',t`\frac{(1-${v('rho')})${v('Wz')}${v('fy')}}{${v('gamma0')}}`);
  calc(4,15.1,'NAxRd',t`\operatorname{if}(${v('N')}<0\,\mathrm{N},${v('NtRd')},${v('NcRd')})(1-${v('rho')})`);
  calc(4,16.2,'uN',t`\operatorname{if}(${v('NAxRd')}>0\,\mathrm{N},${abs('N')}/${v('NAxRd')},-1)`,{displayMode:'result',w:180});
  calc(4,16.2,'uMy',t`\operatorname{if}(${v('MyRd')}>${zeroMoment},${abs('My')}/${v('MyRd')},-1)`,{displayMode:'result',w:180},296);
  calc(4,16.2,'uMz',t`\operatorname{if}(${v('MzRd')}>${zeroMoment},${abs('Mz')}/${v('MzRd')},-1)`,{displayMode:'result',w:180},496);
  calc(4,17.2,'URsection',`${v('uN')}+${v('uMy')}+${v('uMz')}`);
  calc(4,18.2,'SectionResult',v('State5'),{steelFigure:'state',w:100});
  note(4,18.2,'uN=|NEd|/NRd,V; uMy=|My,Ed|/My,Rd; uMz=|Mz,Ed|/Mz,Rd; sum ≤ 1.',0,undefined,236,470);
  note(4,18.8,'Conservative N–My–Mz summation explicitly permitted by §6.2.1(7); no plastic interaction credit.');
  calc(4,20,'hwRatio',t`\frac{${v('h')}-2${v('tf')}}{${v('tw')}}`,{w:280});
  calc(4,20,'shearLimit',t`\frac{72${v('epsilon')}}{${v('eta')}}`,{w:290},396);
  note(4,21.4,'Web slenderness above 72ε/η with web shear requires EN 1993-1-5 shear-buckling verification.');
  note(4,22.3,'Both shear directions acting together require a separate biaxial shear check.');
  note(4,23.2,'The summary controls PASS / FAIL / NOT VERIFIED, including the checks not covered by these equations.');

  // 5 — No black-box extraction of Euler loads or reduction factors.
  note(5,0,'4  COMPRESSION MEMBER BUCKLING',1);
  note(5,0.9,'EN 1993-1-1 §6.3.1. Ky and Kz are independently editable; the K annex is reference only.');
  calc(5,1.8,'LcrY',`${v('Ky')}${v('L')}`,{w:280});
  calc(5,1.8,'LcrZ',`${v('Kz')}${v('L')}`,{w:290},396);
  calc(5,3,'NcrY',t`\frac{\pi^2${v('E')}${v('Iy')}}{${v('LcrY')}^2}`,{displayMode:'full',h:86});
  calc(5,5.3,'lambdaY',t`\sqrt{\frac{${v('A')}${v('fy')}}{${v('NcrY')}}}`,{w:280});
  calc(5,5.3,'phiY',reduction('lambdaY','alphaY'),{w:290,fontSize:12},396);
  calc(5,6.6,'chiY',chi('phiY','lambdaY'),{fontSize:12});
  calc(5,7.8,'NbY',t`\frac{${v('chiY')}${v('A')}${v('fy')}}{${v('gamma1')}}`);
  calc(5,9,'NcrZ',t`\frac{\pi^2${v('E')}${v('Iz')}}{${v('LcrZ')}^2}`,{displayMode:'full',h:86});
  calc(5,11.3,'lambdaZ',t`\sqrt{\frac{${v('A')}${v('fy')}}{${v('NcrZ')}}}`,{w:280});
  calc(5,11.3,'phiZ',reduction('lambdaZ','alphaZ'),{w:290,fontSize:12},396);
  calc(5,12.6,'chiZ',chi('phiZ','lambdaZ'),{fontSize:12});
  calc(5,13.8,'NbZ',t`\frac{${v('chiZ')}${v('A')}${v('fy')}}{${v('gamma1')}}`);
  note(5,15,'Uncoupled torsional buckling — doubly symmetric I/H, §6.3.1.4; torsional length Lt independent.');
  calc(5,16,'iZero',t`\sqrt{\frac{${v('Iy')}+${v('Iz')}}{${v('A')}}}`);
  calc(5,17,'NcrT',t`\frac{${v('G')}${v('It')}+\pi^2${v('E')}${v('Iw')}/${v('Lt')}^2}{${v('iZero')}^2}`,{fontSize:12});
  calc(5,18.3,'lambdaT',t`\sqrt{${v('A')}${v('fy')}/${v('NcrT')}}`,{w:280});
  calc(5,18.3,'phiT',reduction('lambdaT','alphaZ'),{w:290,fontSize:12},396);
  calc(5,19.6,'chiT',chi('phiT','lambdaT'),{fontSize:12});
  calc(5,20.8,'NbT',t`\frac{${v('chiT')}${v('A')}${v('fy')}}{${v('gamma1')}}`);
  note(5,22.1,'Curves from Tables 6.1/6.2; selected αy, αz are listed in the input annex.');
  note(5,23,'λ denotes relative slenderness throughout. Combined loading is unverified if torsional buckling governs.');

  // 6 — Coefficient choice and full Mcr expression are visible; unsupported selections remain guarded.
  note(6,0,'5  LATERAL-TORSIONAL BUCKLING',1);
  note(6,0.9,'EN 1993-1-1 §6.3.2.2 (general method); elastic Mcr from SCI NCCI SN003b §2.');
  note(6,1.6,'Enter a case number on page 1. The matching diagram and C1/C2 are highlighted in Annex B.');
  calc(6,2.8,'Cused1',get('C1'),{displayMode:'result',w:280});
  calc(6,2.8,'Cused2',get('C2'),{displayMode:'result',w:290},396);
  note(6,3.7,'Coefficients are looked up from SCI NCCI SN003b Tables 3.1/3.2; no interpolation is used.');
  calc(6,4.6,'Tcr',t`\frac{\pi^2${v('E')}${v('Iz')}}{(${v('k')}${v('Llt')})^2}`);
  calc(6,5.9,'Bcr',t`\left(\frac{${v('k')}}{${v('kw')}}\right)^2\frac{${v('Iw')}}{${v('Iz')}}+\frac{${v('G')}${v('It')}}{${v('Tcr')}}+(${v('Cused2')}${v('zg')})^2`,{fontSize:12});
  calc(6,7.1,'McrCalc',t`${v('Cused1')}${v('Tcr')}\left(\sqrt{${v('Bcr')}}-${v('Cused2')}${v('zg')}\right)`,{displayMode:'full',h:86});
  calc(6,9.4,'Mcr',get('Mcr'),{displayMode:'result'});
  note(6,10.3,'Use this expression only for verified configurations; external mode uses the supplied Mcr.');
  calc(6,11.2,'lambdaLT',t`\operatorname{if}(${v('Mcr')}>${zeroMoment},\sqrt{${v('Wy')}${v('fy')}/${v('Mcr')}},0)`,{fontSize:12});
  calc(6,12.5,'phiLT',reduction('lambdaLT','alphaLT'),{w:280,fontSize:12});
  calc(6,12.5,'chiLT',t`\operatorname{if}(${v('Mcr')}>${zeroMoment},${chi('phiLT','lambdaLT')},0)`,{displayMode:'result',w:290},396);
  calc(6,13.7,'Mb',t`\frac{${v('chiLT')}${v('Wy')}${v('fy')}}{${v('gamma1')}}`);
  note(6,15.1,'λLT = √(Wy fy / Mcr). Without a verified Mcr, LTB is NOT VERIFIED.');
  note(6,16,'External-Mcr mode bypasses the coefficient calculation.');
  note(6,16.9,'The selected reference case, restraint and signed load height must match the member.');
  note(6,19,'Reference: SCI NCCI SN003b; uniform rolled I/H sections, fork-end restraint and free warping.');

  // 7 — Both Annex B equations are evaluated explicitly.
  note(7,0,'6  COMPRESSION AND BIAXIAL BENDING',1);
  note(7,0.9,'EN 1993-1-1 §6.3.3, equations (6.61)/(6.62); Annex B Method 2, plastic I/H, λz ≥ 0.4.');
  calc(7,1.8,'nY',`${compression}/${v('NbY')}`,{w:280});
  calc(7,1.8,'nZ',`${compression}/${v('NbZ')}`,{w:290},396);
  calc(7,2.8,'kyyAuto',t`${v('Cmy')}\left(1+\operatorname{min}(${v('lambdaY')}-0.2,0.8)${v('nY')}\right)`,{fontSize:12});
  calc(7,3.9,'kzzAuto',t`${v('Cmz')}\left(1+\operatorname{min}(2${v('lambdaZ')}-0.6,1.4)${v('nZ')}\right)`,{fontSize:12});
  calc(7,5,'kzyAuto',t`\operatorname{if}(${v('CmLT')}>0.25,\operatorname{max}\left(1-\frac{0.1${v('lambdaZ')}${v('nZ')}}{${v('CmLT')}-0.25},1-\frac{0.1${v('nZ')}}{${v('CmLT')}-0.25}\right),0)`,{fontSize:12,displayMode:'result'});
  calc(7,6.2,'kyy',t`\operatorname{if}(${v('InteractionMode')}=1,${v('kyyManual')},${v('kyyAuto')})`,{displayMode:'result',w:280});
  calc(7,6.2,'kzz',t`\operatorname{if}(${v('InteractionMode')}=1,${v('kzzManual')},${v('kzzAuto')})`,{displayMode:'result',w:290},396);
  calc(7,7.2,'kyz',t`\operatorname{if}(${v('InteractionMode')}=1,${v('kyzManual')},0.6${v('kzz')})`,{w:280,fontSize:12});
  calc(7,7.2,'kzy',t`\operatorname{if}(${v('InteractionMode')}=1,${v('kzyManual')},${v('kzyAuto')})`,{displayMode:'result',w:290},396);
  calc(7,8.2,'MzStability',`${v('Wz')}${v('fy')}/${v('gamma1')}`,{w:280});
  calc(7,8.2,'mZ',`${abs('Mz')}/${v('MzStability')}`,{w:290},396);
  calc(7,9.2,'mY',t`\operatorname{if}(${abs('My')}=${zeroMoment},0,\operatorname{if}(${v('Mb')}>${zeroMoment},${abs('My')}/${v('Mb')},-1))`,{displayMode:'result',w:280});
  note(7,9.2,'my = |My,Ed| / Mb,Rd (verified Mcr required).',0,undefined,396,290);
  calc(7,10.2,'Jy',`${v('nY')}+${v('kyy')}${v('mY')}+${v('kyz')}${v('mZ')}`,{fontSize:12});
  calc(7,11.2,'ResultY',v('State10'),{steelFigure:'state',w:100});
  note(7,11.2,'Acceptance: Jy ≤ 1; equation (6.61).',0,undefined,256,400);
  calc(7,12.2,'Jz',`${v('nZ')}+${v('kzy')}${v('mY')}+${v('kzz')}${v('mZ')}`,{fontSize:12});
  calc(7,13.2,'ResultZ',v('State11'),{steelFigure:'state',w:100});
  note(7,13.2,'Acceptance: Jz ≤ 1; equation (6.62).',0,undefined,256,400);
  note(7,13.8,'Cm=1 corresponds to the uniform end-moment example. Other distributions need verified Cm factors.');
  note(7,14.6,'Indicative equations do not verify an unsupported branch; check all applicable limits.');
  // 8/9 — Optional detailed inputs and machine contract are kept out of the design narrative.
  note(8,0,'ANNEX',1,{kind:'start'});
  note(8,1,'Section data and advanced inputs',2,{kind:'heading',id:'ec3'});
  note(8,2,'Properties are explicit quantities. Replace a lookup with a verified literal to override it.');
  propertyKeys.slice(0,16).forEach((key,i)=>calc(8,3+Math.floor(i/4),key,t`\operatorname{sectionProp}(${v('Section')},${i})`,{displayMode:'result',displayUnit:sectionUnits[key],fontSize:11,w:145},[76,236,396,556][i%4]));
  const advanced: [string,string][]=[['Lt',v('L')],['alphaY','0.34'],['alphaZ','0.49'],['alphaLT','0.21'],['LTBmode','0'],['zg',q(0,'mm')],['k','1'],['kw','1'],['C1','1'],['C2','0'],['McrExternal',q(0,'kN')+t`\cdot\mathrm{m}`],['InteractionMode','0'],['Cmy','1'],['Cmz','1'],['CmLT','1'],['kyyManual','1'],['kyzManual','1'],['kzyManual','1'],['kzzManual','1'],['Anet',v('A')],['eta','1.2'],['FactorsVerified','1'],['LTBverified','0'],['CurvesVerified','1'],['ManualFactorsVerified','0']];
  advanced.forEach(([key,rhs],i)=>input(8,7.5+Math.floor(i/2),key,rhs,i%2?396:96));
  calc(8,21.7,'LoadCase',t`${v('LTBcase')}-1`,{displayMode:'result',fontSize:10});
  note(8,23.4,'Modes: LTB 0 auto / 1 manual / 2 external.');
  note(8,24.2,'Manual kij, Cm and curves require independent verification; acknowledgement flags persist in .mCCV.');

  note(10,0,'BUCKLING K — REFERENCE ONLY',2,{kind:'heading',id:'buckling-k'});
  calc(10,0.9,'Kreference','1',{steelFigure:'buckling',w:620,h:204,constant:true,displayMode:'formula'});
  note(10,6.2,'Ideal elastic modes. Actual K depends on frame sway, connection stiffness and intermediate restraints.');
  note(10,7,'Fixed–guided: rotations restrained, relative translation free. Viewing this annex never changes Ky/Kz.');
  note(10,7.8,'LTB k/kw are separate lateral-bending / warping factors. Complex frames require stability analysis.');
  note(9,9,'INDEPENDENT ENGINE AUDIT — DATA CONTRACT, NOT THE DESIGN EXPLANATION',2);
  const stack=(keys:string[])=>t`\operatorname{stack}(${keys.map(v).join(',')})`;
  const chunks=(keys:string[],prefix:string,row:number)=>{
    const names:string[]=[];
    for(let i=0;i<keys.length;i+=8){const key=prefix+names.length;names.push(key);calc(9,row+names.length*0.65,key,stack(keys.slice(i,i+8)),{displayMode:'formula',fontSize:10,h:25});}
    calc(9,row+(names.length+1)*0.65,prefix,stack(names),{displayMode:'formula',fontSize:10,h:25});return row+(names.length+2)*0.65;
  };
  let row=chunks(propertyKeys.slice(0,16),'S',9.6);
  const mapping:Record<string,string>={ltbMode:'LTBmode',loadCase:'LoadCase',loadHeight:'zg',externalMcr:'McrExternal',interactionMode:'InteractionMode',kyy:'kyyManual',kyz:'kyzManual',kzy:'kzyManual',kzz:'kzzManual',netArea:'Anet',verifiedFactors:'FactorsVerified',ltbVerified:'LTBverified',curveVerified:'CurvesVerified',manualVerified:'ManualFactorsVerified'};
  row=chunks(inputFields.map(([n])=>mapping[n]??n),'I',row);
  calc(9,row,'R',t`\operatorname{steelDesign}(${v('S')},${v('I')})`,{displayMode:'formula',fontSize:11});
  note(9,18.5,'SCOPE / NOT VERIFIED — Class 4, plated or biaxial shear, arbitrary LTB and Annex A need separate verification.',0,undefined,76,640);
  note(9,19.2,'No applied torsion, fatigue, connections or block tearing. Confirm catalogue properties against project tables.',0,undefined,76,640);
  note(9,19.9,'References: EN 1993-1-1 §§5.5 / 6.2 / 6.3; SCI NCCI SN003b; JRC 2014 Simões.',0,undefined,76,640);
  // Batch-only fields stay available in the worksheet contract, compactly below the audit.
  calc(9,21.1,'UR',get('governingUr'),{displayMode:'result',w:125},76);
  calc(9,21.1,'State',get('state'),{displayMode:'result',w:125},236);
  calc(9,21.1,'Governing',get('governing'),{displayMode:'result',w:145},396);
  calc(9,21.1,'SectionOut',v('Section'),{displayMode:'result',w:125},556);
  checkNames.forEach((_,i)=>calc(9,22+Math.floor(i/4)*0.6,'State'+i,t`\operatorname{entry}(${v('R')},${outputFields.length+2*i+1})`,{displayMode:'result',w:125,fontSize:10},[76,236,396,556][i%4]));

  note(11,0,'ANNEX B — LTB LOAD CASES AND COEFFICIENTS',0,{kind:'heading',id:'ltb-cases'});
  const ltbHeading=shapes.at(-1)!;
  if(ltbHeading.type==='text'){ltbHeading.props.fontSize=19;ltbHeading.props.color='#1e3a5f';ltbHeading.props.h=28;}
  note(11,0.8,'Enter the case number shown below. Coefficients are for k = kw = 1; load-height zg is entered on page 1.');
  calc(11,1.4,'LTBcatalog',t`\operatorname{stack}(${v('LTBcase')})`,{steelFigure:'ltbCatalog',w:634,h:680},76);
  note(11,19.4,'Cases 1–9: SCI NCCI SN003b Table 3.1, end-moment ratio ψ = smaller / larger end moment; C2 = 0.');
  note(11,20.2,'Cases 10–13: Table 3.2 transverse loading. Fixed-end cases use their own coefficients; do not substitute pin-ended values.');
  note(11,21,'Combined end moments plus transverse loading require SN003b §3.4 curves and ψ/μ. They are not silently interpolated here.');
  note(11,21.8,'Outside cases 1–13, or k/kw ≠ 1, returns NOT VERIFIED unless verified manual coefficients or external Mcr are supplied.');
  note(11,22.6,'Reference: SCI NCCI SN003b, Tables 3.1/3.2, §§2–3.3. End restraints and load position must match.');

  note(12,0,'ANNEX C — LTB COEFFICIENT TABLE',1);
  note(12,0.8,'Use the case number beside the matching diagram in Annex B. Coefficients are not interchangeable.');
  note(12,2,'Case',0,undefined,76,48);
  note(12,2,'Loading / moment case',0,undefined,138,330);
  note(12,2,'C1',0,undefined,496,70);
  note(12,2,'C2',0,undefined,580,70);
  ltbCoefficientCases.forEach((c,i)=>{
    const row=3.1+i*0.76;
    note(12,row,String(c.id),0,undefined,76,48);
    note(12,row,c.name,0,undefined,138,330);
    note(12,row,c.c1.toFixed(c.c1%1===0?2:3),0,undefined,496,70);
    note(12,row,c.c2.toFixed(3),0,undefined,580,70);
  });
  note(12,14.2,'Cases 1–9: SN003b Table 3.1; C2 = 0. Cases 10–13: Table 3.2 transverse loading.');
  note(12,15,'k = kw = 1. For other restraints, use verified manual coefficients or external Mcr.');
  note(12,15.8,'Source: SCI NCCI SN003b, Tables 3.1 and 3.2. Do not interpolate between cases.');

  const inputs=['Section','fy','fu','L','Ky','Kz','Llt','N','My','Mz','Vy','Vz','LTBcase','zg','k','kw'];
  const outputs=['sectionClass','Mcr','chiY','chiZ','chiLT','kyy','kyz','kzy','kzz','UR','State','Governing','SectionOut',...checkNames.map((_,i)=>'State'+i)];
  const inputResult:InputResultConfig={title:'EC3 members — simultaneous combinations',inputs:inputs.map(key=>({id:key,label:key==='Section'?'Section ID (library)':key,regionId:bound.get(key)!})),outputs:outputs.map(key=>({id:key,label:key==='State'?'State: 1 PASS / 0 FAIL / −1 NOT VERIFIED':key,regionId:bound.get(key)!,...(key.startsWith('State')?{valueLabels:{'1':'PASS','0':'FAIL','-1':'NOT VERIFIED'}}:key==='Governing'?{valueLabels:Object.fromEntries(checkNames.map((n,i)=>[String(i),n]))}:key==='SectionOut'?{valueLabels:{'0':'User-defined',...Object.fromEntries(sections.map(s=>[String(s.id),s.name]))}}:{})})),rows:[{id:'LC1',name:'Member 1 / ULS 1',values:{N:100,My:50,Mz:5,Vy:0,Vz:0}},{id:'LC2',name:'Member 1 / ULS 2',values:{N:200,My:100,Mz:10,Vy:0,Vz:0}}]};
  for(const shape of shapes)shape.printGroupId=`ec3-sheet-${Math.floor(shape.y/(A4.h+PAGE_GAP))}`;
  for(const row of inputResult.rows)row.values={...Object.fromEntries(inputs.map(k=>[k,null])),...row.values};
  return {shapes,inputResult};
}
export function steelBeamColumnShapes(): Shape[] { return steelBeamColumnTemplate().shapes; }
