/**
 * Help center (Help tab, F1): short original guides for what mCalcCanvas does,
 * and the keyboard shortcuts straight from the shortcut registry, searchable.
 */
import { Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { SHORTCUT_CATEGORIES, SHORTCUTS, BROWSER_RESERVED, type ShortcutDefinition } from '../../app/shortcuts';
import { useAppStore } from '../../store/appStore';
import { Modal } from './Dialogs';

const Kbd = ({ k }: { k: string }) => <kbd className="help-kbd">{k}</kbd>;

const HELP_SECTIONS: { id: string; title: string; body: ReactNode; text: string }[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    text: 'click type definition evaluate units calculate',
    body: (
      <>
        <p>A worksheet is a set of pages. Click on a page to place the red + cross, then type: a math region starts where the cross is. Type <Kbd k='"' /> instead to start a text region.</p>
        <p>Define a value with <Kbd k=":" /> (shown as ≔), e.g. <code>L:8.5 m</code>, and show a result with <Kbd k="=" />, e.g. <code>M=</code>. Regions are calculated top to bottom, left to right, like reading the page.</p>
        <p>Results update as you type. <Kbd k="F9" /> recalculates everything.</p>
      </>
    ),
  },
  {
    id: 'worksheet',
    title: 'Worksheet basics',
    text: 'move drag grid lines enter delete backspace undo outline annex',
    body: (
      <>
        <p>Regions sit on ruled lines (the grid). Drag a region by its ⠿ grip or move it with the arrow keys. With the + cross on the page, <Kbd k="Enter" /> inserts a line and pushes everything below down; <Kbd k="Delete" /> removes the blank line the cross is on and <Kbd k="Backspace" /> the one above. Deleting regions closes the lines they leave empty.</p>
        <p>Headings appear in the Outline (left panel). Long derivations can go to an annex: an annex block is calculated where its link stands in the main text.</p>
      </>
    ),
  },
  {
    id: 'document',
    title: 'Document settings',
    text: 'paper a4 a3 portrait landscape margins page setup ruler boundary zoom page break',
    body: (
      <>
        <p>Document tab → Page setup: paper A4 or A3, portrait or landscape, and margins in millimetres (presets or custom). These only move the page frames: regions keep their positions and nothing is recalculated. If a region ends up outside the printable area it is marked with a red dashed box.</p>
        <p>Page view: page boundaries (dashed printable area), grid, rulers in mm (they follow zoom and scrolling and shade the margins), header and footer. Zoom: 100 %, fit page, fit width.</p>
        <p>Document → Page Break (<Kbd k="Ctrl" />+<Kbd k="Shift" />+<Kbd k="Enter" />) starts a new page at the + cross; Blank page (<Kbd k="Ctrl" />+<Kbd k="Enter" />) adds an empty page after the current one.</p>
      </>
    ),
  },
  {
    id: 'math',
    title: 'Math regions',
    text: 'operators palette subscript greek units display format decimals scientific engineering trailing zeros if function vector range',
    body: (
      <>
        <p>Use the palettes (Math tab → Operators and Symbols) or the keys below. A dot after a name makes a literal subscript (<code>M.Ed</code> → M<sub>Ed</sub>). Units are typed after the number (<code>35 MPa</code>); results can be shown in another unit (Result unit box).</p>
        <p>Results: display (formula, result, full calculation), number format (general, decimal, scientific, engineering), decimal places and trailing zeros. These change only how a number is written: the value used in later regions keeps full precision.</p>
        <p>Functions <code>f(x):…</code>, ranges <code>i:0;n-1</code>, if blocks and checks (<code>UR≤1</code> shows PASS / FAIL) are supported.</p>
      </>
    ),
  },
  {
    id: 'text',
    title: 'Text regions',
    text: 'font bold italic underline subscript superscript color highlight align justify list indent style title heading link',
    body: (
      <>
        <p>Text Formatting tab: font, size, bold, italic, underline, sub/superscript, colour and highlight apply to the selected characters while editing (or the whole region when it is selected); alignment, lists, indent and styles apply to the region.</p>
        <p>Styles: Normal, Title, Subtitle, Heading 1–3 (headings appear in the Outline). Links: select text while editing, then Insert link (http, https or mailto only).</p>
      </>
    ),
  },
  {
    id: 'calculation',
    title: 'Calculation',
    text: 'order reading redefine error units input results batch load cases',
    body: (
      <>
        <p>A region uses the definitions above it (or to its left on the same line). Redefining a name is allowed and outlined in green. Unit mismatches, undefined names and division by zero are reported on the region.</p>
        <p>Input &amp; Results runs many cases (load cases) of the same worksheet: bind inputs and results, enter numbers per case and press Calculate All. Results are outdated as soon as something they depend on changes.</p>
      </>
    ),
  },
  {
    id: 'printing',
    title: 'Printing and exporting',
    text: 'pdf print export header footer page size reports',
    body: (
      <>
        <p>File → Download PDF / Print (<Kbd k="Ctrl" />+<Kbd k="P" />) prints every page with the document's paper size, orientation and margins, without grid, rulers or selection marks. Choose “Save as PDF” in the print dialog.</p>
        <p>Input &amp; Results → Print reports prints a summary of all cases and the full worksheet for each case.</p>
      </>
    ),
  },
  { id: 'shortcuts', title: 'Keyboard shortcuts', text: 'keys shortcuts', body: null },
];

const scopeLabel: Record<ShortcutDefinition['scope'], string> = { global: 'Anywhere', worksheet: 'Worksheet', math: 'Math region', text: 'Text region' };

function ShortcutTable({ list }: { list: ShortcutDefinition[] }) {
  return (
    <table className="help-table" data-testid="shortcut-table">
      <thead>
        <tr>
          <th>Command</th>
          <th>Shortcut</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {list.map((s) => (
          <tr key={s.id} data-shortcut={s.id}>
            <td>{s.command}</td>
            <td className="whitespace-nowrap">
              {s.keys.map((k, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-muted-foreground">+</span>}
                  <Kbd k={k} />
                </span>
              ))}
            </td>
            <td>
              {s.description} <span className="text-[11px] text-muted-foreground">· {scopeLabel[s.scope]}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HelpCenter({ onClose }: { onClose(): void }) {
  const section = useAppStore((s) => s.helpSection);
  const setSection = (id: string) => useAppStore.setState({ helpSection: id });
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const hits = useMemo(
    () =>
      q
        ? SHORTCUTS.filter((s) => [s.command, s.description, s.category, s.group ?? '', s.keys.join('+'), s.keys.join(' ')].join(' ').toLowerCase().includes(q))
        : SHORTCUTS,
    [q],
  );
  const sectionHits = q ? HELP_SECTIONS.filter((s) => s.id !== 'shortcuts' && `${s.title} ${s.text}`.toLowerCase().includes(q)) : [];
  const current = HELP_SECTIONS.find((s) => s.id === section) ?? HELP_SECTIONS[0];
  const showShortcuts = q || current.id === 'shortcuts';

  return (
    <Modal title="Help" onClose={onClose} wide>
      <div className="help-center" data-testid="help-center">
        <nav aria-label="Help sections" className="help-nav">
          {HELP_SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-current={!q && s.id === current.id} onClick={() => (setQuery(''), setSection(s.id))}>
              {s.title}
            </button>
          ))}
        </nav>
        <div className="help-main">
          <label className="help-search">
            <Search size={14} aria-hidden />
            <input autoFocus aria-label="Search help and shortcuts" data-testid="help-search" placeholder="Search commands, keys or topics" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {q && sectionHits.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              Topics:{' '}
              {sectionHits.map((s) => (
                <button key={s.id} type="button" className="help-link" onClick={() => (setQuery(''), setSection(s.id))}>
                  {s.title}
                </button>
              ))}
            </p>
          )}
          {showShortcuts ? (
            hits.length === 0 ? (
              <p className="text-muted-foreground">No shortcut matches “{query}”.</p>
            ) : (
              SHORTCUT_CATEGORIES.filter((c) => hits.some((s) => s.category === c)).map((c) => (
                <section key={c}>
                  <h3 className="help-h3">{c}</h3>
                  {c === 'Operators'
                    ? [...new Set(hits.filter((s) => s.category === c).map((s) => s.group ?? ''))].map((g) => (
                        <div key={g}>
                          <h4 className="help-h4">{g}</h4>
                          <ShortcutTable list={hits.filter((s) => s.category === c && (s.group ?? '') === g)} />
                        </div>
                      ))
                    : <ShortcutTable list={hits.filter((s) => s.category === c)} />}
                </section>
              ))
            )
          ) : (
            <article className="help-article">
              <h3 className="help-h3">{current.title}</h3>
              {current.body}
            </article>
          )}
          {showShortcuts && !q && (
            <p className="text-[11px] text-muted-foreground">The browser keeps {BROWSER_RESERVED.join(', ')} for itself; mCalcCanvas uses the keys above instead (e.g. “ for a text region).</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
