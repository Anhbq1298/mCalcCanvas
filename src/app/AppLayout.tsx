import { CanvasHost } from '../canvas/CanvasHost';
import { StatusBar } from '../components/common/StatusBar';
import { Dialogs, Toast } from '../components/dialogs/Dialogs';
import { ParametersPanel } from '../components/panels/ParametersPanel';
import { PropertiesPanel } from '../components/panels/PropertiesPanel';
import { DocsHeader } from '../components/docs/DocsHeader';
import { useAppStore } from '../store/appStore';

export function AppLayout() {
  const panelOpen = useAppStore((s) => s.panelOpen);
  const paramsOpen = useAppStore((s) => s.paramsOpen);
  return (
    <div className="flex h-full flex-col bg-docs-bg">
      <DocsHeader />
      <div className="flex min-h-0 flex-1">
        {paramsOpen && <ParametersPanel />}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <CanvasHost />
        </main>
        {panelOpen && <PropertiesPanel />}
      </div>
      <StatusBar />
      <Dialogs />
      <Toast />
    </div>
  );
}
