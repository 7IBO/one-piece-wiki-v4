/**
 * Pure, composable transforms a migration's `up` function can call.
 * Each takes an entity's data and returns either a new data object
 * (when it changed something) or the original reference unchanged.
 * They never mutate the input — the runner relies on structural
 * comparison, so referential purity keeps behaviour predictable.
 */
import type { EntityData } from './types.ts';

function clone(data: EntityData): EntityData {
  return structuredClone(data);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Rename a property key, preserving the surrounding key order. */
export function renameProperty(data: EntityData, from: string, to: string): EntityData {
  const props = asRecord(data['properties']);
  if (props === null || !(from in props)) return data;
  const next = clone(data);
  const original = next['properties'] as Record<string, unknown>;
  const rebuilt: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(original)) {
    rebuilt[key === from ? to : key] = value;
  }
  next['properties'] = rebuilt;
  return next;
}

/** Drop a property entirely. */
export function removeProperty(data: EntityData, name: string): EntityData {
  const props = asRecord(data['properties']);
  if (props === null || !(name in props)) return data;
  const next = clone(data);
  delete (next['properties'] as Record<string, unknown>)[name];
  return next;
}

/** Rename a relation `type` on every matching relation entry. */
export function renameRelationType(data: EntityData, from: string, to: string): EntityData {
  const relations = data['relations'];
  if (!Array.isArray(relations)) return data;
  let touched = false;
  const next = clone(data);
  for (const rel of next['relations'] as unknown[]) {
    const record = asRecord(rel);
    if (record !== null && record['type'] === from) {
      record['type'] = to;
      touched = true;
    }
  }
  return touched ? next : data;
}

/** Drop every relation of a given type. */
export function removeRelationType(data: EntityData, type: string): EntityData {
  const relations = data['relations'];
  if (!Array.isArray(relations)) return data;
  const filtered = relations.filter((rel) => asRecord(rel)?.['type'] !== type);
  if (filtered.length === relations.length) return data;
  const next = clone(data);
  next['relations'] = filtered;
  return next;
}

/**
 * Rename a qualifier key inside every relation of `relationType`.
 * Useful when a relation-type schema renames one of its qualifiers.
 */
export function renameRelationQualifier(
  data: EntityData,
  relationType: string,
  from: string,
  to: string,
): EntityData {
  const relations = data['relations'];
  if (!Array.isArray(relations)) return data;
  let touched = false;
  const next = clone(data);
  for (const rel of next['relations'] as unknown[]) {
    const record = asRecord(rel);
    if (record === null || record['type'] !== relationType) continue;
    const qualifiers = asRecord(record['qualifiers']);
    if (qualifiers === null || !(from in qualifiers)) continue;
    const rebuilt: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(qualifiers)) {
      rebuilt[key === from ? to : key] = value;
    }
    record['qualifiers'] = rebuilt;
    touched = true;
  }
  return touched ? next : data;
}
