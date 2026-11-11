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
    title: 'Math functions',
    text: 'operators palette subscript greek units display format decimals scientific engineering trailing zeros if function vector range math functions abs sqrt nthRoot exp ln log sin cos tan asin acos atan sinh cosh tanh floor ceil min max',
    body: (
      <>
        <h4 className="help-h4">Enter and use math</h4>
        <p>Click a page and type an equation. Use <Kbd k=":" /> to define a value and <Kbd k="=" /> to show a result: <code>L:8.5 m</code>, then <code>A=L^2</code>. Equations calculate from top to bottom, so define a value before using it.</p>
        <p>Use parentheses to group operations, <code>^</code> for powers and the Math tab’s Operators, Symbols, Constants and Units palettes for special notation. Common functions include <code>abs</code>, <code>sqrt</code>, <code>nthRoot</code>, <code>exp</code>, <code>ln</code>, <code>log</code>, <code>sin</code>, <code>cos</code>, <code>tan</code>, <code>asin</code>, <code>acos</code>, <code>atan</code>, <code>sinh</code>, <code>cosh</code>, <code>tanh</code>, <code>floor</code>, <code>ceil</code>, <code>min</code> and <code>max</code>. For example, <code>sin(30 deg)=</code> gives 0.5. Trigonometric inputs can use angle units.</p>
        <p>Define functions with <code>f(x):…</code>, ranges with <code>i:0;n-1</code>, and use if blocks for conditional calculations. Checks such as <code>UR≤1</code> show PASS or FAIL. Units follow numbers (for example, <code>35 MPa</code>); use the Result unit box to change how a result is displayed.</p>
        <p>Result display settings (formula, result or full calculation; general, decimal, scientific or engineering format; decimal places and trailing zeros) only change how numbers are shown. Calculations keep full precision.</p>
      </>
    ),
  },
  {
    id: 'matrices',
    title: 'Matrices & vectors',
    text: 'matrix matrices vectors Matrices Tables insert matrix dimensions cells calculate multiply determinant inverse transpose index rows columns solve lsolve dot cross norm hadamard divideElements powerElements functions',
    body: (
      <>
        <h4 className="help-h4">Create a matrix</h4>
        <p>Open Matrices/Tables → Matrix, choose the row and column count, and fill the highlighted cells. To define it, put a name and <Kbd k=":" /> before the matrix, for example <code>A:</code>, then enter values in each cell. Use <code>A=</code> in a later equation to show the matrix. Define vectors and matrices before the equations that use them.</p>
        <h4 className="help-h4">Use matrix and vector operations</h4>
        <p>Use Matrices/Tables → Operators or type functions directly: <code>A·B</code> multiplies matrices, <code>A^T</code> transposes, <code>A^(-1)</code> or <code>inv(A)</code> inverts, and <code>det(A)</code> finds the determinant. Multiplication requires the number of columns in A to equal the number of rows in B; inverse and determinant need a square matrix.</p>
        <p>For a system <code>A·x=b</code>, calculate <code>x=lsolve(A,b)</code>. Read dimensions with <code>rows(A)</code> and <code>cols(A)</code>. Select an entry with <code>at(A,0,1)</code> (row 0, column 1), or extract a whole row or column with <code>row(A,0)</code> and <code>col(A,1)</code>. Indices start at zero.</p>
        <p>For vectors, <code>dot(v,w)</code> is the dot product, <code>cross(v,w)</code> is the 3D cross product, and <code>norm(v)</code> is the length. For element-by-element matrix math use <code>hadamard(A,B)</code>, <code>divideElements(A,B)</code> or <code>powerElements(A,B)</code>; both arrays must have the same shape. Matrix division is not supported.</p>
        <p>The searchable Matrices/Tables → Functions menu inserts function templates, including <code>zeros</code>, <code>ones</code>, <code>identity</code>, rearrangement, factorization and advanced array functions. Each matrix cell carries units; operations such as determinant, inverse and solve require consistent dimensions in their inputs.</p>
      </>
    ),
  },
  {
    id: 'plots',
    title: 'Plots',
    text: 'plot plots graph graphing x-y series vector range axes units title label line marker circles segments legend show data inputs auto scale equal grid origin',
    body: (
      <>
        <h4 className="help-h4">Create an X-Y plot</h4>
        <p>First define the data above where the plot will go. For example, enter <code>n:4</code>, <code>i:0;n-1</code> and <code>y:i^2</code> in separate math regions. This creates four x and y values: 0–3 and their squares.</p>
        <p>Open Plots → X-Y Plot to insert a graph. Select the graph, click Plots → Add series, then enter <code>i</code> for X values and <code>y</code> for Y values in the Properties panel. The graph recalculates when worksheet values change. Use Add series again to plot another pair of expressions.</p>
        <h4 className="help-h4">Format and troubleshoot</h4>
        <p>In Properties, set the graph title and X/Y labels, then give each series a legend label and colour. Choose Line to connect points, Markers to show separate points, Circles to draw points with radius <code>r</code>, or Segments to break the line where group value <code>g</code> changes.</p>
        <p>Use the Plots tab to set axis display units, show grid lines, put axes through the origin or use equal X/Y scales (useful for plans and sections). Units default to automatic; specified axis units must be compatible with the plotted data. The graph fits its range to the data automatically.</p>
        <p>X and Y expressions can each return one value or a vector; vectors must have matching lengths. If a series is blank, has mismatched lengths or contains an invalid expression or unit, the graph shows an error. Correct the expression or units in the series properties. Optional “Show when” controls whether a series is displayed for the current worksheet values.</p>
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
        <p>Table In&amp;Out runs many cases (load cases) of the same worksheet: bind inputs and results, enter numbers per case and press Calculate All. Results are outdated as soon as something they depend on changes.</p>
      </>
    ),
  },
  {
    id: 'printing',
    title: 'Printing and exporting',
    text: 'pdf print export header footer page size reports',
    body: (
      <>
        <p>File → Export PDF / Print (<Kbd k="Ctrl" />+<Kbd k="P" />) prints every page with the document's paper size, orientation and margins, without grid, rulers or selection marks. Choose “Save as PDF” in the print dialog.</p>
        <p>Table In&amp;Out → Print reports prints a summary of all cases and the full worksheet for each case.</p>
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
