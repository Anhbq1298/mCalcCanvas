import { checkNames } from '../../engineering/steel/contract';
import { LtbDiagram, SectionProfile, SlsDiagram, BucklingReference } from '../../components/dialogs/SteelDiagrams';
import type { FormattedQuantity } from '../../engine/UnitSystem';
export function SteelFigure({kind,value}: {kind:'section'|'ltb'|'sls'|'buckling'|'state'|'mode'|'issues';value?:FormattedQuantity}) {
  if(kind==='mode') return <span className="font-sans text-xs text-slate-700">Governing: {checkNames[value?.number??-1]??'NOT VERIFIED'}</span>;
  if(kind==='issues') {
    const labels=['CLASS 4 SECTION','Shear buckling','LTB configuration','Buckling curves','Annex B factors','High-shear stability','Torsional interaction','SLS model','Biaxial shear'];
    const flags=value?.number??255;
    const messages=labels.filter((_,i)=>(flags&(1<<i))!==0);
    return <span className="block max-w-[610px] whitespace-normal font-sans text-[10px] text-amber-800">{messages.length?'NOT VERIFIED — '+messages.join('; '):'All applicable checks verified within the stated scope. See assumptions and limitations in annex.'}</span>;
  }
  if(kind==='state') {
    const n=value?.number;
    const state=n===1?'PASS':n===0?'FAIL':'NOT VERIFIED';
    return <span data-testid="steel-state" className={'inline-block whitespace-nowrap rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold '+(n===1?'bg-emerald-100 text-emerald-800':n===0?'bg-red-100 text-red-800':'bg-amber-100 text-amber-900')}>{state}</span>;
  }
  if(kind==='buckling')return <BucklingReference/>;
  const v=value?.items??[];
  if(v.length<4)return <span className="text-xs text-amber-700">Diagram pending valid calculation</span>;
  if(kind==='sls')return <SlsDiagram mode={v[0]} q={v[1]} P={v[2]} length={v[3]}/>;
  return kind==='section'?<SectionProfile h={v[0]} b={v[1]} tw={v[2]} tf={v[3]}/>:<LtbDiagram loadCase={v[0]} height={v[1]} length={v[2]} k={v[3]} kw={v[4]} actions={v.length>5?v.slice(5):undefined}/>;
}
