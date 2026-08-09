/**
 * Legacy URL redirects (`/e/<type>/<slug>` and `/t/<type>` → the
 * canonical `/<type>[/<slug>]`) — asserted at the route-loader level:
 * the loaders must throw a permanent (301) TanStack redirect to the
 * canonical path, preserving the `?scope=` search param.
 */
import { isRedirect } from '@tanstack/react-router';
import { describe, expect, test } from 'bun:test';
import { Route as LegacyEntityRoute } from '../routes/e.$type.$slug.tsx';
import { Route as LegacyTypeRoute } from '../routes/t.$type.tsx';

type RedirectErr = {
  readonly status: number;
  readonly options: {
    readonly to: string;
    readonly params: Record<string, string>;
    readonly search: Record<string, string>;
    readonly statusCode: number;
  };
};

function trapRedirect(run: () => unknown): RedirectErr {
  try {
    run();
  } catch (err) {
    if (isRedirect(err)) return err as unknown as RedirectErr;
    throw err;
  }
  throw new Error('expected the loader to throw a redirect');
}

/** Invoke a route-file loader outside the router with just the ctx it reads. */
function invokeLoader(route: { options: { loader?: unknown; }; }, ctx: unknown): unknown {
  const loader = route.options.loader;
  if (typeof loader !== 'function') throw new Error('route has no loader');
  return loader(ctx);
}

describe('legacy URL redirects', () => {
  test('/e/$type/$slug 301-redirects to the canonical /$type/$slug', () => {
    const err = trapRedirect(() =>
      invokeLoader(LegacyEntityRoute, {
        params: { type: 'character', slug: 'monkey-d-luffy' },
        deps: { scope: null },
      })
    );
    expect(err.options.to).toBe('/$type/$slug');
    expect(err.options.params).toEqual({ type: 'character', slug: 'monkey-d-luffy' });
    expect(err.options.statusCode).toBe(301);
    expect(err.status).toBe(301);
    expect(err.options.search).toEqual({});
  });

  test('/t/$type 301-redirects to the canonical /$type', () => {
    const err = trapRedirect(() =>
      invokeLoader(LegacyTypeRoute, { params: { type: 'character' }, deps: { scope: null } })
    );
    expect(err.options.to).toBe('/$type');
    expect(err.options.params).toEqual({ type: 'character' });
    expect(err.options.statusCode).toBe(301);
  });

  test('?scope= survives both redirects', () => {
    const entity = trapRedirect(() =>
      invokeLoader(LegacyEntityRoute, {
        params: { type: 'character', slug: 'monkey-d-luffy' },
        deps: { scope: 'live_action' },
      })
    );
    expect(entity.options.search).toEqual({ scope: 'live_action' });
    const listing = trapRedirect(() =>
      invokeLoader(LegacyTypeRoute, {
        params: { type: 'character' },
        deps: { scope: 'live_action' },
      })
    );
    expect(listing.options.search).toEqual({ scope: 'live_action' });
  });
});
