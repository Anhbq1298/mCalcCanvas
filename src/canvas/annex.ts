/**
 * Annex blocks and the links that place them in the calculation.
 *
 * - The ANNEX title (annex.kind = 'start') marks where the annex begins: every
 *   shape below it, in reading order, is annex content.
 * - An annex heading (kind = 'heading') starts a block that runs to the next
 *   annex heading (or the end of the document).
 * - A link (kind = 'link', in the main body) makes its block calculate as if
 *   the whole block stood at the link: the block's regions get the link's
 *   reading key followed by their own (see engineBridge). The calculation is
 *   still one top-to-bottom chain, so no cycles can appear.
 *
 * Blocks are numbered A.1, A.2 … in the order of their links; blocks without
 * a link come after, in their own order.
 */
import { PAGE_GAP, pageSize } from '../export/pageGeometry';
import type { PageOrientation } from '../documents/DocumentTypes';
import type { Shape, TextShape } from './model/types';

interface AnnexBlock {
  /** Stable annex id (heading.props.annex.id). */
  id: string;
  /** Shape id of the annex heading. */
  heading: string;
  /** A.n number (1-based) in link order; unlinked blocks follow. */
  number: number;
  /** Shape id of the link that places the block, if any. */
  link?: string;
  /** Shapes inside the block (reading order), heading excluded. */
  members: string[];
}

interface LinkState {
  block?: AnnexBlock;
  /** Why the link does nothing (missing target, duplicate, inside the annex). */
  problem?: string;
}

interface AnnexInfo {
  /** Shape id of the ANNEX title. */
  start?: string;
  /** Blocks by annex id, in number order. */
  blocks: AnnexBlock[];
  byHeading: Map<string, AnnexBlock>;
  links: Map<string, LinkState>;
  /** Annex heading shapes that do not start a block (and why). */
  headingProblems: Map<string, string>;
  /** Member shape id → link shape id, for blocks placed by a link. */
  anchorOf: Map<string, string>;
}

export const annexNumber = (n: number) => `A.${n}`;

function before(a: Shape, b: Shape): number {
  return a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const roleOf = (s: Shape) => (s.type === 'text' ? s.props.annex : undefined);

export function computeAnnex(shapes: Record<string, Shape>): AnnexInfo {
  const list = Object.values(shapes).sort(before);
  const info: AnnexInfo = { blocks: [], byHeading: new Map(), links: new Map(), headingProblems: new Map(), anchorOf: new Map() };
  const startIdx = list.findIndex((s) => roleOf(s)?.kind === 'start');
  info.start = startIdx >= 0 ? list[startIdx].id : undefined;

  // Blocks: annex headings below the ANNEX title.
  const raw: { id: string; heading: string; members: string[] }[] = [];
  const seen = new Set<string>();
  list.forEach((s, i) => {
    const r = roleOf(s);
    if (r?.kind === 'heading') {
      if (startIdx < 0 || i < startIdx) {
        info.headingProblems.set(s.id, 'Above the ANNEX title: not part of the annex.');
        return;
      }
      if (seen.has(r.id)) {
        info.headingProblems.set(s.id, 'Duplicate annex heading.');
        return;
      }
      seen.add(r.id);
      raw.push({ id: r.id, heading: s.id, members: [] });
      return;
    }
    if (raw.length && i > startIdx) raw[raw.length - 1].members.push(s.id);
  });

  // Links: the first link to a block (reading order) places it.
  const linkOf = new Map<string, string>();
  list.forEach((s, i) => {
    const r = roleOf(s);
    if (r?.kind !== 'link') return;
    if (startIdx >= 0 && i > startIdx) {
      info.links.set(s.id, { problem: 'A link inside the annex is not allowed.' });
      return;
    }
    if (!raw.some((b) => b.id === r.target)) {
      info.links.set(s.id, { problem: 'Annex missing.' });
      return;
    }
    if (linkOf.has(r.target)) {
      info.links.set(s.id, { problem: 'This annex is already linked above.' });
      return;
    }
    linkOf.set(r.target, s.id);
  });

  const linked = raw.filter((b) => linkOf.has(b.id)).sort((a, b) => before(shapes[linkOf.get(a.id)!], shapes[linkOf.get(b.id)!]));
  const unlinked = raw.filter((b) => !linkOf.has(b.id));
  [...linked, ...unlinked].forEach((b, k) => {
    const block: AnnexBlock = { ...b, number: k + 1, link: linkOf.get(b.id) };
    info.blocks.push(block);
    info.byHeading.set(b.heading, block);
    if (block.link) {
      info.links.set(block.link, { block });
      for (const m of block.members) info.anchorOf.set(m, block.link);
      info.anchorOf.set(block.heading, block.link);
    }
  });
  return info;
}

let cacheShapes: Record<string, Shape> | null = null;
let cacheInfo: AnnexInfo | null = null;

/** computeAnnex, memoised on the shapes record (the store replaces it on every change). */
export function annexInfo(shapes: Record<string, Shape>): AnnexInfo {
  if (shapes !== cacheShapes) {
    cacheShapes = shapes;
    cacheInfo = computeAnnex(shapes);
  }
  return cacheInfo!;
}

/** 1-based page number of a shape (page view). */
export function pageNumberOf(s: Shape, orientation: PageOrientation): number {
  const { h } = pageSize(orientation);
  return Math.max(0, Math.floor(s.y / (h + PAGE_GAP))) + 1;
}

export function blockTitle(shapes: Record<string, Shape>, block: AnnexBlock): string {
  const h = shapes[block.heading] as TextShape | undefined;
  return (h?.props.html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
