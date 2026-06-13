/**
 * Coherence checker: cross-entity consistency rules that go beyond
 * single-file validation (`validate`) and bare reference existence
 * (`check:references`). Pure and schema-driven — it reads the resolved
 * catalogue and the loaded entities; it hardcodes no property, relation
 * or entity-type id.
 *
 * Errors (fail CI):
 *  - UNKNOWN_RELATION_TYPE          relation `type` absent from the catalogue
 *  - RELATION_NOT_ALLOWED           relation `type` not in the source
 *                                   entity-type's `allowed_relations`
 *  - RELATION_INVALID_SOURCE_TYPE   source entity type ∉ relation
 *                                   `valid_from_types`
 *  - RELATION_INVALID_TARGET_TYPE   target entity type ∉ relation
 *                                   `valid_to_types`
 *  - RELATION_MISSING_REQUIRED_QUALIFIER  a `required` relation qualifier
 *                                   is absent
 *
 * Warnings (reported, do not fail CI):
 *  - UNREFERENCED_ENTITY            no other entity points at this one
 *                                   (relation target, entity/source ref,
 *                                   or a since/until/source/event axis) —
 *                                   a coherence smell, e.g. an uploaded
 *                                   image no entity depicts.
 */
import type { LoadedEntity } from './entity-loader.ts';
import type { ValidatedCatalogue } from './meta-validator.ts';

export type CoherenceFinding = {
  readonly code:
    | 'UNKNOWN_RELATION_TYPE'
    | 'RELATION_NOT_ALLOWED'
    | 'RELATION_INVALID_SOURCE_TYPE'
    | 'RELATION_INVALID_TARGET_TYPE'
    | 'RELATION_MISSING_REQUIRED_QUALIFIER'
    | 'UNREFERENCED_ENTITY';
  readonly severity: 'error' | 'warning';
  readonly source: string;
  readonly path: string;
  readonly message: string;
};

const ENTITY_REF = /^[a-z0-9-]+:[a-z0-9-]+$/;
const isEntityRef = (value: unknown): value is string =>
  typeof value === 'string' && ENTITY_REF.test(value);

/** A single ref or an array of refs (the `since`/`source` authoring forms). */
function refList(value: unknown): readonly string[] {
  if (isEntityRef(value)) return [value];
  if (Array.isArray(value)) return value.filter(isEntityRef);
  return [];
}

type RelationRecord = {
  readonly type?: unknown;
  readonly target?: unknown;
  readonly qualifiers?: unknown;
};

/** Every entity id pointed at by `from`, across relations + property axes. */
function collectReferencedIds(entities: ReadonlyMap<string, LoadedEntity>): ReadonlySet<string> {
  const referenced = new Set<string>();
  const axisFields = ['since', 'until', 'source', 'event'] as const;

  for (const entity of entities.values()) {
    const data = entity.data as {
      properties?: Record<string, unknown>;
      relations?: unknown[];
    };

    if (Array.isArray(data.relations)) {
      for (const rel of data.relations) {
        if (rel === null || typeof rel !== 'object') continue;
        const record = rel as RelationRecord;
        if (isEntityRef(record.target)) referenced.add(record.target);
        if (record.qualifiers !== null && typeof record.qualifiers === 'object') {
          for (const field of axisFields) {
            for (const ref of refList((record.qualifiers as Record<string, unknown>)[field])) {
              referenced.add(ref);
            }
          }
        }
      }
    }

    if (data.properties !== undefined && data.properties !== null) {
      for (const value of Object.values(data.properties)) {
        const entries = Array.isArray(value) ? value : [value];
        for (const entry of entries) {
          if (entry === null || typeof entry !== 'object') continue;
          const record = entry as Record<string, unknown>;
          for (const ref of refList(record['value'])) referenced.add(ref);
          for (const field of axisFields) {
            for (const ref of refList(record[field])) referenced.add(ref);
          }
        }
      }
    }
  }

  return referenced;
}

/**
 * Run every coherence rule over the loaded entities. Returns a flat,
 * severity-tagged finding list; the caller decides exit behaviour
 * (errors fail, warnings inform).
 */
export function checkCoherence(
  entities: ReadonlyMap<string, LoadedEntity>,
  catalogue: ValidatedCatalogue,
): readonly CoherenceFinding[] {
  const findings: CoherenceFinding[] = [];

  for (const entity of entities.values()) {
    const entityType = catalogue.entityTypes.get(entity.type);
    // Missing entity type is an entity-loader concern; skip here.
    if (entityType === undefined) continue;

    const allowed = new Set<string>(entityType.allowed_relations);
    const data = entity.data as { relations?: unknown[]; };
    if (!Array.isArray(data.relations)) continue;

    for (const [index, rel] of data.relations.entries()) {
      if (rel === null || typeof rel !== 'object') continue;
      const record = rel as RelationRecord;
      const relType = typeof record.type === 'string' ? record.type : undefined;
      if (relType === undefined) continue;
      const path = `relations[${index}]`;

      const relationType = catalogue.relationTypes.get(relType);
      if (relationType === undefined) {
        findings.push({
          code: 'UNKNOWN_RELATION_TYPE',
          severity: 'error',
          source: entity.id,
          path: `${path}.type`,
          message: `Relation type "${relType}" is not in the catalogue.`,
        });
        continue;
      }

      if (!allowed.has(relType)) {
        findings.push({
          code: 'RELATION_NOT_ALLOWED',
          severity: 'error',
          source: entity.id,
          path: `${path}.type`,
          message: `Relation "${relType}" is not in ${entity.type}'s allowed_relations.`,
        });
      }

      if (!(relationType.valid_from_types as readonly string[]).includes(entity.type)) {
        findings.push({
          code: 'RELATION_INVALID_SOURCE_TYPE',
          severity: 'error',
          source: entity.id,
          path: `${path}.type`,
          message: `"${relType}" cannot start from a ${entity.type} (valid_from_types: ${
            relationType.valid_from_types.join(', ')
          }).`,
        });
      }

      const target = isEntityRef(record.target) ? record.target : undefined;
      if (target !== undefined) {
        const targetEntity = entities.get(target);
        if (
          targetEntity !== undefined
          && !(relationType.valid_to_types as readonly string[]).includes(targetEntity.type)
        ) {
          findings.push({
            code: 'RELATION_INVALID_TARGET_TYPE',
            severity: 'error',
            source: entity.id,
            path: `${path}.target`,
            message:
              `"${relType}" cannot point at a ${targetEntity.type} (${target}); valid_to_types: ${
                relationType.valid_to_types.join(', ')
              }.`,
          });
        }
      }

      const qualifiers = record.qualifiers !== null && typeof record.qualifiers === 'object'
        ? record.qualifiers as Record<string, unknown>
        : {};
      for (const qualifier of relationType.qualifiers) {
        if (qualifier.required && qualifiers[qualifier.id] === undefined) {
          findings.push({
            code: 'RELATION_MISSING_REQUIRED_QUALIFIER',
            severity: 'error',
            source: entity.id,
            path: `${path}.qualifiers.${qualifier.id}`,
            message: `Relation "${relType}" requires qualifier "${qualifier.id}".`,
          });
        }
      }
    }
  }

  const referenced = collectReferencedIds(entities);
  for (const entity of entities.values()) {
    if (!referenced.has(entity.id)) {
      findings.push({
        code: 'UNREFERENCED_ENTITY',
        severity: 'warning',
        source: entity.id,
        path: '<entity>',
        message:
          `Nothing references ${entity.id} (no relation target, entity/source ref, or axis).`,
      });
    }
  }

  return findings;
}
