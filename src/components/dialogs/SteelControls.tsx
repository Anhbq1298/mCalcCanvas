/** Built-in steel section library: a Browse button on the worksheet's Section input and the picker dialog. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SECTION_DEF, propertyKeys, sectionUnits, sections, type SteelSection } from '../../engineering/steel/sections';
import { updateShape } from '../../canvas/model/canvasStore';
import { useCalculationStore } from '../../store/calculationStore';

const fieldClass = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900';
const FAMILIES = [...new Set(sections.map((s) => s.family))];

/** Outline of an I/H section (no fillets), scaled to fit. */
function SectionProfile({ h, b, tw, tf }: { h: number; b: number; tw: number; tf: number }) {
  const k = 90 / Math.max(h, b);
  const H = h * k, B = b * k, W = Math.max(tw * k, 1.5), F = Math.max(tf * k, 1.5);
  const x0 = 50 - B / 2, y0 = 50 - H / 2;
  return (
    <svg viewBox="0 0 100 100" width={96} height={96} aria-label="Section outline">
      <path d={`M${x0},${y0}h${B}v${F}h${-(B - W) / 2}v${H - 2 * F}h${(B - W) / 2}v${F}h${-B}v${-F}h${(B - W) / 2}v${-(H - 2 * F)}h${-(B - W) / 2}z`} fill="#dbeafe" stroke="#1e3a5f" strokeWidth={1.2} />
    </svg>
  );
}

export function SteelControls({ id, latex }: { id: string; latex: string }) {
  const [open, setOpen] = useState(false);
  if (!latex.startsWith(SECTION_DEF)) return null;
  return (
    <>
      <button type="button" data-testid="browse-steel" className="ml-2 cursor-pointer whitespace-nowrap rounded border border-slate-300 bg-white px-2 py-1 font-sans text-[11px] text-slate-700 print:hidden" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        Browse
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 p-6" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div role="dialog" aria-modal="true" aria-label="Steel Section Library" className="max-h-[90vh] w-[760px] overflow-auto rounded-xl border bg-white p-5 font-sans text-slate-800 shadow-xl" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setOpen(false); }}>
            <div className="mb-4 flex justify-between">
              <h2 className="text-lg font-semibold">Steel Section Library</h2>
              <button type="button" aria-label="Close" className="cursor-pointer" onClick={() => setOpen(false)}>✕</button>
            </div>
            <SectionPicker id={id} close={() => setOpen(false)} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function SectionPicker({ id, close }: { id: string; close(): void }) {
  const current = sections.find((s) => s.id === useCalculationStore.getState().results[id]?.value?.number) ?? sections[0];
  const [family, setFamily] = useState(current.family);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SteelSection>(current);
  const list = sections.filter((s) => s.family === family && s.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <div className="mb-3 flex gap-2">
        <input aria-label="Search sections" className={fieldClass + ' flex-1'} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search designation…" />
        <select aria-label="Section family" className={fieldClass} value={family} onChange={(e) => { setFamily(e.target.value); setSelected(sections.find((s) => s.family === e.target.value)!); }}>
          {FAMILIES.map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-[220px_1fr] gap-4">
        <div className="max-h-[420px] overflow-auto rounded border">
          {list.map((s) => (
            <button key={s.id} type="button" className={'block w-full cursor-pointer px-3 py-1.5 text-left text-sm ' + (selected.id === s.id ? 'bg-blue-100' : 'hover:bg-slate-50')} onClick={() => setSelected(s)}>
              {s.name} <small className="float-right text-slate-400">{s.id}</small>
            </button>
          ))}
        </div>
        <div>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{selected.name}</h3>
              <p className="max-w-[260px] text-xs text-slate-500">{selected.standard}<br />{selected.source}</p>
            </div>
            <SectionProfile {...selected.values} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {propertyKeys.slice(0, 16).map((key) => (
              <div key={key} className="text-xs">
                {key} [{sectionUnits[key]}]
                <div className="font-mono text-sm">{selected.values[key].toPrecision(6)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-slate-500">Sets the Section ID; the worksheet looks the properties up.</p>
        <button type="button" data-testid="select-steel" className="cursor-pointer rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700" onClick={() => { updateShape(id, { props: { latex: SECTION_DEF + selected.id } }); close(); }}>
          Select Section
        </button>
      </div>
    </>
  );
}

/** Designation shown beside the Section ID. */
export function SteelSectionLabel({ sectionId }: { sectionId?: number }) {
  const section = sections.find((s) => s.id === sectionId);
  return <span className="ml-2 whitespace-nowrap font-sans text-[11px] text-slate-500">{section ? section.name : 'Unknown section'}</span>;
}
