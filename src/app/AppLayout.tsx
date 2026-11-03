import { CanvasHost } from '../canvas/CanvasHost';
import { StatusBar } from '../components/common/StatusBar';
import { Dialogs, Toast } from '../components/dialogs/Dialogs';
import { PropertiesPanel } from '../components/panels/PropertiesPanel';
import { Ribbon } from '../components/ribbon/Ribbon';
import { useAppStore } from '../store/appStore';

export function AppLayout() {
  const panelOpen = useAppStore((s) => s.panelOpen);
  return (
    <div className="flex h-full flex-col bg-background">
      <Ribbon />
      <div className="flex min-h-0 flex-1">
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
