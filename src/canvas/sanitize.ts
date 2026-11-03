/**
 * Whitelist sanitiser for rich text typed or pasted into text regions.
 * Only structural formatting survives; attributes are dropped entirely.
 */
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'SPAN', 'SUB', 'SUP']);

export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, '');
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  const clean = (node: Element) => {
    for (const child of [...node.children]) {
      if (!ALLOWED.has(child.tagName)) {
        if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') child.remove();
        else child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      clean(child);
    }
  };
  // Run until stable (unwrapping can expose new children).
  for (let i = 0; i < 4; i++) clean(root);
  return root.innerHTML;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function plainTextToHtml(text: string): string {
  return text.split(/\r?\n/).map((line) => escapeHtml(line) || '<br>').map((l) => `<div>${l}</div>`).join('');
}
