/**
 * Save status next to the worksheet title: browser storage state (autosave)
 * and, after Save As, the linked .mCCV file with a dot while it is behind.
 */
import { AlertCircle, Check, CircleDot, Loader2 } from 'lucide-react';
import { FILE_ICON } from '../../documents/documentController';
import { MOD_LABEL } from '../../app/shortcuts';
import { useAppStore } from '../../store/appStore';

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export function SaveStatus() {
  const saveState = useAppStore((s) => s.saveState);
  const savedAt = useAppStore((s) => s.savedAt);
  const file = useAppStore((s) => s.file);
  const view = {
    saved: { Icon: Check, text: 'Saved', tone: 'text-docs-muted', tip: `All changes are saved in this browser${savedAt ? ` (${time(savedAt)})` : ''}.` },
    saving: { Icon: Loader2, text: 'Saving…', tone: 'text-docs-muted', tip: 'Saving to this browser…' },
    dirty: { Icon: CircleDot, text: 'Unsaved changes', tone: 'text-docs-muted', tip: 'Changes are saved automatically in a moment.' },
    error: { Icon: AlertCircle, text: 'Not saved', tone: 'text-destructive', tip: 'Browser storage is unavailable. Use File → Save As to keep a .mCCV file.' },
  }[saveState];
  const { Icon } = view;
  return (
    <span className="flex min-w-0 items-center gap-2 whitespace-nowrap text-[12px]">
      <span className={'flex items-center gap-1 ' + view.tone} title={view.tip}>
        <Icon size={13} aria-hidden className={saveState === 'saving' ? 'animate-spin' : ''} />
        <span data-testid="save-state" aria-live="polite">
          {view.text}
        </span>
      </span>
      {file && (
        <span
          data-testid="file-name"
          className="flex min-w-0 items-center gap-1 text-docs-muted"
          title={file.dirty ? `Changes not yet written to ${file.name}. Press ${MOD_LABEL}+S to update it.` : `Saved to ${file.name}.`}
        >
          <img src={FILE_ICON} width={14} height={14} alt="" />
          <span className="truncate">{file.name}</span>
          {file.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-docs-blue" aria-label="file not updated" />}
        </span>
      )}
    </span>
  );
}
