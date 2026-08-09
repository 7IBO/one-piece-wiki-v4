/**
 * Generic incoming-edge manager — ADR-097. The TARGET entity's page
 * manages relation edges STORED ON OTHER entities: a crew page edits
 * its members' `member-of` edges, an arc page edits which chapters
 * point at it via `part-of-arc`, a devil-fruit page edits `ate-fruit`
 * holders, etc. This generalizes the ADR-021 cast manager (which
 * stays the surface for `appears-in` on source pages) to ANY relation
 * type in the catalogue.
 *
 * Pure functions over the already-loaded snapshot — no I/O, no
 * hardcoded relation-type ids. The reverse scan matches the accepted
 * O(entities × relations) budget of the cast/links endpoints
 * (ADR-019 risk note). I/O (display names, per-file GitHub SHAs, the
 * bulk PR flow) stays in server.ts; validation + the ADR-088
 * blocking-rule gate are injected via `IncomingPatchDeps` so this
 * module stays testable with plain objects.
 */
import type { Rule, RuleFinding } from '@onepiece-wiki/schema-engine';
import type { LinkableEntity } from './links.ts';
import { relationsOf } from './links.ts';
import { blockingRuleFindings } from './rule-block.ts';

/** Minimal relation-type slice this module reads. The catalogue's
 *  `RelationType` satisfies it structurally. */
export type IncomingRelationType = {
  readonly id: string;
  readonly valid_from_types: readonly string[];
  readonly valid_to_types: readonly string[];
};

/**
 * Gate for both endpoints: the relation type must exist in the
 * catalogue AND the page's entity type must be a valid TARGET of it.
 * Returns the 400 message, or null when the pair is coherent.
 */
export function incomingRelationError(
  relationType: IncomingRelationType | undefined,
  relationTypeId: string,
  targetType: string,
): string | null {
  if (relationType === undefined) {
    return `No relation type "${relationTypeId}" in the catalogue.`;
  }
  if (!relationType.valid_to_types.includes(targetType)) {
    return `Type "${targetType}" is not a valid target of relation "${relationType.id}" `
      + `(valid_to_types: ${relationType.valid_to_types.join(', ')}).`;
  }
  return null;
}

export type IncomingEdgeRowCore = {
  readonly sourceEntityId: string;
  readonly entityType: string;
  readonly slug: string;
  readonly qualifiers: Record<string, unknown>;
};

/**
 * Reverse-scan the catalogue for entities whose `relations[]` contain
 * `{ type: relationTypeId, target: targetId }`. One row PER EDGE (an
 * entity storing two historised edges to the same target yields two
 * rows). Sorted by entity type then slug so the manager renders a
 * stable list without client-side sorting.
 */
export function scanIncomingEdges(
  relationTypeId: string,
  targetId: string,
  entities: Iterable<LinkableEntity>,
): readonly IncomingEdgeRowCore[] {
  const rows: IncomingEdgeRowCore[] = [];
  for (const entity of entities) {
    for (const edge of relationsOf(entity)) {
      if (edge.relationType !== relationTypeId) continue;
      if (edge.target !== targetId) continue;
      rows.push({
        sourceEntityId: entity.id,
        entityType: entity.type,
        slug: String(entity.data['slug'] ?? ''),
        qualifiers: { ...edge.qualifiers },
      });
    }
  }
  return rows.sort((a, b) =>
    a.entityType === b.entityType
      ? a.slug.localeCompare(b.slug)
      : a.entityType.localeCompare(b.entityType)
  );
}

/** One per-source-entity operation after coalescing the request body.
 *  `add` and `update` collapse into `upsert` — an add whose edge
 *  already exists IS an update (dedupe rule of ADR-097). */
export type IncomingEdgePlan =
  | { readonly op: 'upsert'; readonly qualifiers: Record<string, unknown>; }
  | { readonly op: 'remove'; };

export type IncomingSaveBody = {
  readonly add?: readonly { entityId?: string; qualifiers?: Record<string, unknown>; }[];
  readonly update?: readonly { entityId?: string; qualifiers?: Record<string, unknown>; }[];
  readonly remove?: readonly string[];
  readonly expected?: readonly { entityId?: string; sha?: string | null; }[];
};

/**
 * Coalesce the request body into one plan per touched entity.
 * Precedence (last write wins per entity): remove → update → add,
 * mirroring the cast endpoint's "in both add+remove → net add" rule
 * (ADR-021 edge case 1). Malformed items (missing/empty entityId)
 * are skipped defensively.
 */
export function coalesceIncomingPlans(
  body: IncomingSaveBody,
): ReadonlyMap<string, IncomingEdgePlan> {
  const plans = new Map<string, IncomingEdgePlan>();
  for (const id of body.remove ?? []) {
    if (typeof id === 'string' && id.length > 0) plans.set(id, { op: 'remove' });
  }
  for (const item of [...(body.update ?? []), ...(body.add ?? [])]) {
    if (typeof item.entityId !== 'string' || item.entityId.length === 0) continue;
    plans.set(item.entityId, { op: 'upsert', qualifiers: item.qualifiers ?? {} });
  }
  return plans;
}

/**
 * Apply one plan to a source entity's `relations[]`:
 *  - `remove` drops EVERY edge of the (relation type, target) pair.
 *  - `upsert` replaces the FIRST matching edge in place (keeping the
 *    array position for a tidy diff), drops any additional matching
 *    edges (the manager treats the pair as one edge), or appends a
 *    fresh edge when none exists.
 * An empty qualifier bag omits the `qualifiers` key — same
 * diff-hygiene rule as the cast endpoint.
 */
export function patchIncomingRelations(
  relations: readonly Record<string, unknown>[],
  relationTypeId: string,
  targetId: string,
  plan: IncomingEdgePlan,
): Record<string, unknown>[] {
  const matches = (r: Record<string, unknown>): boolean =>
    r['type'] === relationTypeId && r['target'] === targetId;
  if (plan.op === 'remove') {
    return relations.filter((r) => !matches(r));
  }
  const nextEdge: Record<string, unknown> = {
    type: relationTypeId,
    target: targetId,
    ...(Object.keys(plan.qualifiers).length > 0 ? { qualifiers: plan.qualifiers } : {}),
  };
  if (!relations.some(matches)) return [...relations, nextEdge];
  let replaced = false;
  const next: Record<string, unknown>[] = [];
  for (const r of relations) {
    if (!matches(r)) {
      next.push(r);
      continue;
    }
    if (!replaced) {
      next.push(nextEdge);
      replaced = true;
    }
    // Additional matching edges are dropped — one edge per pair.
  }
  return next;
}

export type ValidationIssueOut = {
  readonly path: readonly string[];
  readonly message: string;
};

/** Injected I/O-free view of the catalogue + validators, so the file
 *  builder stays pure and unit-testable. */
export type IncomingPatchDeps = {
  /** `type:slug` (as scanned) lookup into the snapshot. */
  readonly findEntity: (entityId: string) => LinkableEntity | undefined;
  /** `buildEntitySchema(type, validated)` behind a narrow interface. */
  readonly schemaFor: (entityType: string) =>
    | {
      safeParse: (data: unknown) =>
        | { success: true; }
        | {
          success: false;
          error: { errors: readonly { path: readonly (string | number)[]; message: string; }[]; };
        };
    }
    | undefined;
  /** Rules of the catalogue — the ADR-088 blocking gate runs per
   *  patched entity. */
  readonly rules: () => Iterable<Rule>;
  /** Repo-relative data path of an entity file. */
  readonly pathFor: (entityType: string, fileBase: string) => string;
  /** Client-provided expected SHA for the optimistic lock; null when
   *  the client had none (lock check skipped for that file). */
  readonly expectedShaFor: (entityId: string) => string | null;
};

export type IncomingEdgeFile = {
  readonly path: string;
  readonly content: string;
  readonly expectedSha: string | null;
};

export type IncomingPatchResult =
  | { readonly kind: 'bad_request'; readonly message: string; }
  | {
    readonly kind: 'validation_failed';
    readonly entityId: string;
    readonly issues: readonly ValidationIssueOut[];
  }
  | {
    readonly kind: 'rule_blocked';
    readonly entityId: string;
    readonly findings: readonly RuleFinding[];
  }
  | { readonly kind: 'ok'; readonly files: readonly IncomingEdgeFile[]; };

/**
 * Walk every plan: load the source entity, patch its `relations[]`,
 * validate the patched entity with the generated Zod schema, then run
 * the ADR-088 blocking-rule gate. First failure wins (the whole save
 * is refused — one PR is all-or-nothing). On success returns the file
 * list ready for `submitIncomingEdgesEdit`.
 */
export function buildIncomingEdgeFiles(
  relationType: IncomingRelationType,
  targetId: string,
  plans: ReadonlyMap<string, IncomingEdgePlan>,
  deps: IncomingPatchDeps,
): IncomingPatchResult {
  const files: IncomingEdgeFile[] = [];
  for (const [entityId, plan] of plans) {
    const [entityType, fileBase] = entityId.split(':') as [string, string | undefined];
    if (entityType === '' || fileBase === undefined || fileBase === '') {
      return {
        kind: 'bad_request',
        message: `Malformed entityId "${entityId}" — expected "<type>:<slug>".`,
      };
    }
    const entity = deps.findEntity(entityId);
    if (entity === undefined) {
      return { kind: 'bad_request', message: `No entity ${entityId} in the catalogue.` };
    }
    const relations = Array.isArray(entity.data['relations'])
      ? (entity.data['relations'] as Record<string, unknown>[])
      : [];
    // Appending a brand-new edge requires the source type to be a
    // valid FROM type of the relation (schema-driven — same list the
    // add-picker filters on). Updates/removes of an existing edge are
    // always allowed, so legacy data can still be cleaned up.
    const hasEdge = relations.some((r) =>
      r['type'] === relationType.id && r['target'] === targetId
    );
    if (plan.op === 'upsert' && !hasEdge && !relationType.valid_from_types.includes(entity.type)) {
      return {
        kind: 'bad_request',
        message: `Entity type "${entity.type}" cannot hold a "${relationType.id}" relation `
          + `(valid_from_types: ${relationType.valid_from_types.join(', ')}).`,
      };
    }

    const nextData = {
      ...entity.data,
      relations: patchIncomingRelations(relations, relationType.id, targetId, plan),
    };
    const schema = deps.schemaFor(entity.type);
    if (schema === undefined) {
      return {
        kind: 'bad_request',
        message: `No schema registered for entity type "${entity.type}".`,
      };
    }
    const validation = schema.safeParse(nextData);
    if (!validation.success) {
      return {
        kind: 'validation_failed',
        entityId,
        issues: validation.error.errors.map((i) => ({
          path: i.path.map((p) => String(p)),
          message: i.message,
        })),
      };
    }
    const blocked = blockingRuleFindings(nextData, entity.type, deps.rules());
    if (blocked.length > 0) {
      return { kind: 'rule_blocked', entityId, findings: blocked };
    }
    files.push({
      path: deps.pathFor(entity.type, fileBase),
      content: `${JSON.stringify(nextData, null, 2)}\n`,
      expectedSha: deps.expectedShaFor(entityId),
    });
  }
  return { kind: 'ok', files };
}
