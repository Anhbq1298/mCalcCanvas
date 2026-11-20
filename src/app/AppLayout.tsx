import { CanvasHost } from '../canvas/CanvasHost';
import { StatusBar } from '../components/common/StatusBar';
import { Dialogs, Toast } from '../components/dialogs/Dialogs';
import { LeftPanel } from '../components/panels/LeftPanel';
import { PropertiesPanel } from '../components/panels/PropertiesPanel';
import { DocsHeader } from '../components/docs/DocsHeader';
import { InputResultsPage } from '../components/inputResults/InputResultsPage';
import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { zoomFitWidth } from '../canvas/canvasActions';
import { usePhone } from './usePhone';

export function AppLayout() {
  const panelOpen = useAppStore((s) => s.panelOpen);
  const paramsOpen = useAppStore((s) => s.paramsOpen);
  const workspace = useAppStore((s) => s.workspace);
  const documentId = useAppStore((s) => s.documentId);
  const phone = usePhone();
  // On a phone the side panels are drawers over the sheet: closed when the app or a worksheet opens, and the
  // page fills the width.
  useEffect(() => {
    if (!phone) return;
    useAppStore.setState({ paramsOpen: false, panelOpen: false });
    const t = window.setTimeout(() => zoomFitWidth(), 250);
    return () => window.clearTimeout(t);
  }, [phone, documentId]);
  const drawer = phone && workspace === 'calculation' && (paramsOpen || panelOpen);
  return (
    <div className="flex h-full flex-col bg-docs-bg">
      <DocsHeader />
      <div className="app-body relative flex min-h-0 flex-1" data-phone={phone || undefined}>
        {workspace === 'calculation' && paramsOpen && <LeftPanel />}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div className={workspace === 'calculation' ? 'h-full' : 'hidden'} aria-hidden={workspace !== 'calculation'}>
            <CanvasHost />
          </div>
          <div className={workspace === 'input-results' ? 'h-full' : 'hidden'} aria-hidden={workspace !== 'input-results'}>
            <InputResultsPage />
          </div>
        </main>
        {workspace === 'calculation' && panelOpen && <PropertiesPanel />}
        {drawer && <div className="app-drawer-backdrop" data-testid="drawer-backdrop" aria-hidden onClick={() => useAppStore.setState({ paramsOpen: false, panelOpen: false })} />}
      </div>
      <StatusBar />
      <Dialogs />
      <Toast />
    </div>
  );
}
