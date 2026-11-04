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
