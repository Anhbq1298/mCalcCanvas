import { CanvasHost } from '../canvas/CanvasHost';
import { StatusBar } from '../components/common/StatusBar';
import { Dialogs, Toast } from '../components/dialogs/Dialogs';
import { LeftPanel } from '../components/panels/LeftPanel';
import { PropertiesPanel } from '../components/panels/PropertiesPanel';
import { DocsHeader } from '../components/docs/DocsHeader';
import { InputResultsPage } from '../components/inputResults/InputResultsPage';
import { useAppStore } from '../store/appStore';

export function AppLayout() {
  const panelOpen = useAppStore((s) => s.panelOpen);
  const paramsOpen = useAppStore((s) => s.paramsOpen);
  const workspace = useAppStore((s) => s.workspace);
  return (
    <div className="flex h-full flex-col bg-docs-bg">
      <DocsHeader />
      <div className="flex min-h-0 flex-1">
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
      </div>
      <StatusBar />
      <Dialogs />
      <Toast />
    </div>
  );
}
