import { StateNode } from 'tldraw';
import { createMathRegion } from '../regionActions';

/** Math tool: click anywhere to drop a new math region and start typing. */
export class MathTool extends StateNode {
  static override id = 'math';

  override onEnter(): void {
    this.editor.setCursor({ type: 'cross', rotation: 0 });
  }

  override onPointerDown(): void {
    const { x, y } = this.editor.inputs.getCurrentPagePoint();
    createMathRegion(this.editor, { x, y: y - 14 });
  }

  override onCancel(): void {
    this.editor.setCurrentTool('select');
  }
}
