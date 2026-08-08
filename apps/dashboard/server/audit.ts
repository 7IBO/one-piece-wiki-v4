/**
 * Cross-type audit rows for the data explorer (`GET /api/audit`,
 * `/explore` route). Pure — no I/O, no globals — so it unit-tests
 * without a catalogue on disk. The server handler in `server.ts`
 * gathers the snapshot, per-entity translations and display names,
 * then delegates every per-entity computation here.
 *
 * Schema-driven throughout: expected fields come from the entity-type
 * declaration via `completenessExpectation` (ADR-083), value displays
 * resolve through the property-type catalogue (vocabulary labels,
 * units) — no property name or entity type is ever hardcoded.
 */
import {
  type Completeness,
  type CompletenessExpectation,
  completenessExpectation,
  computeCompleteness,
  propertyHasContent,
} from './completeness.ts';

/** Per-entity `{ en, fr }` i18n maps, as read from `/translations`. */
export type AuditTranslations = {
  readonly en: Record<string, string>;
  readonly fr: Record<string, string>;
};

export type AuditDisplayName = {
  readonly en: string | null;
  readonly fr: string | null;
};

/**
 * Machine-readable slice of one property entry, additively bundled
 * next to the pre-rendered `display` string so the explorer can build
 * inline editors (2026-08 explorer v2). Carries the entry's stored
 * `value` OR `value_key` plus the raw `since` id(s) — nothing else,
 * the display fields stay authoritative for read mode.
 */
export type AuditRawEntry = {
  readonly value?: unknown;
  readonly value_key?: string;
  readonly since?: string | readonly string[];
};

export type AuditValueEntry = {
  readonly display: string;
  /** Compact provenance display ("C96", "E45", a film's name…) —
   *  never the raw `type:slug` id. */
  readonly since?: string;
  readonly raw?: AuditRawEntry;
};

export type AuditPropertyValues = {
  readonly property: string;
  /** The property type's `value_type` from the catalogue — lets the
   *  client pick the right inline editor. Absent for properties not
   *  in the catalogue. */
  readonly valueType?: string;
  /** The property type's `value_constraints.enum_ref`, when any. */
  readonly enumRef?: string;
  readonly entries: readonly AuditValueEntry[];
};

export type AuditRow = {
  readonly id: string;
  readonly type: string;
  readonly slug: string;
  readonly displayName: AuditDisplayName;
  readonly completeness: Completeness;
  /** Required-or-recommended property ids with no content, plus
   *  `recommended_relations` entries with no edge. */
  readonly missingRecommended: readonly string[];
  /** Referenced i18n keys lacking text in a locale, as `key (en)` /
   *  `key (fr)` entries (one per missing locale). */
  readonly missingTranslations: readonly string[];
  readonly values: readonly AuditPropertyValues[];
};

/* Structural "Like" types (same pattern as completeness.ts) so tests
 * build fixtures without dragging in the full Zod-inferred schemas.
 * The real catalogue types are structurally assignable to these. */

type EntityTypeLike = {
  readonly properties: readonly {
    readonly id: string;
    readonly required: boolean;
    readonly recommended: boolean;
  }[];
  readonly recommended_relations?: readonly string[] | undefined;
};

type PropertyTypeLike = {
  readonly value_type: string;
  readonly unit?: string | undefined;
  readonly value_constraints?: {
    readonly enum_ref?: string | undefined;
  } | undefined;
};

type VocabularyLike = {
  readonly values: Record<
    string,
    { readonly labels: { readonly en?: string; readonly fr?: string; }; }
  >;
};

export type AuditContext = {
  readonly entityType: EntityTypeLike | undefined;
  readonly propertyTypes: ReadonlyMap<string, PropertyTypeLike>;
  readonly vocabularies: ReadonlyMap<string, VocabularyLike>;
  readonly translations: AuditTranslations;
  readonly displayName: AuditDisplayName;
  /** Resolve an entity/source id to its display name (for
   *  `entity_ref` / `source_ref` values). Undefined = unknown id. */
  readonly displayNameFor: (entityId: string) => AuditDisplayName | undefined;
  /** Display locale for value strings (translations, vocabulary
   *  labels, ref names) — the other locale is the fallback. */
  readonly locale: 'en' | 'fr';
};

function plainObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asEntryList(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Expected fields (per `completenessExpectation`) the entity does NOT
 * carry: properties without content (same semantics as the meter's
 * `propertyHasContent`) then recommended relation types with no edge.
 */
export function missingRecommendedFor(
  data: Record<string, unknown>,
  expectation: CompletenessExpectation,
): string[] {
  const missing: string[] = [];
  const properties = plainObject(data['properties']);
  for (const id of expectation.propertyIds) {
    const value = properties[id];
    if (value === undefined || value === null || !propertyHasContent(value)) {
      missing.push(id);
    }
  }
  if (expectation.relationTypeIds.length > 0) {
    const present = new Set<string>();
    const relations = data['relations'];
    if (Array.isArray(relations)) {
      for (const rel of relations) {
        if (rel !== null && typeof rel === 'object') {
          const relType = (rel as Record<string, unknown>)['type'];
          if (typeof relType === 'string') present.add(relType);
        }
      }
    }
    for (const id of expectation.relationTypeIds) {
      if (!present.has(id)) missing.push(id);
    }
  }
  return missing;
}

/**
 * Every i18n key the entity references: `canonical_name_key` plus each
 * property entry's `value_key`. Deduplicated, in encounter order.
 */
export function referencedI18nKeys(data: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  const canonical = data['canonical_name_key'];
  if (typeof canonical === 'string' && canonical !== '') keys.add(canonical);
  const properties = plainObject(data['properties']);
  for (const raw of Object.values(properties)) {
    for (const entry of asEntryList(raw)) {
      if (entry === null || typeof entry !== 'object') continue;
      const key = (entry as Record<string, unknown>)['value_key'];
      if (typeof key === 'string' && key !== '') keys.add(key);
    }
  }
  return [...keys];
}

/**
 * Keys lacking text in a locale, reported per missing locale as
 * `key (en)` / `key (fr)` — a key absent from both maps yields two
 * entries. Empty-string translations count as missing.
 */
export function missingTranslationsFor(
  keys: readonly string[],
  translations: AuditTranslations,
): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const en = translations.en[key];
    const fr = translations.fr[key];
    if (typeof en !== 'string' || en === '') out.push(`${key} (en)`);
    if (typeof fr !== 'string' || fr === '') out.push(`${key} (fr)`);
  }
  return out;
}

/**
 * Display string for one property entry — mirrors the client's
 * `summariseEntry` (EntityForm) / list renderings so the explorer's
 * client stays dumb: translated `value_key`, vocabulary labels for
 * enum/multi_enum (via the catalogue, never hardcoded), `number` with
 * its unit, boolean ✓/×, display names for entity/source refs. The
 * response carries ONE string per entry, resolved in `ctx.locale`
 * with the other locale as fallback (the caller re-fetches on locale
 * switch — cheaper than doubling every display in the payload).
 */
export function entryDisplay(
  entry: unknown,
  propertyType: PropertyTypeLike | undefined,
  ctx: Pick<AuditContext, 'translations' | 'vocabularies' | 'displayNameFor' | 'locale'>,
): string {
  const other: 'en' | 'fr' = ctx.locale === 'fr' ? 'en' : 'fr';
  if (entry === null || typeof entry !== 'object') {
    return entry === undefined || entry === null || entry === '' ? '—' : String(entry);
  }
  const record = entry as Record<string, unknown>;
  const key = record['value_key'];
  if (typeof key === 'string' && key !== '') {
    return ctx.translations[ctx.locale][key] ?? ctx.translations[other][key] ?? '—';
  }
  const raw = record['value'];
  const valueType = propertyType?.value_type;
  const enumRef = propertyType?.value_constraints?.enum_ref;
  const vocabLabelFor = (id: string): string => {
    if (enumRef === undefined) return id;
    const term = ctx.vocabularies.get(enumRef)?.values[id];
    return term?.labels[ctx.locale] ?? term?.labels[other] ?? id;
  };
  if (valueType === 'enum') {
    return raw === undefined || raw === null ? '—' : vocabLabelFor(String(raw));
  }
  if (valueType === 'multi_enum') {
    const ids = Array.isArray(raw) ? raw.map(String) : [];
    return ids.length === 0 ? '—' : ids.map(vocabLabelFor).join(', ');
  }
  if (valueType === 'boolean') {
    return raw === true ? '✓' : raw === false ? '×' : '—';
  }
  if (valueType === 'number') {
    if (typeof raw !== 'number') return '—';
    const formatted = raw.toLocaleString(ctx.locale);
    return propertyType?.unit !== undefined ? `${formatted} ${propertyType.unit}` : formatted;
  }
  if (valueType === 'entity_ref' || valueType === 'source_ref') {
    if (typeof raw !== 'string' || raw === '') return '—';
    const name = ctx.displayNameFor(raw);
    return name?.[ctx.locale] ?? name?.[other] ?? (raw.includes(':') ? raw.split(':')[1]! : raw);
  }
  return raw === undefined || raw === null || raw === '' ? '—' : String(raw);
}

/**
 * Compact per-type source abbreviations for provenance displays —
 * mirrors the dashboard form's `SOURCE_ABBR` ("C96 · E45"). Kept
 * server-side so `/api/audit` never ships a raw `type:slug` id as a
 * display string (2026-08 feedback: "ça affiche Alive
 * manga-chapter:1").
 */
const SOURCE_ABBR: Record<string, string> = {
  'manga-chapter': 'C',
  'anime-episode': 'E',
  film: 'F',
  sbs: 'SBS ',
  databook: 'DB ',
  'databook-card': 'VC ',
};

/**
 * Display string for one source id: `C{n}` / `E{n}` / … when the type
 * is a known source kind with a numeric slug, else the source's
 * display name, else the (abbr-prefixed) slug. NEVER the raw id.
 */
export function sourceIdDisplay(
  id: string,
  displayNameFor: (entityId: string) => AuditDisplayName | undefined,
  locale: 'en' | 'fr' = 'en',
): string {
  const sep = id.indexOf(':');
  const type = sep === -1 ? '' : id.slice(0, sep);
  const slug = sep === -1 ? id : id.slice(sep + 1);
  const abbr = SOURCE_ABBR[type];
  if (abbr !== undefined && /^\d+$/.test(slug)) return `${abbr}${slug}`;
  const name = displayNameFor(id);
  const display = locale === 'fr' ? name?.fr ?? name?.en : name?.en ?? name?.fr;
  if (display !== undefined && display !== null && display !== '') return display;
  return abbr !== undefined ? `${abbr}${slug}` : slug;
}

/** The entry's provenance (`since`) as ONE compact display string
 *  (each id resolved through `sourceDisplay`), or undefined. */
export function entrySince(
  entry: unknown,
  sourceDisplay: (id: string) => string,
): string | undefined {
  if (entry === null || typeof entry !== 'object') return undefined;
  const raw = (entry as Record<string, unknown>)['since'];
  const ids = typeof raw === 'string' && raw !== ''
    ? [raw]
    : Array.isArray(raw)
    ? raw.map(String).filter((s) => s !== '')
    : [];
  if (ids.length === 0) return undefined;
  return ids.map(sourceDisplay).join(' · ');
}

/** Machine-readable slice of one entry (see `AuditRawEntry`). */
export function entryRaw(entry: unknown): AuditRawEntry | undefined {
  if (entry === undefined || entry === null) return undefined;
  if (typeof entry !== 'object') return { value: entry };
  const record = entry as Record<string, unknown>;
  const out: { value?: unknown; value_key?: string; since?: string | readonly string[]; } = {};
  if ('value' in record) out.value = record['value'];
  const key = record['value_key'];
  if (typeof key === 'string' && key !== '') out.value_key = key;
  const since = record['since'];
  if (typeof since === 'string' && since !== '') out.since = since;
  else if (Array.isArray(since)) out.since = since.map(String);
  return 'value' in out || out.value_key !== undefined ? out : undefined;
}

/** One audit row for one loaded entity. */
export function buildAuditRow(
  entity: { readonly id: string; readonly type: string; readonly data: Record<string, unknown>; },
  ctx: AuditContext,
): AuditRow {
  const expectation = completenessExpectation(ctx.entityType);
  const properties = plainObject(entity.data['properties']);
  const sourceDisplay = (id: string): string => sourceIdDisplay(id, ctx.displayNameFor, ctx.locale);
  const values: AuditPropertyValues[] = Object.entries(properties).map(([property, rawList]) => {
    const propertyType = ctx.propertyTypes.get(property);
    const enumRef = propertyType?.value_constraints?.enum_ref;
    return {
      property,
      ...(propertyType !== undefined ? { valueType: propertyType.value_type } : {}),
      ...(enumRef !== undefined ? { enumRef } : {}),
      entries: asEntryList(rawList).map((entry) => {
        const since = entrySince(entry, sourceDisplay);
        const raw = entryRaw(entry);
        return {
          display: entryDisplay(entry, propertyType, ctx),
          ...(since !== undefined ? { since } : {}),
          ...(raw !== undefined ? { raw } : {}),
        };
      }),
    };
  });
  return {
    id: entity.id,
    type: entity.type,
    slug: String(entity.data['slug'] ?? ''),
    displayName: ctx.displayName,
    completeness: computeCompleteness(entity.data, expectation),
    missingRecommended: missingRecommendedFor(entity.data, expectation),
    missingTranslations: missingTranslationsFor(
      referencedI18nKeys(entity.data),
      ctx.translations,
    ),
    values,
  };
}
