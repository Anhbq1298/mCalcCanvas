// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { handlePasteData } from '../../canvas/canvasActions';
import { useCanvasStore } from '../../canvas/model/canvasStore';

function clipboard(text: string): DataTransfer {
  return { files: [] as unknown as FileList, getData: (t: string) => (t === 'text/plain' ? text : '') } as unknown as DataTransfer;
}

describe('pasting CalcCanvas shapes from the clipboard', () => {
  it('validates clipboard shapes like an imported file (no script injection)', () => {
    const evil = [
      { id: 'x', type: 'text', x: 100, y: 100, props: { html: '<img src=x onerror=alert(1)><b onclick="alert(1)">hi</b>', w: 200 } },
      { id: 'y', type: 'image', x: 0, y: 0, props: { src: 'javascript:alert(1)', w: 10, h: 10 } },
      { id: 'z', type: 'iframe', x: 0, y: 0, props: {} },
    ];
    expect(handlePasteData(clipboard('calccanvas-shapes:' + JSON.stringify(evil)))).toBe(true);
    const shapes = Object.values(useCanvasStore.getState().shapes);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].type).toBe('text');
    expect(shapes[0].type === 'text' && shapes[0].props.html).toBe('<b>hi</b>');
  });
});

describe('math copied from a math region (MathLive "$$ … $$")', () => {
  it('is recognised, pastes as a math region and reads as text', async () => {
    const { copiedMath, mathToTextHtml } = await import('../../math/mathClipboard');
    expect(copiedMath('$$ \\alpha_{cr} $$')).toBe('\\alpha_{cr}');
    expect(copiedMath('\\[x^2\\]')).toBe('x^2');
    expect(copiedMath('costs $5 and $$ more')).toBeNull();
    expect(copiedMath('plain text')).toBeNull();
    expect(mathToTextHtml('\\gamma_{M0}')).toBe('γ<sub>M0</sub>');
    expect(mathToTextHtml('f_{c.k}\\cdot\\alpha+\\pi')).toBe('f<sub>c.k</sub>·α+π');
    expect(mathToTextHtml('\\frac{M_{Ed}}{W}\\le1')).toBe('M<sub>Ed</sub>/W≤1');
    expect(mathToTextHtml('30\\,\\mathrm{kN}')).toBe('30 kN');
    expect(mathToTextHtml('a<b')).toBe('a&lt;b');
    useCanvasStore.setState({ shapes: {}, selection: [] });
    expect(handlePasteData(clipboard('$$ f_{c.k} $$'))).toBe(true);
    const s = Object.values(useCanvasStore.getState().shapes);
    expect(s.map((x) => [x.type, (x.props as { latex?: string }).latex])).toEqual([['math', 'f_{c.k}']]);
  });
});
