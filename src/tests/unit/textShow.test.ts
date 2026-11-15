import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../documents/DocumentSerializer';
import { DOCUMENT_VERSION } from '../../documents/DocumentTypes';
import { conditionHolds, textShowRegionId } from '../../canvas/textShow';
import type { TextShape } from '../../canvas/model/types';

describe('conditional text (props.showWhen)', () => {
  it('keeps a condition through save/load and decides visibility from the engine result', () => {
    const doc = parseDocument({
      format: 'calccanvas', version: DOCUMENT_VERSION, id: 'd', title: 't',
      shapes: [
        { id: 'a', type: 'text', x: 0, y: 0, props: { html: 'x', showWhen: 'c_{comp}<1' } },
        { id: 'b', type: 'text', x: 0, y: 40, props: { html: 'y', showWhen: '   ' } },
        { id: 'c', type: 'text', x: 0, y: 80, props: { html: 'z', showWhen: 3 } },
      ],
    });
    const [a, b, c] = doc.shapes as TextShape[];
    expect(a.props.showWhen).toBe('c_{comp}<1');
    expect(b.props.showWhen).toBeUndefined();
    expect(c.props.showWhen).toBeUndefined();
    expect(textShowRegionId('a')).toBe('a#show');
    expect(conditionHolds(undefined)).toBe(true);                                   // not calculated yet: shown
    expect(conditionHolds({ status: 'error' })).toBe(true);                          // a broken condition never hides text
    expect(conditionHolds({ status: 'valid', check: { pass: false } })).toBe(false);
    expect(conditionHolds({ status: 'valid', check: { pass: true } })).toBe(true);
    expect(conditionHolds({ status: 'valid', value: { number: 0 } })).toBe(false);
  });
});
