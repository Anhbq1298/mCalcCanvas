import { checkNames } from '../../engineering/steel/contract';
import { LtbDiagram, SectionProfile } from '../../components/dialogs/SteelControls';
import type { FormattedQuantity } from '../../engine/UnitSystem';
export function SteelFigure({kind,value}: {kind:'section'|'ltb'|'buckling'|'state'|'mode'|'issues';value?:FormattedQuantity}) {
  if(kind==='mode') return <span className="font-sans text-xs text-slate-700">Governing: {checkNames[value?.number??-1]??'NOT VERIFIED'}</span>;
  if(kind==='issues') {
    const labels=['NOT VERIFIED — CLASS 4 SECTION','Shear buckling required','LTB configuration unverified','Buckling curves unverified','Annex B factors unverified','High-shear stability unverified','Torsional interaction unverified','SLS model unverified','Biaxial shear interaction unverified'];
    const flags=value?.number??255;
    const messages=labels.filter((_,i)=>(flags&(1<<i))!==0);
    return <span className="block max-w-[610px] whitespace-normal font-sans text-[10px] text-amber-800">{messages.length?messages.join('; '):'All applicable checks verified within the stated scope. See assumptions and limitations in annex.'}</span>;
  }
  if(kind==='state') {
    const n=value?.number;
    const state=n===1?'PASS':n===0?'FAIL':'NOT VERIFIED';
    return <span data-testid="steel-state" className={'inline-block whitespace-nowrap rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold '+(n===1?'bg-emerald-100 text-emerald-800':n===0?'bg-red-100 text-red-800':'bg-amber-100 text-amber-900')}>{state}</span>;
  }
  if(kind==='buckling')return <svg role="img" aria-label="Idealized buckling end conditions" viewBox="0 0 630 170" width="610" height="170">
    {['Pin–pin','Fixed–fixed','Fixed–pin','Fixed–free','Fixed–guided'].map((t,i)=><g key={t} transform={`translate(${i*126},0)`}>
      <path d="M55 30V120" stroke="#475569" strokeWidth="2"/>
      <path d={i===3?'M55 120Q90 65 105 30':i===1?'M55 30C25 55 85 95 55 120':'M55 30Q95 75 55 120'} fill="none" stroke="#2563eb" strokeDasharray="4 3"/>
      {i===0||i===2?<path d="M55 30l-8-10h16Z" stroke="#475569" fill="none"/>:i!==3?<path d="M40 25h30m-30-5h30" stroke="#475569"/>:null}
      {i===0?<path d="M55 120l-8 10h16Z" stroke="#475569" fill="none"/>:<path d="M40 125h30m-30 5h30" stroke="#475569"/>}
      <text x="4" y="150" fontSize="12">{t}</text><text x="27" y="167" fontSize="12">K={['1.0','0.5','≈0.7','2.0','1.0'][i]}</text>
    </g>)}
  </svg>;
  const v=value?.items??[];
  if(v.length<4)return <span className="text-xs text-amber-700">Diagram pending valid calculation</span>;
  return kind==='section'?<SectionProfile h={v[0]} b={v[1]} tw={v[2]} tf={v[3]}/>:<LtbDiagram loadCase={v[0]} height={v[1]} length={v[2]} k={v[3]} kw={v[4]}/>;
}
