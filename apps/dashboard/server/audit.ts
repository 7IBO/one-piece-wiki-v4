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

export type AuditValueEntry = {
  readonly display: string;
  readonly since?: string;
};

export type AuditPropertyValues = {
  readonly property: string;
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
 * response carries ONE string per entry, resolved EN-first with FR
 * fallback (the display-name pair already covers the row title's
 * locale switch; per-value locale nuance isn't worth doubling the
 * payload).
 */
export function entryDisplay(
  entry: unknown,
  propertyType: PropertyTypeLike | undefined,
  ctx: Pick<AuditContext, 'translations' | 'vocabularies' | 'displayNameFor'>,
): string {
  if (entry === null || typeof entry !== 'object') {
    return entry === undefined || entry === null || entry === '' ? '—' : String(entry);
  }
  const record = entry as Record<string, unknown>;
  const key = record['value_key'];
  if (typeof key === 'string' && key !== '') {
    return ctx.translations.en[key] ?? ctx.translations.fr[key] ?? '—';
  }
  const raw = record['value'];
  const valueType = propertyType?.value_type;
  const enumRef = propertyType?.value_constraints?.enum_ref;
  const vocabLabelFor = (id: string): string => {
    if (enumRef === undefined) return id;
    const term = ctx.vocabularies.get(enumRef)?.values[id];
    return term?.labels.en ?? term?.labels.fr ?? id;
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
    const formatted = raw.toLocaleString('en');
    return propertyType?.unit !== undefined ? `${formatted} ${propertyType.unit}` : formatted;
  }
  if (valueType === 'entity_ref' || valueType === 'source_ref') {
    if (typeof raw !== 'string' || raw === '') return '—';
    const name = ctx.displayNameFor(raw);
    return name?.en ?? name?.fr ?? (raw.includes(':') ? raw.split(':')[1]! : raw);
  }
  return raw === undefined || raw === null || raw === '' ? '—' : String(raw);
}

/** The entry's provenance (`since`) as one string, or undefined. */
export function entrySince(entry: unknown): string | undefined {
  if (entry === null || typeof entry !== 'object') return undefined;
  const raw = (entry as Record<string, unknown>)['since'];
  if (typeof raw === 'string' && raw !== '') return raw;
  if (Array.isArray(raw)) {
    const ids = raw.map(String).filter((s) => s !== '');
    return ids.length > 0 ? ids.join(' · ') : undefined;
  }
  return undefined;
}

/** One audit row for one loaded entity. */
export function buildAuditRow(
  entity: { readonly id: string; readonly type: string; readonly data: Record<string, unknown>; },
  ctx: AuditContext,
): AuditRow {
  const expectation = completenessExpectation(ctx.entityType);
  const properties = plainObject(entity.data['properties']);
  const values: AuditPropertyValues[] = Object.entries(properties).map(([property, raw]) => ({
    property,
    entries: asEntryList(raw).map((entry) => {
      const since = entrySince(entry);
      return {
        display: entryDisplay(entry, ctx.propertyTypes.get(property), ctx),
        ...(since !== undefined ? { since } : {}),
      };
    }),
  }));
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
