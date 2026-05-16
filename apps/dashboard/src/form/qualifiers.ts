/**
 * Qualifier registry for the entry editor.
 *
 * Per /docs/SCHEMA_SPEC.md, every historisable property entry can carry
 * two flavors of qualifier:
 *
 *  1. **Base qualifiers** — implicit on every entry, provided by the
 *     schema engine (epistemic_status, actual_value, event,
 *     believed_by, known_truth_by, assisted_by, review_status). Property
 *     types MUST NOT redeclare them. We hardcode their value-types here.
 *
 *  2. **Property-declared qualifiers** — listed by id in
 *     `default_qualifiers` (shown inline on the entry) or in
 *     `allowed_qualifiers` with full type info (shown behind "More
 *     options"). When a property declares only the id (e.g.
 *     `default_qualifiers: ["since", "source"]`) we resolve the id
 *     against the COMMON_QUALIFIERS table.
 *
 * The form ignores the implementation detail of "default vs allowed"
 * by always showing every applicable qualifier. The maintainer chooses
 * which to fill; defaults stay visible inline, the rest collapse.
 */
import type { ValueType } from './inputs';

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
   * of a single input. Per inventory, `believed_by` and
   * `known_truth_by` are `entity_ref[]`.
   */
  readonly multi?: boolean;
};

/**
 * Base qualifiers — always available on every historisable entry.
 * Order chosen so the most common (epistemic_status) sits first.
 */
export const BASE_QUALIFIERS: readonly QualifierDef[] = [
  {
    id: 'epistemic_status',
    label: 'Epistemic status',
    valueType: 'enum',
    enumRef: 'epistemic-statuses',
    description: 'What kind of truth this is. Defaults to "true".',
  },
  {
    id: 'actual_value',
    label: 'Actual value',
    valueType: 'string',
    mirrorValueType: true,
    description: 'The real value when status is a false belief.',
  },
  {
    id: 'event',
    label: 'Event',
    valueType: 'entity_ref',
    entityTypeFilter: ['event'],
    description: 'The event that caused or revealed this value.',
  },
  {
    id: 'believed_by',
    label: 'Believed by',
    valueType: 'entity_ref',
    entityTypeFilter: ['character'],
    multi: true,
    description: 'Characters who hold this belief.',
  },
  {
    id: 'known_truth_by',
    label: 'Known truth by',
    valueType: 'entity_ref',
    entityTypeFilter: ['character'],
    multi: true,
    description: 'Characters who know the actual truth.',
  },
  {
    id: 'assisted_by',
    label: 'Assisted by',
    valueType: 'string',
    description: 'AI agent that generated this value (absent = human).',
  },
  {
    id: 'review_status',
    label: 'Review status',
    valueType: 'enum',
    enumRef: 'review-statuses',
    description: 'Human-review state. Defaults to "reviewed".',
  },
];

/**
 * Common property-declared qualifiers referenced by id-only in
 * `default_qualifiers`. The schema spec lists these in
 * /docs/SCHEMA_SPEC.md § "Common property-declared qualifiers".
 */
export const COMMON_QUALIFIERS: Record<string, QualifierDef> = {
  since: {
    id: 'since',
    label: 'Since',
    valueType: 'source_ref',
    multi: true,
    description: 'When this value starts applying. Record both manga + anime if you know both.',
  },
  until: {
    id: 'until',
    label: 'Until',
    valueType: 'source_ref',
    multi: true,
    description: 'When this value stops applying.',
  },
  source: {
    id: 'source',
    label: 'Source',
    valueType: 'source_ref',
    multi: true,
    description: 'Source(s) citing the value.',
  },
  canon_scope: {
    id: 'canon_scope',
    label: 'Canon scope',
    valueType: 'enum',
    enumRef: 'canon-scopes',
    description: 'Restrict the value to a specific canon.',
  },
  in_universe_date: {
    id: 'in_universe_date',
    label: 'In-universe date',
    valueType: 'string',
    description: 'In-universe date (e.g. "12_years_before_story").',
  },
  // Used by name/epithet — who gave this name to the entity. Locked
  // to characters: bystander events / chapters don't "give" names.
  given_by: {
    id: 'given_by',
    label: 'Given by',
    valueType: 'entity_ref',
    entityTypeFilter: ['character'],
    description: 'Character who gave the name.',
  },
  // Used by name/epithet — short prose context (battlefield speech,
  // bounty poster, etc.). Free-form string.
  context: {
    id: 'context',
    label: 'Context',
    valueType: 'string',
    description: 'Short context for the value.',
  },
  // Used by name — what kind of name (alias, given, family…).
  // Schema declares it with enum_ref so it's fine to keep as bare
  // allowed_qualifiers; the COMMON entry below just gives it a nicer
  // localized label.
  name_type: {
    id: 'name_type',
    label: 'Name type',
    valueType: 'enum',
    enumRef: 'name-types',
    description: 'Which kind of name (alias, given, family…).',
  },
};

/**
 * Resolve the full set of qualifiers for a given property entry. The
 * order is: declared `default_qualifiers` (inline) → declared
 * `allowed_qualifiers` → base qualifiers (skip `since` if already in
 * defaults, since the form renders it as a top-level field).
 *
 * Returns a tuple { primary, secondary } so the EntryEditor can pin
 * the primary set inline and put the rest behind "More options".
 *
 * `source` is intentionally always demoted to secondary even when
 * declared in `default_qualifiers`. Inventory says `source` defaults
 * to `since`, and in practice they're identical the vast majority of
 * the time — showing both inline is duplicate noise. Maintainers who
 * need a different `source` can open "More options" and override.
 */
export type AllowedQualifierDecl = {
  readonly id: string;
  readonly value_type: string;
  readonly enum_ref?: string | undefined;
  readonly required?: boolean | undefined;
};

const ALWAYS_SECONDARY: ReadonlySet<string> = new Set(['source']);

export function resolveQualifiers(
  defaultIds: readonly string[],
  allowed: readonly AllowedQualifierDecl[],
  pinnedIds: readonly string[],
): { primary: readonly QualifierDef[]; secondary: readonly QualifierDef[]; } {
  const primary: QualifierDef[] = [];
  const secondary: QualifierDef[] = [];
  const pinnedSet = new Set(pinnedIds);
  const seen = new Set<string>(pinnedIds);

  for (const id of defaultIds) {
    if (seen.has(id)) continue;
    const def = COMMON_QUALIFIERS[id];
    if (def === undefined) continue;
    if (ALWAYS_SECONDARY.has(id)) secondary.push(def);
    else primary.push(def);
    seen.add(id);
  }

  for (const decl of allowed) {
    if (seen.has(decl.id)) continue;
    // If the property declares a qualifier by id (no metadata beyond
    // value_type), prefer the COMMON_QUALIFIERS entry's richer
    // metadata (entityTypeFilter, multi, description, label) — the
    // schema's lean shape only carries value_type + enum_ref +
    // required, which is too thin for a usable picker.
    const common = COMMON_QUALIFIERS[decl.id];
    const def: QualifierDef = common !== undefined
      ? {
        ...common,
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

  for (const def of BASE_QUALIFIERS) {
    if (seen.has(def.id)) continue;
    if (pinnedSet.has(def.id)) continue;
    secondary.push(def);
    seen.add(def.id);
  }

  return { primary, secondary };
}

function humanizeId(id: string): string {
  return id
    .split(/[_-]/)
    .map((p) => p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p)
    .join(' ');
}
