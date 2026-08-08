/**
 * TanStack Start entrypoint hook — one fresh Router per server
 * request / per client boot, same recipe as the dashboard (ADR-018).
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
