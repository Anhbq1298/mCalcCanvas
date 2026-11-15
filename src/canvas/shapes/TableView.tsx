import { useCallback } from 'react';
import { setActiveGridCell, startEditing, updateShape, useCanvasStore } from '../model/canvasStore';
import type { TableShape } from '../model/types';
import { INPUT_TABLE_HEADER_ROWS, headerParts, inputNameLatex, inputTableRegionId, isVariableHeader } from '../inputTable';
import { useRegionResult } from '../../store/calculationStore';

const GREEK: Record<string, string> = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', varepsilon: 'ε', epsilon: 'ε', eta: 'η', theta: 'θ', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ', varphi: 'φ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Phi: 'Φ' };
const greek = (t: string) => t.replace(/\\([A-Za-z]+)/g, (_w, g: string) => GREEK[g] ?? g);

/** `G_{k.j}` → G<sub>k.j</sub>, `\gamma_{F.i}` → γ<sub>F.i</sub>: italic base (drawing-style variable name). */
function NameLabel({ name }: { name: string }) {
  const m = /^([^_]+)_\{?(.*?)\}?$/.exec(inputNameLatex(name));
  if (!m) return <i>{greek(name)}</i>;
  return <><i>{greek(m[1])}</i><sub>{greek(m[2])}</sub></>;
}

/** Header cell of an input-table column, red with the engine message when the column is invalid. */
function InputHeader({ shapeId, column, name }: { shapeId: string; column: number; name: string }) {
  const r = useRegionResult(inputTableRegionId(shapeId, column));
  const error = r?.status === 'error' ? r.error?.message ?? 'Invalid column' : null;
  if (!isVariableHeader(name)) return <span>{name || '\u00a0'}</span>;
  const { caption } = headerParts(name);
  return <span className={error ? 'is-error' : undefined} title={error ?? undefined}>{caption && <>{caption} </>}<NameLabel name={name} /></span>;
}

export function TableView({ shape, editing, isStatic }: { shape: TableShape; editing: boolean; isStatic: boolean }) {
  const active = useCanvasStore((s) => s.activeGridCell?.shapeId === shape.id ? s.activeGridCell : null);
  const update = useCallback((row: number, column: number, value: string) => {
    const cells = shape.props.cells.map((r) => r.map((cell) => ({ ...cell })));
    cells[row][column].value = value.slice(0, 1000);
    updateShape(shape.id, { props: { cells } }, { history: false });
  }, [shape]);
  return (
    <div className={'cc-table-region' + (shape.props.input ? ' is-input' : '')} data-testid="table-region" style={{ width: shape.props.w, minHeight: shape.props.h }}>
      <table>
        <tbody>
          {shape.props.cells.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const selected = active?.row === r && active.column === c;
                return (
                  <td key={c} className={((shape.props.headerRow && r === 0) || (shape.props.input && r < INPUT_TABLE_HEADER_ROWS) ? 'is-header ' : '') + (shape.props.input && r === 1 ? 'is-unit ' : '') + (shape.props.input && !isVariableHeader(shape.props.cells[0]?.[c]?.value ?? '') ? 'is-label ' : '') + (selected ? 'is-active' : '')} style={{ width: shape.props.columnWidths[c] }}>
                    {editing && !isStatic ? (
                      <input
                        aria-label={`Table cell ${r + 1}, ${c + 1}`}
                        value={cell.value}
                        onFocus={() => setActiveGridCell(shape.id, r, c)}
                        onChange={(e) => update(r, c, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab') {
                            e.preventDefault();
                            const delta = e.shiftKey ? -1 : 1;
                            const flat = Math.max(0, Math.min(shape.props.rows * shape.props.columns - 1, r * shape.props.columns + c + delta));
                            const nextR = Math.floor(flat / shape.props.columns);
                            const nextC = flat % shape.props.columns;
                            setActiveGridCell(shape.id, nextR, nextC);
                            requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[aria-label="Table cell ${nextR + 1}, ${nextC + 1}"]`)?.focus());
                          }
                          e.stopPropagation();
                        }}
                      />
                    ) : (
                      <button type="button" tabIndex={-1} onDoubleClick={() => startEditing(shape.id)} onClick={() => setActiveGridCell(shape.id, r, c)}>{shape.props.input && r === 0 ? <InputHeader shapeId={shape.id} column={c} name={cell.value} /> : cell.value || '\u00a0'}</button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
