import { useCallback, useEffect } from 'react';
import {
  DefaultFontStyle,
  DefaultSizeStyle,
  Tldraw,
  useActions,
  type Editor,
  type TLComponents,
  type TLUiOverrides,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite';
import { initDocuments, startAutosave } from '../documents/documentController';
import { useAppStore } from '../store/appStore';
import { connectEngine } from './engineBridge';
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard';
import { PageOverlay } from './PageOverlay';
import { MathShapeUtil } from './shapes/MathShapeUtil';
import { MathTool } from './tools/MathTool';

/** Fonts and icons bundled with the app (no CDN; works offline). */
const assetUrls = getAssetUrlsByImport();
const shapeUtils = [MathShapeUtil];
const tools = [MathTool];

/**
 * tldraw's own chrome is replaced by the CalcCanvas menu bar, toolbar and
 * properties panel. Context menu, rich-text toolbar, dialogs and the
 * keyboard/clipboard handling stay active.
 */
const components: TLComponents = {
  Toolbar: null,
  MainMenu: null,
  StylePanel: null,
  PageMenu: null,
  NavigationPanel: null,
  HelpMenu: null,
  ActionsMenu: null,
  QuickActions: null,
  ZoomMenu: null,
  DebugPanel: null,
  DebugMenu: null,
  MenuPanel: null,
  SharePanel: null,
  HelperButtons: null,
  Minimap: null,
  TopPanel: null,
  OnTheCanvas: PageOverlay,
};

/** Register the Math tool with tldraw's action/shortcut system (key: M). */
const overrides: TLUiOverrides = {
  tools(editor, toolsMap) {
    return {
      ...toolsMap,
      math: {
        id: 'math',
        label: 'Math' as never,
        icon: 'tool-text' as never,
        kbd: 'm',
        onSelect: () => editor.setCurrentTool('math'),
      },
    };
  },
};

/** Exposes tldraw UI actions (copy/paste/…) to the app menu bar. */
function ActionsBridge() {
  const actions = useActions();
  const setActions = useAppStore((s) => s.setActions);
  useEffect(() => setActions(actions), [actions, setActions]);
  return null;
}

export function CanvasEditor() {
  const editor = useAppStore((s) => s.editor);
  const canvasMode = useAppStore((s) => s.settings.canvasMode);
  const setEditor = useAppStore((s) => s.setEditor);
  useCanvasKeyboard(editor);

  const handleMount = useCallback(
    (ed: Editor) => {
      ed.user.updateUserPreferences({ colorScheme: 'light' });
      ed.setStyleForNextShapes(DefaultFontStyle, 'sans');
      ed.setStyleForNextShapes(DefaultSizeStyle, 's');
      const disconnect = connectEngine(ed);
      const stopAutosave = startAutosave(ed);
      setEditor(ed);
      void initDocuments(ed);
      // Test/automation hook (read-only access to the editor).
      (window as unknown as { __calccanvas?: { editor: Editor } }).__calccanvas = { editor: ed };
      return () => {
        disconnect();
        stopAutosave();
        setEditor(null);
      };
    },
    [setEditor],
  );

  return (
    <div className="calc-canvas absolute inset-0" data-mode={canvasMode} data-testid="canvas">
      <Tldraw
        assetUrls={assetUrls}
        shapeUtils={shapeUtils}
        tools={tools}
        components={components}
        overrides={overrides}
        onMount={handleMount}
      >
        <ActionsBridge />
      </Tldraw>
    </div>
  );
}
