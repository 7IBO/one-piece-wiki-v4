import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared page-resource fetcher (W-F, ADR-032). Replaces the
 * `useState(null)` + `useEffect` + `.catch(setError)` block that was
 * copy-pasted across the route components: `data` starts (and resets)
 * to `null` whenever `deps` change — the routes' existing
 * `data === null → skeleton` branches keep working — and a failure
 * lands in `error` as a message string.
 *
 * Stale responses are dropped on unmount/re-run, and every failure is
 * mirrored to the console so the stack stays readable after the inline
 * error unmounts on the next route change.
 */
export interface ApiResource<T> {
  readonly data: T | null;
  readonly error: string | null;
  /** Re-run the fetch with the same deps (e.g. after an in-place save). */
  readonly reload: () => void;
}

export function useApiResource<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Latest loader without making it a dependency — callers pass inline
  // closures; the `deps` array is the explicit cache key.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    loadRef.current()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        // Keep the full stack readable after the inline error unmounts.
        // eslint-disable-next-line no-console
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
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

  return { data, error, reload };
}
