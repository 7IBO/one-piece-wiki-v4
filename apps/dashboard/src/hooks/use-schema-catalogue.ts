import { useEffect, useState } from 'react';
import { api, type SchemaCatalogue } from '../api';

/**
 * One catalogue fetch for the whole chrome (W-F2). AppSidebar,
 * BottomNav and the command palette used to each hold their own
 * `useState` + `useEffect` fetch of `/api/schemas`; this module-level
 * cache makes the first caller fetch and every later mount reuse the
 * same promise/result. The catalogue only changes on deploy, so there
 * is no invalidation path — a hard reload is the refresh story.
 */
let cached: SchemaCatalogue | null = null;
let inflight: Promise<SchemaCatalogue> | null = null;

export function useSchemaCatalogue(): SchemaCatalogue | null {
  const [catalogue, setCatalogue] = useState<SchemaCatalogue | null>(cached);

  useEffect(() => {
    if (cached !== null) return;
    let cancelled = false;
    inflight ??= api.schemas().then((c) => {
      cached = c;
      return c;
    });
    inflight
      .then((c) => {
        if (!cancelled) setCatalogue(c);
      })
      .catch(() => {
        // Chrome stays usable without the catalogue; the palette and
        // sheets show their own loading/empty states.
        inflight = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return catalogue;
}
