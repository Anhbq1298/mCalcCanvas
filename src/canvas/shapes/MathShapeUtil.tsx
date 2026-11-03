import { BaseBoxShapeUtil, resizeBox, T, type RecordProps, type TLResizeInfo } from 'tldraw';
import { MathShape as MathShapeComponent } from './MathShape';
import { DEFAULT_MATH_PROPS, MATH_SHAPE_TYPE, type MathShape } from './mathShapeTypes';

/**
 * tldraw integration for math regions. Only JSON props live in the store;
 * parsed expressions and numeric results live in the calculation engine.
 */
export class MathShapeUtil extends BaseBoxShapeUtil<MathShape> {
  static override type = MATH_SHAPE_TYPE;
  static override props: RecordProps<MathShape> = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    latex: T.string,
    displayMode: T.literalEnum('auto', 'formula', 'result', 'formulaResult', 'full'),
    displayUnit: T.string,
    precision: T.number,
    autoSize: T.boolean,
    fontSize: T.number,
    color: T.string,
  };

  getDefaultProps(): MathShape['props'] {
    return { ...DEFAULT_MATH_PROPS };
  }

  override getShapeName(): string {
    return 'Math region';
  }

  override canEdit(): boolean {
    return true;
  }

  override isAspectRatioLocked(): boolean {
    return false;
  }

  override hideRotateHandle(): boolean {
    return true;
  }

  override hideResizeHandles(shape: MathShape): boolean {
    return this.editor.getEditingShapeId() === shape.id;
  }

  override hideSelectionBoundsFg(shape: MathShape): boolean {
    return this.editor.getEditingShapeId() === shape.id;
  }

  /** Resizing changes the box only; the equation is never scaled. */
  override onResize(shape: MathShape, info: TLResizeInfo<MathShape>) {
    const next = resizeBox(shape, info);
    return { ...next, props: { ...next.props, autoSize: false } };
  }

  component(shape: MathShape) {
    return <MathShapeComponent shape={shape} />;
  }

  getIndicatorPath(shape: MathShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
