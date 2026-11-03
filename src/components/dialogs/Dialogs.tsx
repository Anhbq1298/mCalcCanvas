import { FileText, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DocumentManager } from '../../documents/DocumentManager';
import { openDocument } from '../../documents/documentController';
import type { DocumentSummary } from '../../documents/DocumentTypes';
import { UNIT_SYMBOLS } from '../../engine';
import { useAppStore } from '../../store/appStore';

function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={'m-auto max-h-[80vh] rounded-lg border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/30 ' + (wide ? 'w-[640px]' : 'w-[460px]')}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-muted">
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="max-h-[65vh] overflow-y-auto px-5 py-4 text-[13px] leading-relaxed">{children}</div>
    </dialog>
  );
}

function OpenDialog({ onClose }: { onClose(): void }) {
  const editor = useAppStore((s) => s.editor);
  const currentId = useAppStore((s) => s.documentId);
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const reload = () => void DocumentManager.list().then(setDocs);
  useEffect(reload, []);
  return (
    <Modal title="Open worksheet" onClose={onClose}>
      {docs === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-muted-foreground">No saved worksheets yet.</p>
      ) : (
        <ul className="-mx-2 space-y-0.5" data-testid="document-list">
          {docs.map((d) => (
            <li key={d.id} className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
              <FileText size={16} className="shrink-0 text-muted-foreground" aria-hidden />
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer text-left"
                onClick={async () => {
                  if (editor) await openDocument(editor, d.id);
                  onClose();
                }}
              >
                <div className="truncate font-medium">
                  {d.title}
                  {d.id === currentId && <span className="ml-2 text-[11px] font-normal text-accent">open</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {d.project ? `${d.project} · ` : ''}
                  {new Date(d.updatedAt).toLocaleString()}
                </div>
              </button>
              {d.id !== currentId && (
                <button
                  type="button"
                  aria-label={`Delete ${d.title}`}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                  onClick={async () => {
                    if (window.confirm(`Delete “${d.title}”? This cannot be undone.`)) {
                      await DocumentManager.remove(d.id);
                      reload();
                    }
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Type on empty canvas', 'Create a math region at the pointer'],
  ['M, then click', 'Place a math region'],
  ['Double-click / Enter', 'Edit selected region'],
  ['Enter or Esc', 'Confirm and leave the equation'],
  [':=', 'Definition (shows ≔)'],
  ['=', 'Evaluate (e.g. M= )'],
  ['/', 'Fraction'],
  ['^ / _', 'Exponent / subscript'],
  ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copy / paste / duplicate'],
  ['Delete', 'Delete selection'],
  ['Arrow keys', 'Nudge (Shift = 10 px)'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+S', 'Save'],
  ['Ctrl+wheel', 'Zoom'],
  ['Space+drag', 'Pan'],
  ['F9', 'Calculate all'],
];

function ShortcutsDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <table className="w-full">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-4">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[12px]">{k}</kbd>
              </td>
              <td className="py-1.5 text-muted-foreground">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function SyntaxDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="Math syntax & units" onClose={onClose} wide>
      <div className="space-y-4">
        <section>
          <h3 className="mb-1 font-semibold">Regions</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Definition</b> – <code>L := 8.5 m</code>. Add a trailing <code>=</code> to also show the value.</li>
            <li><b>Evaluation</b> – <code>M =</code> shows the current value.</li>
            <li><b>Check</b> – <code>η_M ≤ 1</code> shows the value with a PASS/FAIL badge.</li>
            <li>Position on the canvas never matters: each variable has exactly one definition per worksheet.</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">Names and units</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Subscripted names: type <code>M_Ed</code> → M<sub>Ed</sub>. Greek: type <code>eta</code> → η.</li>
            <li>Adjacent letters multiply unless they form a defined name or a unit: <code>wL^2</code> = w·L².</li>
            <li>Multi-letter units are recognised and shown upright: kN, kPa, mm…</li>
            <li>Single-letter units (m, N, s, K) work too. If you define a variable with a unit's name you'll see a warning; the variable wins, and you can still write the unit upright with \mathrm.</li>
            <li>Change a result's unit in the properties panel (e.g. <code>kN·mm</code>) – the stored quantity is unchanged.</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">Supported units</h3>
          <p className="text-muted-foreground">{UNIT_SYMBOLS.map((u) => u.replace('degC', '°C').replace(/^deg$/, '°')).join(' · ')}</p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">Functions</h3>
          <p className="text-muted-foreground">sin cos tan (radians, or degrees with °) · asin acos atan · ln log exp · √ and ⁿ√ · |x| · min max</p>
        </section>
      </div>
    </Modal>
  );
}

function AboutDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="About CalcCanvas" onClose={onClose}>
      <p>A free-positioned engineering calculation workspace: Mathcad-style math regions with units, automatic recalculation and A4 report export.</p>
      <p className="mt-2 text-muted-foreground">
        Built with tldraw, MathLive and mathjs. Worksheets are stored locally in this browser (IndexedDB); use Export JSON for backups.
      </p>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useAppStore((s) => s.dialog);
  const close = () => useAppStore.getState().openDialog(null);
  if (dialog === 'open') return <OpenDialog onClose={close} />;
  if (dialog === 'shortcuts') return <ShortcutsDialog onClose={close} />;
  if (dialog === 'syntax') return <SyntaxDialog onClose={close} />;
  if (dialog === 'about') return <AboutDialog onClose={close} />;
  return null;
}

export function Toast() {
  const toast = useAppStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useAppStore.setState({ toast: null }), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={
        'pointer-events-none fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-[13px] shadow-lg ' +
        (toast.kind === 'error' ? 'bg-destructive text-white' : 'bg-foreground text-white')
      }
    >
      {toast.message}
    </div>
  );
}
