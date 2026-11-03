import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  type DocumentMetadata,
  type DocumentSettings,
} from '../documents/DocumentTypes';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface AppState {
  documentId: string | null;
  title: string;
  metadata: DocumentMetadata;
  settings: DocumentSettings;
  createdAt: string;
  saveState: SaveState;
  panelOpen: boolean;
  dialog: null | 'open' | 'shortcuts' | 'syntax' | 'about';
  toast: { kind: 'info' | 'error'; message: string } | null;

  setDocument(doc: {
    id: string;
    title: string;
    metadata: DocumentMetadata;
    settings: DocumentSettings;
    createdAt: string;
  }): void;
  updateTitle(title: string): void;
  updateMetadata(patch: Partial<DocumentMetadata>): void;
  updateSettings(patch: Partial<DocumentSettings>): void;
  setSaveState(s: SaveState): void;
  togglePanel(open?: boolean): void;
  openDialog(d: AppState['dialog']): void;
  showToast(kind: 'info' | 'error', message: string): void;
}

export const useAppStore = create<AppState>((set) => ({
  documentId: null,
  title: 'Untitled calculation',
  metadata: {},
  settings: DEFAULT_SETTINGS,
  createdAt: new Date().toISOString(),
  saveState: 'saved',
  panelOpen: false,
  dialog: null,
  toast: null,

  setDocument: (doc) =>
    set({
      documentId: doc.id,
      title: doc.title,
      metadata: doc.metadata,
      settings: { ...DEFAULT_SETTINGS, ...doc.settings },
      createdAt: doc.createdAt,
      saveState: 'saved',
    }),
  updateTitle: (title) => set({ title, saveState: 'dirty' }),
  updateMetadata: (patch) => set((s) => ({ metadata: { ...s.metadata, ...patch }, saveState: 'dirty' })),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch }, saveState: 'dirty' })),
  setSaveState: (saveState) => set({ saveState }),
  togglePanel: (open) => set((s) => ({ panelOpen: open ?? !s.panelOpen })),
  openDialog: (dialog) => set({ dialog }),
  showToast: (kind, message) => set({ toast: { kind, message } }),
}));
