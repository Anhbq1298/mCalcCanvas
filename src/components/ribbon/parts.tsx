/**
 * Ribbon building blocks (Mathcad Prime style): groups, large and small buttons,
 * columns, fields, checkboxes, selects, colour pickers and the selection helpers they share.
 */
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Minus,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { commands } from '../../app/commands';
import { useCanvasStore } from '../../canvas/model/canvasStore';
import { type MathDisplayMode } from '../../canvas/model/types';
import { formatEditingText, hasTextSelection } from '../../canvas/textFormatting';
import { Popover } from './Popover';
import { COLOR_GRID, HIGHLIGHTS, patchSelected, useSelectedShapes } from './ribbonState';


// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

export function TB({ icon: Icon, label, onClick, active, disabled, testId, children }: { icon?: LucideIcon; label: string; onClick(): void; active?: boolean; disabled?: boolean; testId?: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={'docs-tb-btn ' + (active ? 'is-active' : '')}
    >
      {Icon ? <Icon size={17} strokeWidth={1.9} aria-hidden /> : children}
    </button>
  );
}

/** A ribbon group: controls (one or two rows) with its name underneath, like Mathcad Prime. */
export function Group({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="rb-group" role="group" aria-label={label} data-testid={testId}>
      <div className="rb-controls">{children}</div>
      <div className="rb-label">{label}</div>
    </div>
  );
}
export const Row = ({ children }: { children: ReactNode }) => <div className="rb-row">{children}</div>;

/** Small labelled checkbox for the ribbon. */
export function Check({ label, checked, onChange, testId, title, disabled, mixed }: { label: string; checked: boolean; onChange(v: boolean): void; testId?: string; title?: string; disabled?: boolean; mixed?: boolean }) {
  return (
    <label className={'rb-check ' + (disabled ? 'opacity-40' : '')} title={title ?? label}>
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = !!mixed;
        }}
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** Large ribbon button: icon above the label (the main commands of a group, as in Mathcad Prime). */
export function BigButton({ icon: Icon, label, onClick, testId, title, disabled, active }: { icon: LucideIcon; label: string; onClick(): void; testId?: string; title?: string; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" className={'rb-big ' + (active ? 'is-active' : '')} title={title ?? label} aria-label={title ?? label} aria-pressed={active} data-testid={testId} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <span className="rb-big-icon">
        <Icon size={24} strokeWidth={1.6} aria-hidden />
      </span>
      <span className="rb-big-text">{label}</span>
    </button>
  );
}

/** Small ribbon button: icon with its label to the right, stacked three per column. */
export function SmallButton({ icon: Icon, label, onClick, testId, title, disabled, active }: { icon: LucideIcon; label: string; onClick(): void; testId?: string; title?: string; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" className={'rb-small ' + (active ? 'is-active' : '')} title={title ?? label} aria-label={title ?? label} aria-pressed={active} data-testid={testId} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon size={15} strokeWidth={1.8} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

/** A column of up to three small controls. */
export const Col = ({ children }: { children: ReactNode }) => <div className="rb-col">{children}</div>;

/** A labelled field row inside a column: "Unit [____]". */
export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="rb-field">
    <span className="rb-mini">{label}</span>
    {children}
  </div>
);

/** Swatch colour picker (no text), for label styles and highlights. */
export function SwatchPicker({ testId, title, value, onPick, allowNone }: { testId: string; title: string; value: string | null; onPick(c: string | null): void; allowNone?: boolean }) {
  return (
    <Popover
      title={title}
      testId={testId}
      width={216}
      trigger={
        <span className="flex items-center gap-1">
          <span className="h-3.5 w-3.5 rounded-sm border border-black/20" style={{ background: value ?? 'transparent' }} />
        </span>
      }
    >
      {(close) => (
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-1">
            {[...HIGHLIGHTS, ...COLOR_GRID.slice(6, 18)].map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`} title={c} onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick(c), close())} className="h-6 w-6 cursor-pointer rounded border border-black/10" style={{ background: c }} />
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-docs-border pt-2 text-[12px]">
            <input type="color" aria-label={`${title}: custom colour`} value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'} onChange={(e) => onPick(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-docs-border p-0.5" />
            Custom…
            {allowNone && (
              <button type="button" className="ml-auto text-docs-blue" onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick(null), close())}>
                None
              </button>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}


export function TBSelect({ value, onChange, options, label, width, testId, style, disabled }: { value: string | number; onChange(v: string): void; options: [string | number, string][]; label: string; width: number; testId?: string; style?: React.CSSProperties; disabled?: boolean }) {
  return (
    <select
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width, ...style }}
      className="docs-tb-select"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Toolbar sections
// ---------------------------------------------------------------------------

/** Font size stepper for the selected regions of the given kinds. */
export function SizeControl({ kinds, label }: { kinds: ('text' | 'math')[]; label: string }) {
  const selected = useSelectedShapes();
  const sized = selected.find((s) => (kinds as string[]).includes(s.type));
  const size = sized && (sized.type === 'text' || sized.type === 'math') ? sized.props.fontSize : kinds[0] === 'math' ? 18 : 15;
  const [draft, setDraft] = useState<string | null>(null);
  const setSize = (n: number) => {
    const v = Math.min(72, Math.max(8, Math.round(n)));
    patchSelected((s) => ((kinds as string[]).includes(s.type) && (s.type === 'text' || s.type === 'math') ? { props: { fontSize: v } } : null));
  };
  return (
    <>
      <TB icon={Minus} label={`Decrease ${label.toLowerCase()}`} disabled={!sized} onClick={() => setSize(size - 1)} />
      <input
        aria-label={label}
        disabled={!sized}
        value={draft ?? String(size)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && Number(draft)) setSize(Number(draft));
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        className="h-6 w-9 rounded border border-docs-ink/40 bg-transparent text-center text-[13px] tabular-nums disabled:opacity-40"
      />
      <TB icon={Plus} label={`Increase ${label.toLowerCase()}`} disabled={!sized} onClick={() => setSize(size + 1)} />
    </>
  );
}

export function ColorButton({ testId, title, kinds }: { testId: string; title: string; kinds: ('text' | 'math')[] }) {
  const all = useSelectedShapes();
  const selected = all.filter((s) => (kinds as string[]).includes(s.type));
  const editingText = useCanvasStore((s) => (s.editingId ? s.shapes[s.editingId]?.type === 'text' : false)) && kinds.includes('text');
  const first = selected[0];
  const current = !first ? '#000000' : first.type === 'text' || first.type === 'math' ? first.props.color : 'stroke' in first.props ? first.props.stroke : '#000000';
  const apply = (c: string) => {
    if (editingText && hasTextSelection()) formatEditingText('foreColor', c);
    else patchSelected((s) => ((kinds as string[]).includes(s.type) && (s.type === 'text' || s.type === 'math') ? { props: { color: c } } : null));
  };
  return (
    <Popover
      title={title}
      testId={testId}
      width={232}
      trigger={
        <span className="flex flex-col items-center leading-none">
          <span className="text-[15px] font-semibold text-docs-ink">A</span>
          <span className="mt-px h-[3px] w-4 rounded-sm" style={{ background: current }} />
        </span>
      }
    >
      {(close) => (
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-1">
            {COLOR_GRID.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                title={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  apply(c);
                  close();
                }}
                className={'h-6 w-6 cursor-pointer rounded-full border transition-transform duration-150 hover:scale-110 ' + (c.toLowerCase() === current.toLowerCase() ? 'border-docs-blue ring-2 ring-docs-blue/40' : 'border-black/10')}
                style={{ background: c }}
              />
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 border-t border-docs-border pt-2 text-[13px] text-docs-ink">
            <input type="color" data-testid="custom-color" value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : '#000000'} onChange={(e) => apply(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-docs-border p-0.5" />
            Custom…
          </label>
          {!selected.length && !editingText && <p className="text-[11px] text-docs-muted">Select a region first.</p>}
        </div>
      )}
    </Popover>
  );
}

export function AlignControls() {
  const selected = useSelectedShapes();
  const text = selected.find((s) => s.type === 'text');
  const align = text?.type === 'text' ? text.props.align : 'left';
  const set = (a: 'left' | 'center' | 'right' | 'justify') => patchSelected((s) => (s.type === 'text' ? { props: { align: a } } : null));
  return (
    <>
      <TB icon={AlignLeft} label="Left align" disabled={!text} active={!!text && align === 'left'} onClick={() => set('left')} />
      <TB icon={AlignCenter} label="Center align" disabled={!text} active={!!text && align === 'center'} onClick={() => set('center')} />
      <TB icon={AlignRight} label="Right align" disabled={!text} active={!!text && align === 'right'} onClick={() => set('right')} />
      <TB icon={AlignJustify} label="Justify" disabled={!text} active={!!text && align === 'justify'} onClick={() => set('justify')} testId="text-justify" />
    </>
  );
}

export function DisplayModeSelect() {
  const selected = useSelectedShapes();
  const math = selected.filter((s) => s.type === 'math');
  const value = math[0]?.type === 'math' ? math[0].props.displayMode : 'auto';
  return (
    <TBSelect
      label="Equation display"
      value={value}
      width={136}
      onChange={(v) => commands.setDisplayMode(v as MathDisplayMode)}
      options={[
        ['auto', 'Auto display'],
        ['formula', 'Formula only'],
        ['result', 'Result only'],
        ['value', 'Value only (table)'],
        ['formulaResult', 'Formula = result'],
        ['full', 'Full calculation'],
      ]}
    />
  );
}

