/**
 * Tiny client for the dashboard's local API. The API runs as a sibling
 * Bun process (api/server.ts); Vite proxies /api/* to it in dev. The
 * shape is intentionally hand-rolled — Phase 4.2 swaps the saveEntity
 * implementation from "write JSON file directly" to "open PR via
 * Octokit" without affecting this surface.
 */
import {
  DATA_LOCALES,
  type DataLocale,
  type EntityTypeSchema,
  type PropertyTypeSchema,
  type QualifierTypeSchema,
  type RelationTypeSchema,
  type RuleSchema,
  type VocabularySchema,
} from '@onepiece-wiki/schemas';

export type DisplayName = {
  readonly en: string | null;
  readonly fr: string | null;
};

/**
 * Per-row completeness (ADR-083): `expected` counts the entity-type's
 * required + recommended properties plus its `recommended_relations`;
 * `filled` counts how many of those the entity actually carries.
 * Advisory only — drives the list-row meter, never validation.
 */
export type Completeness = {
  readonly filled: number;
  readonly expected: number;
};

export type EntityRef = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  readonly canonical_name_key: string | null;
  readonly displayName: DisplayName;
  /** Optional: present on list responses from servers aware of ADR-083. */
  readonly completeness?: Completeness;
};

/**
 * Per-entity translation maps, one per DATA locale (ADR-095): the UI
 * locales `en`/`fr` plus `ja` (original Japanese script) and `ja-latn`
 * (romanized Japanese). Every key is present — the server normalizes
 * missing locale files to `{}` — so form code can index any data
 * locale without branching. `ja`/`ja-latn` are stored data surfaced
 * only in the form's translation inputs; display fallback chains and
 * the locale switcher stay `en`/`fr`.
 */
export type Translations = Readonly<Record<DataLocale, Record<string, string>>>;

/**
 * Fill missing data-locale maps with `{}` (stable key order). Guards
 * the boundaries where a pre-ADR-095 `{en, fr}` record can still
 * appear — e.g. IndexedDB drafts persisted by an older session.
 */
export function normalizeTranslations(
  raw: Partial<Record<DataLocale, Record<string, string>>>,
): Translations {
  const out = {} as Record<DataLocale, Record<string, string>>;
  for (const locale of DATA_LOCALES) out[locale] = raw[locale] ?? {};
  return out;
}

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
  readonly qualifierTypes: Record<string, QualifierTypeSchema>;
  readonly rules: Record<string, RuleSchema>;
};

/** One row of the admin moderation queue (W-B). */
export type QueueItem = {
  readonly prNumber: number;
  readonly htmlUrl: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly labels: readonly string[];
  readonly entityId: string | null;
  readonly contributor:
    | { readonly kind: 'github'; readonly login: string; }
    | { readonly kind: 'anonymous'; readonly nickname: string; }
    | null;
};

/** Server-side structured diff of one queue PR (W-B slice 2). */
export type PullDetail = {
  readonly prNumber: number;
  readonly title: string;
  readonly entities: readonly {
    readonly path: string;
    readonly entityId: string | null;
    readonly kind: 'added' | 'modified' | 'removed';
    readonly properties: readonly {
      readonly id: string;
      readonly before: string | null;
      readonly after: string | null;
    }[];
    readonly relations: readonly {
      readonly type: string;
      readonly added: readonly string[];
      readonly removed: readonly string[];
    }[];
  }[];
  readonly translations: readonly {
    readonly path: string;
    readonly locale: string;
    readonly changed: readonly {
      readonly key: string;
      readonly before: string | null;
      readonly after: string | null;
    }[];
  }[];
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

/** One incoming edge of a relation type, as stored on the SOURCE
 *  entity (ADR-097). `fileSha` is the source file's GitHub blob SHA
 *  for the save's optimistic lock — null when GitHub isn't
 *  configured (the lock is skipped for that file). */
export type IncomingEdgeRow = {
  readonly sourceEntityId: string;
  readonly entityType: string;
  readonly slug: string;
  readonly displayName: DisplayName;
  readonly qualifiers: Record<string, unknown>;
  readonly fileSha: string | null;
};

/** `GET /api/entities/:type/:slug/incoming/:relationType` — the
 *  incoming-edge manager payload (ADR-097). The relation type's
 *  qualifier declarations + `valid_from_types` ride along so the
 *  manager needs no second catalogue lookup. */
export type IncomingEdgesResponse = {
  readonly target: { readonly id: string; readonly type: string; readonly slug: string; };
  readonly relationType: {
    readonly id: string;
    readonly labels: RelationTypeSchema['labels'];
    readonly qualifiers: RelationTypeSchema['qualifiers'];
    readonly valid_from_types: readonly string[];
  };
  readonly rows: readonly IncomingEdgeRow[];
};

/** Body of the incoming-edge bulk save (ADR-097). */
export type IncomingEdgesChange = {
  readonly add: readonly { entityId: string; qualifiers?: Record<string, unknown>; }[];
  readonly update: readonly { entityId: string; qualifiers: Record<string, unknown>; }[];
  readonly remove: readonly string[];
  readonly expected: readonly { entityId: string; sha: string; }[];
};

/** Type-guard for the structured 409 `multi_file_conflict` payload —
 *  a bulk save refused because N source files moved on main since the
 *  manager loaded (plural optimistic lock, ADR-021/097). Returns the
 *  conflicting entity ids so the manager can list them and prompt a
 *  reload. */
export function multiFileConflictEntities(err: unknown): readonly string[] | null {
  if (!(err instanceof ApiError) || err.payload === null) return null;
  if (err.payload['code'] !== 'multi_file_conflict') return null;
  const raw = err.payload['entities'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is string => typeof e === 'string');
}

/** Deep-link coordinates of a linked entity; null when the target id
 *  is dangling (not in the catalogue). */
export type EntityRoute = {
  readonly type: string;
  readonly slug: string;
} | null;

export type OutgoingLinkRow = {
  readonly relationType: string;
  readonly target: string;
  readonly qualifiers: Record<string, unknown>;
  readonly targetRoute: EntityRoute;
  readonly targetDisplayName: DisplayName;
};

export type IncomingLinkRow = {
  readonly relationType: string;
  readonly sourceEntityId: string;
  readonly qualifiers: Record<string, unknown>;
  readonly sourceRoute: EntityRoute;
  readonly sourceDisplayName: DisplayName;
};

export type LinkConflictKind = 'duplicate-symmetric' | 'duplicate-edge' | 'qualifier-mismatch';

export type LinkConflict = {
  readonly kind: LinkConflictKind;
  readonly relationType: string;
  readonly otherEntityId: string;
  readonly detail: string;
};

/** `GET /api/entities/:type/:slug/links` — all links of an entity
 *  (both directions) + inverse-coherence conflicts. */
export type EntityLinks = {
  readonly entity: { readonly id: string; readonly type: string; readonly slug: string; };
  readonly outgoing: readonly OutgoingLinkRow[];
  readonly incoming: readonly IncomingLinkRow[];
  readonly conflicts: readonly LinkConflict[];
};

/** One commit touching an entity's data file — a row of
 *  `GET /api/entities/:type/:slug/history` (in-app history page). */
/** One change line — `text` is the compact value + `since` shown by
 *  default ("Mort · C574"); `details` carries the other qualifiers
 *  (`Label : Valeur`, ` · `-joined) behind a per-line "see more". */
export type HistoryChangeLine = {
  readonly text: string;
  readonly details?: string;
};

/** One property/relation-type change bucket inside a commit — labels
 *  and value lines arrive fully resolved (localized labels, vocab
 *  labels, translated keys, compact `C96` provenance), never JSON. */
export type HistoryChangeGroup = {
  readonly label: string;
  readonly added: readonly HistoryChangeLine[];
  readonly removed: readonly HistoryChangeLine[];
};

export type HistoryCommit = {
  readonly sha: string;
  readonly shortSha: string;
  readonly message: string;
  readonly authorName: string;
  readonly authorLogin?: string;
  readonly date: string;
  readonly htmlUrl: string;
  /** Semantic changes of this commit (newest commits only) — the
   *  history page shows what changed without a click. */
  readonly changes?: readonly HistoryChangeGroup[];
  /** Change lines beyond the server's per-commit budget. */
  readonly changesTruncated?: number;
};

/** Result of `api.entityHistory`. The endpoint's 503 (GitHub App
 *  credentials not configured — the dev case) is folded into the
 *  `unavailable` variant instead of throwing, so the history page can
 *  render an informational banner rather than the error state. */
export type EntityHistory =
  | { readonly kind: 'ok'; readonly commits: readonly HistoryCommit[]; }
  | { readonly kind: 'unavailable'; readonly message: string; };

/** One entity touched by a global-history commit: resolved display
 *  name, deep-link route (null when the entity no longer exists) and
 *  its semantic change groups — same shape as the per-entity page. */
export type GlobalHistoryEntity = {
  readonly entityId: string;
  readonly displayName: DisplayName;
  readonly route: EntityRoute;
  readonly changes: readonly HistoryChangeGroup[];
  readonly changesTruncated: number;
};

/** One row of `GET /api/history` — a commit touching the data tree,
 *  with per-entity semantic changes on the newest commits only
 *  (server budget); non-entity files are only counted. */
export type GlobalHistoryCommit = {
  readonly sha: string;
  readonly shortSha: string;
  readonly message: string;
  readonly authorName: string;
  readonly authorLogin?: string;
  readonly date: string;
  readonly htmlUrl: string;
  readonly entities: readonly GlobalHistoryEntity[];
  readonly otherFilesCount: number;
};

/** Result of `api.globalHistory` — same 503 folding as
 *  `EntityHistory` (informational banner in dev, not an error). */
export type GlobalHistory =
  | { readonly kind: 'ok'; readonly commits: readonly GlobalHistoryCommit[]; }
  | { readonly kind: 'unavailable'; readonly message: string; };

/** Machine-readable slice of one audit entry — the stored `value` OR
 *  `value_key` plus the raw `since` id(s). Powers the explorer's
 *  inline editors; `display` stays authoritative for read mode. */
export type AuditRawEntry = {
  readonly value?: unknown;
  readonly value_key?: string;
  readonly since?: string | readonly string[];
};

/** One pre-rendered property value entry on an audit row. `display`
 *  is resolved server-side (translated value_key, vocabulary labels,
 *  number+unit, boolean ✓/×) so the explorer client stays dumb.
 *  `since` is a compact provenance display ("C96", "E45"…), never a
 *  raw `type:slug` id. */
export type AuditValueEntry = {
  readonly display: string;
  readonly since?: string;
  readonly raw?: AuditRawEntry;
};

export type AuditPropertyValues = {
  readonly property: string;
  /** Property type's `value_type` / `value_constraints.enum_ref` from
   *  the catalogue — lets the client pick the right inline editor. */
  readonly valueType?: string;
  readonly enumRef?: string;
  readonly entries: readonly AuditValueEntry[];
};

/** `GET /api/audit` — one row per entity across every type, powering
 *  the /explore data explorer. */
export type AuditRow = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  readonly displayName: DisplayName;
  readonly completeness: Completeness;
  /** Required-or-recommended property ids with no content + recommended
   *  relation types with no edge. */
  readonly missingRecommended: readonly string[];
  /** i18n keys lacking text in a locale, as `key (en)` / `key (fr)`. */
  readonly missingTranslations: readonly string[];
  readonly values: readonly AuditPropertyValues[];
};

export type AuditResponse = {
  readonly rows: readonly AuditRow[];
};

// ── Narratives (per-locale prose Markdown — DATA_MODEL § Narratives) ──

/** `GET /api/entities/:type/:slug/narrative` — raw Markdown per
 *  locale, `null` when no narrative file exists for that locale. */
export type NarrativeContent = {
  readonly en: string | null;
  readonly fr: string | null;
};

/** Body of the narrative save — only the touched locales are sent.
 *  Empty/blank text deletes the locale's file server-side. */
export type NarrativeSaveBody = {
  readonly en?: string;
  readonly fr?: string;
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
 * Shared fetcher for the two history endpoints: a 503 (GitHub App
 * credentials not configured — the dev case) folds into the
 * `unavailable` variant instead of throwing, so the history pages
 * render an informational banner rather than the error state; any
 * other failure throws like `getJson`.
 */
async function fetchHistory<C>(
  path: string,
): Promise<
  { readonly kind: 'ok'; readonly commits: readonly C[]; } | {
    readonly kind: 'unavailable';
    readonly message: string;
  }
> {
  const response = await fetch(path);
  if (response.status === 503) {
    let message = '';
    try {
      const parsed = (await response.json()) as { error?: unknown; };
      if (typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // body wasn't JSON — keep the empty message.
    }
    return { kind: 'unavailable', message };
  }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${path}`);
  return { kind: 'ok', commits: (await response.json()) as C[] };
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

/** One blocking-rule finding from a 422 `rule_blocked` refusal (ADR-088). */
export type RuleBlockedFinding = {
  readonly ruleId: string;
  readonly messages: { readonly en: string; readonly fr: string; };
  readonly property?: string;
  readonly entryIndex?: number;
};

/**
 * Type-guard for the structured `rule_blocked` payload — a save the
 * server refused because a BLOCKING coherence rule matched (ADR-088).
 * The form maps these onto fields exactly like Zod validation issues.
 */
export function ruleBlockedFindings(err: unknown): readonly RuleBlockedFinding[] | null {
  if (!(err instanceof ApiError) || err.payload === null) return null;
  if (err.payload['code'] !== 'rule_blocked') return null;
  const raw = err.payload['findings'];
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (f): f is RuleBlockedFinding =>
      f !== null
      && typeof f === 'object'
      && typeof (f as { ruleId?: unknown; }).ruleId === 'string'
      && typeof (f as { messages?: unknown; }).messages === 'object'
      && (f as { messages: { en?: unknown; }; }).messages !== null
      && typeof (f as { messages: { en?: unknown; }; }).messages.en === 'string',
  );
}

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
   * All links of an entity (both directions) + inverse-coherence
   * conflicts. Not cached: the panel fetches lazily on mount and
   * freshness matters after a save touched either side of an edge.
   */
  async entityLinks(type: string, slug: string): Promise<EntityLinks> {
    return getJson<EntityLinks>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(slug)}/links`,
    );
  },
  /**
   * Commit history of the entity's data file on the data repo (newest
   * first, capped server-side at 50). Not cached: a save changes it
   * and the history page is the only caller. A 503 — GitHub App
   * credentials not configured (dev) — resolves to the `unavailable`
   * variant instead of throwing; any other failure throws like
   * `getJson` so `useApiResource` surfaces `<LoadFailed>`.
   */
  async entityHistory(
    type: string,
    slug: string,
    locale: 'en' | 'fr' = 'en',
  ): Promise<EntityHistory> {
    return fetchHistory<HistoryCommit>(
      `/api/entities/${encodeURIComponent(type)}/${
        encodeURIComponent(slug)
      }/history?locale=${locale}`,
    );
  },
  /**
   * Recent commits across ALL wiki data (newest first, capped
   * server-side at 30), each with the touched entities' semantic
   * change groups (newest commits only — server budget). Not cached:
   * any save changes it and the /history page is the only caller.
   * Same 503-to-`unavailable` folding as `entityHistory`.
   */
  async globalHistory(locale: 'en' | 'fr' = 'en'): Promise<GlobalHistory> {
    return fetchHistory<GlobalHistoryCommit>(`/api/history?locale=${locale}`);
  },
  /**
   * Cross-type audit rows for the /explore data explorer. Not cached:
   * the route is the only caller, the payload is cheap at catalogue
   * scale, and the explorer refetches after each drawer edit.
   */
  async audit(locale: 'en' | 'fr' = 'en'): Promise<AuditResponse> {
    return getJson<AuditResponse>(`/api/audit?locale=${locale}`);
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
   * Reverse-scan the incoming edges of one relation type targeting
   * this entity (ADR-097). Not cached: the manager fetches on open
   * and freshness (fileSha locks) matters for the save.
   */
  async getIncomingEdges(
    type: string,
    slug: string,
    relationType: string,
  ): Promise<IncomingEdgesResponse> {
    return getJson<IncomingEdgesResponse>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(slug)}/incoming/${
        encodeURIComponent(relationType)
      }`,
    );
  },
  /**
   * Bulk-apply incoming-edge changes for one relation type (ADR-097).
   * Opens one PR titled `[DATA] Update <relation> incoming edges of
   * <targetId>` touching the N storing entity files in one commit.
   * Throws `ApiError` 409 `multi_file_conflict` when any expected SHA
   * moved — see `multiFileConflictEntities`.
   */
  async saveIncomingEdges(
    type: string,
    slug: string,
    relationType: string,
    change: IncomingEdgesChange,
  ): Promise<SaveResult> {
    const result = await postJson<SaveResult>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(slug)}/incoming/${
        encodeURIComponent(relationType)
      }`,
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
  // ── Narratives (per-locale prose Markdown) ──
  /**
   * Both locale narratives of an entity (raw Markdown, `null` when
   * absent). Not cached: the editor fetches lazily on panel mount and
   * freshness matters right after a save.
   */
  async getNarrative(type: string, slug: string): Promise<NarrativeContent> {
    return getJson<NarrativeContent>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(slug)}/narrative`,
    );
  },
  /**
   * Save one or both locale narratives. Opens (or resumes) a PR
   * carrying only the touched `.md` files — entity JSON is never
   * involved. Empty text deletes the locale's file.
   */
  async saveNarrative(
    type: string,
    slug: string,
    body: NarrativeSaveBody,
  ): Promise<SaveResult> {
    const result = await postJson<SaveResult>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(slug)}/narrative`,
      body,
    );
    // A narrative save can open a NEW PR on the entity — the entity
    // page's resume-PR banner reads from getEntity, so drop caches.
    invalidateAfterSave();
    return result;
  },
  /** Admin moderation queue: every open via-dashboard PR (W-B). */
  async adminPulls(): Promise<{ pulls: readonly QueueItem[]; }> {
    return getJson('/api/admin/pulls');
  },
  /** Structured diff of one queue PR (W-B slice 2). Admin-only. */
  async adminPullDetail(prNumber: number): Promise<PullDetail> {
    return getJson(`/api/admin/pulls/${prNumber}/detail`);
  },
  /** Approve: promote staged images (if any) + squash-merge. Admin-only. */
  async adminPromote(prNumber: number): Promise<unknown> {
    return postJson('/api/admin/promote', { prNumber });
  },
  /** Reject: close the PR + delete its staged R2 objects. Admin-only. */
  async adminReject(prNumber: number): Promise<unknown> {
    return postJson('/api/admin/reject', { prNumber });
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
