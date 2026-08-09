/**
 * Qualifier resolution for the entry editor — schema-driven (ADR-078).
 *
 * Per /docs/SCHEMA_SPEC.md, every historisable property entry can carry
 * two flavors of qualifier:
 *
 *  1. **Base qualifiers** — implicit on every entry, provided by the
 *     schema engine (epistemic_status, actual_value, event,
 *     believed_by, known_truth_by, assisted_by, review_status).
 *     Property types MUST NOT redeclare them.
 *
 *  2. **Property-declared qualifiers** — listed by id in
 *     `default_qualifiers` (shown inline on the entry) or in
 *     `allowed_qualifiers` with full type info (shown behind "More
 *     options").
 *
 * Both flavors are declared in the schema catalogue's **qualifier-type
 * registry** (`/data/schemas/qualifier-types/**`, exposed via
 * `/api/schemas` as `qualifierTypes`) — nothing is hardcoded here; the
 * registry carries labels/descriptions (EN/FR), value types, enum
 * refs, entity-type filters and multiplicity. Ids referenced in
 * `default_qualifiers` (or lean `allowed_qualifiers`) resolve against
 * the registry's `common` entries; `base` entries are appended to
 * every entry's "More options" — EXCEPT on property types flagged
 * `factual: true` (ADR-100): production/real-world data offers only
 * its declared qualifiers, the epistemic bag is meaningless there.
 *
 * The form ignores the implementation detail of "default vs allowed"
 * by always showing every applicable qualifier. The maintainer chooses
 * which to fill; defaults stay visible inline, the rest collapse.
 */
import type { QualifierTypeSchema } from '@onepiece-wiki/schemas';
import type { ValueType } from './inputs';
import type { Locale } from './locale';

export type QualifierDef = {
  readonly id: string;
  readonly label: string;
  readonly valueType: ValueType;
  readonly enumRef?: string;
  readonly required?: boolean;
  /** When true, the qualifier mirrors the entry's value type. */
  readonly mirrorValueType?: boolean;
  /** Hint shown beneath the input. */
  readonly description?: string;
  /**
   * For `entity_ref` qualifiers, restrict the picker to these entity
   * types (e.g. `event` qualifier → ['event']). When omitted, every
   * entity type is allowed. When length === 1, the type Select is
   * hidden and only the searchable name picker is shown.
   */
  readonly entityTypeFilter?: readonly string[];
  /**
   * When true, the qualifier holds an array of values. The form
   * renders a stacked list of pickers with a "+" affordance instead
   * of a single input.
   */
  readonly multi?: boolean;
};

export type QualifierRegistry = Record<string, QualifierTypeSchema>;

function toDef(q: QualifierTypeSchema, locale: Locale): QualifierDef {
  const description = q.descriptions?.[locale] ?? q.descriptions?.en;
  return {
    id: q.id,
    label: q.labels[locale] ?? q.labels.en,
    valueType: q.value_type as ValueType,
    ...(q.enum_ref !== undefined ? { enumRef: q.enum_ref } : {}),
    ...(q.mirrors_entry_value ? { mirrorValueType: true } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(q.entity_type_filter !== undefined ? { entityTypeFilter: q.entity_type_filter } : {}),
    ...(q.multi ? { multi: true } : {}),
  };
}

function ofKind(
  registry: QualifierRegistry,
  kind: QualifierTypeSchema['kind'],
): readonly QualifierTypeSchema[] {
  return Object.values(registry)
    .filter((q) => q.kind === kind)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
}

export type AllowedQualifierDecl = {
  readonly id: string;
  readonly value_type: string;
  readonly enum_ref?: string | undefined;
  readonly required?: boolean | undefined;
};

/**
 * `source` is intentionally always demoted to secondary even when
 * declared in `default_qualifiers`. Inventory says `source` defaults
 * to `since`, and in practice they're identical the vast majority of
 * the time — showing both inline is duplicate noise. Maintainers who
 * need a different `source` can open "More options" and override.
 */
const ALWAYS_SECONDARY: ReadonlySet<string> = new Set(['source']);

/**
 * Resolve the full set of qualifiers for a given property entry. The
 * order is: declared `default_qualifiers` (inline) → declared
 * `allowed_qualifiers` → base qualifiers (skip anything in
 * `pinnedIds`, which the form renders as top-level fields).
 *
 * `factual` (ADR-100) is the property type's factual flag: `true`
 * marks production/real-world data, where the base epistemic bag is
 * meaningless — the base-kind registry entries are NOT appended and
 * the entry offers only the declared qualifiers.
 *
 * Returns { primary, secondary } so the EntryEditor can pin the
 * primary set inline and put the rest behind "More options".
 */
export function resolveQualifiers(
  registry: QualifierRegistry,
  locale: Locale,
  defaultIds: readonly string[],
  allowed: readonly AllowedQualifierDecl[],
  pinnedIds: readonly string[],
  factual = false,
): { primary: readonly QualifierDef[]; secondary: readonly QualifierDef[]; } {
  const primary: QualifierDef[] = [];
  const secondary: QualifierDef[] = [];
  const pinnedSet = new Set(pinnedIds);
  const seen = new Set<string>(pinnedIds);

  for (const id of defaultIds) {
    if (seen.has(id)) continue;
    const q = registry[id];
    if (q === undefined) continue;
    const def = toDef(q, locale);
    if (ALWAYS_SECONDARY.has(id)) secondary.push(def);
    else primary.push(def);
    seen.add(id);
  }

  for (const decl of allowed) {
    if (seen.has(decl.id)) continue;
    // If the property declares a qualifier by id (no metadata beyond
    // value_type), prefer the registry entry's richer metadata
    // (entityTypeFilter, multi, description, localized label) — the
    // schema's lean shape only carries value_type + enum_ref +
    // required, which is too thin for a usable picker.
    const q = registry[decl.id];
    const def: QualifierDef = q !== undefined
      ? {
        ...toDef(q, locale),
        // Schema's `required` always wins — that's a per-property
        // call the maintainer made deliberately.
        ...(decl.required === true ? { required: true } : {}),
      }
      : {
        id: decl.id,
        label: humanizeId(decl.id),
        valueType: decl.value_type as ValueType,
        ...(decl.enum_ref !== undefined ? { enumRef: decl.enum_ref } : {}),
        ...(decl.required === true ? { required: true } : {}),
      };
    secondary.push(def);
    seen.add(decl.id);
  }

  if (!factual) {
    for (const q of ofKind(registry, 'base')) {
      if (seen.has(q.id)) continue;
      if (pinnedSet.has(q.id)) continue;
      secondary.push(toDef(q, locale));
      seen.add(q.id);
    }
  }

  return { primary, secondary };
}

function humanizeId(id: string): string {
  return id
    .split(/[_-]/)
    .map((p) => p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p)
    .join(' ');
}
