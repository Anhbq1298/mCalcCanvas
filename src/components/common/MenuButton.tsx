import { Check } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

export type MenuEntry =
  | { type?: 'item'; label: string; shortcut?: string; onSelect: () => void; disabled?: boolean; checked?: boolean }
  | { type: 'separator' }
  | { type: 'heading'; label: string };

interface MenuButtonProps {
  label: string;
  entries: MenuEntry[];
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Hovering another top-level menu while one is open switches to it. */
  onHover(): void;
}

/** Accessible dropdown menu (menubar item + menu with arrow-key navigation). */
export function MenuButton({ label, entries, open, onOpenChange, onHover }: MenuButtonProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]:not([disabled]), [role=menuitemcheckbox]:not([disabled])')?.focus());
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open, onOpenChange]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={
          'h-7 cursor-pointer rounded px-2.5 text-[13px] transition-colors duration-150 ' +
          (open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
        }
        onClick={() => onOpenChange(!open)}
        onPointerEnter={onHover}
      >
        {label}
      </button>
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-50 mt-1 min-w-[240px] w-max max-w-[calc(100vw-16px)] rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {entries.map((entry, i) => {
            if (entry.type === 'separator') return <div key={i} role="separator" className="my-1 h-px bg-border" />;
            if (entry.type === 'heading') {
              return (
                <div key={i} className="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {entry.label}
                </div>
              );
            }
            return (
              <button
                key={i}
                type="button"
                role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={entry.checked}
                disabled={entry.disabled}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[13px] text-foreground transition-colors duration-150 hover:bg-muted focus:bg-muted focus:outline-none disabled:cursor-default disabled:text-muted-foreground/60 disabled:hover:bg-transparent"
                onClick={() => {
                  onOpenChange(false);
                  entry.onSelect();
                }}
              >
                <span className="flex w-4 justify-center">{entry.checked && <Check size={14} aria-hidden />}</span>
                <span className="flex-1 whitespace-nowrap">{entry.label}</span>
                {entry.shortcut && <kbd className="ml-4 whitespace-nowrap font-sans text-[11px] text-muted-foreground">{entry.shortcut}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
