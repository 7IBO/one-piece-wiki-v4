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

export type HistoryChangeGroup = {
  /** Localized property / relation-type label. */
  readonly label: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
};

export type HistoryDiffContext =
  & Pick<
    AuditContext,
    'propertyTypes' | 'vocabularies' | 'translations' | 'displayNameFor' | 'locale'
  >
  & {
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

/** One property entry as a display line: resolved value + compact
 *  provenance suffix (" · C1053") when the entry carries `since`. */
function entryLine(entry: unknown, propertyId: string, ctx: HistoryDiffContext): string {
  const propertyType = ctx.propertyTypes.get(propertyId);
  const display = entryDisplay(entry, propertyType, ctx);
  const since = entrySince(entry, ctx.sourceDisplay);
  return since !== undefined ? `${display} · ${since}` : display;
}

/** One relation edge as a display line: target name + compact since. */
function relationLine(edge: unknown, ctx: HistoryDiffContext): string {
  const record = plainObject(edge);
  const target = typeof record['target'] === 'string' ? record['target'] : '';
  const name = ctx.displayNameFor(target);
  const display = name?.[ctx.locale] ?? name?.en
    ?? (target.includes(':') ? target.split(':')[1]! : target);
  const qualifiers = plainObject(record['qualifiers']);
  const since = entrySince(qualifiers, ctx.sourceDisplay);
  return since !== undefined ? `${display} · ${since}` : display;
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
    const byType = new Map<string, { added: string[]; removed: string[]; }>();
    const bucket = (typeId: string): { added: string[]; removed: string[]; } => {
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
