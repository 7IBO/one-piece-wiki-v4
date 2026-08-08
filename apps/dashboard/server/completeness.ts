/**
 * Per-entity completeness (ADR-083). "Expected" fields are read from
 * the entity-type declaration — properties flagged `required` OR
 * `recommended`, plus every `recommended_relations` entry — so the
 * computation stays schema-driven (no property name ever appears in
 * code) and future types/universes inherit it for free.
 *
 * Advisory only: validation never blocks on completeness. The list
 * endpoint attaches `{ filled, expected }` to each row and the
 * dashboard renders it as a subtle meter.
 */

export type Completeness = {
  readonly filled: number;
  readonly expected: number;
};

/** The precomputed per-type expectation — derive once, apply per entity. */
export type CompletenessExpectation = {
  readonly propertyIds: readonly string[];
  readonly relationTypeIds: readonly string[];
};

type EntityTypeLike = {
  readonly properties: readonly {
    readonly id: string;
    readonly required: boolean;
    readonly recommended: boolean;
  }[];
  readonly recommended_relations?: readonly string[] | undefined;
};

/**
 * Read the expectation off a validated entity-type declaration.
 * `undefined` (unknown type) yields an empty expectation, which
 * `computeCompleteness` reports as `expected: 0` — callers can hide
 * the meter in that case.
 */
export function completenessExpectation(
  entityType: EntityTypeLike | undefined,
): CompletenessExpectation {
  if (entityType === undefined) return { propertyIds: [], relationTypeIds: [] };
  return {
    propertyIds: entityType.properties
      .filter((p) => p.required || p.recommended)
      .map((p) => p.id),
    relationTypeIds: entityType.recommended_relations ?? [],
  };
}

/**
 * Count how many expected fields the entity actually carries.
 *
 * - A property is filled when its key is present with ≥1 entry:
 *   historical properties hold an array (length ≥ 1), non-historical
 *   ones hold a single entry object (presence counts).
 * - A recommended relation is filled when ≥1 relation of that type
 *   exists, regardless of target.
 *
 * O(properties + relations) over the already-loaded entity data — no
 * extra I/O.
 */
export function computeCompleteness(
  data: Record<string, unknown>,
  expectation: CompletenessExpectation,
): Completeness {
  const expected = expectation.propertyIds.length + expectation.relationTypeIds.length;
  let filled = 0;

  const rawProperties = data['properties'];
  const properties = rawProperties !== null && typeof rawProperties === 'object'
      && !Array.isArray(rawProperties)
    ? (rawProperties as Record<string, unknown>)
    : {};
  for (const id of expectation.propertyIds) {
    const value = properties[id];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) ? value.length > 0 : true) filled += 1;
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
      if (present.has(id)) filled += 1;
    }
  }

  return { filled, expected };
}
