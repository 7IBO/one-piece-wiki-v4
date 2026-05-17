/**
 * Layout route for `/types/$type/...`. Renders nothing of its own —
 * just an `<Outlet />` so child routes (`/types/$type/` index list,
 * `/types/$type/$slug` editor, `/types/$type/table` bulk view) take
 * over the main panel.
 *
 * Previously this file held the list view directly via
 * `component: TypeListComponent`. That broke nested routing:
 * TanStack Router auto-generated `types.$type.$slug` as a child of
 * this route, and without an Outlet here the child rendered into
 * nothing — the dashboard at `/types/character/nami` was stuck on
 * the parent's loading skeleton ("character / Loading…") instead of
 * the entity editor. Splitting into a layout (this file) + an
 * index route (`types.$type.index.tsx`) gives sibling-route
 * behaviour while preserving the URL structure.
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';

export const Route = createFileRoute('/types/$type')({
  component: TypeLayout,
});

function TypeLayout(): JSX.Element {
  return <Outlet />;
}
