import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { commands } from '../../app/commands';
import { insertIntoActiveMath, templateToLatex } from '../../math/activeEditor';
import type { PaletteSection } from '../ribbon/palettes';

/** Insert a palette template into the open equation, or start a new region with it. */
function insertTemplate(latex: string): void {
  if (!insertIntoActiveMath(latex)) commands.insertMath(templateToLatex(latex));
}

/**
 * Toolbar dropdown rendered in a portal (never clipped). The trigger keeps
 * focus in the equation/text being edited (mouse-down is prevented).
 */
export function Popover({
  trigger,
  title,
  testId,
  width = 332,
  big,
  children,
}: {
  trigger: ReactNode;
  title: string;
  testId?: string;
  width?: number;
  /** Ribbon label: renders a large button (icon above the label, Mathcad Prime style). */
  big?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6 });
    setOpen((o) => !o);
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        data-testid={testId}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        className={(big ? 'rb-big ' : 'docs-tb-btn gap-0.5 px-1.5 ') + (open ? 'is-active' : '')}
      >
        {big ? (
          <>
            <span className="rb-big-icon">{trigger}</span>
            <span className="rb-big-text">
              {big}
              <ChevronDown size={10} aria-hidden className="text-docs-muted" />
            </span>
          </>
        ) : (
          <>
            {trigger}
            <ChevronDown size={12} aria-hidden className="text-docs-muted" />
          </>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={title}
            style={{ left: pos.left, top: pos.top, width }}
            className="fixed z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-docs-border bg-white p-2 shadow-[0_2px_6px_2px_rgb(60_64_67/0.15),0_1px_2px_rgb(60_64_67/0.3)]"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function PalettePopover({ label, glyph, sections, testId, columns, big }: { label: string; glyph: string; sections: PaletteSection[]; testId: string; columns?: number; big?: boolean }) {
  return (
    <Popover title={label} testId={testId} big={big ? label : undefined} width={columns ? columns * 70 + 24 : undefined} trigger={<span className={'font-math italic leading-none text-docs-ink ' + (big ? 'text-[22px]' : 'text-[17px]')}>{glyph}</span>}>
      {() => (
        <>
          {sections.map((sec) => (
            <div key={sec.title} className="mb-2 last:mb-0">
              <div className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-docs-muted">{sec.title}</div>
              <div
                className={columns ? 'grid gap-0.5 rounded bg-docs-bg/60' : 'flex flex-wrap gap-0.5'}
                style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
              >
                {sec.items.map((it) => (
                  <button
                    key={it.title + it.label}
                    type="button"
                    title={it.title}
                    aria-label={it.title}
                    aria-disabled={it.disabled || undefined}
                    disabled={it.disabled}
                    data-testid={`palette-${it.label}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => !it.disabled && insertTemplate(it.latex)}
                    className={
                      'flex h-8 min-w-[36px] items-center justify-center rounded px-1.5 text-[15px] transition-colors duration-150 ' +
                      (it.disabled ? 'cursor-not-allowed text-docs-muted/45' : 'cursor-pointer text-docs-ink hover:bg-docs-hover ') +
                      (it.math ? ' font-math italic' : '')
                    }
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-1 border-t border-docs-border px-1 pt-1.5 text-[11px] leading-snug text-docs-muted">Inserts at the cursor of the equation you are editing, or starts a new one.</p>
        </>
      )}
    </Popover>
  );
}
