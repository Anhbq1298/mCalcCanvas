/**
 * Left side panel with two tabs, like the Google Docs outline:
 * - Outline: the worksheet's headings; click to jump, double-click to rename, add sections.
 * - Parameters: every defined variable with its value.
 */
import { ListTree, Plus, Variable, X } from 'lucide-react';
import { useState } from 'react';
import { revealShape } from '../../canvas/canvasActions';
import { addHeading, outlineOf, renameHeading, sectionOf, setParagraphStyle } from '../../canvas/headings';
import { useCanvasStore } from '../../canvas/model/canvasStore';
import { useAppStore } from '../../store/appStore';
import { ParametersView } from './ParametersPanel';

function OutlineView() {
  const shapes = useCanvasStore((s) => s.shapes);
  const selection = useCanvasStore((s) => s.selection);
  const items = outlineOf(shapes);
  const active = sectionOf(shapes, selection[0]);
  const [renaming, setRenaming] = useState<string | null>(null);

  const addBtn = (level: 1 | 2, label: string, testId: string) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => addHeading(level)}
      className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1 rounded-full border border-docs-border text-[12.5px] font-medium text-docs-ink transition-colors duration-150 hover:bg-docs-hover"
    >
      <Plus size={14} aria-hidden /> {label}
    </button>
  );

  return (
    <div data-testid="outline-panel" className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1.5 px-3 pb-2">
        {addBtn(1, 'Section', 'add-heading-1')}
        {addBtn(2, 'Sub-section', 'add-heading-2')}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-docs-muted">
            Headings you add appear here. Click <b>+ Section</b>, or select a text region and choose <b>Heading 1/2</b> in the toolbar style box.
          </p>
        ) : (
          <ul data-testid="outline-list" className="space-y-px">
            {items.map((h) => (
              <li key={h.id}>
                {renaming === h.id ? (
                  <input
                    autoFocus
                    aria-label="Heading text"
                    defaultValue={h.text}
                    onBlur={(e) => {
                      renameHeading(h.id, e.currentTarget.value);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    style={{ marginLeft: (h.level - 1) * 14 }}
                    className="h-7 w-[calc(100%-8px)] rounded border border-docs-blue bg-white px-2 text-[13px] focus:outline-none"
                  />
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="outline-item"
                    data-level={h.level}
                    title="Click to go there · double-click to rename"
                    onClick={() => revealShape(h.id)}
                    onDoubleClick={() => setRenaming(h.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') revealShape(h.id);
                      if (e.key === 'F2') setRenaming(h.id);
                    }}
                    style={{ paddingLeft: 10 + (h.level - 1) * 14 }}
                    className={
                      'group flex cursor-pointer items-center gap-1 rounded-md py-1.5 pr-1 transition-colors duration-150 ' +
                      (active === h.id ? 'bg-docs-active text-docs-blue' : 'text-docs-ink hover:bg-docs-hover') +
                      (h.level === 1 ? ' text-[13.5px] font-semibold' : h.level === 2 ? ' text-[13px] font-medium' : ' text-[12.5px]')
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">{h.text || <span className="italic text-docs-muted">(empty heading)</span>}</span>
                    <button
                      type="button"
                      aria-label={`Remove “${h.text}” from the outline`}
                      title="Remove from outline (make normal text)"
                      onClick={(e) => {
                        e.stopPropagation();
                        setParagraphStyle([h.id], 0);
                      }}
                      className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-docs-muted opacity-0 transition-opacity duration-150 hover:bg-docs-border group-hover:opacity-100 focus:opacity-100"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function LeftPanel() {
  const tab = useAppStore((s) => s.leftTab);
  const { toggleParams } = useAppStore.getState();
  const tabBtn = (id: 'outline' | 'params', label: string, Icon: typeof ListTree) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => useAppStore.setState({ leftTab: id })}
      className={
        'flex h-9 cursor-pointer items-center gap-1.5 border-b-2 px-2.5 text-[13.5px] font-medium transition-colors duration-150 ' +
        (tab === id ? 'border-docs-blue text-docs-blue' : 'border-transparent text-docs-muted hover:text-docs-ink')
      }
    >
      <Icon size={16} aria-hidden /> {label}
    </button>
  );
  return (
    <aside aria-label="Side panel" data-testid="left-panel" className="flex w-[300px] shrink-0 flex-col border-r border-docs-border bg-docs-bg">
      <div className="mb-2 flex items-center justify-between pl-2 pr-2 pt-1">
        <div role="tablist" className="flex">
          {tabBtn('outline', 'Outline', ListTree)}
          {tabBtn('params', 'Parameters', Variable)}
        </div>
        <button
          type="button"
          aria-label="Close side panel"
          onClick={() => toggleParams(false)}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-docs-muted transition-colors duration-150 hover:bg-docs-hover"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {tab === 'outline' ? <OutlineView /> : <ParametersView />}
    </aside>
  );
}
