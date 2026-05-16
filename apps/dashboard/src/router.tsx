/**
 * TanStack Start entrypoint hook (ADR-018). Called by the Start
 * runtime on every server request and once on the client after
 * hydration. Each call returns a fresh `Router` so per-request
 * state (loaders, search params, navigation history) doesn't leak
 * between requests.
 *
 * Identical config to the pre-migration `main.tsx` `createRouter`
 * call; only the mounting changed (Start owns the React tree root
 * now via `RouterClient` / `RouterServer`).
 */
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
