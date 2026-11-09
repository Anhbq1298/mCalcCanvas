import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  EMPTY_INPUT_RESULT_CONFIG,
  type DocumentMetadata,
  type DocumentSettings,
  type InputResultConfig,
} from '../documents/DocumentTypes';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface AppState {
  documentId: string | null;
  title: string;
  metadata: DocumentMetadata;
  settings: DocumentSettings;
  inputResult: InputResultConfig;
  createdAt: string;
  saveState: SaveState;
  panelOpen: boolean;
  /** Left side panel (Outline / Parameters). */
  paramsOpen: boolean;
  leftTab: 'outline' | 'params';
  workspace: 'calculation' | 'input-results';
  dialog: null | 'open' | 'shortcuts' | 'syntax' | 'guide' | 'about';
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
  panelOpen: false,
  paramsOpen: true,
  leftTab: 'outline',
  workspace: 'calculation',
  dialog: null,
  toast: null,

  setDocument: (doc) =>
    set({
      documentId: doc.id,
      title: doc.title,
      metadata: doc.metadata,
      settings: { ...DEFAULT_SETTINGS, ...doc.settings },
      inputResult: doc.inputResult ?? EMPTY_INPUT_RESULT_CONFIG,
      createdAt: doc.createdAt,
      saveState: 'saved',
      workspace: 'calculation',
    }),
  updateTitle: (title) => set({ title, saveState: 'dirty' }),
  updateMetadata: (patch) => set((s) => ({ metadata: { ...s.metadata, ...patch }, saveState: 'dirty' })),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch }, saveState: 'dirty' })),
  updateInputResult: (inputResult) => set({ inputResult, saveState: 'dirty' }),
  setWorkspace: (workspace) => set({ workspace }),
  setSaveState: (saveState) => set({ saveState }),
  togglePanel: (open) => set((s) => ({ panelOpen: open ?? !s.panelOpen })),
  toggleParams: (open) => set((s) => ({ paramsOpen: open ?? !s.paramsOpen })),
  showLeftTab: (tab) => set((s) => (s.paramsOpen && s.leftTab === tab ? { paramsOpen: false } : { paramsOpen: true, leftTab: tab })),
  openDialog: (dialog) => set({ dialog }),
  showToast: (kind, message) => set({ toast: { kind, message } }),
}));
