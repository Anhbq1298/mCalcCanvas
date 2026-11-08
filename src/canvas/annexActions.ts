/**
 * Annex commands: insert a link (creating the annex block), go between a link
 * and its block, and put the blocks in link order. Layout rule: the ANNEX
 * title has its own page and every annex block starts on a new page, so
 * blocks can be reordered by moving whole pages.
 */
import { useAppStore } from '../store/appStore';
import { PAGE_GAP, pageIndexOf, pageSize, printableBox } from '../export/pageGeometry';
import { annexInfo } from './annex';
import { revealShape, viewportCenter } from './canvasActions';
import { addShapes, newShapeId, orderedShapes, transaction, updateShapes, useCanvasStore } from './model/canvasStore';
import { DEFAULT_TEXT_PROPS, PARAGRAPH_STYLES, type Shape, type TextShape } from './model/types';
import { constrained, nextWritingPoint, totalPages } from './pageConstraint';

const orientation = () => useAppStore.getState().settings.pageOrientation;
const stride = () => pageSize(orientation()).h + PAGE_GAP;

function textShape(id: string, x: number, y: number, w: number, level: 0 | 1 | 2 | 3, html: string, annex: TextShape['props']['annex']): TextShape {
  const st = PARAGRAPH_STYLES[level];
  return {
    id,
    type: 'text',
    x,
    y,
    props: {
      ...DEFAULT_TEXT_PROPS,
      w,
      html,
      fontFamily: useAppStore.getState().settings.textFont,
      fontSize: st.fontSize,
      color: st.color,
      ...(level ? { heading: level } : {}),
      annex,
    },
  };
}

/** Appends a blank page and returns its index. */
function appendPage(): number {
  const index = totalPages();
  useAppStore.getState().updateSettings({ pages: index + 1 });
  return index;
}

/**
 * Insert → Annex link: a link at the insertion point (red cross, else the next
 * free line in view) and a new annex block on a new page, named "New annex".
 * Creates the ANNEX title page first if there is none.
 */
export function insertAnnexLink(): string | null {
  if (!constrained()) {
    useAppStore.getState().showToast('info', 'Annexes need the page view (View → Page view).');
    return null;
  }
  const st = useCanvasStore.getState();
  const info = annexInfo(st.shapes);
  const at = st.crosshair ? { x: st.crosshair.x, y: st.crosshair.y - 14 } : nextWritingPoint(viewportCenter());
  const start = info.start ? st.shapes[info.start] : undefined;
  if (start && at.y >= start.y) {
    useAppStore.getState().showToast('info', 'Put the annex link in the main body, above the ANNEX title.');
    return null;
  }
  const headingId = newShapeId();
  const annexId = `ax_${headingId}`;
  transaction(() => {
    const added: Shape[] = [];
    if (!info.start) {
      const box = printableBox(appendPage(), orientation());
      added.push(textShape(newShapeId(), box.x, box.y, box.w, 1, 'ANNEX', { kind: 'start' }));
      added.push(
        textShape(newShapeId(), box.x, box.y + 50, box.w, 0, 'Each annex is calculated at its link in the main body: it uses the values defined above that link.', undefined),
      );
    }
    const box = printableBox(appendPage(), orientation());
    added.push(textShape(headingId, box.x, box.y, box.w, 2, 'New annex', { kind: 'heading', id: annexId }));
    const pageBoxAt = printableBox(Math.max(0, Math.floor(at.y / stride())), orientation());
    added.push(textShape(newShapeId(), at.x, at.y, Math.max(160, pageBoxAt.x + pageBoxAt.w - at.x), 0, '', { kind: 'link', target: annexId }));
    addShapes(added, { history: false });
    sortAnnexByLinkOrder({ quiet: true, history: false });
  });
  revealShape(headingId);
  useCanvasStore.setState({ editingId: headingId });
  return headingId;
}

/** From a link: show its annex heading. From anything else: show that shape. */
export function followAnnex(id: string): void {
  const { shapes } = useCanvasStore.getState();
  const s = shapes[id];
  if (s?.type === 'text' && s.props.annex?.kind === 'link') {
    const block = annexInfo(shapes).links.get(id)?.block;
    if (block) revealShape(block.heading);
    return;
  }
  if (s) revealShape(id);
}

/**
 * Moves the annex blocks (whole pages) so they follow the order of their
 * links (A.1, A.2 …). Needs each annex heading on its own page.
 */
export function sortAnnexByLinkOrder(opts: { quiet?: boolean; history?: boolean } = {}): boolean {
  const { shapes } = useCanvasStore.getState();
  const info = annexInfo(shapes);
  const o = orientation();
  const toast = (m: string) => !opts.quiet && useAppStore.getState().showToast('info', m);
  if (info.blocks.length < 2) {
    toast('The annex is already in link order.');
    return true;
  }
  const physical = [...info.blocks].sort((a, b) => shapes[a.heading].y - shapes[b.heading].y);
  const last = Math.max(0, ...orderedShapes().map((s) => pageIndexOf(s, o)));
  const ranges = new Map<string, { first: number; last: number }>();
  for (let k = 0; k < physical.length; k++) {
    const first = pageIndexOf(shapes[physical[k].heading], o);
    const next = k + 1 < physical.length ? pageIndexOf(shapes[physical[k + 1].heading], o) : last + 1;
    if (next <= first) {
      toast('Put each annex heading on its own page, then sort again.');
      return false;
    }
    if (physical[k].members.some((m) => pageIndexOf(shapes[m], o) >= next)) {
      toast('Some annex content shares a page with the next annex heading; give each annex its own pages.');
      return false;
    }
    ranges.set(physical[k].id, { first, last: next - 1 });
  }
  let page = ranges.get(physical[0].id)!.first;
  const patches: Record<string, { y: number }> = {};
  for (const b of info.blocks) {
    const r = ranges.get(b.id)!;
    const dy = (page - r.first) * stride();
    if (dy) for (const id of [b.heading, ...b.members]) patches[id] = { y: (shapes[id] as Shape).y + dy };
    page += r.last - r.first + 1;
  }
  if (Object.keys(patches).length) updateShapes(patches, { raw: true, history: opts.history });
  else toast('The annex is already in link order.');
  return true;
}
