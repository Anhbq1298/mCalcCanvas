/**
 * Allow-list sanitiser for rich text typed, pasted or imported into text regions.
 *
 * The input is parsed into an inert document (DOMParser never runs scripts)
 * and a *new* tree is built from it: only allowed elements are recreated,
 * with no attributes except a validated colour on <font> (what
 * execCommand('foreColor') produces). Text is copied as text nodes.
 * Unsupported elements are unwrapped (their text is kept); elements whose
 * content is code or embedded documents are dropped with their content.
 * Because nothing is copied from the input except text and allowed tag
 * names, the output can only contain allowed elements and attributes, at
 * any nesting depth.
 */
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'SPAN', 'SUB', 'SUP', 'FONT']);
/** Dropped together with everything inside them. */
const DROP = new Set([
  'SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'NOEMBED', 'NOFRAMES', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED',
  'APPLET', 'SVG', 'MATH', 'TITLE', 'TEXTAREA', 'SELECT', 'OPTION', 'XMP', 'PLAINTEXT', 'HEAD', 'META', 'LINK', 'BASE',
]);
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/;
/** Allowed elements nested deeper than this are unwrapped (no legitimate rich text nests this deep). */
const MAX_DEPTH = 64;
/** Upper bound on the input size handled (characters). */
const MAX_INPUT = 200_000;

export function sanitizeHtml(html: string): string {
  const input = html.length > MAX_INPUT ? html.slice(0, MAX_INPUT) : html;
  if (typeof DOMParser === 'undefined') return escapeHtml(input.replace(/<[^>]*>/g, ''));
  const src = new DOMParser().parseFromString(`<!doctype html><body>${input}`, 'text/html');
  const out = src.implementation.createHTMLDocument('');
  const root = out.createElement('div');

  // Iterative walk: [source node, destination parent, output depth].
  const stack: [Node, Node, number][] = [];
  const pushChildren = (from: Node, to: Node, depth: number) => {
    const kids = [...from.childNodes];
    for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], to, depth]);
  };
  pushChildren(src.body, root, 0);
  while (stack.length) {
    const [node, parent, depth] = stack.pop()!;
    if (node.nodeType === 3 /* text */) {
      parent.appendChild(out.createTextNode(node.textContent ?? ''));
      continue;
    }
    if (node.nodeType !== 1 /* element */) continue; // comments, processing instructions…
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (DROP.has(tag)) continue;
    if (!ALLOWED.has(tag) || depth >= MAX_DEPTH) {
      // Unwrap: keep the content, drop the element.
      if (tag === 'BR') parent.appendChild(out.createElement('br'));
      else pushChildren(el, parent, depth);
      continue;
    }
    const copy = out.createElement(tag.toLowerCase());
    if (tag === 'FONT') {
      const c = el.getAttribute('color')?.trim();
      if (c && SAFE_COLOR.test(c)) copy.setAttribute('color', c);
    }
    parent.appendChild(copy);
    pushChildren(el, copy, depth + 1);
  }
  return root.innerHTML;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function plainTextToHtml(text: string): string {
  return text.split(/\r?\n/).map((line) => escapeHtml(line) || '<br>').map((l) => `<div>${l}</div>`).join('');
}
