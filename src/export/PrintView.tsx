import { ShapeView } from '../canvas/shapes/ShapeView';
import type { Shape } from '../canvas/model/types';
import { useAppStore } from '../store/appStore';
import { PageChrome } from './PageChrome';
import { pageBox } from './pageGeometry';

/** The printable A4 pages: each page renders its shapes in static mode plus the header/footer. */
export function PrintView({ pages }: { pages: { index: number; shapes: Shape[] }[] }) {
  const { settings } = useAppStore.getState();
  const landscape = settings.pageOrientation === 'landscape';
  const total = pages.length;
  return (
    <>
      {pages.map(({ index, shapes }) => {
        const box = pageBox(index, settings.pageOrientation);
        return (
          <section key={index} className={`print-page${landscape ? ' landscape' : ''}`} data-page={index + 1}>
            <div className="print-content" style={{ position: 'absolute', left: -box.x, top: -box.y, width: 0, height: 0 }}>
              {shapes.map((s) => (
                <ShapeView key={s.id} shape={s} editing={false} isStatic />
              ))}
            </div>
            <PageChrome index={index} total={total} />
          </section>
        );
      })}
    </>
  );
}

