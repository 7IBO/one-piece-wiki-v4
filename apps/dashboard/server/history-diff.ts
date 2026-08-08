/**
 * Semantic entity-history diff (2026-08 feedback: "afficher sous
 * forme de changements de propriétés et valeurs, pas en mode json").
 *
 * Compares two versions of an entity JSON file (the contents at a
 * commit and at its predecessor) and reports PER PROPERTY / PER
 * RELATION TYPE which values were added and which were removed —
 * every value resolved through the same display machinery as the
 * audit endpoint (vocabulary labels, translated value keys, number +
 * unit, display names for refs, compact `C96` provenance), never raw
 * JSON.
 *
 * Entry matching is by deep structural equality (multiset semantics):
 * an entry edited in place therefore reports as one removal + one
 * addition — exactly how a reviewer reads a value change.
 */
import { type AuditContext, entryDisplay, entrySince } from './audit.ts';

/**
 * One change line, split for the quiet-by-default rendering (2026-08
 * feedback): `text` is the compact value + `since` provenance shown by
 * default ("Mort · C574"); `details` carries the OTHER qualifiers
 * (`Label : Valeur`, ` · `-joined) behind a per-line "see more".
 */
export type HistoryChangeLine = {
  readonly text: string;
  readonly details?: string;
};

export type HistoryChangeGroup = {
  /** Localized property / relation-type label. */
  readonly label: string;
  readonly added: readonly HistoryChangeLine[];
  readonly removed: readonly HistoryChangeLine[];
};

/* Structural "Like" types (same pattern as audit.ts) so tests build
 * fixtures without the full Zod-inferred schemas. The validated
 * catalogue types are structurally assignable to these. */

type QualifierTypeLike = {
  readonly labels: { readonly en?: string; readonly fr?: string; };
  readonly value_type?: string | undefined;
  readonly enum_ref?: string | undefined;
};

type RelationQualifierDeclLike = {
  readonly id: string;
  readonly value_type?: string | undefined;
  readonly enum_ref?: string | undefined;
};

type RelationTypeLike = {
  readonly qualifiers?: readonly RelationQualifierDeclLike[] | undefined;
};

export type HistoryDiffContext =
  & Pick<
    AuditContext,
    'propertyTypes' | 'vocabularies' | 'translations' | 'displayNameFor' | 'locale'
  >
  & {
    /** Qualifier-type registry — labels + value types for the extra
     *  qualifiers carried by entries/edges (ADR-078; never hardcoded). */
    readonly qualifierTypes: ReadonlyMap<string, QualifierTypeLike>;
    /** Relation-type catalogue — a relation qualifier's `enum_ref`
     *  lives on the relation type's own declaration, not the registry. */
    readonly relationTypes: ReadonlyMap<string, RelationTypeLike>;
    /** Localized label for a property id (falls back to the id). */
    readonly propertyLabel: (id: string) => string;
    /** Localized ACTIVE label for a relation-type id. */
    readonly relationLabel: (id: string) => string;
    /** Compact display for a source id (`C96`) — audit's sourceIdDisplay. */
    readonly sourceDisplay: (id: string) => string;
  };

function plainObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asList(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Deterministic serialization — object keys sorted at every depth so
 *  structurally-equal entries compare equal regardless of key order. */
export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(record[k])}`).join(',')}}`;
}

/** Multiset difference: items of `a` not matched (by serialization)
 *  in `b` — each `b` occurrence cancels at most one `a` occurrence. */
function multisetDiff(a: readonly unknown[], b: readonly unknown[]): readonly unknown[] {
  const counts = new Map<string, number>();
  for (const item of b) {
    const key = stableSerialize(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: unknown[] = [];
  for (const item of a) {
    const key = stableSerialize(item);
    const left = counts.get(key) ?? 0;
    if (left > 0) counts.set(key, left - 1);
    else out.push(item);
  }
  return out;
}

/**
 * Display for one qualifier VALUE, resolved by its declared value
 * type: `source_ref` compacts like `since` ("C574"), `entity_ref`
 * resolves to a display name, enums resolve through vocabularies,
 * arrays join their resolved items with a comma (same rules as the
 * links panel's `formatQualifierValue`).
 */
function qualifierValueDisplay(
  value: unknown,
  valueType: string | undefined,
  enumRef: string | undefined,
  ctx: HistoryDiffContext,
): string {
  if (Array.isArray(value)) {
    return value.map((v) => qualifierValueDisplay(v, valueType, enumRef, ctx)).join(', ');
  }
  const other: 'en' | 'fr' = ctx.locale === 'fr' ? 'en' : 'fr';
  if (typeof value === 'string') {
    if (valueType === 'source_ref') return ctx.sourceDisplay(value);
    if (valueType === 'entity_ref') {
      const name = ctx.displayNameFor(value);
      return name?.[ctx.locale] ?? name?.[other]
        ?? (value.includes(':') ? value.split(':')[1]! : value);
    }
    if (enumRef !== undefined) {
      const term = ctx.vocabularies.get(enumRef)?.values[value];
      const label = term?.labels[ctx.locale] ?? term?.labels[other];
      if (label !== undefined) return label;
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return stableSerialize(value);
}

/**
 * Every OTHER qualifier carried by an entry/edge, as `Label : Valeur`
 * parts (the links panel's format — key labels via the qualifier-type
 * registry, never raw snake_case). `skip` holds the fields already
 * rendered (value/value_key + since); `declarations` are the relation
 * type's own qualifier declarations, which carry the `enum_ref` for
 * relation qualifiers (the registry is the fallback).
 */
function qualifierParts(
  record: Record<string, unknown>,
  skip: ReadonlySet<string>,
  declarations: readonly RelationQualifierDeclLike[] | undefined,
  ctx: HistoryDiffContext,
): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (skip.has(key) || value === undefined || value === null) continue;
    const registry = ctx.qualifierTypes.get(key);
    const declaration = declarations?.find((d) => d.id === key);
    const label = registry?.labels[ctx.locale] ?? registry?.labels.en ?? key;
    const valueType = declaration?.value_type ?? registry?.value_type;
    const enumRef = declaration?.enum_ref ?? registry?.enum_ref;
    parts.push(`${label} : ${qualifierValueDisplay(value, valueType, enumRef, ctx)}`);
  }
  return parts;
}

/** Entry fields that are NOT extra qualifiers: the value itself and
 *  the `since` provenance, both already rendered ahead of the suffix. */
const ENTRY_VALUE_FIELDS: ReadonlySet<string> = new Set(['value', 'value_key', 'since']);
const EDGE_RENDERED_FIELDS: ReadonlySet<string> = new Set(['since']);

/** `text` + optional `details` from the already-rendered head parts
 *  (value · since) and the extra-qualifier parts. */
function changeLine(
  headParts: readonly string[],
  qualifiers: readonly string[],
): HistoryChangeLine {
  const text = headParts.join(' · ');
  return qualifiers.length > 0 ? { text, details: qualifiers.join(' · ') } : { text };
}

/** One property entry as a change line: `text` = resolved value +
 *  compact provenance ("Mort · C574") when the entry carries `since`;
 *  every other qualifier goes to `details` as `Label : Valeur`
 *  (links-panel format), shown by the client only on demand. */
function entryLine(entry: unknown, propertyId: string, ctx: HistoryDiffContext): HistoryChangeLine {
  const propertyType = ctx.propertyTypes.get(propertyId);
  const display = entryDisplay(entry, propertyType, ctx);
  const since = entrySince(entry, ctx.sourceDisplay);
  return changeLine(
    since !== undefined ? [display, since] : [display],
    qualifierParts(plainObject(entry), ENTRY_VALUE_FIELDS, undefined, ctx),
  );
}

/** One relation edge as a change line: `text` = target name + compact
 *  since; every other qualifier goes to `details` as `Label : Valeur`. */
function relationLine(edge: unknown, ctx: HistoryDiffContext): HistoryChangeLine {
  const record = plainObject(edge);
  const target = typeof record['target'] === 'string' ? record['target'] : '';
  const name = ctx.displayNameFor(target);
  const display = name?.[ctx.locale] ?? name?.en
    ?? (target.includes(':') ? target.split(':')[1]! : target);
  const qualifiers = plainObject(record['qualifiers']);
  const since = entrySince(qualifiers, ctx.sourceDisplay);
  const typeId = typeof record['type'] === 'string' ? record['type'] : '';
  const declarations = ctx.relationTypes.get(typeId)?.qualifiers;
  return changeLine(
    since !== undefined ? [display, since] : [display],
    qualifierParts(qualifiers, EDGE_RENDERED_FIELDS, declarations, ctx),
  );
}

/**
 * Structured changes between two entity versions. `oldData` null =
 * the file did not exist before (creation commit) — everything
 * reports as added.
 */
export function diffEntityData(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  ctx: HistoryDiffContext,
): readonly HistoryChangeGroup[] {
  const groups: HistoryChangeGroup[] = [];

  const oldProps = plainObject(oldData?.['properties']);
  const newProps = plainObject(newData?.['properties']);
  const propertyIds = [...new Set([...Object.keys(newProps), ...Object.keys(oldProps)])];
  for (const propertyId of propertyIds) {
    const before = asList(oldProps[propertyId]);
    const after = asList(newProps[propertyId]);
    const added = multisetDiff(after, before);
    const removed = multisetDiff(before, after);
    if (added.length === 0 && removed.length === 0) continue;
    groups.push({
      label: ctx.propertyLabel(propertyId),
      added: added.map((e) => entryLine(e, propertyId, ctx)),
      removed: removed.map((e) => entryLine(e, propertyId, ctx)),
    });
  }

  // Relations, grouped by relation type so the label reads naturally
  // ("Membre de : + Équipage de Barbe Blanche").
  const oldRels = asList(oldData?.['relations']);
  const newRels = asList(newData?.['relations']);
  const addedRels = multisetDiff(newRels, oldRels);
  const removedRels = multisetDiff(oldRels, newRels);
  if (addedRels.length > 0 || removedRels.length > 0) {
    const byType = new Map<string, { added: HistoryChangeLine[]; removed: HistoryChangeLine[]; }>();
    const bucket = (
      typeId: string,
    ): { added: HistoryChangeLine[]; removed: HistoryChangeLine[]; } => {
      const existing = byType.get(typeId);
      if (existing !== undefined) return existing;
      const fresh = { added: [], removed: [] };
      byType.set(typeId, fresh);
      return fresh;
    };
    for (const edge of addedRels) {
      const typeId = String(plainObject(edge)['type'] ?? '');
      bucket(typeId).added.push(relationLine(edge, ctx));
    }
    for (const edge of removedRels) {
      const typeId = String(plainObject(edge)['type'] ?? '');
      bucket(typeId).removed.push(relationLine(edge, ctx));
    }
    for (const [typeId, lines] of byType) {
      groups.push({
        label: ctx.relationLabel(typeId),
        added: lines.added,
        removed: lines.removed,
      });
    }
  }

  return groups;
}
