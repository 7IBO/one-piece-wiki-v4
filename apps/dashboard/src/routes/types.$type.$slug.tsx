/**
 * Layout route for `/types/$type/$slug`. Renders ONLY <Outlet />
 * so nested routes can mount:
 *   - `/types/$type/$slug/`            → types.$type.$slug.index.tsx (edit page)
 *   - `/types/$type/$slug/apparitions` → types.$type.$slug.apparitions.tsx
 *
 * Without this split, TanStack Router renders this file's component
 * for every sub-path, hiding the nested routes (the bug that
 * motivated the split — the same fix was previously applied to
 * `types.$type.tsx`).
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';

export const Route = createFileRoute('/types/$type/$slug')({
  component: EntitySlugLayout,
});

function EntitySlugLayout(): JSX.Element {
  return <Outlet />;
}
