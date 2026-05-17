/**
 * Tiny client for the dashboard's local API. The API runs as a sibling
 * Bun process (api/server.ts); Vite proxies /api/* to it in dev. The
 * shape is intentionally hand-rolled — Phase 4.2 swaps the saveEntity
 * implementation from "write JSON file directly" to "open PR via
 * Octokit" without affecting this surface.
 */
import type {
  EntityTypeSchema,
  PropertyTypeSchema,
  RelationTypeSchema,
  VocabularySchema,
} from '@onepiece-wiki/schemas';

export type DisplayName = {
  readonly en: string | null;
  readonly fr: string | null;
};

export type EntityRef = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  readonly canonical_name_key: string | null;
  readonly displayName: DisplayName;
};

export type Translations = {
  readonly en: Record<string, string>;
  readonly fr: Record<string, string>;
};

export type EntityDetail = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  readonly data: Record<string, unknown>;
  readonly sha: string | null;
  readonly translations: Translations;
  /**
   * Present when the current session already has an open PR on this
   * entity. The `data` + `translations` above are read off the PR's
   * head branch (not main), so the contributor resumes from their
   * in-flight state. The next save appends a commit to this PR
   * instead of opening a new one — see ADR-016 / save-flow.ts.
   */
  readonly resumePR?: {
    readonly number: number;
    readonly htmlUrl: string;
    readonly headBranch: string;
  };
};

export type TableEntity = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  readonly data: Record<string, unknown>;
  readonly translations: Translations;
};

export type TableResponse = {
  readonly entities: readonly TableEntity[];
};

export type SaveResult = {
  readonly ok: true;
  readonly pr: {
    readonly number: number;
    readonly htmlUrl: string;
    readonly headBranch: string;
    /** True when the save appended a commit to an already-open PR
     *  (resume-editing path); false when a fresh PR was opened. */
    readonly reused: boolean;
    /** True when the resolved content matched what's already on the
     *  branch (or main) — no commit was created and `number`/`htmlUrl`
     *  may be 0/empty. UI should show "nothing to save" instead of
     *  "PR opened" / "commit added". */
    readonly noOp: boolean;
  };
};

export type SchemaCatalogue = {
  readonly entityTypes: Record<string, EntityTypeSchema>;
  readonly propertyTypes: Record<string, PropertyTypeSchema>;
  readonly relationTypes: Record<string, RelationTypeSchema>;
  readonly vocabularies: Record<string, VocabularySchema>;
};

export type SourceRef = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  readonly number: number | null;
  readonly displayName: DisplayName;
};

export type CastEntry = {
  readonly entityId: string;
  readonly entityType: string;
  readonly slug: string;
  readonly displayName: DisplayName;
  readonly qualifiers: Record<string, unknown>;
};

export type CastGroup = {
  readonly entityType: string;
  readonly entries: readonly CastEntry[];
};

export type CastResponse = {
  readonly source: { readonly id: string; readonly type: string; readonly slug: string; };
  readonly cast: readonly CastGroup[];
};

export type PresignResult = {
  readonly uploadUrl: string;
  /**
   * `staging://<key>` placeholder the form stores on the entity
   * JSON. The promote-images workflow rewrites it to the canonical
   * public URL after the PR merges. See ADR-015 / Phase 7.1.
   */
  readonly stagingUrl: string;
  readonly key: string;
  readonly expiresIn: number;
  readonly maxBytes: number;
};

/**
 * Frontend resolver for the `staging://` URL scheme.
 *  - `staging://pending/foo.png` → `/api/preview/pending/foo.png`
 *    (signed-redirect endpoint; the browser will follow the 302 to
 *    a short-lived signed R2 GET URL).
 *  - Any other URL is returned unchanged — the read pipelines see
 *    canonical public URLs after merge.
 */
export function resolveImageUrl(url: string): string {
  if (url.startsWith('staging://')) {
    return `/api/preview/${encodeURI(url.slice('staging://'.length))}`;
  }
  return url;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${path}`);
  return (await response.json()) as T;
}

/**
 * Structured error thrown on a non-2xx response from a POST. Code
 * paths that need to inspect the server's error payload (e.g.
 * validation issues for per-field highlighting) match on this class;
 * everything else still gets a readable `.message`.
 */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    readonly status: number,
    message: string,
    readonly payload: Record<string, unknown> | null,
  ) {
    super(message);
  }
}

export type ValidationIssue = { readonly path: readonly string[]; readonly message: string; };

/** Type-guard for the structured `validation_failed` payload. */
export function validationIssues(err: unknown): readonly ValidationIssue[] | null {
  if (!(err instanceof ApiError) || err.payload === null) return null;
  if (err.payload['code'] !== 'validation_failed') return null;
  const raw = err.payload['issues'];
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (i): i is ValidationIssue =>
      i !== null
      && typeof i === 'object'
      && Array.isArray((i as { path?: unknown; }).path)
      && typeof (i as { message?: unknown; }).message === 'string',
  );
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    let payload: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed !== null && typeof parsed === 'object') {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      // text wasn't JSON — fall through with payload null.
    }
    const message = payload !== null && typeof payload['error'] === 'string'
      ? (payload['error'] as string)
      : `${response.status} ${response.statusText}: ${text}`;
    throw new ApiError(response.status, message, payload);
  }
  return (await response.json()) as T;
}

/**
 * Module-level promise cache. Survives navigation between routes (the
 * Vite/TanStack-Router shell never reloads, so this keeps responses
 * warm for the whole session). Cleared on hard reload.
 *
 * The catalogues (schemas, sources, i18n keys, per-type entity lists)
 * are derived from on-disk JSON and only change when a save lands. We
 * cache them indefinitely and invalidate on `saveEntity`.
 *
 * `getEntity` results are also cached but cleared whenever any save
 * succeeds — the saved entity may have moved (slug change), changed
 * SHA, or shifted the source list, so it's safer to refetch on next
 * visit than to surgically patch the cache.
 */
let schemasPromise: Promise<SchemaCatalogue> | null = null;
let sourcesPromise: Promise<SourceRef[]> | null = null;
let i18nKeysPromise: Promise<string[]> | null = null;
const entitiesByTypeCache = new Map<string, Promise<EntityRef[]>>();
const entityDetailCache = new Map<string, Promise<EntityDetail>>();

function entityKey(type: string, slug: string): string {
  return `${type}:${slug}`;
}

function invalidateAfterSave(): void {
  // Conservative: drop everything that could've been touched by a PR.
  // Schemas don't change at runtime so we keep them warm.
  sourcesPromise = null;
  i18nKeysPromise = null;
  entitiesByTypeCache.clear();
  entityDetailCache.clear();
}

export const api = {
  async schemas(): Promise<SchemaCatalogue> {
    if (schemasPromise === null) {
      schemasPromise = getJson<SchemaCatalogue>('/api/schemas').catch((err) => {
        schemasPromise = null;
        throw err;
      });
    }
    return schemasPromise;
  },
  async sources(): Promise<SourceRef[]> {
    if (sourcesPromise === null) {
      sourcesPromise = getJson<SourceRef[]>('/api/sources').catch((err) => {
        sourcesPromise = null;
        throw err;
      });
    }
    return sourcesPromise;
  },
  async i18nKeys(): Promise<string[]> {
    if (i18nKeysPromise === null) {
      i18nKeysPromise = getJson<string[]>('/api/i18n-keys').catch((err) => {
        i18nKeysPromise = null;
        throw err;
      });
    }
    return i18nKeysPromise;
  },
  async listEntities(type: string): Promise<EntityRef[]> {
    const cached = entitiesByTypeCache.get(type);
    if (cached !== undefined) return cached;
    const promise = getJson<EntityRef[]>(`/api/entities/${encodeURIComponent(type)}`).catch(
      (err) => {
        entitiesByTypeCache.delete(type);
        throw err;
      },
    );
    entitiesByTypeCache.set(type, promise);
    return promise;
  },
  /**
   * Bulk-fetch every entity of a type with its full data + translations.
   * Powers the table / bulk-edit view. Not cached: the table page is
   * the only place that calls it and freshness matters for save flows.
   */
  async tableEntities(type: string): Promise<TableResponse> {
    return getJson<TableResponse>(`/api/entities/${encodeURIComponent(type)}/table`);
  },
  async getEntity(type: string, slug: string): Promise<EntityDetail> {
    const key = entityKey(type, slug);
    const cached = entityDetailCache.get(key);
    if (cached !== undefined) return cached;
    const promise = getJson<EntityDetail>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
    ).catch((err) => {
      entityDetailCache.delete(key);
      throw err;
    });
    entityDetailCache.set(key, promise);
    return promise;
  },
  /**
   * Reverse-scan apparitions for a source entity (ADR-021). Returns
   * the cast grouped by entity-type, each entry with its display
   * name + `appears-in` qualifiers (typically `{appearance_type}`).
   */
  async getCast(type: string, slug: string): Promise<CastResponse> {
    return getJson<CastResponse>(
      `/api/sources/${encodeURIComponent(type)}/${encodeURIComponent(slug)}/cast`,
    );
  },
  /**
   * Bulk-apply a cast change to a source. Opens one PR titled
   * `[DATA] Update cast of <sourceId>` touching N entity files.
   * Server-side coalesces add+remove (last write wins on qualifiers).
   */
  async saveCast(
    type: string,
    slug: string,
    change: {
      add: { entityId: string; qualifiers?: Record<string, unknown>; }[];
      remove: string[];
    },
  ): Promise<SaveResult> {
    const result = await postJson<SaveResult>(
      `/api/sources/${encodeURIComponent(type)}/${encodeURIComponent(slug)}/cast`,
      change,
    );
    invalidateAfterSave();
    return result;
  },
  /**
   * Open a PR creating a brand-new entity of the given type
   * (ADR-020). The server validates slug format + global
   * uniqueness server-side; the frontend pre-checks against the
   * cached `listEntities(type)` for instant feedback but the
   * server's check is the only source of truth.
   *
   * Throws `ApiError` with status 409 if the slug is already taken
   * (race with another contributor's just-merged PR).
   */
  async createEntity(
    type: string,
    slug: string,
    data: Record<string, unknown>,
    translations: Translations,
  ): Promise<SaveResult> {
    const result = await postJson<SaveResult>(
      `/api/entities/${encodeURIComponent(type)}`,
      { slug, data, translations },
    );
    invalidateAfterSave();
    return result;
  },
  async saveEntity(
    type: string,
    slug: string,
    data: Record<string, unknown>,
    sha: string | null,
    translations: Translations,
  ): Promise<SaveResult> {
    // Identity (GitHub login OR anonymous nickname) is read server-side
    // from the better-auth session cookie — no longer passed in the
    // body. See `apps/dashboard/api/auth.ts` + ADR-016.
    const result = await postJson<SaveResult>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
      { data, sha, translations },
    );
    invalidateAfterSave();
    return result;
  },
  /**
   * Open PRs opened by the current session (identity inferred from
   * the cookie). Powers the home page's "Vos contributions en cours"
   * section — see ADR-016. Returns an empty list (not a 401) when
   * the visitor isn't signed in, so the home page can render the
   * section conditionally without branching on auth state.
   */
  async myContributions(): Promise<{
    contributions: readonly {
      prNumber: number;
      htmlUrl: string;
      title: string;
      updatedAt: string;
      entityId: string;
      entityType: string;
      entitySlug: string;
    }[];
  }> {
    return getJson('/api/me/contributions');
  },
  /** Manually drop every cached response — useful behind a "Refresh" button. */
  invalidateAll(): void {
    schemasPromise = null;
    invalidateAfterSave();
  },
  /**
   * Ask the API to mint a presigned PUT URL on R2, then PUT the file
   * bytes from the browser straight to Cloudflare. Returns the
   * `staging://<key>` placeholder the form stores on the entity
   * JSON; the promote-images workflow rewrites it to the canonical
   * public URL after the PR merges (see ADR-015 / Phase 7.1).
   */
  async uploadImage(
    file: File,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<{ stagingUrl: string; key: string; }> {
    const presign = await postJson<PresignResult>('/api/uploads/presign', {
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    });
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presign.uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress !== undefined) {
          onProgress(e.loaded, e.total);
        }
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      });
      xhr.addEventListener('error', () =>
        reject(
          new Error(
            'R2 upload blocked. The most common cause is missing CORS on the '
              + 'bucket — open the Cloudflare dashboard → R2 → your bucket → '
              + 'Settings → CORS Policy and allow PUT/GET from the dashboard '
              + 'origin, or run `bun scripts/setup-r2-cors.ts` from the repo '
              + 'root for the canonical config. Original network error in the '
              + 'browser devtools network tab.',
          ),
        ));
      xhr.send(file);
    });
    return { stagingUrl: presign.stagingUrl, key: presign.key };
  },
};
