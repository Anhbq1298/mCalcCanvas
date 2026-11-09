/**
 * Ribbon tab strip and panel. Tabs follow Mathcad Prime order and stay where the user puts them.
 */
import type { ReactNode } from 'react';
import { MathFormattingTab, TextFormattingTab } from './formatTabs';
import { CalculationTab, DocumentTab, HelpTab, InsertTab, MathTab, MatricesTab, PlotsTab } from './tabs';

export type RibbonTabId = 'math' | 'insert' | 'matrices' | 'plots' | 'math-format' | 'text-format' | 'calculation' | 'document' | 'help';

/** Mathcad Prime order. The tab stays where the user put it (no switching on selection). */
const TAB_LABELS: [RibbonTabId, string][] = [
  ['math', 'Math'],
  ['insert', 'Insert'],
  ['matrices', 'Matrices/Tables'],
  ['plots', 'Plots'],
  ['math-format', 'Math Formatting'],
  ['text-format', 'Text Formatting'],
  ['calculation', 'Calculation'],
  ['document', 'Document'],
  ['help', 'Help'],
];

export function RibbonTabs({ tab, setTab, only, label = 'Ribbon' }: { tab: RibbonTabId; setTab(t: RibbonTabId): void; only: (id: RibbonTabId) => boolean; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className="rb-tabs">
      {TAB_LABELS.filter(([id]) => only(id)).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          data-testid={`format-tab-${id}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setTab(id)}
          className={'rb-tab ' + (tab === id ? 'is-active' : '')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const TAB_CONTENT: Record<RibbonTabId, () => ReactNode> = {
  math: MathTab,
  insert: InsertTab,
  matrices: MatricesTab,
  calculation: CalculationTab,
  plots: PlotsTab,
  'math-format': MathFormattingTab,
  'text-format': TextFormattingTab,
  document: DocumentTab,
  help: HelpTab,
};

export function RibbonPanel({ tab }: { tab: RibbonTabId }) {
  const label = TAB_LABELS.find(([id]) => id === tab)![1];
  const Content = TAB_CONTENT[tab];
  return (
    <div role="tabpanel" aria-label={label} className="rb-panel" data-testid={`format-panel-${tab}`}>
      <Content />
    </div>
  );
}

