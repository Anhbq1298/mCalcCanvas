import { FolderOpen, History, Trash2, X } from 'lucide-react';
import { commands } from '../../app/commands';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { DocumentManager } from '../../documents/DocumentManager';
import { FILE_ICON, openDocument, restoreVersion } from '../../documents/documentController';
import type { VersionSummary } from '../../documents/DocumentRepository';
import type { DocumentSummary } from '../../documents/DocumentTypes';
import { BUILTIN_CONSTANT_INFO, UNIT_SYMBOLS } from '../../engine/light';
import { useAppStore } from '../../store/appStore';
import { HelpCenter } from './HelpCenter';
import { PageSetupDialog } from './PageSetupDialog';
// The format guide runs its own engine: loaded only when opened.
const FormatGuideDialog = lazy(() => import('./FormatGuide').then((m) => ({ default: m.FormatGuideDialog })));

export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
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

const VERSION_KIND: Record<VersionSummary['kind'], string> = { manual: 'Saved', auto: 'Autosave', migration: 'Before upgrade' };

/** Version snapshots of one worksheet, each with Restore (the current state is kept as a version first). */
function VersionList({ docId, onRestore }: { docId: string; onRestore(versionId: string): void }) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  useEffect(() => {
    void DocumentManager.listVersions(docId).then(setVersions, () => setVersions([]));
  }, [docId]);
  if (versions === null) return <p className="py-1 pl-8 text-[11px] text-muted-foreground">Loading…</p>;
  if (!versions.length) return <p className="py-1 pl-8 text-[11px] text-muted-foreground">No earlier versions yet.</p>;
  return (
    <ul className="mb-1 space-y-0.5 pl-8" data-testid="version-list">
      {versions.map((v) => (
        <li key={v.id} className="flex items-center gap-2 text-[12px]">
          <span className="min-w-0 flex-1 truncate">
            {new Date(v.savedAt).toLocaleString()} <span className="text-muted-foreground">· {VERSION_KIND[v.kind]}</span>
          </span>
          <button type="button" onClick={() => onRestore(v.id)} className="cursor-pointer rounded px-2 py-0.5 text-[12px] font-medium text-[#0b57d0] hover:bg-muted">
            Restore
          </button>
        </li>
      ))}
    </ul>
  );
}

function OpenDialog({ onClose }: { onClose(): void }) {
  const currentId = useAppStore((s) => s.documentId);
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const reload = () => void DocumentManager.list().then(setDocs, () => setDocs([]));
  useEffect(reload, []);
  return (
    <Modal title="Open worksheet" onClose={onClose}>
      <button
        type="button"
        data-testid="open-file"
        onClick={async () => {
          onClose();
          await commands.openFile();
        }}
        className="mb-3 flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-border text-[13px] font-medium text-[#0b57d0] transition-colors duration-150 hover:bg-muted"
      >
        <FolderOpen size={16} aria-hidden /> Open a .mCCV file from your computer
      </button>
      <h3 className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Recent worksheets (saved in this browser)</h3>
      {docs === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-muted-foreground">No saved worksheets yet.</p>
      ) : (
        <ul className="-mx-2 space-y-0.5" data-testid="document-list">
          {docs.map((d) => (
            <li key={d.id} className="rounded hover:bg-muted/60">
              <div className="group flex items-center gap-2 px-2 py-1.5">
                <img src={FILE_ICON} width={16} height={16} alt="" className="shrink-0" />
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={async () => {
                    await openDocument(d.id);
                    onClose();
                  }}
                >
                  <div className="truncate font-medium">
                    {d.title}
                    {d.id === currentId && <span className="ml-2 text-[11px] font-normal text-accent">open</span>}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {d.fileName ? `${d.fileName} · ` : ''}
                    {d.project ? `${d.project} · ` : ''}
                    {new Date(d.updatedAt).toLocaleString()}
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Version history of ${d.title}`}
                  aria-expanded={history === d.id}
                  title="Version history"
                  className={
                    'flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-opacity duration-150 hover:text-foreground focus:opacity-100 group-hover:opacity-100 ' +
                    (history === d.id ? 'opacity-100' : 'opacity-0')
                  }
                  onClick={() => setHistory(history === d.id ? null : d.id)}
                >
                  <History size={14} aria-hidden />
                </button>
                {d.id !== currentId && (
                  <button
                    type="button"
                    aria-label={`Delete ${d.title}`}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    onClick={async () => {
                      if (window.confirm(`Delete “${d.title}” and its version history? This cannot be undone.`)) {
                        await DocumentManager.remove(d.id);
                        reload();
                      }
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </div>
              {history === d.id && (
                <VersionList
                  docId={d.id}
                  onRestore={async (versionId) => {
                    if (d.id !== currentId) await openDocument(d.id);
                    await restoreVersion(versionId);
                    onClose();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
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
            <li>Calculations run <b>top to bottom, left to right</b>. A region can only use variables defined above it (or to its left on the same line); using one defined below shows an error.</li>
            <li>A variable can be redefined: regions below the new definition use the new value, regions above keep the old one. The redefinition gets a <span className="font-semibold text-[#188038]">green outline</span>.</li>
            <li><b>Annex</b> – Math → Annex link puts a link (▸ A.1 …) in the main body and a new annex page at the end. <b>An annex is calculated at its link</b>: it uses what is defined above the link, and regions below the link use its results. Annexes are numbered in link order; Calculation → Sort annex moves their pages into that order. Double-click a link to go to its annex, and "↩" to come back.</li>
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
          <h3 className="mb-1 font-semibold">Built-in constants</h3>
          <ul className="list-disc space-y-0.5 pl-5">
            {BUILTIN_CONSTANT_INFO.map((c) => (
              <li key={c.name}>
                <b className="font-math italic">{c.name}</b> – {c.description}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted-foreground">Defining a variable with the same name overrides the constant in that worksheet (you'll see a warning).</p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">Functions</h3>
          <p className="text-muted-foreground">sin cos tan (radians, or degrees with °) · asin acos atan · ln log exp · √ and ⁿ√ · |x| · min max</p>
          <p className="mt-1">
            <b>If block</b> (Operators → if block), as in Mathcad Prime: <i>if</i> condition, the value on the next line, then <i>else if</i> condition / value as needed, and <i>else</i> / value last. Join comparisons with ∧ (and) or ∨ (or). <code>if(condition, a, b)</code> still works and is shown as a block.
          </p>
        </section>
      </div>
    </Modal>
  );
}

function AboutDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="About CalcCanvas" onClose={onClose}>
      <p>An engineering calculation workspace: math regions with units, automatic recalculation and A4 report export.</p>
      <p className="mt-2 text-muted-foreground">
        Built with its own canvas engine, MathLive and mathjs. Worksheets are stored locally in this browser (IndexedDB); use File → Save As to keep a copy as a .mCCV file or share it.
      </p>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useAppStore((s) => s.dialog);
  const close = () => useAppStore.getState().openDialog(null);
  if (dialog === 'open') return <OpenDialog onClose={close} />;
  if (dialog === 'shortcuts' || dialog === 'help') return <HelpCenter onClose={close} />;
  if (dialog === 'page-setup') return <PageSetupDialog onClose={close} />;
  if (dialog === 'syntax') return <SyntaxDialog onClose={close} />;
  if (dialog === 'guide')
    return (
      <Suspense fallback={null}>
        <FormatGuideDialog onClose={close} />
      </Suspense>
    );
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
