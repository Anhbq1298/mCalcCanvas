import { useEffect } from 'react';
import { initDocuments, startAutosave } from '../documents/documentController';
import { CanvasView } from './CanvasView';
import { connectEngine } from './engineBridge';
import { useCanvasStore } from './model/canvasStore';
import { useCanvasKeyboard } from './useCanvasKeyboard';

/** Mounts the canvas and wires engine sync, autosave and shortcuts. */
export function CanvasHost() {
  useCanvasKeyboard();
  useEffect(() => {
    const disconnect = connectEngine();
    const stopAutosave = startAutosave();
    void initDocuments();
    // Read-only hook for automated browser tests.
    (window as unknown as { __calccanvas?: unknown }).__calccanvas = { store: useCanvasStore };
    return () => {
      disconnect();
      stopAutosave();
    };
  }, []);
  return <CanvasView />;
}
