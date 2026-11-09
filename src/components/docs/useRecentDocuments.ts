import { useEffect, useState } from 'react';
import { DocumentManager } from '../../documents/DocumentManager';
import type { DocumentSummary } from '../../documents/DocumentTypes';

/** Worksheets in this browser, most recent first; reloaded each time `active` turns true. */
export function useRecentDocuments(active: boolean, limit = 5): DocumentSummary[] {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    DocumentManager.list()
      .then((all) => live && setDocs(all.slice(0, limit)))
      .catch(() => live && setDocs([]));
    return () => {
      live = false;
    };
  }, [active, limit]);
  return docs;
}
