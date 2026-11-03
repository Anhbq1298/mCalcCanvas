import {
  ArrowUpRight,
  Calculator,
  CheckSquare,
  FileDown,
  Grid3x3,
  Hand,
  ImagePlus,
  Magnet,
  Minus,
  MousePointer2,
  PanelRight,
  Pencil,
  Plus,
  Redo2,
  Sigma,
  Square,
  Type,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useValue } from 'tldraw';
import { commands, type ToolId } from '../../app/commands';
import { useAppStore } from '../../store/appStore';

function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  onClick(): void;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className={
        'flex h-8 w-8 cursor-pointer items-center justify-center rounded transition-colors duration-150 disabled:cursor-default disabled:opacity-40 ' +
        (active ? 'bg-accent-soft text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
      }
    >
      <Icon size={17} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

const Divider = () => <div className="mx-1.5 h-5 w-px bg-border" aria-hidden />;

const TOOLS: { id: ToolId; icon: LucideIcon; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select (V)' },
  { id: 'hand', icon: Hand, label: 'Pan (H or Space+drag)' },
  { id: 'math', icon: Sigma, label: 'Math region (M) – click to place' },
  { id: 'text', icon: Type, label: 'Text (T)' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'geo', icon: Square, label: 'Rectangle' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
  { id: 'draw', icon: Pencil, label: 'Freehand' },
];

export function Toolbar() {
  const editor = useAppStore((s) => s.editor);
  const canvasMode = useAppStore((s) => s.settings.canvasMode);
  const panelOpen = useAppStore((s) => s.panelOpen);
  const tool = useValue('tool', () => editor?.getCurrentToolId() ?? 'select', [editor]);
  const zoom = useValue('zoom', () => editor?.getZoomLevel() ?? 1, [editor]);
  const canUndo = useValue('undo', () => editor?.canUndo() ?? false, [editor]);
  const canRedo = useValue('redo', () => editor?.canRedo() ?? false, [editor]);
  const isGrid = useValue('grid', () => editor?.getInstanceState().isGridMode ?? false, [editor]);
  const isSnap = useValue('snap', () => editor?.user.getIsSnapMode() ?? false, [editor]);

  return (
    <div
      role="toolbar"
      aria-label="Tools"
      className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-card px-2"
    >
      {TOOLS.map((t) => (
        <IconButton key={t.id} icon={t.icon} label={t.label} active={tool === t.id} onClick={() => commands.setTool(t.id)} testId={`tool-${t.id}`} />
      ))}
      <IconButton icon={CheckSquare} label="Insert check (≤ limit)" onClick={() => commands.insertCheck()} />
      <IconButton icon={ImagePlus} label="Insert image" onClick={() => void commands.insertImage()} />
      <Divider />
      <IconButton icon={Undo2} label="Undo (Ctrl+Z)" onClick={commands.undo} disabled={!canUndo} />
      <IconButton icon={Redo2} label="Redo (Ctrl+Y)" onClick={commands.redo} disabled={!canRedo} />
      <Divider />
      <IconButton icon={Minus} label="Zoom out" onClick={commands.zoomOut} />
      <button
        type="button"
        onClick={commands.resetZoom}
        title="Reset zoom to 100%"
        className="h-8 w-12 cursor-pointer rounded text-[12px] tabular-nums text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton icon={Plus} label="Zoom in" onClick={commands.zoomIn} />
      <IconButton icon={Grid3x3} label="Toggle grid" active={isGrid} onClick={commands.toggleGrid} />
      <IconButton icon={Magnet} label="Toggle snapping" active={isSnap} onClick={commands.toggleSnap} />
      <Divider />
      <div role="radiogroup" aria-label="Canvas mode" className="flex rounded border border-border p-0.5">
        {(['free', 'page'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={canvasMode === m}
            onClick={() => commands.setCanvasMode(m)}
            className={
              'h-6 cursor-pointer rounded-sm px-2 text-[12px] transition-colors duration-150 ' +
              (canvasMode === m ? 'bg-primary text-on-primary' : 'text-muted-foreground hover:text-foreground')
            }
          >
            {m === 'free' ? 'Free canvas' : 'Page layout'}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1 pl-2">
        <button
          type="button"
          onClick={commands.calculateAll}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded border border-border px-2.5 text-[12px] font-medium text-foreground transition-colors duration-150 hover:bg-muted"
        >
          <Calculator size={15} aria-hidden /> Calculate all
        </button>
        <button
          type="button"
          onClick={() => void commands.exportPdf()}
          data-testid="export-pdf"
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded bg-primary px-3 text-[12px] font-medium text-on-primary transition-colors duration-150 hover:bg-primary/90"
        >
          <FileDown size={15} aria-hidden /> Export PDF
        </button>
        <IconButton icon={PanelRight} label="Toggle properties panel" active={panelOpen} onClick={() => useAppStore.getState().togglePanel()} />
      </div>
    </div>
  );
}
