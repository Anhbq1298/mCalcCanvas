/**
 * Page setup: paper (A4/A3), orientation, margins in mm (presets or custom) with
 * a preview of the paper and its printable area. Applied in one settings change:
 * page frames move, regions keep their positions, nothing is recalculated.
 */
import { useState } from 'react';
import { DEFAULT_MARGINS, type PageMargins, type PageOrientation, type PaperSize } from '../../documents/DocumentTypes';
import { MARGIN_PRESETS, presetOf } from '../../export/marginPresets';
import { marginsValid, paperMm } from '../../export/pageGeometry';
import { useAppStore } from '../../store/appStore';
import { Modal } from './Dialogs';

export function PageSetupDialog({ onClose }: { onClose(): void }) {
  const settings = useAppStore((s) => s.settings);
  const [paper, setPaper] = useState<PaperSize>(settings.paper ?? 'A4');
  const [orientation, setOrientation] = useState<PageOrientation>(settings.pageOrientation);
  const [margins, setMargins] = useState<PageMargins>(settings.margins ?? DEFAULT_MARGINS);
  const valid = marginsValid(margins, orientation, paper);
  const p = paperMm(orientation, paper);
  const scale = 150 / Math.max(p.w, p.h);
  const apply = () => {
    if (!valid) return;
    useAppStore.getState().updateSettings({ paper, pageOrientation: orientation, margins });
    onClose();
  };
  const field = (k: keyof PageMargins, label: string) => (
    <label className="ps-field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={0.1}
        aria-label={`${label} margin (mm)`}
        data-testid={`margin-${k}`}
        value={margins[k]}
        onChange={(e) => setMargins({ ...margins, [k]: Number(e.target.value) })}
      />
      <small>mm</small>
    </label>
  );
  return (
    <Modal title="Page setup" onClose={onClose}>
      <div className="page-setup" data-testid="page-setup">
        <div className="space-y-3">
          <label className="ps-field">
            <span>Paper</span>
            <select aria-label="Paper size" data-testid="ps-paper" value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)}>
              <option value="A4">A4 (210 × 297 mm)</option>
              <option value="A3">A3 (297 × 420 mm)</option>
            </select>
          </label>
          <div className="ps-field">
            <span>Orientation</span>
            <div className="flex gap-1" role="radiogroup" aria-label="Orientation">
              {(['portrait', 'landscape'] as const).map((o) => (
                <button key={o} type="button" role="radio" aria-checked={orientation === o} className={'ps-toggle ' + (orientation === o ? 'is-on' : '')} onClick={() => setOrientation(o)}>
                  {o === 'portrait' ? 'Portrait' : 'Landscape'}
                </button>
              ))}
            </div>
          </div>
          <label className="ps-field">
            <span>Margins</span>
            <select aria-label="Margin preset" data-testid="ps-preset" value={presetOf(margins)} onChange={(e) => setMargins(MARGIN_PRESETS.find((x) => x.id === e.target.value)?.margins ?? margins)}>
              {MARGIN_PRESETS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {field('top', 'Top')}
            {field('bottom', 'Bottom')}
            {field('left', 'Left')}
            {field('right', 'Right')}
          </div>
          {!valid && <p className="text-[12px] text-destructive">The margins must leave at least 20 mm of printable width and height.</p>}
        </div>
        <figure className="ps-preview" aria-label="Page preview">
          <div style={{ width: p.w * scale, height: p.h * scale }} className="ps-paper" data-testid="ps-preview-paper">
            <div
              className="ps-printable"
              style={{ left: margins.left * scale, right: margins.right * scale, top: margins.top * scale, bottom: margins.bottom * scale }}
            />
          </div>
          <figcaption>
            {paper} {orientation}, {p.w} × {p.h} mm
            <br />
            printable {Math.max(0, p.w - margins.left - margins.right).toFixed(1)} × {Math.max(0, p.h - margins.top - margins.bottom).toFixed(1)} mm
          </figcaption>
        </figure>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Regions keep their positions; a region outside the new printable area is marked in red.</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="ir-secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="ir-primary-button" data-testid="ps-apply" disabled={!valid} onClick={apply}>
          Apply
        </button>
      </div>
    </Modal>
  );
}
