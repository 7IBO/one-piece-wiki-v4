/**
 * Hand-written route tree for Phase 4.1. The TanStack Router CLI can
 * regenerate this from file-based routes once the dashboard grows
 * beyond three pages; for now an explicit tree is shorter than the
 * generator's machinery.
 */
import { createRootRoute, createRoute } from '@tanstack/react-router';
import { Route as RootRoute } from './routes/__root.tsx';
import { Route as IndexRoute } from './routes/index.tsx';
import { Route as EntityEditRoute } from './routes/types.$type.$slug.tsx';
import { Route as TypeListRoute } from './routes/types.$type.tsx';

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { parentRoute: typeof RootRoute; };
    '/types/$type': { parentRoute: typeof RootRoute; };
    '/types/$type/$slug': { parentRoute: typeof RootRoute; };
  }
}

const indexRoute = IndexRoute.update({
  path: '/',
  getParentRoute: () => RootRoute,
} as never);

const typeListRoute = TypeListRoute.update({
  path: '/types/$type',
  getParentRoute: () => RootRoute,
} as never);

const entityEditRoute = EntityEditRoute.update({
  path: '/types/$type/$slug',
  getParentRoute: () => RootRoute,
} as never);

export const routeTree = RootRoute.addChildren([
  indexRoute,
  typeListRoute,
  entityEditRoute,
]);

// Silence unused warnings: re-export for downstream consumers.
export { createRootRoute, createRoute };
