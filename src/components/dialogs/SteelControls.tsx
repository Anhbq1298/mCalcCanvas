/** Built-in steel section library: a Browse button on the worksheet's Section input and the picker dialog. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SECTION_DEF, propertyKeys, sectionUnits, sections, type SteelSection } from '../../engineering/steel/sections';
import { useCanvasStore } from '../../canvas/model/canvasStore';
import { useCalculationStore } from '../../store/calculationStore';
import { applySteelSection, savedCustomDimensions } from '../../canvas/steelSections';
import { CUSTOM_SECTION_NAME, customSectionValues, dimensionKeys, sectionDimensionError, type SectionDimensions } from '../../engineering/steel/customSection';

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
  const currentId = useCalculationStore.getState().results[id]?.value?.number;
  const current = sections.find((s) => s.id === currentId) ?? sections[0];
  const [mode, setMode] = useState<'library' | 'custom'>(currentId === 0 ? 'custom' : 'library');
  const [family, setFamily] = useState(current.family);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SteelSection>(current);
  const [dimensions, setDimensions] = useState(() => {
    const saved = savedCustomDimensions(useCanvasStore.getState().shapes, id) ?? (currentId === 0 ? null : current.values);
    if (!saved) return { h: '', b: '', tf: '', tw: '' };
    return { h: String(saved.h), b: String(saved.b), tf: String(saved.tf), tw: String(saved.tw) };
  });
  const [applyError, setApplyError] = useState('');
  const custom: SectionDimensions = { h: Number(dimensions.h), b: Number(dimensions.b), tf: Number(dimensions.tf), tw: Number(dimensions.tw) };
  const geometryError = sectionDimensionError(custom);
  const values = mode === 'library' ? selected.values : geometryError ? null : customSectionValues(custom);
  const list = sections.filter((s) => s.family === family && s.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <div role="tablist" aria-label="Section source" className="mb-3 flex gap-2 border-b border-slate-200 pb-2">
        {(['library', 'custom'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={mode === value} className={'cursor-pointer rounded px-3 py-1.5 text-sm ' + (mode === value ? 'bg-blue-100 text-blue-900' : 'text-slate-600 hover:bg-slate-50')} onClick={() => { setMode(value); setApplyError(''); }}>{value === 'library' ? 'Library' : 'Custom I/H'}</button>)}
      </div>
      {mode === 'library' && <div className="mb-3 flex gap-2">
        <input aria-label="Search sections" className={fieldClass + ' flex-1'} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search designation…" />
        <select aria-label="Section family" className={fieldClass} value={family} onChange={(e) => { setFamily(e.target.value); setSelected(sections.find((s) => s.family === e.target.value)!); }}>
          {FAMILIES.map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>}
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        {mode === 'library' ? <div className="max-h-[420px] overflow-auto rounded border">
          {list.map((s) => (
            <button key={s.id} type="button" className={'block w-full cursor-pointer px-3 py-1.5 text-left text-sm ' + (selected.id === s.id ? 'bg-blue-100' : 'hover:bg-slate-50')} onClick={() => setSelected(s)}>
              {s.name} <small className="float-right text-slate-400">{s.id}</small>
            </button>
          ))}
        </div> : <div className="space-y-3">
          <h3 className="text-sm font-semibold">Dimensions</h3>
          {dimensionKeys.map(key => <label key={key} className="flex items-center justify-between gap-2 text-sm">
            <span>{key} [mm]</span>
            <input type="number" min="0" step="any" className={fieldClass + ' w-32'} value={dimensions[key]} onChange={e => { setDimensions({ ...dimensions, [key]: e.target.value }); setApplyError(''); }} />
          </label>)}
          <p className="text-xs text-slate-500">Doubly symmetric welded I/H. Equal flanges; r = 0; weld metal excluded.</p>
          <p className="text-xs text-slate-500">It and Iw use thin-wall approximations (SCI P385, Appendix B.2.2 / B.3.1).</p>
          <p className="text-xs text-slate-500">Av,z uses conservative η = 1.0 (EN 1993-1-1:2005 §6.2.6(3)). Mass uses 7850 kg/m³.</p>
        </div>}
        <div>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{mode === 'library' ? selected.name : CUSTOM_SECTION_NAME}</h3>
              <p className="max-w-[260px] text-xs text-slate-500">{mode === 'library' ? <>{selected.standard}<br />{selected.source}</> : 'Properties update as you edit. Welded buckling curves: EN 1993-1-1:2005 Tables 6.2 / 6.4.'}</p>
            </div>
            {values && <SectionProfile {...values} />}
          </div>
          {mode === 'custom' && geometryError ? <p role="alert" className="mt-4 text-sm text-red-700">{geometryError}</p> : values && <div className="grid grid-cols-3 gap-2">
            {propertyKeys.map((key) => (
              <div key={key} data-testid={`section-property-${key}`} className="text-xs">
                {key} [{sectionUnits[key]}]
                <div className="font-mono text-sm">{values[key].toPrecision(6)}</div>
              </div>
            ))}
          </div>}
        </div>
      </div>
      {applyError && <p role="alert" className="mt-3 text-sm text-red-700">{applyError}</p>}
      <div className="mt-4 flex items-center justify-between">
        <p className="max-w-[430px] text-xs text-slate-500">{mode === 'library' ? 'Sets the Section ID; the worksheet looks the properties up.' : 'Stores dimensions and equations in the worksheet. Section ID 0 = custom welded I/H.'}</p>
        <button type="button" data-testid="select-steel" disabled={mode === 'custom' && !!geometryError} className="cursor-pointer rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => {
          try { applySteelSection(id, mode === 'library' ? selected.id : custom); close(); }
          catch (error) { setApplyError(error instanceof Error ? error.message : 'Unable to apply section.'); }
        }}>
          {mode === 'library' ? 'Select Section' : 'Use Custom Section'}
        </button>
      </div>
    </>
  );
}

/** Designation shown beside the Section ID. */
export function SteelSectionLabel({ sectionId }: { sectionId?: number }) {
  const section = sections.find((s) => s.id === sectionId);
  return <span className="ml-2 whitespace-nowrap font-sans text-[11px] text-slate-500">{sectionId === 0 ? `${CUSTOM_SECTION_NAME} (r = 0)` : section ? section.name : 'Unknown section'}</span>;
}
