/**
 * View-model assembly for the public wiki app. Everything the pages
 * render is resolved HERE, server-side: localized entity names (via
 * the artifact's `translations` table), property/relation/vocabulary
 * labels (via the schema catalogue — never hardcoded, per CLAUDE.md),
 * relation direction labels (via the ADR-086 `label` column), spoiler
 * gating against the reader's progression cursor (WEB_APP.md), canon
 * scope preference, per-type wiki templates (ADR-091 presentation
 * bindings, each degrading to the generic rendering), and narrative
 * markdown. Components receive display-ready strings plus link
 * targets and implement zero business logic.
 */
import type {
  EntityType,
  PropertyType,
  RelationType,
  ValidatedCatalogue,
} from '@onepiece-wiki/schema-engine';
import { entityRefItems, entityRefItemSources, nameKeyFor } from '@onepiece-wiki/schemas';
import { getCatalogue } from './catalogue.ts';
// Namespace import on purpose: a mixed `import { type X, fn }` from
// this bun:sqlite-backed module had its VALUE specifiers dropped by
// the dev SSR transform (bindings came back undefined). The namespace
// form is transform-proof; keep type imports separate.
import * as db from './db.ts';
import type { EntityRow, PropertyRow, RelationRow } from './db.ts';
import { type LinkTemplateEntry, resolveAvailabilityUrl } from './links.ts';
import { cursorActive, EMPTY_CURSOR, isSourceVisible, type ProgressCursor } from './progress.ts';

export type Locale = 'en' | 'fr';
export type { ProgressCursor };
export { EMPTY_CURSOR };

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

/** A spoiler-checked, display-ready image slot. */
export type ImageView = {
  readonly url: string;
  readonly alt: string;
  readonly attribution: string | null;
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
  readonly until: EntityChip | null;
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

/** One infobox line: a property's latest spoiler-visible value. */
export type InfoboxRowView = {
  readonly id: string;
  readonly label: string;
  readonly entry: PropertyEntryView;
};

/** One infobox line built from relation edges (e.g. devil fruit, captain). */
export type InfoboxRelationRowView = {
  readonly key: string;
  readonly label: string;
  readonly chips: readonly EntityChip[];
};

// ---------------------------------------------------------------------------
// Per-type templates (ADR-091)

/** A linked entity with an optional portrait and a short note (role…). */
export type MemberThumbView = {
  readonly chip: EntityChip;
  readonly image: ImageView | null;
  readonly note: string | null;
};

export type MemberRowView = {
  readonly chip: EntityChip;
  readonly image: ImageView | null;
  readonly role: string | null;
  readonly rank: string | null;
  readonly since: EntityChip | null;
  readonly until: EntityChip | null;
};

export type CrewSectionView = {
  readonly crew: EntityChip;
  readonly label: string;
  readonly role: string | null;
  readonly rank: string | null;
  /** The OTHER members of the same crew, for the affiliation section. */
  readonly members: readonly MemberThumbView[];
};

export type SourceItemView = {
  readonly chip: EntityChip;
  readonly number: number | null;
  readonly current: boolean;
};

export type CastGroupView = {
  readonly type: string;
  readonly typeLabel: string;
  readonly items: readonly MemberThumbView[];
};

export type AvailabilityItemView = {
  readonly platform: EntityChip;
  readonly url: string | null;
};

export type CharacterTemplateView = {
  readonly kind: 'character';
  readonly crews: readonly CrewSectionView[];
};

export type CrewTemplateView = {
  readonly kind: 'crew';
  readonly members: readonly MemberRowView[];
  readonly former: readonly MemberRowView[];
};

export type SourceTemplateView = {
  readonly kind: 'source';
  readonly number: number | null;
  readonly prev: EntityChip | null;
  readonly next: EntityChip | null;
  readonly arc:
    | {
      readonly chip: EntityChip;
      readonly label: string;
      readonly items: readonly SourceItemView[];
    }
    | null;
  readonly cast: readonly CastGroupView[];
  readonly availability: readonly AvailabilityItemView[];
};

export type ArcTemplateView = {
  readonly kind: 'arc';
  readonly chapters: readonly SourceItemView[];
  readonly episodes: readonly SourceItemView[];
  readonly arcs: readonly SourceItemView[];
};

export type FruitTemplateView = {
  readonly kind: 'devil-fruit';
  readonly users: readonly MemberRowView[];
  readonly former: readonly MemberRowView[];
};

export type GenericTemplateView = { readonly kind: 'generic'; };

export type TemplateView =
  | CharacterTemplateView
  | CrewTemplateView
  | SourceTemplateView
  | ArcTemplateView
  | FruitTemplateView
  | GenericTemplateView;

export type EntityView = {
  readonly kind: 'entity';
  readonly id: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly slug: string;
  readonly name: string;
  readonly firstAppearance: EntityChip | null;
  readonly image: ImageView | null;
  readonly infobox: readonly InfoboxRowView[];
  readonly infoboxRelations: readonly InfoboxRelationRowView[];
  readonly properties: readonly PropertyView[];
  readonly relations: readonly RelationGroupView[];
  readonly narrative: string | null;
  readonly template: TemplateView;
  /** The canon scope to attach to outgoing entity links (`?scope=`). */
  readonly propagateScope: string | null;
};

/**
 * "Not yet in your progression": the reader's cursor is behind every
 * appearance anchor of this entity — show the name, withhold the data.
 */
export type GatedEntityView = {
  readonly kind: 'gated';
  readonly type: string;
  readonly typeLabel: string;
  readonly slug: string;
  readonly name: string;
};

export type EntityPageView = EntityView | GatedEntityView;

// ---------------------------------------------------------------------------
// Presentation bindings (ADR-091) — every binding degrades to the
// generic template when the id is absent from the catalogue or data.

const LIVE_ACTION_SCOPE = 'live_action';
const LIVE_ACTION_TYPES: ReadonlySet<string> = new Set([
  'live-action-series',
  'live-action-episode',
]);
/** Default-scope preference: unqualified + these canon scopes. */
const DEFAULT_SCOPES: ReadonlySet<string> = new Set(['manga', 'anime']);
/** depicted-by role ranking for the infobox portrait slot. */
const ROLE_PRIORITY: Readonly<Record<string, number>> = {
  primary_portrait: 0,
  cover: 1,
  group_photo: 2,
  secondary_portrait: 3,
};
/** Relation ids surfaced as infobox rows, per entity type. */
const INFOBOX_RELATIONS: Readonly<Record<string, readonly string[]>> = {
  character: ['ate-fruit'],
  crew: ['captained-by', 'led-by'],
  organization: ['captained-by', 'led-by'],
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

function chipForRow(row: EntityRow, cat: ValidatedCatalogue, locale: Locale): EntityChip {
  return {
    id: row.id,
    type: row.type,
    typeLabel: entityTypeLabel(cat, row.type, locale),
    slug: row.slug,
    name: resolveEntityName(row, cat, locale),
  };
}

function chipFor(id: string, cat: ValidatedCatalogue, locale: Locale): EntityChip | null {
  const row = db.getEntityById(id);
  return row === null ? null : chipForRow(row, cat, locale);
}

/** Chip for a possibly-dangling reference: falls back to the raw id. */
function chipOrPlaceholder(id: string, cat: ValidatedCatalogue, locale: Locale): EntityChip {
  const chip = chipFor(id, cat, locale);
  if (chip !== null) return chip;
  const [type = '', slug = id] = id.includes(':') ? id.split(':', 2) : ['', id];
  return { id, type, typeLabel: humanize(type), slug, name: humanize(slug) };
}

// ---------------------------------------------------------------------------
// Raw-data helpers (structural reads of well-known property shapes)

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** All entries of one property from an entity's raw data blob. */
function rawPropertyEntries(
  row: EntityRow,
  propertyId: string,
): readonly Record<string, unknown>[] {
  const properties = row.data['properties'];
  if (!isRecord(properties)) return [];
  const raw = properties[propertyId];
  if (raw === null || raw === undefined) return [];
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries.filter(isRecord);
}

/** Latest spoiler-visible scalar `value` of a property, or null. */
function latestRawValue(
  row: EntityRow,
  propertyId: string,
  cursor: ProgressCursor,
): unknown {
  const entries = rawPropertyEntries(row, propertyId).filter((entry) => {
    const since = entry['since'];
    return typeof since === 'string' ? isSourceVisible(since, cursor) : true;
  });
  const last = entries[entries.length - 1];
  return last === undefined ? null : last['value'] ?? null;
}

function readNumber(row: EntityRow, cursor: ProgressCursor): number | null {
  const value = latestRawValue(row, 'number', cursor);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

type LocalQualifier = { id: string; value_type: string; enum_ref?: string | undefined; };

function qualifierDefFor(
  id: string,
  local: readonly LocalQualifier[],
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
  // ADR-096 — `believed_by` / `known_truth_by` items may carry per-item
  // provenance as `{ target, source? }`. Resolve the target as usual
  // and append the source name(s) in parentheses ("Luffy (Chapter 585)").
  if (raw !== null && typeof raw === 'object') {
    const [item] = entityRefItems([raw]);
    if (item !== undefined) {
      const head = displayQualifierValue(item.target, def, cat, locale);
      const sources = entityRefItemSources(item);
      if (sources.length === 0) return head;
      const names = sources.map((s) => chipFor(s, cat, locale)?.name ?? s).join(', ');
      return { ...head, value: `${head.value} (${names})` };
    }
  }
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
  local: readonly LocalQualifier[],
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

/** Localized label of one enum-ish qualifier on a relation edge. */
function edgeQualifierLabel(
  edge: RelationRow,
  qualifierId: string,
  schema: RelationType | undefined,
  cat: ValidatedCatalogue,
  locale: Locale,
): string | null {
  const raw = edge.qualifiers?.[qualifierId];
  if (raw === null || raw === undefined) return null;
  const def = qualifierDefFor(qualifierId, schema?.qualifiers ?? [], cat);
  return displayQualifierValue(raw, def, cat, locale).value;
}

// ---------------------------------------------------------------------------
// Spoiler + canon-scope filtering

/** Property entry kept after filtering, with reveal-safety metadata. */
type FilteredEntry = {
  readonly row: PropertyRow;
  /** A later entry of the same property is visible under the cursor. */
  readonly hasLaterVisible: boolean;
};

function entryCanonScope(entry: PropertyRow): string | null {
  const raw = entry.value['canon_scope'];
  return typeof raw === 'string' ? raw : null;
}

/**
 * Apply the spoiler cursor then the canon-scope rule to one property's
 * entry list (WEB_APP.md): entries anchored beyond the cursor are
 * dropped; entries scoped to a DIFFERENT canon scope than the active
 * one are dropped from the page (default scope = unqualified +
 * manga/anime).
 */
function filterPropertyEntries(
  entries: readonly PropertyRow[],
  cursor: ProgressCursor,
  scope: string | null,
): readonly FilteredEntry[] {
  const visible = entries.filter((entry) => {
    if (!isSourceVisible(entry.since_source, cursor)) return false;
    const entryScope = entryCanonScope(entry);
    if (entryScope === null) return true;
    return scope === null ? DEFAULT_SCOPES.has(entryScope) : entryScope === scope;
  });
  return visible.map((row) => ({
    row,
    hasLaterVisible: visible.some((other) => other.entry_index > row.entry_index),
  }));
}

/**
 * Latest entry for the infobox: entries qualified with the active
 * scope win over unqualified ones; otherwise the last visible entry.
 */
function latestForInfobox(
  entries: readonly FilteredEntry[],
  scope: string | null,
): FilteredEntry | null {
  if (scope !== null) {
    const scoped = entries.filter((e) => entryCanonScope(e.row) === scope);
    const lastScoped = scoped[scoped.length - 1];
    if (lastScoped !== undefined) return lastScoped;
  }
  return entries[entries.length - 1] ?? null;
}

/**
 * A relation edge is visible when its `since` anchor is within the
 * cursor AND its target is not itself a beyond-cursor source entity
 * (a chapter you have not read must not surface through edges).
 */
function isEdgeVisible(edge: RelationRow, cursor: ProgressCursor): boolean {
  return isSourceVisible(edge.since_source, cursor)
    && isSourceVisible(edge.target_entity_id, cursor);
}

/** `until` anchor reached: the relation visibly ended for this reader. */
function edgeEnded(edge: RelationRow, cursor: ProgressCursor): boolean {
  return edge.until_source !== null && isSourceVisible(edge.until_source, cursor);
}

// ---------------------------------------------------------------------------
// Images (depicted-by → image entities, spoiler + scope aware)

function imageOrigin(image: EntityRow): string | null {
  const value = latestRawValue(image, 'source_origin', EMPTY_CURSOR);
  return typeof value === 'string' ? value : null;
}

function buildImageView(
  image: EntityRow,
  cursor: ProgressCursor,
  locale: Locale,
  fallbackAlt: string,
): ImageView | null {
  const urls = rawPropertyEntries(image, 'url').filter((entry) => {
    const since = entry['since'];
    return typeof since === 'string' ? isSourceVisible(since, cursor) : true;
  });
  const url = urls[urls.length - 1]?.['value'];
  if (typeof url !== 'string' || url === '') return null;
  const altKeyEntry = rawPropertyEntries(image, 'alt_text_key')[0]?.['value_key'];
  const alt = typeof altKeyEntry === 'string'
    ? db.getTranslation(locale, altKeyEntry) ?? fallbackAlt
    : fallbackAlt;
  const attribution = latestRawValue(image, 'attribution', cursor);
  return {
    url,
    alt,
    attribution: typeof attribution === 'string' ? attribution : null,
  };
}

/**
 * Pick the entity's display image among its `depicted-by` targets:
 * spoiler-hidden images (`spoiler_since` beyond cursor) are excluded,
 * the active canon scope steers `source_origin` preference
 * (live_action scope prefers live_action origins; default prefers
 * everything else), then the depiction `role` ranks candidates.
 * Null = no visible image (the UI renders a typographic placeholder).
 */
function resolveEntityImage(
  row: EntityRow,
  edges: readonly RelationRow[],
  cursor: ProgressCursor,
  scope: string | null,
  locale: Locale,
  name: string,
): ImageView | null {
  type Candidate = { view: ImageView; originScore: number; roleScore: number; };
  const candidates: Candidate[] = [];
  for (const edge of edges) {
    if (edge.relation_type !== 'depicted-by') continue;
    if (!isSourceVisible(edge.since_source, cursor)) continue;
    const image = db.getEntityById(edge.target_entity_id);
    if (image === null) continue;
    const spoilerSince = latestRawValue(image, 'spoiler_since', EMPTY_CURSOR);
    if (typeof spoilerSince === 'string' && !isSourceVisible(spoilerSince, cursor)) continue;
    const view = buildImageView(image, cursor, locale, name);
    if (view === null) continue;
    const origin = imageOrigin(image);
    const originScore = scope === LIVE_ACTION_SCOPE
      ? (origin === LIVE_ACTION_SCOPE ? 0 : 1)
      : (origin === LIVE_ACTION_SCOPE ? 1 : 0);
    const role = edge.qualifiers?.['role'];
    const roleScore = typeof role === 'string' ? ROLE_PRIORITY[role] ?? 4 : 5;
    candidates.push({ view, originScore, roleScore });
  }
  candidates.sort((a, b) => a.originScore - b.originScore || a.roleScore - b.roleScore);
  return candidates[0]?.view ?? null;
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

function buildEntryView(
  entry: FilteredEntry,
  schema: PropertyType | undefined,
  localQualifiers: readonly LocalQualifier[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): PropertyEntryView {
  const value = displayValue(entry.row.value, 'value', schema, cat, locale);
  // Epistemic non-leak (WEB_APP.md § spoiler gating, rule 4): with an
  // active cursor, the concealed truth (`actual_value`) is shown only
  // once the revealing entry — by construction a LATER entry — is
  // itself visible. Without a cursor the wiki default shows all.
  const revealSafe = !cursorActive(cursor) || entry.hasLaterVisible;
  const actual = revealSafe
    ? displayValue(entry.row.value, 'actual_value', schema, cat, locale)
    : null;
  const reviewStatus = entry.row.value['review_status'];
  return {
    display: value?.display ?? '—',
    valueChip: value?.chip ?? null,
    since: entry.row.since_source === null ? null : chipFor(entry.row.since_source, cat, locale),
    until: entry.row.until_source === null ? null : chipFor(entry.row.until_source, cat, locale),
    epistemic: epistemicView(cat, entry.row.epistemic_status, locale),
    actualDisplay: actual?.display ?? null,
    event: entry.row.event_id === null ? null : chipFor(entry.row.event_id, cat, locale),
    qualifiers: collectQualifiers(entry.row.value, localQualifiers, cat, locale),
    autoImported: reviewStatus === 'auto_imported',
  };
}

function buildPropertyViews(
  row: EntityRow,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
): { properties: readonly PropertyView[]; infobox: readonly InfoboxRowView[]; } {
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
  const infobox: InfoboxRowView[] = [];
  for (const [propertyId, entries] of byProperty) {
    const schema = cat.propertyTypes.get(propertyId);
    const localQualifiers = schema?.allowed_qualifiers ?? [];
    const filtered = filterPropertyEntries(entries, cursor, scope);
    if (filtered.length === 0) continue;
    const label = schema === undefined ? humanize(propertyId) : pickLabel(schema.labels, locale);
    views.push({
      id: propertyId,
      label,
      entries: filtered.map((entry) =>
        buildEntryView(entry, schema, localQualifiers, cat, locale, cursor)
      ),
    });
    const latest = latestForInfobox(filtered, scope);
    if (latest !== null) {
      infobox.push({
        id: propertyId,
        label,
        entry: buildEntryView(latest, schema, localQualifiers, cat, locale, cursor),
      });
    }
  }
  const order = (id: string): number => declaredOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  const byOrder = (a: { id: string; }, b: { id: string; }): number =>
    order(a.id) - order(b.id) || a.id.localeCompare(b.id);
  return { properties: views.sort(byOrder), infobox: infobox.sort(byOrder) };
}

function buildRelationViews(
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
  consumed: ReadonlySet<string>,
): readonly RelationGroupView[] {
  const groups = new Map<string, {
    label: string;
    inverse: boolean;
    items: RelationItemView[];
  }>();
  for (const rel of edges) {
    if (consumed.has(rel.relation_type)) continue;
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
      until: rel.until_source === null ? null : chipFor(rel.until_source, cat, locale),
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

// ---------------------------------------------------------------------------
// Template builders (each degrades to `generic` when data is missing)

function resolveEdgeLabel(edge: RelationRow, cat: ValidatedCatalogue, locale: Locale): string {
  if (edge.label !== null) {
    const fromArtifact = edge.label[locale] ?? edge.label['en'];
    if (fromArtifact !== undefined) return fromArtifact;
  }
  const baseType = edge.relation_type.replace(/\.inverse$/, '');
  const schema = cat.relationTypes.get(baseType);
  if (schema === undefined) return humanize(baseType);
  const pair = schema.labels[locale] ?? schema.labels.en;
  return edge.is_inferred ? pair.inverse : pair.active;
}

function memberThumb(
  target: EntityRow,
  note: string | null,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
): MemberThumbView {
  const chip = chipForRow(target, cat, locale);
  return {
    chip,
    image: resolveEntityImage(
      target,
      db.listRelationsFrom(target.id),
      cursor,
      scope,
      locale,
      chip.name,
    ),
    note,
  };
}

function memberRow(
  edge: RelationRow,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
): MemberRowView | null {
  const target = db.getEntityById(edge.target_entity_id);
  if (target === null) return null;
  const chip = chipForRow(target, cat, locale);
  const schema = cat.relationTypes.get(edge.relation_type.replace(/\.inverse$/, ''));
  return {
    chip,
    image: resolveEntityImage(
      target,
      db.listRelationsFrom(target.id),
      cursor,
      scope,
      locale,
      chip.name,
    ),
    role: edgeQualifierLabel(edge, 'role', schema, cat, locale),
    rank: edgeQualifierLabel(edge, 'held_rank', schema, cat, locale),
    since: edge.since_source === null ? null : chipFor(edge.since_source, cat, locale),
    until: edge.until_source === null || !isSourceVisible(edge.until_source, cursor)
      ? null
      : chipFor(edge.until_source, cat, locale),
  };
}

function buildCharacterTemplate(
  row: EntityRow,
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
): CharacterTemplateView {
  const crews: CrewSectionView[] = [];
  for (const edge of edges) {
    if (edge.relation_type !== 'member-of') continue;
    const crewRow = db.getEntityById(edge.target_entity_id);
    if (crewRow === null) continue;
    const schema = cat.relationTypes.get('member-of');
    const members: MemberThumbView[] = [];
    for (const memberEdge of db.listRelationsFrom(crewRow.id)) {
      if (memberEdge.relation_type !== 'member-of.inverse') continue;
      if (memberEdge.target_entity_id === row.id) continue;
      if (!isEdgeVisible(memberEdge, cursor)) continue;
      const target = db.getEntityById(memberEdge.target_entity_id);
      if (target === null) continue;
      members.push(memberThumb(
        target,
        edgeQualifierLabel(memberEdge, 'role', schema, cat, locale),
        cat,
        locale,
        cursor,
        scope,
      ));
    }
    crews.push({
      crew: chipForRow(crewRow, cat, locale),
      label: resolveEdgeLabel(edge, cat, locale),
      role: edgeQualifierLabel(edge, 'role', schema, cat, locale),
      rank: edgeQualifierLabel(edge, 'held_rank', schema, cat, locale),
      members: members.sort((a, b) => a.chip.name.localeCompare(b.chip.name)),
    });
  }
  return { kind: 'character', crews };
}

function splitCurrentFormer(
  edges: readonly RelationRow[],
  relationType: string,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
): { current: MemberRowView[]; former: MemberRowView[]; } {
  const current: MemberRowView[] = [];
  const former: MemberRowView[] = [];
  for (const edge of edges) {
    if (edge.relation_type !== relationType) continue;
    const view = memberRow(edge, cat, locale, cursor, scope);
    if (view === null) continue;
    (edgeEnded(edge, cursor) ? former : current).push(view);
  }
  const byName = (a: MemberRowView, b: MemberRowView): number =>
    a.chip.name.localeCompare(b.chip.name);
  return { current: current.sort(byName), former: former.sort(byName) };
}

function buildCrewTemplate(
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
): CrewTemplateView {
  const { current, former } = splitCurrentFormer(
    edges,
    'member-of.inverse',
    cat,
    locale,
    cursor,
    scope,
  );
  return { kind: 'crew', members: current, former };
}

function buildFruitTemplate(
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
): FruitTemplateView {
  const { current, former } = splitCurrentFormer(
    edges,
    'ate-fruit.inverse',
    cat,
    locale,
    cursor,
    scope,
  );
  return { kind: 'devil-fruit', users: current, former };
}

function sourceItem(
  target: EntityRow,
  currentId: string,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): SourceItemView {
  return {
    chip: chipForRow(target, cat, locale),
    number: readNumber(target, cursor),
    current: target.id === currentId,
  };
}

const byNumber = (a: SourceItemView, b: SourceItemView): number =>
  (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER)
  || a.chip.name.localeCompare(b.chip.name);

/** Siblings of one relation-inverse type on a container entity. */
function containedSources(
  containerId: string,
  inverseType: string,
  targetType: string | null,
  currentId: string,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): SourceItemView[] {
  const items: SourceItemView[] = [];
  for (const edge of db.listRelationsFrom(containerId)) {
    if (edge.relation_type !== inverseType) continue;
    if (!isEdgeVisible(edge, cursor)) continue;
    const target = db.getEntityById(edge.target_entity_id);
    if (target === null) continue;
    if (targetType !== null && target.type !== targetType) continue;
    items.push(sourceItem(target, currentId, cat, locale, cursor));
  }
  return items.sort(byNumber);
}

/** Prev/next same-type source by numeric slug suffix (WEB_APP.md). */
function adjacentSource(
  row: EntityRow,
  delta: number,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): EntityChip | null {
  const match = /^(.*?)(\d+)$/.exec(row.slug);
  if (match === null) return null;
  const [, prefix = '', digits = ''] = match;
  const n = Number(digits) + delta;
  if (n < 0) return null;
  const sibling = db.getEntityBySlug(row.type, `${prefix}${n}`);
  if (sibling === null) return null;
  if (!isSourceVisible(sibling.id, cursor)) return null;
  return chipForRow(sibling, cat, locale);
}

function buildAvailability(
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): AvailabilityItemView[] {
  const items: AvailabilityItemView[] = [];
  for (const edge of edges) {
    if (edge.relation_type !== 'available-on') continue;
    const platform = db.getEntityById(edge.target_entity_id);
    if (platform === null) continue;
    const templates: LinkTemplateEntry[] = rawPropertyEntries(platform, 'link_template')
      .filter((entry) => typeof entry['value'] === 'string')
      .map((entry) => ({
        template: entry['value'] as string,
        region: typeof entry['region'] === 'string' ? entry['region'] : null,
      }));
    const homepage = latestRawValue(platform, 'homepage_url', cursor);
    const urlOverride = edge.qualifiers?.['url'];
    const externalId = edge.qualifiers?.['external_id'];
    items.push({
      platform: chipForRow(platform, cat, locale),
      url: resolveAvailabilityUrl({
        locale,
        urlOverride: typeof urlOverride === 'string' ? urlOverride : null,
        externalId: typeof externalId === 'string' ? externalId : null,
        templates,
        homepage: typeof homepage === 'string' ? homepage : null,
      }),
    });
  }
  return items.sort((a, b) => a.platform.name.localeCompare(b.platform.name));
}

function buildCast(
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
): CastGroupView[] {
  const groups = new Map<string, { typeLabel: string; items: MemberThumbView[]; }>();
  for (const edge of edges) {
    if (edge.relation_type !== 'features') continue;
    const target = db.getEntityById(edge.target_entity_id);
    if (target === null) continue;
    const schema = cat.relationTypes.get('features');
    const note = edgeQualifierLabel(edge, 'appearance_type', schema, cat, locale);
    const thumb = memberThumb(target, note, cat, locale, cursor, scope);
    const bucket = groups.get(target.type);
    if (bucket === undefined) {
      groups.set(target.type, {
        typeLabel: entityTypeLabel(cat, target.type, locale),
        items: [thumb],
      });
    } else bucket.items.push(thumb);
  }
  return [...groups.entries()].map(([type, group]) => ({
    type,
    typeLabel: group.typeLabel,
    items: group.items.sort((a, b) => a.chip.name.localeCompare(b.chip.name)),
  })).sort((a, b) => b.items.length - a.items.length || a.typeLabel.localeCompare(b.typeLabel));
}

function buildSourceTemplate(
  row: EntityRow,
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
): SourceTemplateView {
  let arc: SourceTemplateView['arc'] = null;
  const arcEdge = edges.find((edge) =>
    edge.relation_type === 'part-of-arc' || edge.relation_type === 'occurs-during-arc'
  );
  if (arcEdge !== undefined) {
    const arcRow = db.getEntityById(arcEdge.target_entity_id);
    if (arcRow !== null) {
      arc = {
        chip: chipForRow(arcRow, cat, locale),
        label: resolveEdgeLabel(arcEdge, cat, locale),
        items: containedSources(
          arcRow.id,
          'part-of-arc.inverse',
          row.type,
          row.id,
          cat,
          locale,
          cursor,
        ),
      };
    }
  }
  return {
    kind: 'source',
    number: readNumber(row, cursor),
    prev: adjacentSource(row, -1, cat, locale, cursor),
    next: adjacentSource(row, 1, cat, locale, cursor),
    arc,
    cast: buildCast(edges, cat, locale, cursor, scope),
    availability: buildAvailability(edges, cat, locale, cursor),
  };
}

function buildArcTemplate(
  row: EntityRow,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): ArcTemplateView {
  return {
    kind: 'arc',
    chapters: containedSources(
      row.id,
      'part-of-arc.inverse',
      'manga-chapter',
      row.id,
      cat,
      locale,
      cursor,
    ),
    episodes: containedSources(
      row.id,
      'part-of-arc.inverse',
      'anime-episode',
      row.id,
      cat,
      locale,
      cursor,
    ),
    arcs: containedSources(row.id, 'part-of-saga.inverse', 'arc', row.id, cat, locale, cursor),
  };
}

/** Relation type keys a template consumed — excluded from the generic
 *  connection groups so sections do not repeat. `depicted-by` always
 *  feeds the infobox portrait slot. */
function consumedRelationKeys(row: EntityRow, template: TemplateView): ReadonlySet<string> {
  const consumed = new Set<string>(['depicted-by']);
  for (const key of INFOBOX_RELATIONS[row.type] ?? []) consumed.add(key);
  switch (template.kind) {
    case 'character':
      consumed.add('member-of');
      break;
    case 'crew':
      consumed.add('member-of.inverse');
      break;
    case 'source':
      consumed.add('part-of-arc');
      consumed.add('occurs-during-arc');
      consumed.add('features');
      consumed.add('available-on');
      break;
    case 'arc':
      consumed.add('part-of-arc.inverse');
      consumed.add('part-of-saga.inverse');
      break;
    case 'devil-fruit':
      consumed.add('ate-fruit.inverse');
      break;
    case 'generic':
      break;
  }
  return consumed;
}

function buildTemplate(
  row: EntityRow,
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
): TemplateView {
  switch (row.type) {
    case 'character':
      return buildCharacterTemplate(row, edges, cat, locale, cursor, scope);
    case 'crew':
    case 'organization':
      return buildCrewTemplate(edges, cat, locale, cursor, scope);
    case 'manga-chapter':
    case 'anime-episode':
      return buildSourceTemplate(row, edges, cat, locale, cursor, scope);
    case 'arc':
    case 'saga':
      return buildArcTemplate(row, cat, locale, cursor);
    case 'devil-fruit':
      return buildFruitTemplate(edges, cat, locale, cursor, scope);
    default:
      return { kind: 'generic' };
  }
}

function buildInfoboxRelations(
  row: EntityRow,
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
): readonly InfoboxRelationRowView[] {
  const rows: InfoboxRelationRowView[] = [];
  for (const key of INFOBOX_RELATIONS[row.type] ?? []) {
    const matching = edges.filter((edge) => edge.relation_type === key);
    const first = matching[0];
    if (first === undefined) continue;
    rows.push({
      key,
      label: resolveEdgeLabel(first, cat, locale),
      chips: matching.map((edge) => chipOrPlaceholder(edge.target_entity_id, cat, locale)),
    });
  }
  return rows;
}

/** The canon scope outgoing links should carry (WEB_APP.md § scope). */
function scopeToPropagate(
  row: EntityRow,
  cursor: ProgressCursor,
  incoming: string | null,
): string | null {
  if (LIVE_ACTION_TYPES.has(row.type)) return LIVE_ACTION_SCOPE;
  const canonScope = latestRawValue(row, 'canon_scope', cursor);
  if (canonScope === LIVE_ACTION_SCOPE) return LIVE_ACTION_SCOPE;
  return incoming;
}

export async function buildEntityView(
  type: string,
  slug: string,
  locale: Locale,
  cursor: ProgressCursor = EMPTY_CURSOR,
  scope: string | null = null,
): Promise<EntityPageView | null> {
  const cat = await getCatalogue();
  const row = db.getEntityBySlug(type, slug);
  if (row === null) return null;
  const typeLabel = entityTypeLabel(cat, row.type, locale);
  const name = resolveEntityName(row, cat, locale);

  // Progression gate (WEB_APP.md rule 3): when every appearance anchor
  // sits beyond the cursor — or the entity IS a beyond-cursor source
  // (a chapter you have not reached) — show the name and withhold
  // everything else.
  if (
    !isSourceVisible(row.id, cursor)
    || (row.first_appearance_source !== null
      && !isSourceVisible(row.first_appearance_source, cursor))
  ) {
    return { kind: 'gated', type: row.type, typeLabel, slug: row.slug, name };
  }

  const edges = db.listRelationsFrom(row.id).filter((edge) => isEdgeVisible(edge, cursor));
  const template = buildTemplate(row, edges, cat, locale, cursor, scope);
  const consumed = consumedRelationKeys(row, template);
  const { properties, infobox } = buildPropertyViews(row, cat, locale, cursor, scope);
  return {
    kind: 'entity',
    id: row.id,
    type: row.type,
    typeLabel,
    slug: row.slug,
    name,
    firstAppearance: row.first_appearance_source === null
      ? null
      : chipFor(row.first_appearance_source, cat, locale),
    image: resolveEntityImage(row, edges, cursor, scope, locale, name),
    infobox,
    infoboxRelations: buildInfoboxRelations(row, edges, cat, locale),
    properties,
    relations: buildRelationViews(edges, cat, locale, consumed),
    narrative: db.getNarrative(row.id, locale),
    template,
    propagateScope: scopeToPropagate(row, cursor, scope),
  };
}
