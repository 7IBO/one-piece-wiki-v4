/**
 * Shared shapes + defensive parsing helpers for the api-onepiece.com
 * mappers (ADR-101).
 *
 * The API is a CANDIDATE POOL (ADR-101 §3): mappers emit candidate
 * entity files a maintainer reviews and moves into `/data` through the
 * normal PR flow. Conventions shared by every mapper:
 *
 *  - EN+FR sweeps merge into ONE entity + per-locale translations;
 *  - every field of a raw record is either in the mapper's exported
 *    `*_HANDLED_FIELDS` list or lands in the report's gap section —
 *    nothing is silently dropped;
 *  - historisable entries are stamped `review_status: auto_imported`
 *    (ADR-079 rails); entries the API cannot anchor (no chapter/
 *    episode reveal info) are emitted WITHOUT `since` and flagged in
 *    the report's unanchored section;
 *  - image URLs become `image` ENTITIES (URL only, license
 *    `unverified-external`, attribution api-onepiece.com) — no binary
 *    is ever downloaded (ADR-101 §2).
 */

export type RawRecord = Readonly<Record<string, unknown>>;

/** One record seen in the EN and/or FR sweep (paired by API id). */
export type LocalizedRecordPair = {
  readonly en?: RawRecord;
  readonly fr?: RawRecord;
};

export type CandidateEntity = {
  readonly id: string;
  readonly type: string;
  readonly schema_version: number;
  readonly slug: string;
  readonly canonical_name_key?: string;
  readonly properties: Record<string, unknown>;
  readonly relations: Record<string, unknown>[];
};

/** Per-locale translation sidecars (key → string). */
export type CandidateTranslations = {
  readonly en: Record<string, string>;
  readonly fr: Record<string, string>;
};

/** An API field the mapper does not handle — report gap material. */
export type FieldGap = {
  readonly field: string;
  /** Stringified sample value (truncated) so the gap is actionable. */
  readonly example: string;
};

export type ImageCandidate = {
  readonly entity: CandidateEntity;
  readonly translations: CandidateTranslations;
  /** True when spoiler_since fell back to manga-chapter:1. */
  readonly spoilerFallback: boolean;
};

export type MappedCandidate = {
  readonly entity: CandidateEntity;
  readonly translations: CandidateTranslations;
  /** Image entities spawned from URL fields (depicted-by edges are
   *  already pushed onto the subject's relations). */
  readonly images: readonly ImageCandidate[];
  readonly gaps: readonly FieldGap[];
  /** Entries emitted without a `since` anchor (API carries none). */
  readonly unanchored: readonly string[];
  /** Facts deliberately NOT stored (e.g. derived values) — reported. */
  readonly informational: readonly string[];
  readonly warnings: readonly string[];
};

/** `review_status` stamp for every auto-imported historisable entry. */
export const AUTO_IMPORTED = { review_status: 'auto_imported' } as const;

/** Spoiler anchor used when a subject has no known first anchor. */
export const SPOILER_FALLBACK = 'manga-chapter:1';

/** kebab-case English slug (CLAUDE.md id rules). */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Trimmed non-empty string, or null (dirty data defence). */
export function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || /^(unknown|inconnu[e]?|n\/a|none|-)$/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Defensive numeric parsing for API values: numbers pass through;
 * strings tolerate `.`/`,`/space thousand separators and trailing
 * units ("3.000.000.000", "1,500,000,000 Berries", "174 cm").
 */
export function parseLooseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = cleanString(value);
  if (raw === null) return null;
  const match = /(\d[\d.,\s ]*)/.exec(raw);
  if (match === null) return null;
  const digits = match[1]!.replace(/[.,\s ]/g, '');
  if (digits === '') return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "2022-03-07", "2022/03/07" or parseable date string → ISO date. */
export function parseLooseDate(value: unknown): string | null {
  const raw = cleanString(value);
  if (raw === null) return null;
  const direct = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
  if (direct !== null) {
    return `${direct[1]}-${direct[2]!.padStart(2, '0')}-${direct[3]!.padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

const GAP_EXAMPLE_LIMIT = 80;

/**
 * EVERY raw field not in the handled list becomes a gap — the ADR-101
 * "never silently dropped" rule. Checks the union of the EN and FR
 * record shapes.
 */
export function collectGaps(
  pair: LocalizedRecordPair,
  handledFields: readonly string[],
): readonly FieldGap[] {
  const handled = new Set(handledFields);
  const gaps = new Map<string, FieldGap>();
  for (const record of [pair.en, pair.fr]) {
    if (record === undefined) continue;
    for (const [field, value] of Object.entries(record)) {
      if (handled.has(field) || gaps.has(field)) continue;
      if (value === null || value === undefined || value === '') continue;
      const example = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
      gaps.set(field, {
        field,
        example: example.length > GAP_EXAMPLE_LIMIT
          ? `${example.slice(0, GAP_EXAMPLE_LIMIT)}…`
          : example,
      });
    }
  }
  return [...gaps.values()];
}

/**
 * Localized field access over a record pair: EN value first (slugs and
 * canonical strings are English per CLAUDE.md), FR as fallback, plus
 * the FR value for translation sidecars.
 */
export function localizedField(
  pair: LocalizedRecordPair,
  ...fields: readonly string[]
): { readonly en: string | null; readonly fr: string | null; } {
  const read = (record: RawRecord | undefined): string | null => {
    if (record === undefined) return null;
    for (const field of fields) {
      const value = cleanString(record[field]);
      if (value !== null) return value;
    }
    return null;
  };
  return { en: read(pair.en), fr: read(pair.fr) };
}

/** First raw value found across locales for a field (EN wins). */
export function pairField(pair: LocalizedRecordPair, ...fields: readonly string[]): unknown {
  for (const record of [pair.en, pair.fr]) {
    if (record === undefined) continue;
    for (const field of fields) {
      const value = record[field];
      if (value !== null && value !== undefined && value !== '') return value;
    }
  }
  return undefined;
}

/**
 * Standard localized-name emission: one `name` entry pointing at
 * `<type>.<slug>.name`, EN + FR sidecar values (FR falls back to EN so
 * both locales resolve). Returns the canonical name key.
 */
export function emitName(
  entity: CandidateEntity,
  translations: CandidateTranslations,
  enName: string,
  frName: string | null,
): string {
  const key = `${entity.type}.${entity.slug}.name`;
  entity.properties['name'] = [{ value_key: key, ...AUTO_IMPORTED }];
  translations.en[key] = enName;
  translations.fr[key] = frName ?? enName;
  return key;
}

/**
 * Earliest `manga-chapter:` anchor found among a subject's property
 * entries — feeds image `spoiler_since`. The API itself carries no
 * anchors, so this only fires when a mapper inferred one.
 */
export function earliestAnchor(properties: Readonly<Record<string, unknown>>): string | null {
  let best: { id: string; n: number; } | null = null;
  for (const value of Object.values(properties)) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;
      const since = (entry as { since?: unknown; }).since;
      if (typeof since !== 'string') continue;
      const m = /^manga-chapter:(\d+)$/.exec(since);
      if (m === null) continue;
      const n = Number(m[1]);
      if (best === null || n < best.n) best = { id: since, n };
    }
  }
  return best?.id ?? null;
}

/** Current image schema_version — keep in sync with the type. */
export const IMAGE_SCHEMA_VERSION = 2;

const URL_FORMATS: ReadonlyMap<string, string> = new Map([
  ['png', 'png'],
  ['jpg', 'jpg'],
  ['jpeg', 'jpg'],
  ['webp', 'webp'],
  ['gif', 'gif'],
  ['avif', 'avif'],
  ['svg', 'svg'],
]);

/** `image-formats` value inferred from a URL's extension, or null. */
export function inferImageFormat(url: string): string | null {
  const m = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url);
  if (m === null) return null;
  return URL_FORMATS.get(m[1]!.toLowerCase()) ?? null;
}

/**
 * URL-only image ingestion (ADR-101 §2): the external URL becomes an
 * `image` entity (license `unverified-external`, attribution
 * "api-onepiece.com", source_origin `other`); a `depicted-by` edge is
 * pushed onto the subject. `spoiler_since` uses the subject's earliest
 * known anchor, falling back to manga-chapter:1 (flagged upstream via
 * `spoilerFallback`). NO binary is downloaded, ever.
 *
 * Returns null (with no side effect) when the URL is not http(s) or
 * its format cannot be inferred — never guess a required enum.
 */
export function buildImageCandidate(
  subject: CandidateEntity,
  subjectNames: { readonly en: string; readonly fr: string | null; },
  url: string,
  role: string,
): ImageCandidate | null {
  if (!/^https?:\/\//i.test(url)) return null;
  const format = inferImageFormat(url);
  if (format === null) return null;

  const slug = `${subject.slug}-api-onepiece`;
  const id = `image:${slug}`;
  const nameKey = `image.${slug}.name`;
  const altKey = `image.${slug}.alt`;
  const anchor = earliestAnchor(subject.properties);

  const entity: CandidateEntity = {
    id,
    type: 'image',
    schema_version: IMAGE_SCHEMA_VERSION,
    slug,
    canonical_name_key: nameKey,
    properties: {
      url: [{ value: url, ...AUTO_IMPORTED }],
      license: { value: 'unverified-external' },
      attribution: { value: 'api-onepiece.com' },
      source_origin: { value: 'other' },
      format: { value: format },
      spoiler_since: { value: anchor ?? SPOILER_FALLBACK },
      alt_text_key: { value_key: altKey },
    },
    relations: [],
  };
  const en = subjectNames.en;
  const fr = subjectNames.fr ?? subjectNames.en;
  const translations: CandidateTranslations = {
    en: {
      [nameKey]: `${en} — api-onepiece.com image`,
      [altKey]: `Image of ${en} (api-onepiece.com)`,
    },
    fr: {
      [nameKey]: `${fr} — image api-onepiece.com`,
      [altKey]: `Image de ${fr} (api-onepiece.com)`,
    },
  };

  subject.relations.push({
    type: 'depicted-by',
    target: id,
    qualifiers: { role },
  });

  return { entity, translations, spoilerFallback: anchor === null };
}

/**
 * Relation-target resolution contract shared by mappers: given a
 * display name and the acceptable entity types, return an entity id —
 * an EXISTING entity (matcher index) or a candidate from the same
 * sweep — or null when unknown.
 */
export type ResolveTarget = (name: string, types: readonly string[]) => string | null;

export type MapperContext = {
  readonly resolveTarget?: ResolveTarget;
  /** Lowercased vocabulary label (en/fr) AND value id → value id. */
  readonly vocabularies?: Readonly<Record<string, ReadonlyMap<string, string>>>;
};

/** Exact (case-insensitive) vocabulary match via the context index. */
export function matchVocabulary(
  ctx: MapperContext,
  vocabulary: string,
  raw: string,
): string | null {
  const index = ctx.vocabularies?.[vocabulary];
  if (index === undefined) return null;
  return index.get(raw.trim().toLowerCase()) ?? null;
}

/**
 * Resolve a relation target by name: matcher/sweep index first, else a
 * slugified guess of the first acceptable type + a warning that the
 * target must exist before merge.
 */
export function resolveOrGuessTarget(
  ctx: MapperContext,
  name: string,
  types: readonly string[],
  warnings: string[],
  relationType: string,
): string | null {
  const resolved = ctx.resolveTarget?.(name, types) ?? null;
  if (resolved !== null) return resolved;
  const slug = slugify(name);
  if (slug === '') {
    warnings.push(`${relationType}: unusable target name "${name}" — edge skipped`);
    return null;
  }
  const guess = `${types[0]}:${slug}`;
  warnings.push(
    `${relationType}: target "${name}" not found among existing entities or this sweep — `
      + `emitted as ${guess}; the entity must exist before merge`,
  );
  return guess;
}
