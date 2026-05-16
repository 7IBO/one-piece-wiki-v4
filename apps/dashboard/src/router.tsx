/**
 * TanStack Start router factory.
 *
 * The Vite plugin auto-generates `routeTree.gen.ts` from the files
 * under `src/routes/` and wires this `getRouter` into both the SSR
 * server and the client bundle. The function name MUST be `getRouter`
 * — the route-tree generator embeds a `typeof getRouter` reference
 * at the bottom of the generated tree file (see ADR-018 if added).
 */
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
  });
}
