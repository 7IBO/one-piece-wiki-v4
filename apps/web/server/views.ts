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
import {
  CURSOR_AXES,
  cursorActive,
  EMPTY_CURSOR,
  isDepartureVisible,
  isSourceVisible,
  type ProgressCursor,
} from './progress.ts';

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

/**
 * A spoiler-checked, display-ready image slot.
 *
 * It carries the FACTS about its own shape — the intrinsic pixel
 * dimensions the `image` entity declares, and the depiction `role`
 * that says what kind of picture it is. Turning those into an aspect
 * ratio is a presentation decision and lives in
 * `src/lib/image-ratio.ts`; both are null far more often than not, and
 * every consumer degrades to its own frame (ADR-091).
 */
export type ImageView = {
  readonly url: string;
  readonly alt: string;
  readonly attribution: string | null;
  /** Intrinsic width in pixels (`image_width`), when declared. */
  readonly width: number | null;
  /** Intrinsic height in pixels (`image_height`), when declared. */
  readonly height: number | null;
  /** `depicted-by` role — a `depiction-roles` vocabulary value. */
  readonly role: string | null;
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

/**
 * One progression axis on the home page: where the reader is, and how
 * far the axis runs.
 *
 * `total` is the number of SOURCES that exist — not a count of hidden
 * content. The distinction is the whole anti-spoiler rule: "5 members
 * hidden by your progression" reveals that five more members exist and
 * is forbidden; "chapter 1044 of 1145" reveals nothing a bookshop
 * shelf does not, because the existence and numbering of published
 * chapters is public. Never put a count of WITHHELD FACTS here.
 */
export type AxisView = {
  readonly sourceType: string;
  readonly label: string;
  /** Where the reader says they are. */
  readonly at: number;
  /** How many of this source type the corpus holds. */
  readonly total: number;
  /** The next one, when it exists — the "resume" target. */
  readonly next: { readonly slug: string; readonly number: number; } | null;
};

/** The reader's position, or `null` when they have declared none. */
export type ReadingView = {
  readonly axes: readonly AxisView[];
  /** The axis to lead with: the one the reader has gone furthest on. */
  readonly primary: AxisView | null;
};

/**
 * A recent release. The DATE is public — a magazine schedule is not a
 * spoiler — but the TITLE is withheld beyond the cursor, because a
 * chapter title tells you what happens in it. `title: null` means
 * "exists, dated, not named for you yet".
 */
export type ReleaseView = {
  readonly sourceType: string;
  readonly typeLabel: string;
  readonly slug: string;
  readonly number: number | null;
  readonly releasedAt: string | null;
  readonly title: string | null;
  readonly beyondCursor: boolean;
};

export type HomeView = {
  readonly groups: readonly TypeGroup[];
  readonly totalEntities: number;
  /** Null when the reader has declared no progression at all. */
  readonly reading: ReadingView | null;
  readonly releases: readonly ReleaseView[];
  /** Echoed so the page can mount its own progression control. */
  readonly cursor: ProgressCursor;
};

// ---------------------------------------------------------------------------
// Type listing

export type EntityListItem = {
  readonly slug: string;
  readonly name: string;
  /**
   * The entity's position on the axis its own type declares, when it
   * declares one (`number`, `arc_number`, …). Null for types with no
   * ordinal — a character has no rank.
   */
  readonly ordinal: number | null;
  /** Raw facet values by property id — the listing filters on these. */
  readonly facets: Readonly<Record<string, string>>;
  /** Display image (spoiler-checked) — listings are image-led. */
  readonly image: ImageView | null;
  /** Type-appropriate identity line (epithet, release date…), spoiler-checked. */
  readonly secondary: string | null;
  readonly subtitle: string | null;
  /** Status micro-tag when it is not the unremarkable default (spoiler-checked). */
  readonly tag: string | null;
};

/** One selectable value of a listing facet, with its population. */
export type FacetOptionView = {
  readonly value: string;
  readonly label: string;
  readonly count: number;
};

/**
 * A filter offered by a type listing. Derived ENTIRELY from the schema
 * (any declared enum property that actually splits the population), so
 * there is no facet list to maintain and a type with no enum property
 * simply gets no filters.
 */
export type FacetView = {
  readonly id: string;
  readonly label: string;
  readonly options: readonly FacetOptionView[];
};

export type TypeListView = {
  readonly type: string;
  readonly label: string;
  readonly facets: readonly FacetView[];
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
  /** Target thumbnail (spoiler/scope-checked) — connection modules are image-led. */
  readonly image: ImageView | null;
  /** Target identity line (epithet, release date…), spoiler-checked. */
  readonly secondary: string | null;
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
  /** Type-appropriate identity line (character epithet…), spoiler-checked. */
  readonly secondary: string | null;
  readonly note: string | null;
};

export type MemberRowView = {
  readonly chip: EntityChip;
  readonly image: ImageView | null;
  /** Type-appropriate identity line (character epithet…), spoiler-checked. */
  readonly secondary: string | null;
  readonly role: string | null;
  readonly rank: string | null;
  readonly since: EntityChip | null;
  readonly until: EntityChip | null;
  /** Context micro-stat (crew-member bounty…), spoiler-checked. */
  readonly stat: string | null;
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

/** A source's position inside its arc/saga (the sibling ribbon). */
export type SourceTemplateView = {
  readonly kind: 'source';
  readonly arc:
    | {
      readonly chip: EntityChip;
      readonly label: string;
      readonly items: readonly SourceItemView[];
    }
    | null;
};

/** One ordered set a container entity holds (an arc's chapters, a
 *  volume's chapters, a saga's arcs…). */
export type ContainerGroupView = {
  /** The inverse relation key this group came from — so the page can
   *  exclude it from the generic connection sections. */
  readonly relationKey: string;
  readonly label: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly items: readonly SourceItemView[];
};

export type ContainerTemplateView = {
  readonly kind: 'container';
  readonly groups: readonly ContainerGroupView[];
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
  | ContainerTemplateView
  | FruitTemplateView
  | GenericTemplateView;

// ---------------------------------------------------------------------------
// Ordinal sequence + appearances (type-agnostic derivations)

/** A sibling of the same type one step away on the ordinal axis. */
export type SequenceNeighbourView = {
  readonly chip: EntityChip;
  readonly number: number;
};

/**
 * The entity's place on its type's ordinal axis, when the type
 * declares one (`number`, `arc_number`, `film_number`…). Discovered
 * from the SCHEMA — there is no per-type list of ordinal properties.
 */
export type SequenceView = {
  readonly propertyId: string;
  readonly label: string;
  readonly number: number;
  readonly total: number;
  readonly prev: SequenceNeighbourView | null;
  readonly next: SequenceNeighbourView | null;
};

/**
 * Incoming appearance edges from an ORDERED source type (chapters,
 * episodes, arcs…): how many of them mention this entity, out of how
 * many the reader can see. Empty until such a relation exists in the
 * schema AND the corpus carries edges — the section then simply does
 * not render (ADR-091 degradation).
 */
export type AppearanceGroupView = {
  readonly key: string;
  readonly label: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly count: number;
  /** Population of that source type within the reader's cursor. */
  readonly total: number;
  readonly items: readonly SourceItemView[];
};

export type EntityView = {
  readonly kind: 'entity';
  readonly id: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly slug: string;
  readonly name: string;
  readonly firstAppearance: EntityChip | null;
  readonly image: ImageView | null;
  /** Every OTHER visible depiction — episode stills, covers, plates. */
  readonly gallery: readonly ImageView[];
  /** Place on the type's ordinal axis (prev/next), when it has one. */
  readonly sequence: SequenceView | null;
  /** Entities this one features (`features`), grouped by their type. */
  readonly cast: readonly CastGroupView[];
  /** Where to read / watch it (`available-on`). */
  readonly availability: readonly AvailabilityItemView[];
  /** Ordered sources this entity appears in, with a ratio. */
  readonly appearances: readonly AppearanceGroupView[];
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
};
/**
 * ADR-099: `led-by` is gone — leadership is a membership function. The
 * crew/organization infobox leader row is DERIVED from the active
 * incoming `member-of` edges whose `role` is one of these values
 * (degrades to no row when the relation/roles are absent, ADR-091).
 */
const LEADERSHIP_MEMBER_ROLES: ReadonlySet<string> = new Set(['leader', 'captain']);
const MEMBER_OF_INVERSE = 'member-of.inverse';
/** The property whose declaration formats the derived crew total (ADR-099). */
const BOUNTY_PROPERTY = 'bounty';
/**
 * Entity-card second line: the ONE property whose latest visible value
 * identifies an entity of this type at a glance (ADR-091 binding —
 * cards degrade to name-only when the property or its data is absent).
 */
const CARD_SECONDARY_PROPERTIES: Readonly<Record<string, string>> = {
  character: 'epithet',
  'manga-chapter': 'released_at',
  'anime-episode': 'released_at',
  volume: 'released_at',
  'streaming-platform': 'platform_kind',
};
/** Entity-card micro-stat property (shown only where context warrants). */
const CARD_STAT_PROPERTIES: Readonly<Record<string, string>> = {
  character: 'bounty',
};
/** Card status tag: property id + the unremarkable value that gets NO tag. */
const CARD_STATUS_PROPERTY = 'status';
const CARD_STATUS_DEFAULT = 'alive';

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

/**
 * The name to show an entity under, FOR THIS READER.
 *
 * Names are historised like everything else (an entity renamed at
 * chapter 96, a devil fruit whose true name lands at 1044), so
 * resolving one is a spoiler decision, not a lookup. This function
 * therefore does not read `canonical_name_key` directly: it runs
 * `DISPLAY_NAME_SQL` (`server/search-sql.ts`) — the SAME statement,
 * with the same `search_gates` predicate, that labels a search result.
 * One resolution, one gate, so a page title, a hero, a `<title>`, a
 * link label and a search card can never disagree.
 *
 * Two fallbacks, in this order:
 *
 * 1. the entity carries NO indexed candidate name at all (its
 *    `canonical_name_key` is not held by any localizable property —
 *    an `image` entity does this): such a key carries no `since`, so
 *    it is anchor-free and safe to resolve straight from
 *    `translations`, exactly as before;
 * 2. the entity HAS names but the reader has reached none of them:
 *    degrade to the slug. Reaching for the raw key here is the leak.
 */
function resolveEntityName(
  row: EntityRow,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): string {
  const reached = db.displayNameAtCursor(row.id, cursor, locale);
  if (reached !== null) return reached;
  if (!db.hasDisplayName(row.id)) {
    const schema = cat.entityTypes.get(row.type);
    const key = row.canonical_name_key
      ?? nameKeyFor(row.data, schema?.display_name_properties ?? undefined);
    if (key !== null) {
      const translated = db.getTranslation(locale, key);
      if (translated !== null) return translated;
    }
  }
  return humanize(row.slug);
}

function chipForRow(
  row: EntityRow,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): EntityChip {
  return {
    id: row.id,
    type: row.type,
    typeLabel: entityTypeLabel(cat, row.type, locale),
    slug: row.slug,
    name: resolveEntityName(row, cat, locale, cursor),
  };
}

function chipFor(
  id: string,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): EntityChip | null {
  const row = db.getEntityById(id);
  return row === null ? null : chipForRow(row, cat, locale, cursor);
}

/** Chip for a possibly-dangling reference: falls back to the raw id. */
function chipOrPlaceholder(
  id: string,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): EntityChip {
  const chip = chipFor(id, cat, locale, cursor);
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

/**
 * The property that ORDERS an entity type, discovered from the schema:
 * the first declared property whose id is `number` or ends in
 * `_number` AND whose declared `value_type` is numeric.
 * `manga-chapter` → `number`, `arc` → `arc_number`, `film` →
 * `film_number`, `saga` → `saga_number`… A type that declares none
 * simply has no ordinal, hence no prev/next and no ratio — the
 * ADR-091 degradation rule, applied without a per-type list.
 */
function ordinalPropertyOf(cat: ValidatedCatalogue, type: string): string | null {
  const schema = cat.entityTypes.get(type);
  if (schema === undefined) return null;
  for (const declaration of schema.properties) {
    const id = declaration.id;
    if (id !== 'number' && !id.endsWith('_number')) continue;
    if (cat.propertyTypes.get(id)?.value_type !== 'number') continue;
    return id;
  }
  return null;
}

/**
 * An entity's ordinal, read WITHOUT the progression cursor: an ordinal
 * identifies the entity (chapter 1044 IS 1044 for every reader), so
 * the index must not shift under a cursor. Spoiler gating happens on
 * the entity itself, not on its number.
 */
function ordinalValue(row: EntityRow, propertyId: string): number | null {
  const value = latestRawValue(row, propertyId, EMPTY_CURSOR);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** An entity's ordinal on whichever axis its own type declares. */
function ordinalOf(row: EntityRow, cat: ValidatedCatalogue): number | null {
  const propertyId = ordinalPropertyOf(cat, row.type);
  return propertyId === null ? null : ordinalValue(row, propertyId);
}

/**
 * `ordinal → row` for one type, built once per process. The SQLite
 * artifact is immutable at runtime (CLAUDE.md: it is a derived, never
 * mutated, build product), so the index can never go stale.
 */
const ordinalIndexes = new Map<string, ReadonlyMap<number, EntityRow>>();

function ordinalIndexFor(type: string, propertyId: string): ReadonlyMap<number, EntityRow> {
  const key = `${type}/${propertyId}`;
  const cached = ordinalIndexes.get(key);
  if (cached !== undefined) return cached;
  const index = new Map<number, EntityRow>();
  for (const row of db.listEntitiesByType(type)) {
    const n = ordinalValue(row, propertyId);
    if (n !== null && !index.has(n)) index.set(n, row);
  }
  ordinalIndexes.set(key, index);
  return index;
}

/**
 * Prev/next on the type's own ordinal axis. A neighbour beyond the
 * reader's cursor is NOT announced at all — its title alone would be
 * a spoiler — so the button simply disappears.
 */
function buildSequence(
  row: EntityRow,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): SequenceView | null {
  const propertyId = ordinalPropertyOf(cat, row.type);
  if (propertyId === null) return null;
  const number = ordinalValue(row, propertyId);
  if (number === null) return null;
  const index = ordinalIndexFor(row.type, propertyId);
  const neighbour = (delta: number): SequenceNeighbourView | null => {
    const sibling = index.get(number + delta);
    if (sibling === undefined || !isSourceVisible(sibling.id, cursor)) return null;
    return {
      chip: chipForRow(sibling, cat, locale, cursor),
      number: ordinalValue(sibling, propertyId) ?? number + delta,
    };
  };
  let total = 0;
  for (const sibling of index.values()) {
    if (isSourceVisible(sibling.id, cursor)) total += 1;
  }
  const schema = cat.propertyTypes.get(propertyId);
  return {
    propertyId,
    label: schema === undefined ? humanize(propertyId) : pickLabel(schema.labels, locale),
    number,
    total,
    prev: neighbour(-1),
    next: neighbour(1),
  };
}

/**
 * Latest spoiler-visible display string of one property, read from an
 * ALREADY-LOADED entity row (no extra SQL beyond the translations
 * lookup an i18n value needs): raw entries are filtered on their
 * `since` anchor exactly like everywhere else, and only the believed
 * value (`value` / `value_key`) is resolved through the property
 * schema (enum labels, dates, currency_short numbers, i18n keys) —
 * `actual_value` never surfaces on cards.
 */
function latestVisibleDisplay(
  row: EntityRow,
  propertyId: string,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): string | null {
  const entries = rawPropertyEntries(row, propertyId).filter((entry) => {
    const since = entry['since'];
    return typeof since === 'string' ? isSourceVisible(since, cursor) : true;
  });
  const last = entries[entries.length - 1];
  if (last === undefined) return null;
  const resolved = displayValue(
    last,
    'value',
    cat.propertyTypes.get(propertyId),
    cat,
    locale,
    cursor,
  );
  if (resolved === null) return null;
  return resolved.display === '' || resolved.display === '—' ? null : resolved.display;
}

// ---------------------------------------------------------------------------
// Entity-card enrichment (secondary line, micro-stat, status tag)

/** Type-appropriate card second line (epithet, release date, kind…). */
function cardSecondary(
  row: EntityRow,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): string | null {
  const propertyId = CARD_SECONDARY_PROPERTIES[row.type];
  if (propertyId === undefined) return null;
  return latestVisibleDisplay(row, propertyId, cat, locale, cursor);
}

/** Card micro-stat (character bounty…) where the context warrants it. */
function cardStat(
  row: EntityRow,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): string | null {
  const propertyId = CARD_STAT_PROPERTIES[row.type];
  if (propertyId === undefined) return null;
  return latestVisibleDisplay(row, propertyId, cat, locale, cursor);
}

/**
 * Status micro-tag: the latest visible (believed) status, only when it
 * is NOT the unremarkable default — an "Alive" tag on every card would
 * be noise, a "Dead" / "Presumed dead" one is identity.
 */
function cardStatusTag(
  row: EntityRow,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): string | null {
  const raw = latestRawValue(row, CARD_STATUS_PROPERTY, cursor);
  if (typeof raw !== 'string' || raw === CARD_STATUS_DEFAULT) return null;
  return latestVisibleDisplay(row, CARD_STATUS_PROPERTY, cat, locale, cursor);
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
  cursor: ProgressCursor,
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
    const parts = raw.map((v) => displayScalar(v, schema, cat, locale, cursor).display);
    return { display: parts.join(', '), chip: null };
  }
  if (typeof raw !== 'string') return { display: JSON.stringify(raw), chip: null };
  if (valueType === 'enum' || valueType === 'multi_enum') {
    const enumRef = schema?.value_constraints?.enum_ref;
    return { display: vocabValueLabel(cat, enumRef, raw, locale), chip: null };
  }
  if (valueType === 'date') return { display: formatDate(raw, locale), chip: null };
  if ((valueType === 'entity_ref' || valueType === 'source_ref') && raw.includes(':')) {
    const chip = chipOrPlaceholder(raw, cat, locale, cursor);
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
  cursor: ProgressCursor,
): { display: string; chip: EntityChip | null; } | null {
  const key = payload[`${valueField}_key`];
  if (typeof key === 'string') {
    const translated = db.getTranslation(locale, key);
    return { display: translated ?? key, chip: null };
  }
  if (!(valueField in payload)) return null;
  return displayScalar(payload[valueField], schema, cat, locale, cursor);
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
  cursor: ProgressCursor,
): { value: string; chip?: EntityChip; } {
  if (Array.isArray(raw)) {
    return {
      value: raw.map((v) => displayQualifierValue(v, def, cat, locale, cursor).value).join(', '),
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
      const head = displayQualifierValue(item.target, def, cat, locale, cursor);
      const sources = entityRefItemSources(item);
      if (sources.length === 0) return head;
      const names = sources.map((s) => chipFor(s, cat, locale, cursor)?.name ?? s).join(', ');
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
    const chip = chipFor(raw, cat, locale, cursor);
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
  cursor: ProgressCursor,
): readonly LabelledValue[] {
  const out: LabelledValue[] = [];
  for (const [id, raw] of Object.entries(payload)) {
    if (AXIS_KEYS.has(id) || raw === null || raw === undefined) continue;
    const def = qualifierDefFor(id, local, cat);
    const { value, chip } = displayQualifierValue(raw, def, cat, locale, cursor);
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
  cursor: ProgressCursor,
): string | null {
  const raw = edge.qualifiers?.[qualifierId];
  if (raw === null || raw === undefined) return null;
  const def = qualifierDefFor(qualifierId, schema?.qualifiers ?? [], cat);
  return displayQualifierValue(raw, def, cat, locale, cursor).value;
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

/**
 * `until` anchor reached: the relation visibly ended for this reader.
 * The pure rule lives in `progress.ts` (`isDepartureVisible`) — a
 * departure beyond the cursor renders as CURRENT (revealing it would
 * be a spoiler).
 */
function edgeEnded(edge: RelationRow, cursor: ProgressCursor): boolean {
  return isDepartureVisible(edge.until_source, cursor);
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
  const width = latestRawValue(image, 'image_width', EMPTY_CURSOR);
  const height = latestRawValue(image, 'image_height', EMPTY_CURSOR);
  return {
    url,
    alt,
    attribution: typeof attribution === 'string' ? attribution : null,
    // Intrinsic dimensions are read WITHOUT the cursor, like ordinals:
    // a file's pixel size is not a story fact and cannot spoil.
    width: typeof width === 'number' && Number.isFinite(width) ? width : null,
    height: typeof height === 'number' && Number.isFinite(height) ? height : null,
    // Filled by the caller, which is the one holding the edge.
    role: null,
  };
}

/**
 * Rank the entity's visible `depicted-by` depictions, best first:
 * spoiler-hidden images (`spoiler_since` beyond cursor) are excluded,
 * the active canon scope steers `source_origin` preference
 * (live_action scope prefers live_action origins; default prefers
 * everything else), then the depiction `role` ranks candidates.
 * The head is the display image; the tail is the page gallery
 * (episode stills, covers, plates). Empty = no visible depiction, and
 * the UI renders generated artwork instead of an empty frame.
 */
function resolveEntityImages(
  row: EntityRow,
  edges: readonly RelationRow[],
  cursor: ProgressCursor,
  scope: string | null,
  locale: Locale,
  name: string,
): readonly ImageView[] {
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
    candidates.push({
      // The depiction role is what says WHAT the picture is, hence the
      // ratio it must be displayed at (`src/lib/image-ratio.ts`).
      view: typeof role === 'string' ? { ...view, role } : view,
      originScore,
      roleScore,
    });
  }
  candidates.sort((a, b) => a.originScore - b.originScore || a.roleScore - b.roleScore);
  return candidates.map((candidate) => candidate.view);
}

/** The single display image (the best-ranked depiction), or null. */
function resolveEntityImage(
  row: EntityRow,
  edges: readonly RelationRow[],
  cursor: ProgressCursor,
  scope: string | null,
  locale: Locale,
  name: string,
): ImageView | null {
  return resolveEntityImages(row, edges, cursor, scope, locale, name)[0] ?? null;
}

/**
 * Everything a RESULT CARD needs about one entity, resolved exactly
 * like a listing card is (same image ranking, same `spoiler_since`
 * check, same schema-driven identity line, same status tag) —
 * exported so `server/search.ts` composes the existing view model
 * instead of growing a second, divergent copy of card enrichment.
 *
 * The chip's `name` is the site-wide display name, which is already
 * cursor-checked (`resolveEntityName` runs `DISPLAY_NAME_SQL`), so
 * search no longer needs a label of its own: a result can never be
 * listed under a name the reader has not reached.
 */
export type EntityCardView = {
  readonly chip: EntityChip;
  readonly image: ImageView | null;
  readonly secondary: string | null;
  readonly tag: string | null;
};

export function buildEntityCardView(
  entityId: string,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): EntityCardView | null {
  const row = db.getEntityById(entityId);
  if (row === null) return null;
  const chip = chipForRow(row, cat, locale, cursor);
  return {
    chip,
    image: resolveEntityImage(row, db.listRelationsFrom(row.id), cursor, null, locale, chip.name),
    secondary: cardSecondary(row, cat, locale, cursor),
    tag: cardStatusTag(row, cat, locale, cursor),
  };
}

/** Localized label of a property id (or of the pseudo-field `slug`). */
export function propertyLabel(
  cat: ValidatedCatalogue,
  propertyId: string,
  locale: Locale,
): string {
  const schema = cat.propertyTypes.get(propertyId);
  return schema === undefined ? humanize(propertyId) : pickLabel(schema.labels, locale);
}

// ---------------------------------------------------------------------------
// Views

/** How many recent releases the home page shows. */
const HOME_RELEASES = 6;

/**
 * The reader's position on every declared axis, plus the axis to lead
 * with. Built from `CURSOR_AXES`, so a third axis (live action, films)
 * appears here the day it is declared — nothing below names an axis.
 *
 * Returns `null` when the reader has declared nothing: the home page
 * then leads with the universe rather than with an empty progress bar.
 */
function buildReading(
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): ReadingView | null {
  if (!cursorActive(cursor)) return null;
  const axes: AxisView[] = [];
  for (const { axis, sourceType } of CURSOR_AXES) {
    const at = cursor[axis];
    if (at === null) continue;
    const propertyId = ordinalPropertyOf(cat, sourceType);
    if (propertyId === null) continue;
    const index = ordinalIndexFor(sourceType, propertyId);
    // The POPULATION of the axis, not a count of withheld facts — see
    // the note on AxisView. A shelf of published volumes says as much.
    const total = index.size;
    if (total === 0) continue;
    const after = index.get(at + 1);
    axes.push({
      sourceType,
      label: entityTypeLabel(cat, sourceType, locale),
      at,
      total,
      next: after === undefined ? null : { slug: after.slug, number: at + 1 },
    });
  }
  if (axes.length === 0) return null;
  // Lead with the axis the reader has gone furthest along, measured as
  // a FRACTION: 400 episodes out of 1122 is less progress than 1044
  // chapters out of 1145, and the bigger raw number would mislead.
  const primary = axes.reduce((best, a) => (a.at / a.total > best.at / best.total ? a : best));
  return { axes, primary };
}

/**
 * The newest sources, one list across every axis.
 *
 * Ordered by ORDINAL, not by date: only 10 of 406 chapters and none of
 * the 400 episodes carry `released_at`, so a date sort would show an
 * almost empty block. For a serialised work the ordinal IS the release
 * order, and the date is shown when it happens to be known.
 *
 * The date is public, the title is not: a chapter title tells you what
 * happens in it. Beyond the cursor, `title` is null and the caller
 * renders a withheld state — never a count of what is withheld.
 */
function buildReleases(
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): readonly ReleaseView[] {
  const out: ReleaseView[] = [];
  const named = cursorActive(cursor);
  for (const { sourceType } of CURSOR_AXES) {
    const propertyId = ordinalPropertyOf(cat, sourceType);
    if (propertyId === null) continue;
    const index = ordinalIndexFor(sourceType, propertyId);
    const newest = [...index.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, HOME_RELEASES);
    for (const [number, row] of newest) {
      // A reader who has declared NOTHING is protected, not exposed.
      // `isSourceVisible` answers true for an axis with no cursor —
      // correct for "this value has no `since`", wrong here: it would
      // hand every chapter title to someone who never said where they
      // are. The home page states what EXISTS (a number, a date) and
      // withholds what it MEANS (the title) until the reader opts in.
      const visible = named && isSourceVisible(row.id, cursor);
      out.push({
        sourceType,
        typeLabel: entityTypeLabel(cat, sourceType, locale),
        slug: row.slug,
        number,
        releasedAt: latestVisibleDisplay(row, 'released_at', cat, locale, cursor),
        title: visible ? db.displayNameAtCursor(row.id, cursor, locale) : null,
        beyondCursor: !visible,
      });
    }
  }
  return out
    .sort((a, b) => (b.number ?? 0) - (a.number ?? 0))
    .slice(0, HOME_RELEASES);
}

export async function buildHomeView(locale: Locale, cursor: ProgressCursor): Promise<HomeView> {
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
  return {
    groups,
    totalEntities: total,
    reading: buildReading(cat, locale, cursor),
    releases: buildReleases(cat, locale, cursor),
    cursor,
  };
}

/** At most this many filter rows on a listing — more is a wall, not a tool. */
const MAX_FACETS = 3;
/** A facet with more options than this stops being a quick filter. */
const MAX_FACET_OPTIONS = 8;

/**
 * Derive the filters of a type listing from the SCHEMA alone: every
 * declared enum property whose visible values actually split the
 * population becomes a facet, labelled through its vocabulary.
 *
 * Fully schema-driven — no well-known ids are consulted, so a new type
 * gains filters the moment it declares an enum property, and a type
 * without one simply has none (the listing then renders no filter bar).
 */
function buildFacets(
  rows: readonly EntityRow[],
  type: string,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): { facets: readonly FacetView[]; byRow: ReadonlyMap<string, Record<string, string>>; } {
  const byRow = new Map<string, Record<string, string>>();
  for (const row of rows) byRow.set(row.id, {});
  const declared = cat.entityTypes.get(type)?.properties ?? [];
  const facets: FacetView[] = [];
  for (const declaration of declared) {
    if (facets.length >= MAX_FACETS) break;
    const schema = cat.propertyTypes.get(declaration.id);
    if (schema === undefined) continue;
    if (schema.value_type !== 'enum') continue;
    const enumRef = schema.value_constraints?.enum_ref;
    const counts = new Map<string, number>();
    const values = new Map<string, string>();
    for (const row of rows) {
      const raw = latestRawValue(row, declaration.id, cursor);
      if (typeof raw !== 'string' || raw === '') continue;
      values.set(row.id, raw);
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
    // A facet earns its place only when it separates the population.
    if (counts.size < 2 || counts.size > MAX_FACET_OPTIONS) continue;
    for (const [rowId, value] of values) {
      const bucket = byRow.get(rowId);
      if (bucket !== undefined) bucket[declaration.id] = value;
    }
    const options = [...counts.entries()]
      .map(([value, count]) => ({
        value,
        label: vocabValueLabel(cat, enumRef, value, locale),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    facets.push({
      id: declaration.id,
      label: pickLabel(schema.labels, locale),
      options,
    });
  }
  return { facets, byRow };
}

export async function buildTypeListView(
  type: string,
  locale: Locale,
  cursor: ProgressCursor = EMPTY_CURSOR,
): Promise<TypeListView | null> {
  const cat = await getCatalogue();
  const rows = db.listEntitiesByType(type);
  if (rows.length === 0 && !cat.entityTypes.has(type)) return null;
  // Card enrichment reads the already-loaded row blobs; the image adds
  // one prepared relation lookup per row (v7 image-led listings).
  const { facets, byRow } = buildFacets(rows, type, cat, locale, cursor);
  const items = rows
    .map((row) => {
      const name = resolveEntityName(row, cat, locale, cursor);
      return {
        slug: row.slug,
        name,
        ordinal: ordinalOf(row, cat),
        facets: byRow.get(row.id) ?? {},
        image: resolveEntityImage(row, db.listRelationsFrom(row.id), cursor, null, locale, name),
        secondary: cardSecondary(row, cat, locale, cursor),
        subtitle: row.first_appearance_source === null
          ? null
          : chipFor(row.first_appearance_source, cat, locale, cursor)?.name ?? null,
        tag: cardStatusTag(row, cat, locale, cursor),
      };
    })
    // ORDERED TYPES SORT BY THEIR ORDINAL, not by their title. Sorting
    // 400 episodes alphabetically put "A Man's Oath Never Dies" before
    // "I'm Luffy!" and left no way at all to reach episode 250 — a
    // defect that stayed invisible while the corpus held ten
    // characters and became the whole experience the moment the
    // chapters and episodes landed.
    //
    // Which types are ordered is not a list kept here: it is whatever
    // `ordinalPropertyOf` finds declared on the type, so a new ordered
    // type sorts correctly the day it declares its property.
    .sort((a, b) =>
      a.ordinal !== null && b.ordinal !== null
        ? a.ordinal - b.ordinal
        : a.name.localeCompare(b.name)
    );
  return { type, label: entityTypeLabel(cat, type, locale), facets, items };
}

function buildEntryView(
  entry: FilteredEntry,
  schema: PropertyType | undefined,
  localQualifiers: readonly LocalQualifier[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): PropertyEntryView {
  const value = displayValue(entry.row.value, 'value', schema, cat, locale, cursor);
  // Epistemic non-leak (WEB_APP.md § spoiler gating, rule 4): with an
  // active cursor, the concealed truth (`actual_value`) is shown only
  // once the revealing entry — by construction a LATER entry — is
  // itself visible. Without a cursor the wiki default shows all.
  const revealSafe = !cursorActive(cursor) || entry.hasLaterVisible;
  const actual = revealSafe
    ? displayValue(entry.row.value, 'actual_value', schema, cat, locale, cursor)
    : null;
  const reviewStatus = entry.row.value['review_status'];
  return {
    display: value?.display ?? '—',
    valueChip: value?.chip ?? null,
    since: entry.row.since_source === null
      ? null
      : chipFor(entry.row.since_source, cat, locale, cursor),
    until: entry.row.until_source === null
      ? null
      : chipFor(entry.row.until_source, cat, locale, cursor),
    epistemic: epistemicView(cat, entry.row.epistemic_status, locale),
    actualDisplay: actual?.display ?? null,
    event: entry.row.event_id === null ? null : chipFor(entry.row.event_id, cat, locale, cursor),
    qualifiers: collectQualifiers(entry.row.value, localQualifiers, cat, locale, cursor),
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
  cursor: ProgressCursor,
  scope: string | null,
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
    // Image-led modules (v7): resolve the target row once for its
    // thumbnail + identity line; dangling targets degrade to the chip.
    const targetRow = db.getEntityById(rel.target_entity_id);
    const target = targetRow === null
      ? chipOrPlaceholder(rel.target_entity_id, cat, locale, cursor)
      : chipForRow(targetRow, cat, locale, cursor);
    const item: RelationItemView = {
      target,
      image: targetRow === null ? null : resolveEntityImage(
        targetRow,
        db.listRelationsFrom(targetRow.id),
        cursor,
        scope,
        locale,
        target.name,
      ),
      secondary: targetRow === null ? null : cardSecondary(targetRow, cat, locale, cursor),
      since: rel.since_source === null ? null : chipFor(rel.since_source, cat, locale, cursor),
      until: rel.until_source === null ? null : chipFor(rel.until_source, cat, locale, cursor),
      epistemic: epistemicView(cat, rel.epistemic_status, locale),
      qualifiers: rel.qualifiers === null
        ? []
        : collectQualifiers(rel.qualifiers, schema?.qualifiers ?? [], cat, locale, cursor),
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
  const chip = chipForRow(target, cat, locale, cursor);
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
    secondary: cardSecondary(target, cat, locale, cursor),
    note,
  };
}

function memberRow(
  edge: RelationRow,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
  scope: string | null,
  withStat: boolean,
): MemberRowView | null {
  const target = db.getEntityById(edge.target_entity_id);
  if (target === null) return null;
  const chip = chipForRow(target, cat, locale, cursor);
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
    secondary: cardSecondary(target, cat, locale, cursor),
    role: edgeQualifierLabel(edge, 'role', schema, cat, locale, cursor),
    rank: edgeQualifierLabel(edge, 'held_rank', schema, cat, locale, cursor),
    since: edge.since_source === null ? null : chipFor(edge.since_source, cat, locale, cursor),
    until: edge.until_source === null || !isSourceVisible(edge.until_source, cursor)
      ? null
      : chipFor(edge.until_source, cat, locale, cursor),
    stat: withStat ? cardStat(target, cat, locale, cursor) : null,
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
        edgeQualifierLabel(memberEdge, 'role', schema, cat, locale, cursor),
        cat,
        locale,
        cursor,
        scope,
      ));
    }
    crews.push({
      crew: chipForRow(crewRow, cat, locale, cursor),
      label: resolveEdgeLabel(edge, cat, locale),
      role: edgeQualifierLabel(edge, 'role', schema, cat, locale, cursor),
      rank: edgeQualifierLabel(edge, 'held_rank', schema, cat, locale, cursor),
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
  withStat: boolean,
): { current: MemberRowView[]; former: MemberRowView[]; } {
  const current: MemberRowView[] = [];
  const former: MemberRowView[] = [];
  for (const edge of edges) {
    if (edge.relation_type !== relationType) continue;
    const view = memberRow(edge, cat, locale, cursor, scope, withStat);
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
  // Crew-member cards carry the bounty micro-stat (WEB_APP.md cards).
  const { current, former } = splitCurrentFormer(
    edges,
    'member-of.inverse',
    cat,
    locale,
    cursor,
    scope,
    true,
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
  // Fruit-user cards: identity + since/until — no bounty stat (noise here).
  const { current, former } = splitCurrentFormer(
    edges,
    'ate-fruit.inverse',
    cat,
    locale,
    cursor,
    scope,
    false,
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
    chip: chipForRow(target, cat, locale, cursor),
    number: ordinalOf(target, cat),
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
      platform: chipForRow(platform, cat, locale, cursor),
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
    const note = edgeQualifierLabel(edge, 'appearance_type', schema, cat, locale, cursor);
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
): SourceTemplateView {
  let arc: SourceTemplateView['arc'] = null;
  const arcEdge = edges.find((edge) =>
    edge.relation_type === 'part-of-arc' || edge.relation_type === 'occurs-during-arc'
  );
  if (arcEdge !== undefined) {
    const arcRow = db.getEntityById(arcEdge.target_entity_id);
    if (arcRow !== null) {
      arc = {
        chip: chipForRow(arcRow, cat, locale, cursor),
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
  return { kind: 'source', arc };
}

/**
 * What a CONTAINER entity holds. Fully derived: every incoming
 * `part-of-*` edge (the schema's containment naming) is bucketed by
 * the type of the thing contained and ordered by that type's own
 * ordinal — so an arc yields its chapters AND its episodes, a saga
 * its arcs, a volume its chapters, and a containment relation added
 * later needs no code change. No containment edges → no groups, and
 * the page falls back to the generic connection sections (ADR-091).
 */
function buildContainerTemplate(
  row: EntityRow,
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): ContainerTemplateView {
  const groups = new Map<string, {
    relationKey: string;
    label: string;
    type: string;
    typeLabel: string;
    items: SourceItemView[];
  }>();
  for (const edge of edges) {
    if (!edge.is_inferred || !edge.relation_type.startsWith('part-of-')) continue;
    const target = db.getEntityById(edge.target_entity_id);
    if (target === null) continue;
    const key = `${edge.relation_type}:${target.type}`;
    const item = sourceItem(target, row.id, cat, locale, cursor);
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, {
        relationKey: edge.relation_type,
        label: resolveEdgeLabel(edge, cat, locale),
        type: target.type,
        typeLabel: entityTypeLabel(cat, target.type, locale),
        items: [item],
      });
    } else bucket.items.push(item);
  }
  return {
    kind: 'container',
    groups: [...groups.values()]
      .map((group) => ({ ...group, items: group.items.sort(byNumber) }))
      .sort((a, b) => b.items.length - a.items.length || a.typeLabel.localeCompare(b.typeLabel)),
  };
}

/**
 * Appearances: incoming edges whose SOURCE is an entity of an ordered
 * type (one declaring an ordinal property). That is what makes
 * "36 chapters out of 1044" meaningful, and it is derived rather than
 * listed — the day an `appears-in-chapter` relation exists, this
 * lights up with no code change; until then there are no such edges
 * and the section renders nothing.
 */
function buildAppearances(
  edges: readonly RelationRow[],
  consumed: ReadonlySet<string>,
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): readonly AppearanceGroupView[] {
  const groups = new Map<string, {
    key: string;
    label: string;
    type: string;
    typeLabel: string;
    items: SourceItemView[];
  }>();
  for (const edge of edges) {
    if (!edge.is_inferred || consumed.has(edge.relation_type)) continue;
    const target = db.getEntityById(edge.target_entity_id);
    if (target === null || ordinalPropertyOf(cat, target.type) === null) continue;
    const key = `${edge.relation_type}:${target.type}`;
    const item = sourceItem(target, '', cat, locale, cursor);
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, {
        key,
        label: resolveEdgeLabel(edge, cat, locale),
        type: target.type,
        typeLabel: entityTypeLabel(cat, target.type, locale),
        items: [item],
      });
    } else bucket.items.push(item);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      count: group.items.length,
      total: visiblePopulation(group.type, cursor),
      items: group.items.sort(byNumber),
    }))
    .sort((a, b) => b.count - a.count || a.typeLabel.localeCompare(b.typeLabel));
}

/** How many entities of a type the reader's cursor lets them see. */
function visiblePopulation(type: string, cursor: ProgressCursor): number {
  let total = 0;
  for (const row of db.listEntitiesByType(type)) {
    if (isSourceVisible(row.id, cursor)) total += 1;
  }
  return total;
}

/** Relation type keys a template consumed — excluded from the generic
 *  connection groups so sections do not repeat. `depicted-by` always
 *  feeds the infobox portrait slot. */
function consumedRelationKeys(row: EntityRow, template: TemplateView): ReadonlySet<string> {
  // `depicted-by` always feeds the portrait + gallery; `features` and
  // `available-on` always feed the cast and availability modules,
  // whatever the type — those three are type-agnostic now.
  const consumed = new Set<string>(['depicted-by', 'features', 'available-on']);
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
      break;
    case 'container':
      for (const group of template.groups) consumed.add(group.relationKey);
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
    case 'live-action-episode':
      return buildSourceTemplate(row, edges, cat, locale, cursor);
    case 'arc':
    case 'saga':
    case 'volume':
    case 'live-action-series':
      return buildContainerTemplate(row, edges, cat, locale, cursor);
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
  cursor: ProgressCursor,
): readonly InfoboxRelationRowView[] {
  const rows: InfoboxRelationRowView[] = [];
  for (const key of INFOBOX_RELATIONS[row.type] ?? []) {
    const matching = edges.filter((edge) => edge.relation_type === key);
    const first = matching[0];
    if (first === undefined) continue;
    rows.push({
      key,
      label: resolveEdgeLabel(first, cat, locale),
      chips: matching.map((edge) => chipOrPlaceholder(edge.target_entity_id, cat, locale, cursor)),
    });
  }
  // Derived leadership row (ADR-099): active incoming `member-of`
  // edges whose `role` is a leadership function, one row per role,
  // labelled with the role's own vocabulary label ("Captain"/"Leader").
  const memberOfSchema = cat.relationTypes.get('member-of');
  const byRole = new Map<string, { label: string; chips: EntityChip[]; }>();
  for (const edge of edges) {
    if (edge.relation_type !== MEMBER_OF_INVERSE || edgeEnded(edge, cursor)) continue;
    const role = edge.qualifiers?.['role'];
    if (typeof role !== 'string' || !LEADERSHIP_MEMBER_ROLES.has(role)) continue;
    const label = edgeQualifierLabel(edge, 'role', memberOfSchema, cat, locale, cursor)
      ?? humanize(role);
    const chip = chipOrPlaceholder(edge.target_entity_id, cat, locale, cursor);
    const bucket = byRole.get(role);
    if (bucket === undefined) byRole.set(role, { label, chips: [chip] });
    else bucket.chips.push(chip);
  }
  for (const [role, group] of byRole) {
    rows.push({ key: `${MEMBER_OF_INVERSE}:${role}`, label: group.label, chips: group.chips });
  }
  return rows;
}

/**
 * Derived crew "Total bounty" (ADR-099, audit P1): the sum of the
 * latest cursor-visible `bounty` of the crew's ACTIVE incoming
 * `member-of` characters — computed per progression point, never
 * stored. Formatted through the bounty property's own declaration so
 * it reads like every other bounty value; degrades to no row when the
 * property type, the members or their bounties are absent (ADR-091).
 */
function deriveTotalBountyRow(
  edges: readonly RelationRow[],
  cat: ValidatedCatalogue,
  locale: Locale,
  cursor: ProgressCursor,
): InfoboxRowView | null {
  const bountySchema = cat.propertyTypes.get(BOUNTY_PROPERTY);
  if (bountySchema === undefined) return null;
  let total = 0;
  let found = false;
  for (const edge of edges) {
    if (edge.relation_type !== MEMBER_OF_INVERSE || edgeEnded(edge, cursor)) continue;
    const member = db.getEntityById(edge.target_entity_id);
    if (member === null) continue;
    const bounty = latestRawValue(member, BOUNTY_PROPERTY, cursor);
    if (typeof bounty !== 'number' || !Number.isFinite(bounty)) continue;
    total += bounty;
    found = true;
  }
  if (!found) return null;
  return {
    id: 'derived:total_bounty',
    // Presentation-only label for a computed stat (no schema id backs
    // it since ADR-099 removed the stored property) — same pattern as
    // the localized Yes/No literals above.
    label: locale === 'fr' ? 'Prime totale' : 'Total bounty',
    entry: {
      display: formatNumber(total, bountySchema, locale),
      valueChip: null,
      since: null,
      until: null,
      epistemic: null,
      actualDisplay: null,
      event: null,
      qualifiers: [],
      autoImported: false,
    },
  };
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

/**
 * The hover-card preview (WEB_APP.md § Hover preview): the least a
 * reader needs to decide whether to follow a link — the entity's
 * artwork or photo, its name, its identity line, and two or three
 * facts.
 *
 * **A preview is a SURFACING, exactly like a search hit.** It is
 * therefore built at the reader's cursor from the same helpers the
 * page uses, and an entity the reader has not reached returns null —
 * no card, not even a redacted one, since a redacted card would itself
 * announce that something exists later (ADR-108's third hazard).
 */
export type EntityPreviewView = {
  readonly chip: EntityChip;
  readonly image: ImageView | null;
  /** Identity line (epithet, release date…), spoiler-checked. */
  readonly secondary: string | null;
  /** Status micro-tag when it is not the unremarkable default. */
  readonly tag: string | null;
  readonly firstAppearance: string | null;
  /** A few headline facts, in the type's own declared order. */
  readonly facts: readonly LabelledValue[];
};

/** How many facts a preview shows. More is a page, not a preview. */
const PREVIEW_FACT_LIMIT = 3;

export async function buildEntityPreview(
  type: string,
  slug: string,
  locale: Locale,
  cursor: ProgressCursor = EMPTY_CURSOR,
  scope: string | null = null,
): Promise<EntityPreviewView | null> {
  const cat = await getCatalogue();
  const row = db.getEntityBySlug(type, slug);
  if (row === null) return null;
  // Same gate as the page (rule 3): beyond the cursor, no preview.
  if (
    !isSourceVisible(row.id, cursor)
    || (row.first_appearance_source !== null
      && !isSourceVisible(row.first_appearance_source, cursor))
  ) {
    return null;
  }
  const chip = chipForRow(row, cat, locale, cursor);
  const edges = db.listRelationsFrom(row.id).filter((edge) => isEdgeVisible(edge, cursor));
  const secondaryProperty = CARD_SECONDARY_PROPERTIES[row.type];
  const { infobox } = buildPropertyViews(row, cat, locale, cursor, scope);
  const facts: LabelledValue[] = [];
  for (const entry of infobox) {
    if (facts.length >= PREVIEW_FACT_LIMIT) break;
    // The identity line already says this one; a fact that renders as
    // an em dash says nothing at all.
    if (entry.id === secondaryProperty) continue;
    const value = entry.entry.display;
    if (value === '' || value === '—') continue;
    facts.push({ label: entry.label, value });
  }
  return {
    chip,
    image: resolveEntityImage(row, edges, cursor, scope, locale, chip.name),
    secondary: cardSecondary(row, cat, locale, cursor),
    tag: cardStatusTag(row, cat, locale, cursor),
    firstAppearance: row.first_appearance_source === null
      ? null
      : chipFor(row.first_appearance_source, cat, locale, cursor)?.name ?? null,
    facts,
  };
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
  const name = resolveEntityName(row, cat, locale, cursor);

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
  const templateKeys = consumedRelationKeys(row, template);
  // Appearances take what the template left; whatever they take is in
  // turn withheld from the generic connection sections, so a fact is
  // never rendered twice — and never dropped either.
  const appearances = buildAppearances(edges, templateKeys, cat, locale, cursor);
  const consumed = new Set(templateKeys);
  for (const group of appearances) consumed.add(group.key.split(':')[0] ?? group.key);
  const { properties, infobox: declaredInfobox } = buildPropertyViews(
    row,
    cat,
    locale,
    cursor,
    scope,
  );
  // ADR-099: crews get the DERIVED total-bounty stat appended to their
  // declared infobox rows ("Introduced in" needs no equivalent — the
  // hero already surfaces `firstAppearance` below).
  const totalBounty = row.type === 'crew'
    ? deriveTotalBountyRow(edges, cat, locale, cursor)
    : null;
  const infobox = totalBounty === null ? declaredInfobox : [...declaredInfobox, totalBounty];
  const firstAppearance = row.first_appearance_source === null
    ? null
    : chipFor(row.first_appearance_source, cat, locale, cursor);
  const images = resolveEntityImages(row, edges, cursor, scope, locale, name);
  return {
    kind: 'entity',
    id: row.id,
    type: row.type,
    typeLabel,
    slug: row.slug,
    name,
    firstAppearance,
    image: images[0] ?? null,
    gallery: images.slice(1),
    sequence: buildSequence(row, cat, locale, cursor),
    cast: buildCast(edges, cat, locale, cursor, scope),
    availability: buildAvailability(edges, cat, locale, cursor),
    appearances,
    infobox,
    infoboxRelations: buildInfoboxRelations(row, edges, cat, locale, cursor),
    properties,
    relations: buildRelationViews(edges, cat, locale, consumed, cursor, scope),
    narrative: db.getNarrative(row.id, locale),
    template,
    propagateScope: scopeToPropagate(row, cursor, scope),
  };
}
