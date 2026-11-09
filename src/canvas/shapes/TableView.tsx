import { useCallback } from 'react';
import { setActiveGridCell, startEditing, updateShape, useCanvasStore } from '../model/canvasStore';
import type { TableShape } from '../model/types';

export function TableView({ shape, editing, isStatic }: { shape: TableShape; editing: boolean; isStatic: boolean }) {
  const active = useCanvasStore((s) => s.activeGridCell?.shapeId === shape.id ? s.activeGridCell : null);
  const update = useCallback((row: number, column: number, value: string) => {
    const cells = shape.props.cells.map((r) => r.map((cell) => ({ ...cell })));
    cells[row][column].value = value.slice(0, 1000);
    updateShape(shape.id, { props: { cells } }, { history: false });
  }, [shape]);
  return (
    <div className="cc-table-region" data-testid="table-region" style={{ width: shape.props.w, minHeight: shape.props.h }}>
      <table>
        <tbody>
          {shape.props.cells.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const selected = active?.row === r && active.column === c;
                return (
                  <td key={c} className={(shape.props.headerRow && r === 0 ? 'is-header ' : '') + (selected ? 'is-active' : '')} style={{ width: shape.props.columnWidths[c] }}>
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
                      <button type="button" tabIndex={-1} onDoubleClick={() => startEditing(shape.id)} onClick={() => setActiveGridCell(shape.id, r, c)}>{cell.value || '\u00a0'}</button>
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
