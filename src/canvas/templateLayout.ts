import { shapeBounds, unionBounds } from './model/geometry.ts';
import type { Box, Shape } from './model/types.ts';

interface TemplateLayoutOptions {
  width?: number;
  height?: number;
  margins?: { left: number; right: number; top: number; bottom: number };
  mode?: 'compact' | 'print';
}
interface TemplateLayoutResult {
  shapes: Shape[];
  pages: number;
  utilization: number[];
  issues: string[];
}
type Block = { shapes: Shape[]; box: Box };

/** Pure template/print planner. It never changes source formulas, ids or input bindings.
 * Existing rows and grouped drawings move together; gaps and old page breaks are discarded.
 * The original vertical/left-to-right equation order is preserved inside every block.
 */
export function optimizeTemplateLayout(input: Shape[], options: TemplateLayoutOptions = {}): TemplateLayoutResult {
  const width = options.width ?? 794;
  const height = options.height ?? 1123;
  const m = options.margins ?? { left: 76, right: 76, top: 60, bottom: 60 };
  const usable = { w: width - m.left - m.right, h: height - m.top - m.bottom };
  const columns = options.mode === 'print' ? Math.max(1, Math.floor((usable.w + 24) / (642 + 24))) : 1;
  const columnWidth = (usable.w - (columns - 1) * 24) / columns;
  const gap = options.mode === 'print' ? 4 : 6;
  const groups = new Map<string, Shape[]>();
  for (const shape of input) {
    const key = shape.groupId ?? shape.id;
    const list = groups.get(key) ?? [];
    list.push(shape);
    groups.set(key, list);
  }
  const atoms: Block[] = [...groups.values()].map(shapes => ({ shapes, box: unionBounds(shapes.map(shapeBounds))! }));
  atoms.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const blocks: Block[] = [];
  for (const atom of atoms) {
    const last = blocks.at(-1);
    const annexStart = atom.shapes.some(s => s.type === 'text' && s.props.annex?.kind === 'start');
    if (last && !annexStart && atom.box.y < last.box.y + last.box.h - 2) {
      last.shapes.push(...atom.shapes);
      last.box = unionBounds([last.box, atom.box])!;
    } else blocks.push({ shapes: [...atom.shapes], box: { ...atom.box } });
  }
  // Metrics may reveal a row is wider than its source columns. Repack its atoms
  // into shelves, keeping grouped drawings intact and source reading order stable.
  const packed: Block[] = [];
  for (const block of blocks) {
    const members = atoms.filter(a => block.shapes.includes(a.shapes[0]));
    const collision = members.some((a, i) => members.slice(i + 1).some(b =>
      Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x) > 1 &&
      Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y) > 1));
    if (!collision && block.box.w <= columnWidth && block.box.h <= usable.h) { packed.push(block); continue; }
    let shelf: Shape[] = [];
    let x = m.left;
    let y = block.box.y;
    let shelfHeight = 0;
    const finish = () => { if (shelf.length) packed.push({ shapes: shelf, box: unionBounds(shelf.map(shapeBounds))! }); shelf = []; };
    const ordered: Block[] = [];
    for (const atom of members) {
      if (ordered.includes(atom)) continue;
      if (atom.shapes.some(s => s.type === 'math')) {
        for (const label of members) {
          if (ordered.includes(label) || label === atom || !label.shapes.every(s => s.type === 'text' && !s.props.heading && !s.props.annex)) continue;
          if (label.box.x < atom.box.x && label.box.y < atom.box.y + atom.box.h && label.box.y + label.box.h > atom.box.y) ordered.push(label);
        }
      }
      ordered.push(atom);
    }
    for (const atom of ordered) {
      if (x + atom.box.w > m.left + columnWidth && shelf.length) { finish(); y += shelfHeight + gap; x = m.left; shelfHeight = 0; }
      for (const s of atom.shapes) shelf.push({ ...s, x: s.x + x - atom.box.x, y: s.y + y - atom.box.y });
      x += atom.box.w + 16;
      shelfHeight = Math.max(shelfHeight, atom.box.h);
    }
    finish();
  }
  let page = 0;
  let column = 0;
  let bottom = m.top;
  const moved = new Map<string, Shape>();
  const used: number[] = [];
  const issues: string[] = [];
  const heading = (b: Block) => b.shapes.some(s => s.type === 'text' && !!s.props.heading);
  for (let i = 0; i < packed.length; i++) {
    const block = packed[i];
    const isHeading = heading(block);
    const annex = block.shapes.some(s => s.type === 'text' && s.props.annex?.kind === 'start');
    let keepHeight = block.box.h;
    if (isHeading) {
      for (let j = i + 1; j < packed.length; j++) {
        keepHeight += gap + packed[j].box.h;
        if (!heading(packed[j])) break;
      }
    }
    const before = bottom > m.top ? (annex ? 18 : isHeading ? 12 : gap) : 0;
    if (bottom + before + Math.min(keepHeight, usable.h) > height - m.bottom && bottom > m.top) {
      column++;
      if (column === columns) { page++; column = 0; }
      bottom = m.top;
    }
    const top = bottom + (bottom > m.top ? (annex ? 18 : isHeading ? 12 : gap) : 0);
    const x = Math.max(m.left, Math.min(block.box.x, m.left + columnWidth - block.box.w)) + column * (columnWidth + 24);
    const dx = x - block.box.x;
    const dy = page * (height + 48) + top - block.box.y;
    for (const s of block.shapes) moved.set(s.id, { ...s, x: s.x + dx, y: s.y + dy });
    if (block.box.w > columnWidth + 0.5 || block.box.h > usable.h + 0.5) issues.push(`Oversized block: ${block.shapes[0].id}`);
    bottom = top + block.box.h;
    used[page] = Math.max(used[page] ?? 0, bottom - m.top);
  }
  return { shapes: input.map(s => moved.get(s.id) ?? { ...s }), pages: page + 1, utilization: used.map(h => h / usable.h), issues };
}
