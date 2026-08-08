import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared page-resource fetcher (W-F, ADR-032). Replaces the
 * `useState(null)` + `useEffect` + `.catch(setError)` block that was
 * copy-pasted across the route components: `data` starts (and resets)
 * to `null` whenever `deps` change — the routes' existing
 * `data === null → skeleton` branches keep working — and a failure
 * lands in `error` as a message string.
 *
 * `reload()` is stale-while-refetch: the previous `data` stays on
 * screen while the fetch re-runs (`reloading` flips true), so a retry
 * or an in-place refresh never blanks the page back to a skeleton.
 * Only a `deps` change resets `data` to `null`.
 *
 * Stale responses are dropped on unmount/re-run, and every failure is
 * mirrored to the console so the stack stays readable after the inline
 * error unmounts on the next route change.
 */
export interface ApiResource<T> {
  readonly data: T | null;
  readonly error: string | null;
  /** True while `reload()` is re-fetching with previous data kept. */
  readonly reloading: boolean;
  /** Re-run the fetch with the same deps (e.g. after an in-place save). */
  readonly reload: () => void;
}

export function useApiResource<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Latest loader without making it a dependency — callers pass inline
  // closures; the `deps` array is the explicit cache key.
  const loadRef = useRef(load);
  loadRef.current = load;

  // Previous deps snapshot so the effect can tell "deps changed"
  // (reset to null → skeleton) apart from "reload() bumped the nonce"
  // (keep previous data → stale-while-refetch).
  const prevDeps = useRef<readonly unknown[] | null>(null);

  useEffect(() => {
    const depsChanged = prevDeps.current === null
      || prevDeps.current.length !== deps.length
      || deps.some((d, i) => !Object.is(d, prevDeps.current?.[i]));
    prevDeps.current = deps;
    let cancelled = false;
    if (depsChanged) setData(null);
    setError(null);
    setReloading(!depsChanged);
    loadRef.current()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setReloading(false);
      })
      .catch((e: unknown) => {
        // Keep the full stack readable after the inline error unmounts.
        // eslint-disable-next-line no-console
        console.error(e);
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setReloading(false);
      });
    return () => {
      cancelled = true;
    };
    // The spread IS the dependency list: callers own the cache key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  return { data, error, reloading, reload };
}
