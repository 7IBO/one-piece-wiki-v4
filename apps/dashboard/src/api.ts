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
  VocabularySchema,
} from '@onepiece-wiki/schemas';

export type EntityRef = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  readonly canonical_name_key: string | null;
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

export type SaveResult = {
  readonly ok: true;
  readonly pr: { readonly number: number; readonly htmlUrl: string; readonly headBranch: string; };
};

export type SchemaCatalogue = {
  readonly entityTypes: Record<string, EntityTypeSchema>;
  readonly propertyTypes: Record<string, PropertyTypeSchema>;
  readonly vocabularies: Record<string, VocabularySchema>;
};

export type SourceRef = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  readonly number: number | null;
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

export const api = {
  async schemas(): Promise<SchemaCatalogue> {
    return getJson<SchemaCatalogue>('/api/schemas');
  },
  async sources(): Promise<SourceRef[]> {
    return getJson<SourceRef[]>('/api/sources');
  },
  async i18nKeys(): Promise<string[]> {
    return getJson<string[]>('/api/i18n-keys');
  },
  async listEntities(type: string): Promise<EntityRef[]> {
    return getJson<EntityRef[]>(`/api/entities/${encodeURIComponent(type)}`);
  },
  async getEntity(type: string, slug: string): Promise<EntityDetail> {
    return getJson<EntityDetail>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
    );
  },
  async saveEntity(
    type: string,
    slug: string,
    data: Record<string, unknown>,
    sha: string | null,
    translations: Translations,
  ): Promise<SaveResult> {
    return postJson<SaveResult>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
      { data, sha, translations },
    );
  },
};
