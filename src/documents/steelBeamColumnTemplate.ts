/** Editable EC3 worksheet. Numeric contracts are documented in steel/contract.ts. */
import { newShapeId } from '../canvas/model/canvasStore';
import { DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS, type Shape, type MathProps, type AnnexRole } from '../canvas/model/types';
import { escapeHtml } from '../canvas/sanitize';
import { A4, PAGE_GAP } from '../export/pageGeometry';
import { propertyKeys, sectionUnits, sections } from '../engineering/steel/sections';
import { checkNames, definition, inputFields, outputFields, symbol } from '../engineering/steel/contract';
import type { InputResultConfig } from './DocumentTypes';

export function steelBeamColumnTemplate(): {shapes:Shape[];inputResult:InputResultConfig} {
  const shapes:Shape[]=[], bound=new Map<string,string>();
  const Y=(p:number,r:number)=>(p-1)*(A4.h+PAGE_GAP)+60+r*40;
  const text=(p:number,r:number,html:string,heading:0|1|2=0,x=76,w=640,annex?:AnnexRole)=>{
    shapes.push({id:newShapeId(),type:'text',x,y:Y(p,r),props:{...DEFAULT_TEXT_PROPS,w,h:heading?28:24,html:escapeHtml(html),fontSize:heading===1?19:heading===2?15:12,color:heading?'#1e3a5f':'#475569',...(heading?{heading}:{}),...(annex?{annex}:{})}});
  };
  const math=(p:number,r:number,latex:string,x=96,extra:Partial<MathProps>={})=>{
    const id=newShapeId(); shapes.push({id,type:'math',x,y:Y(p,r),props:{...DEFAULT_MATH_PROPS,latex,fontSize:14,w:250,h:32,baseline:20,displayMode:'formulaResult',...extra}});return id;
  };
  const input=(p:number,r:number,key:string,rhs:string,x=96)=>{const id=math(p,r,definition(key)+rhs,x,{displayMode:'formula'});bound.set(key,id);return id;};
  const pair=(p:number,r:number,a:[string,string],b:[string,string])=>{input(p,r,...a);input(p,r,...b,396);};
  const q=(n:number,u:string)=>`${n}\\,\\mathrm{${u}}`;
  text(1,0,'STEEL BEAM & BEAM-COLUMN DESIGN',1);
  text(1,0.8,'EN 1993-1-1:2005 + A1:2014 · Doubly symmetric rolled I/H · prismatic member');
  input(1,2,'Section','1211');
  text(1,2.8,'Steel section source: licensed offline catalogue; designation and dataset shown beside Section ID');
  text(1,3.7,'1  MATERIAL / NATIONAL ANNEX — designer-selected values',2);
  pair(1,4.7,['fy',q(355,'MPa')],['fu',q(510,'MPa')]);
  pair(1,5.7,['E',q(210,'GPa')],['G',q(80.76923,'GPa')]);
  pair(1,6.7,['gamma0','1'],['gamma1','1']);
  input(1,7.7,'gamma2','1.25');
  text(1,8.7,'2  LENGTHS / FLEXURAL BUCKLING — Ky and Kz are editable',2);
  pair(1,9.7,['L',q(5,'m')],['Llt',q(5,'m')]);
  pair(1,10.7,['Ky','1'],['Kz','1']);
  text(1,11.7,'3  SIMULTANEOUS ULS ACTIONS — one combination and member position',2);
  pair(1,12.7,['N',q(100,'kN')],['My',q(50,'kN')+'\\cdot\\mathrm{m}']);
  pair(1,13.7,['Mz',q(5,'kN')+'\\cdot\\mathrm{m}'],['Vy',q(0,'kN')]);
  input(1,14.7,'Vz',q(30,'kN'));
  text(1,15.7,'Compression N positive; y major, z minor. Moment/shear signs retained; checks use |demand|.');
  text(1,16.7,'4  SERVICEABILITY — separate unfactored loads / project limit',2);
  pair(1,17.7,['q',q(5,'kN')+'/\\mathrm{m}'],['P',q(0,'kN')]);
  pair(1,18.7,['SLSmode','0'],['LimitRatio','250']);
  text(1,19.7,'SLS mode: 0 simple beam, UDL + central point; 1 cantilever, UDL + tip; 2 external.');
  input(1,21,'LTBmode','0');
  text(1,22,'Calculate section, stability and SLS — editable properties and factors',0,76,640,{kind:'link',target:'ec3'});
  text(1,23,'Assumptions: no holes; uniform moments for interaction; fork ends; free warping.');
  text(1,23.8,'Specify actual segment lengths/restraints. Presence of a slab does not establish lateral restraint.');

  text(2,0,'5  GOVERNING DESIGN SUMMARY',1);
  math(2,1,definition('State')+'\\operatorname{entry}('+symbol('R')+',4)',96,{steelFigure:'state'});
  math(2,1,definition('UR')+'\\operatorname{entry}('+symbol('R')+',3)',396,{displayMode:'result'});
  math(2,2.6,definition('Issues')+`\\operatorname{entry}(${symbol('R')},${outputFields.findIndex(([n])=>n==='flags')})`,76,{steelFigure:'issues',displayMode:'result'});
  text(2,3.5,'Check / clause',0,76,180);text(2,3.5,'Resistance',0,276,120);text(2,3.5,'Demand',0,416,100);text(2,3.5,'UR',0,536,60);text(2,3.5,'Status',0,616,100);
  const resistances=[`\\operatorname{if}(${symbol('N')}<0\\,\\mathrm{N},\\operatorname{entry}(${symbol('R')},7),\\operatorname{entry}(${symbol('R')},6))`,...['My','Mz','Vy','Vz'].map(k=>`\\operatorname{entry}(${symbol('R')},${outputFields.findIndex(([n])=>n===k)})`),'1',...['NbY','NbZ','NbT','Mb'].map(k=>`\\operatorname{entry}(${symbol('R')},${outputFields.findIndex(([n])=>n===k)})`),'1','1',`${symbol('L')}/${symbol('LimitRatio')}`];
  const demands=['N','My','Mz','Vy','Vz','sectionUr','N','N','N','My','iy','iz','delta'];
  const clauses=['6.2.3 / 6.2.4','6.2.5 / 6.2.8','6.2.5 / 6.2.8','6.2.6','6.2.6 / EN 1993-1-5','6.2.1(7) / 6.2.10','6.3.1.2','6.3.1.2','6.3.1.4','6.3.2.2','6.3.3 / Annex B','6.3.3 / Annex B','EN 1990 / project'];
  checkNames.forEach((name,i)=>{
    const row=4.3+i;
    text(2,row,name,0,76,190);const label=shapes.at(-1)!;if(label.type==='text'){label.props.html=escapeHtml(name)+'<br/>'+escapeHtml(clauses[i]);label.props.fontSize=11;label.props.h=34;}
    math(2,row+0.2,definition('r'+i)+resistances[i],276,{displayMode:'value',constant:true,w:120,fontSize:12,h:28,...(i===12?{displayUnit:'mm'}:{})});
    const demand=i===5||i>=10?`\\operatorname{entry}(${symbol('R')},${outputFields.findIndex(([n])=>n===demands[i])})`:`\\operatorname{abs}(${symbol(demands[i])})`;
    math(2,row+0.2,definition('d'+i)+demand,416,{displayMode:'value',constant:true,w:120,fontSize:12,h:28,...(i===12?{displayUnit:'mm'}:{})});
    const urIndex=outputFields.length+2*i;
    math(2,row+0.2,definition('UR'+i)+`\\operatorname{entry}(${symbol('R')},${urIndex})`,536,{displayMode:'value',constant:true,w:70,fontSize:12,h:28});
    const id=math(2,row+0.2,definition('State'+i)+`\\operatorname{entry}(${symbol('R')},${urIndex+1})`,616,{steelFigure:'state',w:100,h:28});bound.set('State'+i,id);
  });
  text(2,18.2,'6  KEY INTERMEDIATE RESULTS — section class, Euler loads, reduction factors',2);
  const intermediates=['sectionClass','NcrY','NcrZ','chiY','chiZ','Mcr','chiLT','kyy','kyz','kzy','kzz','rho'];
  intermediates.forEach((key,i)=>{const index=outputFields.findIndex(([n])=>n===key);const id=math(2,19.3+Math.floor(i/2),definition(key)+`\\operatorname{entry}(${symbol('R')},${index})`,i%2?396:96,{displayMode:'result'});bound.set(key,id);});
  math(2,1.8,definition('Governing')+`\\operatorname{entry}(${symbol('R')},5)`,96,{displayMode:'result',steelFigure:'mode'});
  math(2,1.8,definition('SectionOut')+symbol('Section'),396,{displayMode:'result'});
  text(2,17.3,'Batch: 1 PASS / 0 FAIL / −1 NOT VERIFIED. UR −1 means unverified.');

  text(3,0,'ANNEX',1,76,640,{kind:'start'});
  text(3,1,'Section data, calculation inputs and EC3 calculation',2,76,640,{kind:'heading',id:'ec3'});
  text(3,2,'Properties have explicit units. Replace any lookup definition with a verified literal to override it.');
  propertyKeys.slice(0,16).forEach((key,i)=>{const id=input(3,3+Math.floor(i/2),key,`\\operatorname{sectionProp}(${symbol('Section')},${i})`,i%2?396:96);const s=shapes.find(s=>s.id===id)!;if(s.type==='math'){s.props.displayMode='result';s.props.displayUnit=sectionUnits[key];}});
  const advanced: [string,string][]=[
    ['Lt',symbol('L')],['alphaY','0.34'],['alphaZ','0.49'],['alphaLT','0.21'],
    ['LoadCase','0'],['zg',q(0,'mm')],['k','1'],['kw','1'],['C1','1'],['C2','0'],['McrExternal',q(0,'kN')+'\\cdot\\mathrm{m}'],
    ['InteractionMode','0'],['Cmy','1'],['Cmz','1'],['CmLT','1'],['kyyManual','1'],['kyzManual','1'],['kzyManual','1'],['kzzManual','1'],
    ['DeltaExternal',q(0,'mm')],['Anet',symbol('A')],['eta','1.2'],['FactorsVerified','1'],['LTBverified','0'],['CurvesVerified','1'],['ManualFactorsVerified','0'],
  ];
  advanced.forEach(([key,rhs],i)=>input(3,11.5+Math.floor(i/2),key,rhs,i%2?396:96));
  text(3,24.4,'InteractionMode: 0 Annex B plastic I, λz ≥ 0.4; 1 independently verified manual kij.');


  text(4,0,'CALCULATION CONTRACT / REFERENCES',2);
  const stack=(names:string[])=>`\\operatorname{stack}(${names.map(symbol).join(',')})`;
  const chunks=(keys:string[],prefix:string,start:number)=>{
    const groups:string[]=[];
    for(let i=0;i<keys.length;i+=6){const key=prefix+groups.length;groups.push(key);math(4,start+groups.length-1,definition(key)+stack(keys.slice(i,i+6)),96,{displayMode:'formula'});}
    math(4,start+groups.length,definition(prefix)+stack(groups),96,{displayMode:'formula'});return start+groups.length+1;
  };
  let row=chunks(propertyKeys.slice(0,16),'S',1);
  const mapping: Record<string,string>={gamma0:'gamma0',gamma1:'gamma1',gamma2:'gamma2',ltbMode:'LTBmode',loadCase:'LoadCase',loadHeight:'zg',externalMcr:'McrExternal',interactionMode:'InteractionMode',kyy:'kyyManual',kyz:'kyzManual',kzy:'kzyManual',kzz:'kzzManual',slsMode:'SLSmode',displacement:'DeltaExternal',limitRatio:'LimitRatio',netArea:'Anet',verifiedFactors:'FactorsVerified',ltbVerified:'LTBverified',curveVerified:'CurvesVerified',manualVerified:'ManualFactorsVerified'};
  row=chunks(inputFields.map(([n])=>mapping[n]??n),'I',row);
  math(4,row,definition('R')+`\\operatorname{steelDesign}(${symbol('S')},${symbol('I')})`,96,{displayMode:'formula'});
  text(4,row+1,'LTB reference: NCCI SN003b; uniform I/H; fork ends / free warping');
  math(4,row+2,definition('LTBmodel')+`\\operatorname{stack}(${symbol('LoadCase')},${symbol('zg')}/\\mathrm{mm},${symbol('Llt')}/\\mathrm{mm},${symbol('k')},${symbol('kw')})`,96,{displayMode:'formula',steelFigure:'ltb',w:566,h:242});
  math(4,row+8.2,definition('Cused1')+`\\operatorname{entry}(${symbol('R')},28)`,96,{displayMode:'result'});
  math(4,row+8.2,definition('Cused2')+`\\operatorname{entry}(${symbol('R')},29)`,396,{displayMode:'result'});
  text(4,row+9.2,'Cused1 / Cused2 apply to coefficient modes only; external Mcr bypasses them.');
  // Reference diagrams are unlinked and never modify Ky / Kz.
  text(5,0,'BUCKLING K — REFERENCE ONLY',2,76,640,{kind:'heading',id:'buckling-k'});
  math(5,1,definition('Kreference')+'1',76,{steelFigure:'buckling',displayMode:'formula',w:626,h:204,constant:true});
  text(5,6.2,'Ideal elastic members only. Fixed–guided: end rotations restrained, relative translation free.');
  text(5,7,'Actual K depends on frame sway, connection stiffness and intermediate restraints.');
  text(5,8,'Complex frames may require a separate stability analysis. Viewing this annex never changes Ky/Kz.');
  text(5,9,'LTB k / kw are lateral-bending / warping boundary factors, separate from flexural Ky / Kz.');
  text(5,11,'TECHNICAL SCOPE / NOT VERIFIED',2);
  text(5,12,'Class 4, shear buckling, biaxial shear, arbitrary LTB and Annex A require separate verification.');
  text(5,12.8,'Annex B auto: Class 1/2, λz ≥ 0.4; other cases require independently verified manual kij.');
  text(5,13.6,'No applied torsion. Connections, block tearing and fatigue excluded; Lt specified independently.');
  text(5,14.4,'High-shear member interaction needs a separate check; use external SLS for other loading.');
  text(5,15.2,'NA: designer-selected factors / curves / η. General LTB §6.3.2.2; 2022 edition not used.');
  text(5,16.2,'COMPRESSION INTERACTION — §6.3.3; main summary governs verification',2);
  math(5,17.2,definition('NRk')+`${symbol('A')}${symbol('fy')}`,96);
  math(5,18.2,definition('MyRk')+`\\operatorname{if}(${symbol('sectionClass')}<3,${symbol('Wpl_y')},${symbol('Wel_y')})${symbol('fy')}`,96,{displayMode:'formulaResult',fontSize:12});
  math(5,19.2,definition('MzRk')+`\\operatorname{if}(${symbol('sectionClass')}<3,${symbol('Wpl_z')},${symbol('Wel_z')})${symbol('fy')}`,96,{displayMode:'formulaResult',fontSize:12});
  const interaction=(axis:'y'|'z')=>`J_{${axis}}(n,m_{y},m_{z})\\coloneq\\frac{n}{${symbol(axis==='y'?'chiY':'chiZ')}${symbol('NRk')}/${symbol('gamma1')}}+${symbol(axis==='y'?'kyy':'kzy')}\\frac{m_{y}}{${symbol('chiLT')}${symbol('MyRk')}/${symbol('gamma1')}}+${symbol(axis==='y'?'kyz':'kzz')}\\frac{m_{z}}{${symbol('MzRk')}/${symbol('gamma1')}}`;
  math(5,20.5,interaction('y'),96,{displayMode:'formula',fontSize:12,h:44});
  math(5,22,interaction('z'),96,{displayMode:'formula',fontSize:12,h:44});
  text(5,23.5,'Check both J_y and J_z ≤ 1 with absolute simultaneous moments; coefficient validity is separate.');
  text(5,24.3,'Sources and validation: EN 1993-1-1 §§5.5 / 6.2 / 6.3; SCI SN003b; JRC 2014 Simões.');
  const inputs=['Section','fy','fu','L','Ky','Kz','Llt','N','My','Mz','Vy','Vz','LTBmode','LoadCase'];
  const outputs=['sectionClass','Mcr','chiY','chiZ','chiLT','kyy','kyz','kzy','kzz'];
  const find=(prefix:string)=>shapes.find(s=>s.type==='math'&&s.props.latex.startsWith(definition(prefix)))!.id;
  const inputResult:InputResultConfig={title:'EC3 members — simultaneous combinations',inputs:inputs.map(key=>({id:key,label:key==='Section'?'Section ID (library)':key,regionId:bound.get(key)!})),outputs:[...outputs,'UR','State','Governing','SectionOut',...checkNames.map((_,i)=>'State'+i)].map(key=>({id:key,label:key==='State'?'State: 1 PASS / 0 FAIL / −1 NOT VERIFIED':key,regionId:bound.get(key)??find(key), ...(key.startsWith('State')?{valueLabels:{'1':'PASS','0':'FAIL','-1':'NOT VERIFIED'}}:key==='Governing'?{valueLabels:Object.fromEntries(checkNames.map((n,i)=>[String(i),n]))}:key==='SectionOut'?{valueLabels:{'0':'User-defined',...Object.fromEntries(sections.map(s=>[String(s.id),s.name]))}}:{})})),rows:[{id:'LC1',name:'Member 1 / ULS 1',values:{N:100,My:50,Mz:5,Vy:0,Vz:30}},{id:'LC2',name:'Member 1 / ULS 2',values:{N:200,My:100,Mz:10,Vy:0,Vz:60}}]};
  for(const shape of shapes)shape.printGroupId=`ec3-sheet-${Math.floor(shape.y/(A4.h+PAGE_GAP))}`;
  for(const row of inputResult.rows) row.values={...Object.fromEntries(inputs.map(k=>[k,null])),...row.values};
  return {shapes,inputResult};
}
export function steelBeamColumnShapes():Shape[]{return steelBeamColumnTemplate().shapes;}
