/**
 * View-model assembly for the public reader app. Everything the pages
 * render is resolved HERE, server-side: localized entity names (via
 * the artifact's `translations` table), property/relation/vocabulary
 * labels (via the schema catalogue — never hardcoded, per CLAUDE.md),
 * relation direction labels (via the ADR-086 `label` column), and
 * narrative markdown. Components receive display-ready strings plus
 * link targets and implement zero business logic.
 */
import type {
  EntityType,
  PropertyType,
  RelationType,
  ValidatedCatalogue,
} from '@onepiece-wiki/schema-engine';
import { nameKeyFor } from '@onepiece-wiki/schemas';
import { getCatalogue } from './catalogue.ts';
// Namespace import on purpose: a mixed `import { type X, fn }` from
// this bun:sqlite-backed module had its VALUE specifiers dropped by
// the dev SSR transform (bindings came back undefined). The namespace
// form is transform-proof; keep type imports separate.
import * as db from './db.ts';
import type { EntityRow, PropertyRow } from './db.ts';

export type Locale = 'en' | 'fr';

// ---------------------------------------------------------------------------
// Shared shapes

/** A resolved, linkable reference to another entity. */
export type EntityChip = {
  readonly id: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly slug: string;
  readonly name: string;
};

export type LabelledValue = {
  readonly label: string;
  readonly value: string;
  /** Present when the qualifier value is itself an entity reference. */
  readonly chip?: EntityChip;
};

// ---------------------------------------------------------------------------
// Home

export type TypeSummary = {
  readonly id: string;
  readonly label: string;
  readonly count: number;
};

export type TypeGroup = {
  readonly id: string;
  readonly types: readonly TypeSummary[];
};

export type HomeView = {
  readonly groups: readonly TypeGroup[];
  readonly totalEntities: number;
};

// ---------------------------------------------------------------------------
// Type listing

export type EntityListItem = {
  readonly slug: string;
  readonly name: string;
  readonly subtitle: string | null;
};

export type TypeListView = {
  readonly type: string;
  readonly label: string;
  readonly items: readonly EntityListItem[];
};

// ---------------------------------------------------------------------------
// Entity detail

export type PropertyEntryView = {
  readonly display: string;
  readonly valueChip: EntityChip | null;
  readonly since: EntityChip | null;
  readonly until: EntityChip | null;
  /** Non-null when the entry's epistemic status is not plain truth. */
  readonly epistemic: { readonly status: string; readonly label: string; } | null;
  /** The concealed truth (`actual_value`), resolved, when present. */
  readonly actualDisplay: string | null;
  readonly event: EntityChip | null;
  readonly qualifiers: readonly LabelledValue[];
  readonly autoImported: boolean;
};

export type PropertyView = {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly PropertyEntryView[];
};

export type RelationItemView = {
  readonly target: EntityChip;
  readonly since: EntityChip | null;
  readonly epistemic: { readonly status: string; readonly label: string; } | null;
  readonly qualifiers: readonly LabelledValue[];
};

export type RelationGroupView = {
  readonly key: string;
  /** Direction label straight from the artifact's `label` column. */
  readonly label: string;
  /** true = materialized inverse row: the stored edge points AT this entity. */
  readonly inverse: boolean;
  readonly items: readonly RelationItemView[];
};

export type EntityView = {
  readonly id: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly slug: string;
  readonly name: string;
  readonly firstAppearance: EntityChip | null;
  readonly properties: readonly PropertyView[];
  readonly relations: readonly RelationGroupView[];
  readonly narrative: string | null;
};

// ---------------------------------------------------------------------------
// Label helpers

function pickLabel(labels: Record<string, string>, locale: Locale): string {
  return labels[locale] ?? labels['en'] ?? '';
}

function humanize(id: string): string {
  const spaced = id.replace(/[-_]+/g, ' ').trim();
  return spaced.length === 0 ? id : (spaced[0] ?? '').toUpperCase() + spaced.slice(1);
}

function entityTypeLabel(cat: ValidatedCatalogue, type: string, locale: Locale): string {
  const schema = cat.entityTypes.get(type);
  return schema === undefined ? humanize(type) : pickLabel(schema.labels, locale);
}

function vocabValueLabel(
  cat: ValidatedCatalogue,
  enumRef: string | undefined,
  value: string,
  locale: Locale,
): string {
  if (enumRef !== undefined) {
    const vocab = cat.vocabularies.get(enumRef);
    const entry = vocab?.values[value];
    if (entry !== undefined) return pickLabel(entry.labels, locale);
  }
  return humanize(value);
}

function epistemicView(
  cat: ValidatedCatalogue,
  status: string,
  locale: Locale,
): { status: string; label: string; } | null {
  if (status === 'true') return null;
  return { status, label: vocabValueLabel(cat, 'epistemic-statuses', status, locale) };
}

// ---------------------------------------------------------------------------
// Entity name resolution

function resolveEntityName(row: EntityRow, cat: ValidatedCatalogue, locale: Locale): string {
  const schema = cat.entityTypes.get(row.type);
  const key = row.canonical_name_key
    ?? nameKeyFor(row.data, schema?.display_name_properties ?? undefined);
  if (key !== null) {
    const translated = db.getTranslation(locale, key);
    if (translated !== null) return translated;
  }
  return humanize(row.slug);
}

function chipFor(id: string, cat: ValidatedCatalogue, locale: Locale): EntityChip | null {
  const row = db.getEntityById(id);
  if (row === null) return null;
  return {
    id: row.id,
    type: row.type,
    typeLabel: entityTypeLabel(cat, row.type, locale),
    slug: row.slug,
    name: resolveEntityName(row, cat, locale),
  };
}

/** Chip for a possibly-dangling reference: falls back to the raw id. */
function chipOrPlaceholder(id: string, cat: ValidatedCatalogue, locale: Locale): EntityChip {
  const chip = chipFor(id, cat, locale);
  if (chip !== null) return chip;
  const [type = '', slug = id] = id.includes(':') ? id.split(':', 2) : ['', id];
  return { id, type, typeLabel: humanize(type), slug, name: humanize(slug) };
}

// ---------------------------------------------------------------------------
// Value display

function formatNumber(value: number, schema: PropertyType | undefined, locale: Locale): string {
  const compact = schema?.ui_hint?.display_format === 'currency_short' && value >= 1_000_000;
  const options: Intl.NumberFormatOptions = compact
    ? { notation: 'compact', maximumFractionDigits: 1 }
    : {};
  const formatted = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', options)
    .format(value);
  const unit = schema?.unit;
  return unit === undefined ? formatted : `${formatted} ${humanize(unit)}`;
}

function formatDate(value: string, locale: Locale): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(parsed);
}

function displayScalar(
  raw: unknown,
  schema: PropertyType | undefined,
  cat: ValidatedCatalogue,
  locale: Locale,
): { display: string; chip: EntityChip | null; } {
  if (raw === null || raw === undefined) return { display: '—', chip: null };
  const valueType = schema?.value_type;
  if (typeof raw === 'number') {
    return { display: formatNumber(raw, schema, locale), chip: null };
  }
  if (typeof raw === 'boolean') {
    return {
      display: raw ? (locale === 'fr' ? 'Oui' : 'Yes') : locale === 'fr' ? 'Non' : 'No',
      chip: null,
    };
  }
  if (Array.isArray(raw)) {
    const parts = raw.map((v) => displayScalar(v, schema, cat, locale).display);
    return { display: parts.join(', '), chip: null };
  }
  if (typeof raw !== 'string') return { display: JSON.stringify(raw), chip: null };
  if (valueType === 'enum' || valueType === 'multi_enum') {
    const enumRef = schema?.value_constraints?.enum_ref;
    return { display: vocabValueLabel(cat, enumRef, raw, locale), chip: null };
  }
  if (valueType === 'date') return { display: formatDate(raw, locale), chip: null };
  if ((valueType === 'entity_ref' || valueType === 'source_ref') && raw.includes(':')) {
    const chip = chipOrPlaceholder(raw, cat, locale);
    return { display: chip.name, chip };
  }
  return { display: raw, chip: null };
}

/**
 * Resolve one historisable value payload (`{ value | value_key, … }`)
 * to display text. `value_key` goes through the translations table;
 * plain values go through the property type's value_type rules.
 */
function displayValue(
  payload: Record<string, unknown>,
  valueField: 'value' | 'actual_value',
  schema: PropertyType | undefined,
  cat: ValidatedCatalogue,
  locale: Locale,
): { display: string; chip: EntityChip | null; } | null {
  const key = payload[`${valueField}_key`];
  if (typeof key === 'string') {
    const translated = db.getTranslation(locale, key);
    return { display: translated ?? key, chip: null };
  }
  if (!(valueField in payload)) return null;
  return displayScalar(payload[valueField], schema, cat, locale);
}

// ---------------------------------------------------------------------------
// Qualifier display

/** Payload keys that are axes / handled specially, never generic qualifiers. */
const AXIS_KEYS = new Set([
  'value',
  'value_key',
  'actual_value',
  'actual_value_key',
  'since',
  'until',
  'source',
  'epistemic_status',
  'event',
  'canon_scope',
  'assisted_by',
  'review_status',
  'revealed_since',
]);

type QualifierDef = {
  readonly valueType: string | undefined;
  readonly enumRef: string | undefined;
};

function qualifierDefFor(
  id: string,
  local: readonly { id: string; value_type: string; enum_ref?: string | undefined; }[],
  cat: ValidatedCatalogue,
): QualifierDef {
  const own = local.find((q) => q.id === id);
  if (own !== undefined) return { valueType: own.value_type, enumRef: own.enum_ref };
  const registered = cat.qualifierTypes.get(id);
  if (registered !== undefined) {
    return { valueType: registered.value_type, enumRef: registered.enum_ref };
  }
  return { valueType: undefined, enumRef: undefined };
}

function qualifierLabel(id: string, cat: ValidatedCatalogue, locale: Locale): string {
  const registered = cat.qualifierTypes.get(id);
  return registered === undefined ? humanize(id) : pickLabel(registered.labels, locale);
}

function displayQualifierValue(
  raw: unknown,
  def: QualifierDef,
  cat: ValidatedCatalogue,
  locale: Locale,
): { value: string; chip?: EntityChip; } {
  if (Array.isArray(raw)) {
    return {
      value: raw.map((v) => displayQualifierValue(v, def, cat, locale).value).join(', '),
    };
  }
  if (typeof raw === 'boolean') {
    return { value: raw ? (locale === 'fr' ? 'Oui' : 'Yes') : locale === 'fr' ? 'Non' : 'No' };
  }
  if (typeof raw === 'number') return { value: String(raw) };
  if (typeof raw !== 'string') return { value: JSON.stringify(raw) };
  if (def.enumRef !== undefined) {
    return { value: vocabValueLabel(cat, def.enumRef, raw, locale) };
  }
  if (
    (def.valueType === 'entity_ref' || def.valueType === 'source_ref'
      || (def.valueType === undefined && /^[a-z0-9-]+:[a-z0-9-]+$/.test(raw)))
    && raw.includes(':')
  ) {
    const chip = chipFor(raw, cat, locale);
    if (chip !== null) return { value: chip.name, chip };
  }
  if (def.valueType === 'date') return { value: formatDate(raw, locale) };
  return { value: def.valueType === undefined ? humanize(raw) : raw };
}

function collectQualifiers(
  payload: Record<string, unknown>,
  local: readonly { id: string; value_type: string; enum_ref?: string | undefined; }[],
  cat: ValidatedCatalogue,
  locale: Locale,
): readonly LabelledValue[] {
  const out: LabelledValue[] = [];
  for (const [id, raw] of Object.entries(payload)) {
    if (AXIS_KEYS.has(id) || raw === null || raw === undefined) continue;
    const def = qualifierDefFor(id, local, cat);
    const { value, chip } = displayQualifierValue(raw, def, cat, locale);
    out.push({
      label: qualifierLabel(id, cat, locale),
      value,
      ...(chip !== undefined ? { chip } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Views

export async function buildHomeView(locale: Locale): Promise<HomeView> {
  const cat = await getCatalogue();
  const grouped = new Map<string, TypeSummary[]>();
  let total = 0;
  for (const row of db.listTypeCounts()) {
    total += row.count;
    const schema: EntityType | undefined = cat.entityTypes.get(row.type);
    const group = schema?.ui_hint?.group ?? 'other';
    const summary: TypeSummary = {
      id: row.type,
      label: entityTypeLabel(cat, row.type, locale),
      count: row.count,
    };
    const bucket = grouped.get(group);
    if (bucket === undefined) grouped.set(group, [summary]);
    else bucket.push(summary);
  }
  const groups: TypeGroup[] = [...grouped.entries()]
    .map(([id, types]) => ({
      id,
      types: [...types].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => {
      const countOf = (g: TypeGroup): number => g.types.reduce((sum, t) => sum + t.count, 0);
      return countOf(b) - countOf(a) || a.id.localeCompare(b.id);
    });
  return { groups, totalEntities: total };
}

export async function buildTypeListView(
  type: string,
  locale: Locale,
): Promise<TypeListView | null> {
  const cat = await getCatalogue();
  const rows = db.listEntitiesByType(type);
  if (rows.length === 0 && !cat.entityTypes.has(type)) return null;
  const items = rows
    .map((row) => ({
      slug: row.slug,
      name: resolveEntityName(row, cat, locale),
      subtitle: row.first_appearance_source === null
        ? null
        : chipFor(row.first_appearance_source, cat, locale)?.name ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { type, label: entityTypeLabel(cat, type, locale), items };
}

function buildPropertyViews(
  row: EntityRow,
  cat: ValidatedCatalogue,
  locale: Locale,
): readonly PropertyView[] {
  const typeSchema = cat.entityTypes.get(row.type);
  const declaredOrder = new Map<string, number>(
    (typeSchema?.properties ?? []).map((p, i) => [p.id, i]),
  );
  const byProperty = new Map<string, PropertyRow[]>();
  for (const prop of db.listProperties(row.id)) {
    const bucket = byProperty.get(prop.property_id);
    if (bucket === undefined) byProperty.set(prop.property_id, [prop]);
    else bucket.push(prop);
  }
  const views: PropertyView[] = [];
  for (const [propertyId, entries] of byProperty) {
    const schema = cat.propertyTypes.get(propertyId);
    const localQualifiers = schema?.allowed_qualifiers ?? [];
    views.push({
      id: propertyId,
      label: schema === undefined ? humanize(propertyId) : pickLabel(schema.labels, locale),
      entries: entries.map((entry): PropertyEntryView => {
        const value = displayValue(entry.value, 'value', schema, cat, locale);
        const actual = displayValue(entry.value, 'actual_value', schema, cat, locale);
        const reviewStatus = entry.value['review_status'];
        return {
          display: value?.display ?? '—',
          valueChip: value?.chip ?? null,
          since: entry.since_source === null ? null : chipFor(entry.since_source, cat, locale),
          until: entry.until_source === null ? null : chipFor(entry.until_source, cat, locale),
          epistemic: epistemicView(cat, entry.epistemic_status, locale),
          actualDisplay: actual?.display ?? null,
          event: entry.event_id === null ? null : chipFor(entry.event_id, cat, locale),
          qualifiers: collectQualifiers(entry.value, localQualifiers, cat, locale),
          autoImported: reviewStatus === 'auto_imported',
        };
      }),
    });
  }
  return views.sort((a, b) => {
    const ai = declaredOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = declaredOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.id.localeCompare(b.id);
  });
}

function buildRelationViews(
  row: EntityRow,
  cat: ValidatedCatalogue,
  locale: Locale,
): readonly RelationGroupView[] {
  const groups = new Map<string, {
    label: string;
    inverse: boolean;
    items: RelationItemView[];
  }>();
  for (const rel of db.listRelationsFrom(row.id)) {
    const baseType = rel.relation_type.replace(/\.inverse$/, '');
    const schema: RelationType | undefined = cat.relationTypes.get(baseType);
    // Direction label comes from the artifact's `label` column
    // (ADR-086: stored rows carry `active` labels, materialized
    // inverses carry `inverse` labels). Schema fallback for older DBs.
    const fallback = schema === undefined
      ? humanize(baseType)
      : rel.is_inferred
      ? (schema.labels[locale] ?? schema.labels.en).inverse
      : (schema.labels[locale] ?? schema.labels.en).active;
    const label = rel.label === null ? fallback : rel.label[locale] ?? rel.label['en'] ?? fallback;
    const item: RelationItemView = {
      target: chipOrPlaceholder(rel.target_entity_id, cat, locale),
      since: rel.since_source === null ? null : chipFor(rel.since_source, cat, locale),
      epistemic: epistemicView(cat, rel.epistemic_status, locale),
      qualifiers: rel.qualifiers === null
        ? []
        : collectQualifiers(rel.qualifiers, schema?.qualifiers ?? [], cat, locale),
    };
    const key = rel.relation_type;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, { label, inverse: rel.is_inferred, items: [item] });
    else bucket.items.push(item);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      inverse: group.inverse,
      items: [...group.items].sort((a, b) => a.target.name.localeCompare(b.target.name)),
    }))
    .sort((a, b) => Number(a.inverse) - Number(b.inverse) || a.label.localeCompare(b.label));
}

export async function buildEntityView(
  type: string,
  slug: string,
  locale: Locale,
): Promise<EntityView | null> {
  const cat = await getCatalogue();
  const row = db.getEntityBySlug(type, slug);
  if (row === null) return null;
  return {
    id: row.id,
    type: row.type,
    typeLabel: entityTypeLabel(cat, row.type, locale),
    slug: row.slug,
    name: resolveEntityName(row, cat, locale),
    firstAppearance: row.first_appearance_source === null
      ? null
      : chipFor(row.first_appearance_source, cat, locale),
    properties: buildPropertyViews(row, cat, locale),
    relations: buildRelationViews(row, cat, locale),
    narrative: db.getNarrative(row.id, locale),
  };
}
