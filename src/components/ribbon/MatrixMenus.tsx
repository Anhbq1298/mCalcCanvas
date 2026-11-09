/** Matrices/Tables tab menus: dimension picker, operators and functions (the tab layout is in tabs.tsx). */
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { insertMatrix, insertTable } from '../../canvas/matrixTableCommands';
import { insertTemplate } from '../../math/insertTemplate';

/** Dimension grid (hover to size, click to insert) plus typed rows × columns. */
export function DimensionPicker({ kind, close }: { kind: 'matrix' | 'table'; close(): void }) {
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

/** Vector/matrix operator templates ([title, LaTeX]). */
const MATRIX_OPERATORS = [
  ['Matrix multiplication', '#@\\cdot #?'], ['Matrix power', '#@^{#?}'], ['Subscript / index', '#@_{#?}'],
  ['Matrix inverse', '#@^{-1}'], ['Transpose', '#@^{T}'], ['Determinant', '\\det\\left(#@\\right)'],
  ['Vector norm', '\\left\\lVert#@\\right\\rVert'], ['Vectorize', '\\operatorname{vec}\\left(#@\\right)'], ['Cross product', '#@\\times #?'],
] as const;

const functions = ['abs','augment','Cholesky','cols','cond1','cond2','conde','condi','convolve','crosscorr','deconvolve','det','diag','eigenvals','eigenvec','eigenvecs','geninv','genvals','genvecs','hlookup','identity','IsArray','IsScalar','kronecker','last','length','logpts','logspace','lookup','lsolve','LU','match','matrix','max','min','norm','norm1','norm2','norme','normi','QR','rank','Rank','rows','rref','stack','submatrix','svd','svds','tr','vhlookup','vlookup'];
const engineFunctions = new Set(['abs', 'max', 'min']);

/** Searchable vector/matrix function list; functions the engine does not support yet are shown disabled. */
export function FunctionsMenu() {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => functions.filter((name) => name.toLowerCase().includes(query.toLowerCase())), [query]);
  return <div><label className="mb-2 flex items-center gap-1 rounded border border-docs-border px-2"><Search size={14}/><input autoFocus aria-label="Search matrix functions" value={query} onChange={(e) => setQuery(e.target.value)} className="h-7 min-w-0 flex-1 outline-none" /></label><div className="grid grid-cols-5 gap-0.5">{shown.map((name) => { const enabled = engineFunctions.has(name); return <button key={name} type="button" disabled={!enabled} title={enabled ? `Insert ${name}` : `${name} — calculation engine support is planned`} className="rounded px-2 py-1 text-left text-xs hover:bg-docs-hover disabled:cursor-not-allowed disabled:text-docs-muted/45" onClick={() => insertTemplate(`\\operatorname{${name}}\\left(#?\\right)`)}>{name}</button>; })}</div></div>;
}

/** Vector/matrix operators: each inserts its template into the open equation (or a new one). */
export function OperatorsMenu() {
  return (
    <div className="grid grid-cols-3 gap-1">
      {MATRIX_OPERATORS.map(([label, latex]) => (
        <button key={label} type="button" title={label} className="rounded border border-transparent p-2 text-center text-xs hover:border-docs-border hover:bg-docs-hover" onMouseDown={(e) => e.preventDefault()} onClick={() => insertTemplate(latex)}>
          {label}
        </button>
      ))}
    </div>
  );
}
