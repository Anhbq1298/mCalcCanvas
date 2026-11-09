import { Columns3, Grid3X3, ListX, PanelTop, Rows3, Search, Sigma, Table2, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { applyGridCommand, insertMatrix, insertTable } from '../../canvas/matrixTableCommands';
import { useCanvasStore } from '../../canvas/model/canvasStore';
import { useAppStore } from '../../store/appStore';
import { Popover } from '../docs/Popover';
import { insertTemplate } from '../../math/insertTemplate';

function RibbonButton({ label, icon, disabled, active, onClick }: { label: string; icon: React.ReactNode; disabled?: boolean; active?: boolean; onClick(): void }) {
  return <button type="button" className={'matrix-ribbon-button ' + (active ? 'is-active' : '')} aria-pressed={active} disabled={disabled} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function DimensionPicker({ kind, close }: { kind: 'matrix' | 'table'; close(): void }) {
  const [hover, setHover] = useState({ row: 2, column: 2 });
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const commit = (r: number, c: number) => {
    if (kind === 'matrix') insertMatrix(r, c);
    else insertTable(r, c);
    close();
  };
  return (
    <div data-testid={`${kind}-dimension-picker`}>
      <div className="mb-2 text-center text-sm font-medium text-docs-ink">{hover.row + 1} × {hover.column + 1}</div>
      <div className="grid grid-cols-10 gap-0.5" role="grid" aria-label={`${kind} dimensions`}>
        {Array.from({ length: 100 }, (_, index) => {
          const row = Math.floor(index / 10);
          const column = index % 10;
          const active = row <= hover.row && column <= hover.column;
          return <button key={index} type="button" role="gridcell" aria-label={`${row + 1} by ${column + 1}`} className={'dimension-cell ' + (active ? 'is-active' : '')} onMouseEnter={() => setHover({ row, column })} onFocus={() => setHover({ row, column })} onClick={() => commit(row + 1, column + 1)} />;
        })}
      </div>
      <div className="mt-2 flex items-center gap-1 border-t border-docs-border pt-2">
        <input aria-label="Rows" type="number" min={1} max={100} value={rows} onChange={(e) => setRows(Number(e.target.value))} />
        <span>×</span>
        <input aria-label="Columns" type="number" min={1} max={50} value={columns} onChange={(e) => setColumns(Number(e.target.value))} />
        <button type="button" className="ml-auto rounded bg-docs-blue px-2 py-1 text-xs text-white" onClick={() => commit(rows, columns)}>Insert</button>
      </div>
    </div>
  );
}

const operators = [
  ['Matrix multiplication', '#@\\cdot #?'], ['Matrix power', '#@^{#?}'], ['Subscript / index', '#@_{#?}'],
  ['Matrix inverse', '#@^{-1}'], ['Transpose', '#@^{T}'], ['Determinant', '\\det\\left(#@\\right)'],
  ['Vector norm', '\\left\\lVert#@\\right\\rVert'], ['Vectorize', '\\operatorname{vec}\\left(#@\\right)'], ['Cross product', '#@\\times #?'],
] as const;

const functions = ['abs','augment','Cholesky','cols','cond1','cond2','conde','condi','convolve','crosscorr','deconvolve','det','diag','eigenvals','eigenvec','eigenvecs','geninv','genvals','genvecs','hlookup','identity','IsArray','IsScalar','kronecker','last','length','logpts','logspace','lookup','lsolve','LU','match','matrix','max','min','norm','norm1','norm2','norme','normi','QR','rank','Rank','rows','rref','stack','submatrix','svd','svds','tr','vhlookup','vlookup'];
const engineFunctions = new Set(['abs', 'max', 'min']);

function FunctionsMenu() {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => functions.filter((name) => name.toLowerCase().includes(query.toLowerCase())), [query]);
  return <div><label className="mb-2 flex items-center gap-1 rounded border border-docs-border px-2"><Search size={14}/><input autoFocus aria-label="Search matrix functions" value={query} onChange={(e) => setQuery(e.target.value)} className="h-7 min-w-0 flex-1 outline-none" /></label><div className="grid grid-cols-5 gap-0.5">{shown.map((name) => { const enabled = engineFunctions.has(name); return <button key={name} type="button" disabled={!enabled} title={enabled ? `Insert ${name}` : `${name} — calculation engine support is planned`} className="rounded px-2 py-1 text-left text-xs hover:bg-docs-hover disabled:cursor-not-allowed disabled:text-docs-muted/45" onClick={() => insertTemplate(`\\operatorname{${name}}\\left(#?\\right)`)}>{name}</button>; })}</div></div>;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="matrix-ribbon-group"><div className="flex items-center gap-1">{children}</div><span className="matrix-ribbon-group-label">{label}</span></div>;
}

export function MatricesTablesRibbon() {
  const gridSelected = useCanvasStore((s) => {
    if (s.selection.length !== 1) return false;
    const shape = s.shapes[s.selection[0]];
    return shape?.type === 'table' || (shape?.type === 'math' && /\\begin\{bmatrix\}/.test(shape.props.latex));
  });
  const settings = useAppStore((s) => s.settings);
  const toggle = (key: 'showMatrixIndices' | 'collapseNestedMatrices') => useAppStore.getState().updateSettings({ [key]: !settings[key] });
  return <div className="flex flex-wrap items-stretch gap-1" data-testid="matrices-tables-ribbon">
    <Group label="Matrices and Tables">
      <Popover title="Insert Matrix" testId="insert-matrix" width={248} trigger={<span className="matrix-ribbon-trigger"><Grid3X3 size={18}/>Matrix</span>}>{(close) => <DimensionPicker kind="matrix" close={close} />}</Popover>
      <Popover title="Insert Table" testId="insert-table" width={248} trigger={<span className="matrix-ribbon-trigger"><Table2 size={18}/>Table</span>}>{(close) => <DimensionPicker kind="table" close={close} />}</Popover>
      <Popover title="Vector/Matrix Operators" testId="matrix-operators" width={310} trigger={<span className="matrix-ribbon-trigger"><Sigma size={18}/>Operators</span>}>{() => <div className="grid grid-cols-3 gap-1">{operators.map(([label, latex]) => <button key={label} type="button" title={label} className="rounded border border-transparent p-2 text-center text-xs hover:border-docs-border hover:bg-docs-hover" onClick={() => insertTemplate(latex)}>{label}</button>)}</div>}</Popover>
      <Popover title="Vector/Matrix Functions" testId="matrix-functions" width={520} trigger={<span className="matrix-ribbon-trigger"><Sigma size={18}/>Functions</span>}>{() => <FunctionsMenu />}</Popover>
    </Group>
    <Group label="Rows and Columns">
      <RibbonButton label="Insert Above" icon={<PanelTop size={17}/>} disabled={!gridSelected} onClick={() => applyGridCommand('above')} />
      <RibbonButton label="Insert Below" icon={<Rows3 size={17}/>} disabled={!gridSelected} onClick={() => applyGridCommand('below')} />
      <RibbonButton label="Insert Left" icon={<Columns3 size={17}/>} disabled={!gridSelected} onClick={() => applyGridCommand('left')} />
      <RibbonButton label="Insert Right" icon={<Columns3 size={17}/>} disabled={!gridSelected} onClick={() => applyGridCommand('right')} />
      <RibbonButton label="Delete Row" icon={<Trash2 size={17}/>} disabled={!gridSelected} onClick={() => applyGridCommand('delete-row')} />
      <RibbonButton label="Delete Column" icon={<Trash2 size={17}/>} disabled={!gridSelected} onClick={() => applyGridCommand('delete-column')} />
      <RibbonButton label="Clear Cells" icon={<ListX size={17}/>} disabled={!gridSelected} onClick={() => applyGridCommand('clear')} />
    </Group>
    <Group label="Result Format">
      <RibbonButton label="Show Indices" icon={<Rows3 size={17}/>} active={settings.showMatrixIndices} onClick={() => toggle('showMatrixIndices')} />
      <RibbonButton label="Collapse Nested" icon={<Grid3X3 size={17}/>} active={settings.collapseNestedMatrices} onClick={() => toggle('collapseNestedMatrices')} />
    </Group>
  </div>;
}
