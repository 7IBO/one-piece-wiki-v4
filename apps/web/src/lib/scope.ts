/**
 * Canon-scope search param (`?scope=`) — one validation shared by the
 * canonical routes AND the legacy redirect routes so the param
 * survives 301s and client navigations identically everywhere.
 */
export type ScopeSearch = { readonly scope?: string; };

export const SCOPE_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Route `validateSearch`: keep a well-formed `scope`, drop the rest. */
export function validateScopeSearch(search: Record<string, unknown>): ScopeSearch {
  const scope = search['scope'];
  return typeof scope === 'string' && SCOPE_PATTERN.test(scope) ? { scope } : {};
}
