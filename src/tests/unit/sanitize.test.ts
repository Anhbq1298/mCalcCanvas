// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { sanitizeHtml } from '../../canvas/sanitize';

const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'span', 'sub', 'sup', 'font']);

/** Every element is allowed and the only attribute is a safe colour on <font>. */
function onlyAllowed(html: string): boolean {
  const root = document.createElement('div');
  root.innerHTML = html;
  for (const el of root.querySelectorAll('*')) {
    if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) return false;
    for (const a of el.attributes) {
      if (!(el.tagName === 'FONT' && a.name === 'color' && /^(#[0-9a-f]{3,8}|rgb\(.*\))$/i.test(a.value))) return false;
    }
  }
  return true;
}

describe('HTML sanitiser', () => {
  it.each([
    ['<img src=x onerror=alert(1)>', ''],
    ['<script>alert(1)</script>', ''],
    ['<div onclick="alert(1)">Text</div>', '<div>Text</div>'],
    ['<a href="javascript:alert(1)">link</a>', 'link'],
    ['<iframe src="https://evil.example"></iframe>ok', 'ok'],
    ['<style>*{display:none}</style>y', 'y'],
    ['<b style="background:url(javascript:alert(1))">B</b>', '<b>B</b>'],
    ['<font color="#ff0000" onmouseover="x()">red</font>', '<font color="#ff0000">red</font>'],
    ['<font color="red;background:url(x)">c</font>', '<font>c</font>'],
    ['<template><img src=x onerror=alert(1)></template>t', 't'],
    ['<!-- <img src=x onerror=alert(1)> -->c', 'c'],
  ])('neutralises %s', (input, expected) => {
    const out = sanitizeHtml(input);
    expect(out).toBe(expected);
    expect(onlyAllowed(out)).toBe(true);
  });

  it('HTML sanitiser', () => {
    step('keeps safe links (http, https, mailto), highlight colours and indents; drops unsafe link targets', () => {
      expect(sanitizeHtml('<a href="https://example.com/a?b=1" onclick="x()">site</a>')).toBe('<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">site</a>');
      expect(sanitizeHtml('<a href="mailto:a@b.c">mail</a>')).toContain('href="mailto:a@b.c"');
      expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('x');
      expect(sanitizeHtml('<a href="data:text/html,hi">x</a>')).toBe('x');
      expect(sanitizeHtml('<span style="background-color: rgb(255, 245, 157); position: fixed">hi</span>')).toBe('<span style="background-color: rgb(255, 245, 157)">hi</span>');
      expect(sanitizeHtml('<span style="background-color: url(x)">hi</span>')).toBe('<span>hi</span>');
      expect(sanitizeHtml('<blockquote style="margin: 0 0 0 40px">in</blockquote>')).toBe('<blockquote>in</blockquote>');
    });
    step('drops embedded SVG/MathML content entirely', () => {
      const out = sanitizeHtml('<svg><script>alert(1)</script><a href="javascript:x">s</a></svg><math><mi>x</mi></math>');
      expect(out).not.toMatch(/script|alert|href|svg|math/i);
      expect(onlyAllowed(out)).toBe(true);
    });
    step('cleans arbitrarily deep nesting of unsupported elements', () => {
      let html = '<b onclick="alert(1)">X</b><img src=x onerror=alert(1)>';
      for (let i = 0; i < 40; i++) html = `<article data-x="${i}"><section onclick="y()">${html}</section></article>`;
      const out = sanitizeHtml(html);
      expect(out).toBe('<b>X</b>');
      expect(onlyAllowed(out)).toBe(true);
    });
    step('survives pathological depth without keeping disallowed markup', () => {
      const html = '<span>'.repeat(3000) + '<i onclick="x()">deep</i>' + '</span>'.repeat(3000);
      const out = sanitizeHtml(html);
      expect(out).toContain('deep');
      expect(onlyAllowed(out)).toBe(true);
    });
    step('keeps supported formatting and engineering text', () => {
      const html =
        '<h1>Title</h1><h2>Sub</h2><p><b>M</b><sub>Ed</sub> = 225 kN·m &lt; M<sub>Rd</sub></p>' +
        '<ul><li><i>a</i></li><li><u>b</u></li></ul><ol><li>1</li></ol><div>σ ≤ f<sub>yd</sub>, x<sup>2</sup><br>line</div>' +
        '<font color="#188038">green</font><font color="rgb(1, 2, 3)">rgb</font><strong>s</strong><em>e</em><span>sp</span>';
      expect(sanitizeHtml(html)).toBe(html);
    });
  });
});
