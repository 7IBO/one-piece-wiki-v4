/**
 * `/e/<type>/<slug>` — legacy entity URL. Permanently redirects (301,
 * server-side in the loader) to the canonical `/<type>/<slug>` page,
 * preserving the `?scope=` canon-scope param. Kept as a route so old
 * links and bookmarks never break.
 */
import { createFileRoute, redirect } from '@tanstack/react-router';
import { validateScopeSearch } from '../lib/scope';

export const Route = createFileRoute('/e/$type/$slug')({
  validateSearch: validateScopeSearch,
  loaderDeps: ({ search }) => ({ scope: search.scope ?? null }),
  loader: ({ params, deps }) => {
    throw redirect({
      to: '/$type/$slug',
      params: { type: params.type, slug: params.slug },
      search: deps.scope === null ? {} : { scope: deps.scope },
      statusCode: 301,
    });
  },
});
