import { create } from 'zustand';
import { setPageSetup } from '../export/pageGeometry';
import {
  DEFAULT_SETTINGS,
  EMPTY_INPUT_RESULT_CONFIG,
  type DocumentMetadata,
  type DocumentSettings,
  type InputResultConfig,
} from '../documents/DocumentTypes';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

/** Screen-only view options (this browser, not the document). */
export interface ViewPrefs {
  ruler: boolean;
  /** Dashed printable-area outline on every page. */
  boundaries: boolean;
}

const VIEW_KEY = 'calccanvas.view';
function loadView(): ViewPrefs {
  const fallback = { ruler: false, boundaries: false };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

interface AppState {
  documentId: string | null;
  title: string;
  metadata: DocumentMetadata;
  settings: DocumentSettings;
  inputResult: InputResultConfig;
  createdAt: string;
  saveState: SaveState;
  /** When the worksheet was last written to browser storage (ISO time). */
  savedAt: string | null;
  /** The .mCCV file linked with Save As in this session; `dirty` = edited since it was written. */
  file: { name: string; dirty: boolean } | null;
  panelOpen: boolean;
  /** Left side panel (Outline / Parameters). */
  paramsOpen: boolean;
  leftTab: 'outline' | 'params';
  workspace: 'calculation' | 'input-results';
  dialog: null | 'open' | 'shortcuts' | 'syntax' | 'guide' | 'about' | 'page-setup' | 'help';
  /** Section the Help center opens on. */
  helpSection: string;
  view: ViewPrefs;
  toast: { kind: 'info' | 'error'; message: string } | null;

  setDocument(doc: {
    id: string;
    title: string;
    metadata: DocumentMetadata;
    settings: DocumentSettings;
    inputResult?: InputResultConfig;
    createdAt: string;
  }): void;
  updateTitle(title: string): void;
  updateMetadata(patch: Partial<DocumentMetadata>): void;
  updateSettings(patch: Partial<DocumentSettings>): void;
  updateInputResult(next: InputResultConfig): void;
  setWorkspace(workspace: AppState['workspace']): void;
  setSaveState(s: SaveState): void;
  togglePanel(open?: boolean): void;
  toggleParams(open?: boolean): void;
  /** Toolbar button for a tab: opens the panel on that tab, or closes it if already showing. */
  showLeftTab(tab: 'outline' | 'params'): void;
  openDialog(d: AppState['dialog']): void;
  openHelp(section?: string): void;
  setView(patch: Partial<ViewPrefs>): void;
  showToast(kind: 'info' | 'error', message: string): void;
}

export const useAppStore = create<AppState>((set) => ({
  documentId: null,
  title: 'Untitled calculation',
  metadata: {},
  settings: DEFAULT_SETTINGS,
  inputResult: EMPTY_INPUT_RESULT_CONFIG,
  createdAt: new Date().toISOString(),
  saveState: 'saved',
  savedAt: null,
  file: null,
  panelOpen: false,
  paramsOpen: true,
  leftTab: 'outline',
  workspace: 'calculation',
  dialog: null,
  helpSection: 'getting-started',
  view: loadView(),
  toast: null,

  setDocument: (doc) => {
    setPageSetup(doc.settings);
    set({
      documentId: doc.id,
      title: doc.title,
      metadata: doc.metadata,
      settings: { ...DEFAULT_SETTINGS, ...doc.settings },
      inputResult: doc.inputResult ?? EMPTY_INPUT_RESULT_CONFIG,
      createdAt: doc.createdAt,
      saveState: 'saved',
      workspace: 'calculation',
    });
  },
  updateTitle: (title) => set({ title, saveState: 'dirty' }),
  updateMetadata: (patch) => set((s) => ({ metadata: { ...s.metadata, ...patch }, saveState: 'dirty' })),
  updateSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch };
      // Page geometry is read synchronously while rendering: update it first.
      setPageSetup(settings);
      return { settings, saveState: 'dirty' };
    }),
  updateInputResult: (inputResult) => set({ inputResult, saveState: 'dirty' }),
  setWorkspace: (workspace) => set({ workspace }),
  setSaveState: (saveState) => set({ saveState }),
  togglePanel: (open) => set((s) => ({ panelOpen: open ?? !s.panelOpen })),
  toggleParams: (open) => set((s) => ({ paramsOpen: open ?? !s.paramsOpen })),
  showLeftTab: (tab) => set((s) => (s.paramsOpen && s.leftTab === tab ? { paramsOpen: false } : { paramsOpen: true, leftTab: tab })),
  openDialog: (dialog) => set({ dialog }),
  openHelp: (section) => set((s) => ({ dialog: 'help', helpSection: section ?? s.helpSection })),
  setView: (patch) =>
    set((s) => {
      const view = { ...s.view, ...patch };
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify(view));
      } catch {
        /* storage unavailable */
      }
      return { view };
    }),
  showToast: (kind, message) => set({ toast: { kind, message } }),
}));
