import { useEffect } from 'react';
import { initDocuments, startAutosave } from '../documents/documentController';
import { CanvasView } from './CanvasView';
import { engine } from '../store/calculationStore';
import { connectEngine } from './engineBridge';
import { useCanvasStore } from './model/canvasStore';
import { useCanvasKeyboard } from './useCanvasKeyboard';

/** Mounts the canvas and wires engine sync, autosave and shortcuts. */
export function CanvasHost() {
  useCanvasKeyboard();
  useEffect(() => {
    const disconnect = connectEngine();
    const stopAutosave = startAutosave();
    const loaded = initDocuments();
    // Read-only hook for automated browser tests (loaded: first worksheet on the canvas; idle(): calculation finished).
    (window as unknown as { __calccanvas?: unknown }).__calccanvas = { store: useCanvasStore, idle: () => engine.idle(), loaded };
    return () => {
      disconnect();
      stopAutosave();
    };
  }, []);
  return <CanvasView />;
}
