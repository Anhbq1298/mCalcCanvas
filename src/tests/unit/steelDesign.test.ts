import {describe,expect,it} from 'vitest';
import {step} from '../step';
import {designSteel,criticalMoment,method2,type SteelInput} from '../../engineering/steel/ec3';
import {sections,sectionById,validateSection} from '../../engineering/steel/sections';
import {CalculationEngine} from '../../engine/CalculationEngine';
import {steelBeamColumnTemplate} from '../../documents/steelBeamColumnTemplate';
import {calcKey} from '../../canvas/engineBridge';
import {definition,symbol,outputFields} from '../../engineering/steel/contract';
import {runBatchJob} from '../../engine/batch';
import {parseDocument,serializeDocument} from '../../documents/DocumentSerializer';
import {DEFAULT_SETTINGS,DOCUMENT_VERSION} from '../../documents/DocumentTypes';
const s=sectionById(1211).values;
const a:SteelInput={fy:355,fu:510,E:210000,G:80769.23,gamma0:1,gamma1:1,gamma2:1.25,L:5000,Ky:1,Kz:1,Llt:5000,Lt:5000,N:100000,My:50e6,Mz:5e6,Vy:0,Vz:30000,alphaY:0.21,alphaZ:0.34,alphaLT:0.34,ltbMode:0,loadCase:0,loadHeight:0,k:1,kw:1,C1:1,C2:0,externalMcr:0,interactionMode:0,Cmy:1,Cmz:1,CmLT:1,kyy:1,kyz:1,kzy:1,kzz:1,slsMode:0,q:5,P:0,displacement:0,limitRatio:250,netArea:s.A,eta:1.2,verifiedFactors:1,ltbVerified:0,curveVerified:1,manualVerified:0};

describe('EC3 2005 engineering and catalogue',()=>{
 it('validates sources, independent references and bounded design scope',()=>{
  step('every catalogue record passes geometry, published precision and unit conversion checks',()=>{
   const invalid=sections.flatMap(s=>validateSection(s).map(error=>`${s.name}: ${error}`));expect(invalid).toEqual([]);
   expect(new Set(sections.map(s=>s.id)).size).toBe(sections.length);
   // IPE 360 public EN tables rounded to 3 significant figures; source contour values within 0.2%.
   expect(sectionById(1012).values.A/7270).toBeCloseTo(1,2);expect(sectionById(1012).values.Iy/162700000).toBeCloseTo(1,2);
  });
  step('Dlubal KB 001622 independent critical moment example, NCCI SN003b',()=>{
   const m=criticalMoment({...s,Iz:10140e4,Iw:2883000e6,It:292.5e4},{...a,G:80769.2,Llt:6500,C1:1.127,C2:0.454,loadHeight:180});
   expect(m/1e6).toBeCloseTo(1153.10,1); // printed reference rounded to 0.01 kNm, stiffness rounded
   const center=criticalMoment(s,{...a,C1:1.127,C2:0.454,loadHeight:0});
   expect(criticalMoment(s,{...a,C1:1.127,C2:0.454,loadHeight:180})).toBeLessThan(center);
   expect(criticalMoment(s,{...a,C1:1.127,C2:0.454,loadHeight:-180})).toBeGreaterThan(center);
  });
  step('JRC 2014 Simoes HEB320 example 3, independent buckling and Annex B factors',()=>{
   const r=designSteel({...s,h:320,b:300,tw:11.5,tf:20.5,r:27,A:16130,Iy:308200000,Iz:92390000,Wpl_y:2149000,Wpl_z:939100,Wel_y:1926250,Wel_z:615933.333}, {...a,fy:355,L:4335,Lt:4335,Llt:4335,N:1704000,My:24.8e6,Mz:0,Vy:0,Vz:0,netArea:16130,alphaY:0.34,alphaZ:0.49,ltbMode:2,externalMcr:5045.1e6,Cmy:0.428,CmLT:0.428});
   expect(r.values.ly).toBeCloseTo(0.41,2);expect(r.values.lz).toBeCloseTo(0.75,2);
   expect(r.values.chiY).toBeCloseTo(0.92,2);expect(r.values.chiZ).toBeCloseTo(0.69,2);
   expect(r.values.kyy).toBeCloseTo(0.46,2);expect(r.values.kzy).toBeCloseTo(0.82,2);
   // JRC uses alternative LTB; do not compare its chiLT with the general-method result.
  });
  step('tension, compression, both bending axes, shear and simultaneous interactions',()=>{
   const pure={...a,N:0,My:0,Mz:0,Vy:0,Vz:0};
   for(const actions of [{N:100000},{N:-100000},{My:50e6},{Mz:5e6},{My:50e6,Mz:5e6},{N:100000,My:50e6,Mz:5e6},{Vz:30000}]){
    const r=designSteel(s,{...pure,...actions});expect(r.state,JSON.stringify({actions,limitations:r.limitations})).toBe('PASS');expect(r.governingUr).toBeGreaterThanOrEqual(0);
   }
   const resistance=designSteel(s,pure).values;
   expect(resistance.Nc).toBeCloseTo(5727676.5,6);expect(resistance.Nt).toBeCloseTo(5727676.5,6);
   expect(resistance.My).toBeCloseTo(762980200,4);expect(resistance.Mz).toBeCloseTo(333379435,4);
   expect(resistance.Vy).toBeCloseTo(2520999.950416501,6);expect(resistance.Vz).toBeCloseTo(1061080.6807564828,6);
   expect(designSteel(s,{...pure,N:-3e6,netArea:s.A/2}).checks[0].state).toBe('FAIL');
   expect(designSteel(s,{...pure,N:4e6}).state).toBe('FAIL');
   expect(designSteel(s,{...pure,N:-8e6}).state).toBe('FAIL');
   expect(designSteel(s,{...a,Ky:2}).values.NcrY).toBeCloseTo(designSteel(s,a).values.NcrY/4,6);
   expect(designSteel(s,{...a,Kz:2}).values.NcrZ).toBeCloseTo(designSteel(s,a).values.NcrZ/4,6);
  });
  step('class boundaries, high shear, missing factors and unsupported modes cannot silently pass',()=>{
   for(const [ratio,cl] of [[8,1],[9.5,2],[12,3],[15,4]]){
    const r=designSteel({...s,b:200,tw:10,tf:190/(2*ratio),r:0,h:250},{...a,fy:235,N:1000,My:0,Mz:0,Vy:0,Vz:0});
    expect(r.flangeClass).toBe(cl);if(cl===4)expect(r.state).toBe('NOT VERIFIED');
   }
   expect(method2(0.1,0.2,0.3,0.2,1,1,1)).toBeNull();
   expect(designSteel(s,{...a,interactionMode:1}).state).toBe('NOT VERIFIED');
   expect(designSteel(s,{...a,interactionMode:1,manualVerified:1}).state).toBe('PASS');
   expect(designSteel(s,{...a,curveVerified:0}).state).toBe('NOT VERIFIED');
   expect(designSteel(s,{...a,Vy:10000,Vz:30000}).state).toBe('NOT VERIFIED');
   expect(designSteel(s,{...a,verifiedFactors:0}).state).toBe('NOT VERIFIED');
   expect(designSteel(s,{...a,loadCase:5}).state).toBe('NOT VERIFIED');
   expect(designSteel(s,{...a,kw:0.5}).state).toBe('NOT VERIFIED');
   expect(designSteel(s,{...a,ltbMode:1,ltbVerified:0}).state).toBe('NOT VERIFIED');
   expect(designSteel(s,{...a,ltbMode:1,ltbVerified:1}).checks.find(c=>c.name==='LTB')?.state).toBe('PASS');
   const high=designSteel(s,{...a,Vz:0.75*s.Avz*a.fy/Math.sqrt(3)});
   expect(high.values.rho).toBeCloseTo(0.25,12);expect(high.state).toBe('NOT VERIFIED');
   expect(designSteel(s,{...a,Vz:2*s.Avz*a.fy/Math.sqrt(3)}).state).toBe('FAIL');
   expect(()=>designSteel(s,{...a,L:0})).toThrow(/Positive L/);
  });
  step('classical SLS closed form and project-specific limits',()=>{
   // Independent prismatic I=308235000 mm4, E=210000 MPa, L=5000 mm, w=5 N/mm.
   expect(designSteel(s,a).values.delta).toBeCloseTo(0.6286190756846263,7);
   expect(designSteel(s,{...a,slsMode:1}).values.delta).toBeCloseTo(6.034743126572412,7);
   const external=designSteel(s,{...a,slsMode:2,displacement:21,limitRatio:250});
   expect(external.checks.at(-1)?.state).toBe('FAIL');
  });
 });
});

describe('steel worksheet engine, workers contract, batch and serialization',()=>{
 it('recalculates the editable worksheet and preserves portable overrides',()=>{
  const {shapes,inputResult}=steelBeamColumnTemplate();
  const record=Object.fromEntries(shapes.map(s=>[s.id,s]));
  const regions=shapes.filter(s=>s.type==='math').map(s=>({id:s.id,input:{latex:s.props.latex,order:calcKey(s,record)}}));
  const engine=new CalculationEngine();engine.batch(()=>regions.forEach(r=>engine.setRegion(r.id,r.input)));
  step('template evaluates all regions and every result has its expected units',()=>{
   const errors=regions.flatMap(r=>engine.getResult(r.id)?.error?.message??[]);expect(errors).toEqual([]);
   const state=shapes.find(s=>s.type==='math'&&s.props.latex.startsWith(definition('State')))!;
   expect(engine.getResult(state.id)?.value?.number).toBe(1);
  });
  step('readable equations independently reproduce the guarded kernel before and after a K edit',()=>{
   const pairs=[['NcRd','Nc'],['NtRd','Nt'],['MyRd','My'],['MzRd','Mz'],['VyRd','Vy'],['VzRd','Vz'],['NcrY','NcrY'],['NcrZ','NcrZ'],['NcrT','NcrT'],['lambdaY','ly'],['lambdaZ','lz'],['chiY','chiY'],['chiZ','chiZ'],['chiT','chiT'],['NbY','NbY'],['NbZ','NbZ'],['NbT','NbT'],['McrCalc','Mcr'],['lambdaLT','lambdaLT'],['chiLT','chiLT'],['Mb','Mb'],['kyy','kyy'],['kyz','kyz'],['kzy','kzy'],['kzz','kzz'],['Jy','iy'],['Jz','iz'],['delta','delta'],['URsection','sectionUr']];
   const compare=()=>{
    for(const [key,output] of pairs){
     const ref=`\\operatorname{entry}(${symbol('R')},${outputFields.findIndex(([n])=>n===output)})`;
     engine.setRegion('report-comparison',{latex:`(${symbol(key)}-${ref})/${ref}=`,order:1e8});
     expect(engine.getResult('report-comparison')?.error,key).toBeUndefined();
     expect(engine.getResult('report-comparison')?.value?.number,key).toBeCloseTo(0,10);
    }
   };
   compare();
   const ky=regions.find(r=>r.input.latex.startsWith(definition('Ky')))!;
   engine.setRegion(ky.id,{...ky.input,latex:definition('Ky')+'2'});compare();
   engine.setRegion(ky.id,ky.input);
   const full=shapes.filter(s=>s.type==='math'&&s.props.displayMode==='full');
   expect(full.length).toBeGreaterThanOrEqual(6);
   for(const shape of full)expect(engine.getResult(shape.id)?.substitutionLatex,shape.id).toBeTruthy();
  });
  step('lookup functions reject missing and dimensionally incorrect inputs',()=>{
   engine.setRegion('bad',{latex:'\\operatorname{sectionProp}(1,0)=',order:10000});expect(engine.getResult('bad')?.error?.message).toMatch(/Unknown steel/);
   engine.setRegion('bad',{latex:'\\operatorname{sectionProp}(1\\,\\mathrm{m},0)=',order:10000});expect(engine.getResult('bad')?.error?.code).toBe('unit-mismatch');
  });
  step('batch section/action overrides have no leakage in either case order',()=>{
   const N=inputResult.inputs.find(c=>c.id==='N')!.regionId,section=inputResult.inputs.find(c=>c.id==='Section')!.regionId;
   const rows=[{id:'a',overrides:[{regionId:N,value:100,unit:'kN'},{regionId:section,value:1012,unit:''}]},{id:'b',overrides:[{regionId:N,value:300,unit:'kN'},{regionId:section,value:1011,unit:''}]}];
   const job={regions,inputIds:inputResult.inputs.map(c=>c.regionId),rows,outputs:inputResult.outputs.map(c=>({columnId:c.id,regionId:c.regionId}))};
   const forward=runBatchJob(job,{}),reverse=runBatchJob({...job,rows:[...rows].reverse()},{});
   expect(forward).toEqual(reverse);expect(forward.a.outputs.UR?.value?.number).not.toBe(forward.b.outputs.UR?.value?.number);
  });
  step('mCCV optional figure props and input bindings survive save/load; unknown props are removed',()=>{
   const time='2026-11-10T00:00:00.000Z';const doc={id:'steel-fixture',version:DOCUMENT_VERSION,title:'EC3',metadata:{project:'Validation',calculationReference:'EC3-1',preparedBy:'',checkedBy:'',revision:'A'},settings:DEFAULT_SETTINGS,inputResult,shapes,createdAt:time,updatedAt:time};
   const parsed=parseDocument(JSON.parse(serializeDocument(doc)));
   expect(parsed.shapes.map(s=>s.type==='math'?s.props.steelFigure:undefined)).toEqual(shapes.map(s=>s.type==='math'?s.props.steelFigure:undefined));
   expect(parsed.inputResult).toEqual(inputResult);
   expect(parsed.shapes.map(s=>s.printGroupId)).toEqual(shapes.map(s=>s.printGroupId));
   const invalid=parseDocument({...doc,shapes:doc.shapes.map((s,i)=>i?s:{...s,printGroupId:'<script>'})});
   expect(invalid.shapes[0].printGroupId).toBeUndefined();
  });
 });
});
