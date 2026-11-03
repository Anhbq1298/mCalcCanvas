import { memo } from 'react';
import type { Shape } from '../model/types';
import { DrawView, ImageView, LineView, RectView } from './GeoViews';
import { MathView } from './MathView';
import { TextView } from './TextView';

/**
 * Positions one shape in page coordinates. `isStatic` is used for print
 * output (no measuring, no editing UI).
 */
export const ShapeView = memo(function ShapeView({ shape, editing, isStatic = false }: { shape: Shape; editing: boolean; isStatic?: boolean }) {
  // Box-like shapes take pointer events on their whole area; strokes only on the stroke.
  const boxLike = shape.type === 'math' || shape.type === 'text' || shape.type === 'image';
  let body: React.ReactNode;
  switch (shape.type) {
    case 'math':
      body = <MathView shape={shape} editing={editing} isStatic={isStatic} />;
      break;
    case 'text':
      body = <TextView shape={shape} editing={editing} isStatic={isStatic} />;
      break;
    case 'image':
      body = <ImageView shape={shape} />;
      break;
    case 'rect':
      body = <RectView shape={shape} />;
      break;
    case 'line':
      body = <LineView shape={shape} />;
      break;
    case 'draw':
      body = <DrawView shape={shape} />;
      break;
  }
  return (
    <div
      className="cc-shape"
      data-shape-id={shape.id}
      data-shape-type={shape.type}
      data-editing={editing || undefined}
      style={{
        position: 'absolute',
        left: shape.x,
        top: shape.y,
        pointerEvents: boxLike ? 'auto' : 'none',
        cursor: editing ? 'auto' : undefined,
      }}
    >
      {body}
    </div>
  );
});
