import { SectionProfile } from './SteelDiagrams';
export { LtbDiagram, SectionProfile } from './SteelDiagrams';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { sections, sectionById, sectionUnits, propertyKeys, validateSection, type SteelSection } from '../../engineering/steel/sections';
import { transaction, updateShape, updateShapes, useCanvasStore } from '../../canvas/model/canvasStore';
import type { ShapePatch } from '../../canvas/model/canvasStore';
import { escapeHtml } from '../../canvas/sanitize';
import { definition, symbol } from '../../engineering/steel/contract';
import { useCalculationStore } from '../../store/calculationStore';
import { rolledCurves } from '../../engineering/steel/ec3';

const fieldClass='rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900';
const buttonClass='rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700';
function inputPrefix(latex:string,key:string):string|undefined {
  const m=/^([A-Za-z]+)(.*)$/.exec(key);
  const old=m?`\\mathrm{${m[1]}}${m[2]?'_{'+m[2].replace(/^_/, '')+'}':''}\\coloneq`:definition(key);
  return [definition(key),old].find(prefix=>latex.startsWith(prefix));
}
function replaceInputs(values: Record<string,string>) {
  const patches: Record<string,ShapePatch>={};
  for(const s of Object.values(useCanvasStore.getState().shapes)) if(s.type==='math') {
    for(const [name,rhs] of Object.entries(values)) if(inputPrefix(s.props.latex,name)) patches[s.id]={props:{latex:definition(name)+' '+rhs}};
  }
  transaction(()=>updateShapes(patches));
}
function readCustom(): SteelSection[] {
  try { const raw: unknown=JSON.parse(localStorage.getItem('mccv-steel-sections-v1')??'[]');
    return Array.isArray(raw)?raw.filter((s: SteelSection)=>{try{return typeof s.name==='string'&&validateSection(s).length===0;}catch{return false;}}):[];
  }catch{return [];}
}
export function SteelControls({id,latex}: {id:string;latex:string}) {
  const [open,setOpen]=useState(false);
  const isSection=latex.startsWith(definition('Section'));
  if(!isSection)return null;
  return <><button type="button" data-testid="browse-steel" className="ml-2 cursor-pointer whitespace-nowrap rounded border border-slate-300 bg-white px-2 py-1 font-sans text-[11px] text-slate-700 print:hidden" onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setOpen(true);}}>Browse Section Library</button>
    {open&&createPortal(<div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 p-6" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-label="Steel Section Library" className="max-h-[90vh] w-[850px] overflow-auto rounded-xl border bg-white p-5 font-sans text-slate-800 shadow-xl" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')setOpen(false);}}>
        <div className="mb-4 flex justify-between"><h2 className="text-lg font-semibold">Steel Section Library</h2><button aria-label="Close steel dialog" onClick={()=>setOpen(false)}>✕</button></div>
        <SectionPicker id={id} close={()=>setOpen(false)}/>
      </div></div>,document.body)}</>;
}
function SectionPicker({id,close}: {id:string;close:()=>void}) {
  const initial=sections.find(s=>s.id===useCalculationStore.getState().results[id]?.value?.number)??sectionById(1211);
  const [family,setFamily]=useState(initial.family),[search,setSearch]=useState(''),[selected,setSelected]=useState<SteelSection>(initial);
  const [custom,setCustom]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(readCustom);
  const list=sections.filter(s=>(!family||s.family===family)&&s.name.toLowerCase().includes(search.toLowerCase()));
  const apply=()=>{
    const errors=validateSection(selected);if(errors.length){setError(errors.join('; '));return;}
    const values: Record<string,string>={Section:String(custom?0:selected.id)};
    propertyKeys.forEach((key,i)=>{values[key]=custom?`${selected.values[key]}\\,\\mathrm{${sectionUnits[key].split('^')[0]}}${sectionUnits[key].includes('^')?'^'+sectionUnits[key].split('^')[1]:''}`:`\\operatorname{sectionProp}(${symbol('Section')},${i})`;});
    const curves=rolledCurves(selected.values);
    const fyRegion=Object.values(useCanvasStore.getState().shapes).find(s=>s.type==='math'&&s.props.latex.startsWith(definition('fy')));
    const fyValue=fyRegion?useCalculationStore.getState().results[fyRegion.id]?.value:undefined;
    // Formatted stress may use MPa/ksi: automatic curve selection is restricted to known MPa grades.
    values.CurvesVerified=curves&&fyValue?.unitText==='MPa'&&fyValue.number<=420?'1':'0';
    if(curves){values.alphaY=String(curves[0]);values.alphaZ=String(curves[1]);values.alphaLT=String(curves[2]);}
    transaction(()=>{
      replaceInputs(values);updateShape(id,{props:{latex:definition('Section')+values.Section}});
      const note=Object.values(useCanvasStore.getState().shapes).find(s=>s.type==='text'&&s.props.html.startsWith('Steel section source:'));
      if(note)updateShape(note.id,{props:{html:escapeHtml(custom?`Steel section source: ${selected.name} | ${selected.version} | ${selected.source}`:'Steel section source: licensed offline catalogue; designation and dataset shown beside Section ID')}});
    });
    if(custom){try{const next=[...saved.filter(s=>s.name!==selected.name),selected];localStorage.setItem('mccv-steel-sections-v1',JSON.stringify(next));setSaved(next);}catch{setError('Section applied; local catalogue storage unavailable. Worksheet contains the properties.');return;}}
    close();
  };
  return <><div className="mb-3 flex gap-2"><input aria-label="Search sections" className={fieldClass+' flex-1'} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search designation…"/><select aria-label="Section family" className={fieldClass} value={family} onChange={e=>{setFamily(e.target.value);setCustom(false);const s=sections.find(s=>s.family===e.target.value);if(s)setSelected(s);}}>{['IPE','HEA','HEB','HEM','W','UB','UC'].map(f=><option key={f}>{f}</option>)}</select><button className={buttonClass} onClick={()=>{setCustom(true);setSelected({...selected,id:0,source:'User-defined, independently verified by designer',version:'custom-v1',family});}}>User-Defined Section</button></div>
    <div className="grid grid-cols-[220px_1fr] gap-4"><div className="max-h-[440px] overflow-auto rounded border">{list.map(s=><button key={s.id} className={'block w-full px-3 py-1.5 text-left text-sm '+(selected.id===s.id?'bg-blue-100':'hover:bg-slate-50')} onClick={()=>{setSelected(s);setCustom(false);}}>{s.name} <small className="float-right text-slate-400">{s.id}</small></button>)}{!list.length&&<p className="p-3 text-sm">Catalogue withheld pending verified redistribution rights. Enter a user-defined {family} section.</p>}{saved.map((s,i)=><button key={'custom'+i} className="block p-2 text-sm" onClick={()=>{setSelected(s);setCustom(true);}}>{s.name} (custom)</button>)}</div>
      <div><div className="flex items-start justify-between"><div><h3 className="font-semibold">{selected.name}</h3><p className="max-w-[250px] text-xs text-slate-500">{selected.standard}<br/>{selected.source}<br/>Dataset {selected.version}</p>{custom&&<input aria-label="Custom section name" className={fieldClass+' mt-2 w-full'} value={selected.name} onChange={e=>setSelected({...selected,name:e.target.value})}/>}</div><SectionProfile {...selected.values}/></div>
        <div className="grid grid-cols-3 gap-2">{propertyKeys.slice(0,16).map(key=><label key={key} className="text-xs">{key} [{sectionUnits[key]}]{custom?<input aria-label={`Custom ${key}`} type="number" className={fieldClass+' w-full'} value={selected.values[key]} onChange={e=>{const values={...selected.values,[key]:Number(e.target.value)};values.mass=values.A*0.00785;values.iy=Math.sqrt(values.Iy/values.A);values.iz=Math.sqrt(values.Iz/values.A);setSelected({...selected,values});}}/>:<div className="font-mono text-sm">{selected.values[key].toPrecision(6)}</div>}</label>)}</div>
      </div></div><p role="alert" className="mt-3 text-sm text-red-700">{error}</p><div className="mt-3 flex items-center justify-between"><p className="text-xs text-slate-500">Individual property definitions remain editable. Ky / Kz remain unchanged.</p><button className={buttonClass} disabled={!custom && selected.family!==family} onClick={apply}>Select Section</button></div></>;
}
export function SteelSectionLabel({sectionId}: {sectionId?:number}) {
  const section=sections.find(s=>s.id===sectionId);
  return <span className="ml-2 max-w-[200px] whitespace-normal font-sans text-[10px] text-slate-500">{section?`${section.name} · ${section.version}`:sectionId===0?'User-defined (worksheet properties)':'Unknown section'}</span>;
}
