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
  readonly pr: { readonly number: number; readonly htmlUrl: string; readonly headBranch: string; };
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

export type PresignResult = {
  readonly uploadUrl: string;
  readonly publicUrl: string;
  readonly key: string;
  readonly expiresIn: number;
  readonly maxBytes: number;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${path}`);
  return (await response.json()) as T;
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
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
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
  async saveEntity(
    type: string,
    slug: string,
    data: Record<string, unknown>,
    sha: string | null,
    translations: Translations,
  ): Promise<SaveResult> {
    const result = await postJson<SaveResult>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
      { data, sha, translations },
    );
    invalidateAfterSave();
    return result;
  },
  /** Manually drop every cached response — useful behind a "Refresh" button. */
  invalidateAll(): void {
    schemasPromise = null;
    invalidateAfterSave();
  },
  /**
   * Ask the API to mint a presigned PUT URL on R2, then PUT the file
   * bytes from the browser straight to Cloudflare. Returns the final
   * publicly-served URL the entity JSON should reference.
   */
  async uploadImage(
    file: File,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<{ publicUrl: string; key: string; }> {
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
    return { publicUrl: presign.publicUrl, key: presign.key };
  },
};
