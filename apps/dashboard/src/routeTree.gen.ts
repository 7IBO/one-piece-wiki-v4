/**
 * Hand-written route tree for Phase 4.1. The TanStack Router CLI can
 * regenerate this from file-based routes once the dashboard grows
 * beyond three pages; for now an explicit tree is shorter than the
 * generator's machinery.
 */
import { createRootRoute, createRoute } from '@tanstack/react-router';
import { Route as RootRoute } from './routes/__root';
import { Route as IndexRoute } from './routes/index';
import { Route as LoginRoute } from './routes/login';
import { Route as TypeListRoute } from './routes/types.$type';
import { Route as EntityEditRoute } from './routes/types.$type.$slug';
import { Route as TableRoute } from './routes/types.$type.table';

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { parentRoute: typeof RootRoute; };
    '/login': { parentRoute: typeof RootRoute; };
    '/types/$type': { parentRoute: typeof RootRoute; };
    '/types/$type/$slug': { parentRoute: typeof RootRoute; };
    '/types/$type/table': { parentRoute: typeof RootRoute; };
  }
}

const indexRoute = IndexRoute.update({
  path: '/',
  getParentRoute: () => RootRoute,
} as never);

const loginRoute = LoginRoute.update({
  path: '/login',
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

// Registered BEFORE the $slug route so `/types/$type/table` resolves
// to the bulk view instead of an entity with slug "table".
const tableRoute = TableRoute.update({
  path: '/types/$type/table',
  getParentRoute: () => RootRoute,
} as never);

export const routeTree = RootRoute.addChildren([
  indexRoute,
  loginRoute,
  typeListRoute,
  tableRoute,
  entityEditRoute,
]);

// Silence unused warnings: re-export for downstream consumers.
export { createRootRoute, createRoute };
