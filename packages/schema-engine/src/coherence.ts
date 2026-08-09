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
 *  - DUPLICATE_RELATION             an exact-duplicate relation (identical
 *                                   type + target + qualifiers) on one entity
 *  - DUPLICATE_PROPERTY_VALUE       an exact-duplicate entry within one
 *                                   property's history
 *  - RULE_FINDING (blocking only)   a declarative rule with
 *                                   `enforcement: 'blocking'` (ADR-088)
 *                                   matched — structurally-always-wrong
 *                                   data
 *
 * Warnings (reported, do not fail CI):
 *  - RULE_FINDING (advisory)        a declarative advisory rule matched
 *                                   (ADR-085 — canon-exception knowledge)
 *  - UNREFERENCED_ENTITY            no other entity points at this one
 *                                   (relation target, entity/source ref,
 *                                   or a since/until/source/event axis) —
 *                                   a coherence smell, e.g. an uploaded
 *                                   image no entity depicts.
 */
import {
  ENTITY_ID_PATTERN,
  ENTITY_REF_ITEM_QUALIFIER_IDS,
  entityRefItems,
  entityRefItemSources,
  RELATION_BASE_QUALIFIER_IDS,
} from '@onepiece-wiki/schemas';
import type { LoadedEntity } from './entity-loader.ts';
import type { ValidatedCatalogue } from './meta-validator.ts';
import { type CorpusContext, evaluateRules, relationIsActive } from './rules.ts';

export type CoherenceFinding = {
  readonly code:
    | 'UNKNOWN_RELATION_TYPE'
    | 'RELATION_NOT_ALLOWED'
    | 'RELATION_INVALID_SOURCE_TYPE'
    | 'RELATION_INVALID_TARGET_TYPE'
    | 'RELATION_MISSING_REQUIRED_QUALIFIER'
    | 'UNREFERENCED_ENTITY'
    // schema-level (no entity data needed)
    | 'SCHEMA_ALLOWED_RELATION_UNKNOWN'
    | 'SCHEMA_ALLOWED_RELATION_INVALID_SOURCE'
    | 'SCHEMA_UNIVERSE_SCOPE_LEAK'
    | 'RELATION_DECLARES_BASE_QUALIFIER'
    | 'DUPLICATE_RELATION'
    | 'DUPLICATE_PROPERTY_VALUE'
    | 'ENTITY_SCHEMA_VERSION_AHEAD'
    // Declarative rules (ADR-085) + inverse-edge coherence
    | 'RULE_FINDING'
    | 'SYMMETRIC_RELATION_STORED_TWICE';
  readonly severity: 'error' | 'warning';
  readonly source: string;
  readonly path: string;
  readonly message: string;
};

const isEntityRef = (value: unknown): value is string =>
  typeof value === 'string' && ENTITY_ID_PATTERN.test(value);

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
  // `attested_by` (ADR-093) is an entity_ref[] base qualifier pointing
  // at `reference:*` — counted so an attesting reference isn't flagged
  // UNREFERENCED.
  const axisFields = ['since', 'until', 'source', 'event', 'attested_by'] as const;
  // Relations additionally carry the epistemic base qualifier
  // `revealed_since` (source_ref, ADR-037). Count it so a reveal source
  // is not falsely flagged UNREFERENCED.
  const relationAxisFields = [...axisFields, 'revealed_since'] as const;
  // `believed_by` / `known_truth_by` (property entries AND relation
  // bags) are entity-ref-item lists (ADR-096): each item contributes
  // its target AND its per-item `source` refs, so neither a believer
  // nor the source depicting that belief is flagged UNREFERENCED.
  const addItemRefs = (record: Record<string, unknown>): void => {
    for (const field of ENTITY_REF_ITEM_QUALIFIER_IDS) {
      for (const item of entityRefItems(record[field])) {
        referenced.add(item.target);
        for (const ref of entityRefItemSources(item)) referenced.add(ref);
      }
    }
  };

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
          const qualifiers = record.qualifiers as Record<string, unknown>;
          for (const field of relationAxisFields) {
            for (const ref of refList(qualifiers[field])) {
              referenced.add(ref);
            }
          }
          addItemRefs(qualifiers);
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
          addItemRefs(record);
        }
      }
    }
  }

  return referenced;
}

/**
 * Stable, recursively key-sorted JSON serialization. Two values produce the
 * same string iff they are deeply equal regardless of key order — the basis
 * for exact-duplicate detection.
 */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${
      Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')
    }}`;
  }
  return JSON.stringify(value) ?? 'null';
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

  // Duplicate detection: an exact-duplicate relation or property entry is
  // always redundant (a copy-paste / double-ingest error). "Exact" = identical
  // type + target + qualifiers (relation) or an identical entry (property);
  // legitimately historised re-relations (e.g. left and rejoined a crew)
  // differ in since/until and are NOT flagged. Matters most ahead of bulk
  // ingest, which mass-produces entities.
  for (const entity of entities.values()) {
    const data = entity.data as {
      relations?: unknown[];
      properties?: Record<string, unknown>;
    };

    if (Array.isArray(data.relations)) {
      const seen = new Map<string, number>();
      for (const [index, rel] of data.relations.entries()) {
        if (rel === null || typeof rel !== 'object') continue;
        const key = canonicalize(rel);
        const prior = seen.get(key);
        if (prior === undefined) {
          seen.set(key, index);
        } else {
          findings.push({
            code: 'DUPLICATE_RELATION',
            severity: 'error',
            source: entity.id,
            path: `relations[${index}]`,
            message:
              `Relation duplicates relations[${prior}] exactly (same type, target, qualifiers).`,
          });
        }
      }
    }

    if (data.properties !== null && typeof data.properties === 'object') {
      for (const [propertyId, value] of Object.entries(data.properties)) {
        if (!Array.isArray(value)) continue;
        const seen = new Map<string, number>();
        for (const [index, entry] of value.entries()) {
          if (entry === null || typeof entry !== 'object') continue;
          const key = canonicalize(entry);
          const prior = seen.get(key);
          if (prior === undefined) {
            seen.set(key, index);
          } else {
            findings.push({
              code: 'DUPLICATE_PROPERTY_VALUE',
              severity: 'error',
              source: entity.id,
              path: `properties.${propertyId}[${index}]`,
              message: `Property entry duplicates properties.${propertyId}[${prior}] exactly.`,
            });
          }
        }
      }
    }
  }

  // ADR-085 — declarative rules, one pass per entity. Advisory rules
  // surface as warnings (non-blocking CLI output); rules that opted
  // into `enforcement: 'blocking'` (ADR-088 — structurally-always-
  // wrong shapes) surface as errors and fail the check.
  //
  // ADR-099 — this caller has the FULL entity map, so it builds the
  // incoming-active-edge index and hands rules the `CorpusContext`
  // that unlocks `has_active_incoming_relation` /
  // `no_active_incoming_relation` (single-entity callers skip those).
  const ruleList = [...catalogue.rules.values()];
  if (ruleList.length > 0) {
    // "targetId|relationType" -> set of SOURCE entity types with ≥1
    // ACTIVE (no `until`) stored edge of that type toward the target.
    const incomingActive = new Map<string, Set<string>>();
    for (const entity of entities.values()) {
      const data = entity.data as { relations?: unknown[]; };
      if (!Array.isArray(data.relations)) continue;
      for (const rel of data.relations) {
        if (rel === null || typeof rel !== 'object') continue;
        const record = rel as RelationRecord;
        if (typeof record.type !== 'string' || !isEntityRef(record.target)) continue;
        const qualifiers = record.qualifiers !== null && typeof record.qualifiers === 'object'
          ? record.qualifiers as Record<string, unknown>
          : undefined;
        if (!relationIsActive(qualifiers)) continue;
        const key = `${record.target}|${record.type}`;
        const sources = incomingActive.get(key);
        if (sources === undefined) incomingActive.set(key, new Set([entity.type]));
        else sources.add(entity.type);
      }
    }
    const corpusContext: CorpusContext = {
      hasActiveIncomingRelation: (entityId, relationType, sourceType) => {
        const sources = incomingActive.get(`${entityId}|${relationType}`);
        if (sources === undefined) return false;
        return sourceType === undefined || sources.has(sourceType);
      },
    };
    for (const entity of entities.values()) {
      const data = entity.data as {
        type?: string;
        properties?: Record<string, unknown>;
        relations?: { type: string; target: string; qualifiers?: Record<string, unknown>; }[];
      };
      const findingsForEntity = evaluateRules(
        {
          id: entity.id,
          type: entity.type,
          properties: data.properties,
          relations: data.relations,
        },
        ruleList,
        corpusContext,
      );
      for (const f of findingsForEntity) {
        findings.push({
          code: 'RULE_FINDING',
          severity: f.enforcement === 'blocking' ? 'error' : 'warning',
          source: entity.id,
          path: f.property !== undefined
            ? `properties.${f.property}${f.entryIndex !== undefined ? `[${f.entryIndex}]` : ''}`
            : '<entity>',
          message: `[${f.ruleId}] ${f.messages.en}`,
        });
      }
    }
  }

  // Inverse-edge coherence: the build pipeline GENERATES inverse edges,
  // so a symmetric relation type (same active/inverse label) stored on
  // BOTH endpoints duplicates the edge. Advisory — the fix is deleting
  // one side.
  {
    const seen = new Map<string, string>(); // "type|a|b" (sorted) -> first source id
    for (const entity of entities.values()) {
      const data = entity.data as { relations?: { type?: unknown; target?: unknown; }[]; };
      if (!Array.isArray(data.relations)) continue;
      for (const rel of data.relations) {
        if (typeof rel?.type !== 'string' || typeof rel?.target !== 'string') continue;
        const rt = catalogue.relationTypes.get(rel.type);
        if (rt === undefined) continue;
        // Same relation TYPE stored in both directions between the same
        // two entities is always a double-stored edge — the pipeline
        // generates the inverse (matches the dashboard links endpoint's
        // duplicate-symmetric conflict semantics).
        const pair = [entity.id, rel.target].sort().join('|');
        const key = `${rel.type}|${pair}`;
        const first = seen.get(key);
        if (first !== undefined && first !== entity.id) {
          findings.push({
            code: 'SYMMETRIC_RELATION_STORED_TWICE',
            severity: 'warning',
            source: entity.id,
            path: '<relations>',
            message: `"${rel.type}" between ${first} and ${entity.id} is stored on both `
              + `entities — the pipeline generates the inverse; keep one side only.`,
          });
        } else {
          seen.set(key, entity.id);
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

/**
 * Schema-version sanity: an entity may sit at an OLDER `schema_version` than
 * its type (it predates an additive bump and still validates — that is fine,
 * see the `schema:versions` report + the migrate-forward model in ADR-029/059),
 * but it must never declare a version NEWER than the type has ever reached.
 * That can only mean corrupt data or a type bump that was forgotten, so it is
 * an error. Behind-the-type entities are reported, not failed, to avoid noise
 * on every additive bump.
 */
export function checkEntityVersions(
  entities: ReadonlyMap<string, LoadedEntity>,
  catalogue: ValidatedCatalogue,
): readonly CoherenceFinding[] {
  const findings: CoherenceFinding[] = [];
  for (const entity of entities.values()) {
    const entityType = catalogue.entityTypes.get(entity.type);
    if (entityType === undefined) continue;
    const version = (entity.data as { schema_version?: unknown; }).schema_version;
    if (typeof version !== 'number') continue;
    if (version > entityType.schema_version) {
      findings.push({
        code: 'ENTITY_SCHEMA_VERSION_AHEAD',
        severity: 'error',
        source: entity.id,
        path: 'schema_version',
        message: `Entity is at schema_version ${version} but the "${entity.type}" type is only at `
          + `${entityType.schema_version}. An entity cannot declare a version the schema has `
          + `never reached — corrupt data or a forgotten type bump.`,
      });
    }
  }
  return findings;
}

/**
 * Schema-level coherence: rules over the catalogue alone (no entity data
 * needed), so latent mismatches are caught before any entity exercises
 * them. Currently: every relation an entity type lists in
 * `allowed_relations` must exist AND must permit that entity type as a
 * source (`valid_from_types`). Catches the class of bug where a type
 * advertises a relation the relation schema forbids it from starting.
 * Also flags a relation type that re-declares an engine-provided base
 * qualifier (`RELATION_DECLARES_BASE_QUALIFIER`, ADR-037).
 */
export function checkSchemaCoherence(
  catalogue: ValidatedCatalogue,
): readonly CoherenceFinding[] {
  const findings: CoherenceFinding[] = [];

  for (const [typeId, entityType] of catalogue.entityTypes) {
    for (const relId of entityType.allowed_relations) {
      const relationType = catalogue.relationTypes.get(relId);
      if (relationType === undefined) {
        findings.push({
          code: 'SCHEMA_ALLOWED_RELATION_UNKNOWN',
          severity: 'error',
          source: typeId,
          path: 'allowed_relations',
          message:
            `Entity type "${typeId}" allows relation "${relId}" which is not in the catalogue.`,
        });
        continue;
      }
      if (!(relationType.valid_from_types as readonly string[]).includes(typeId)) {
        findings.push({
          code: 'SCHEMA_ALLOWED_RELATION_INVALID_SOURCE',
          severity: 'error',
          source: typeId,
          path: 'allowed_relations',
          message:
            `Entity type "${typeId}" allows "${relId}" but "${relId}".valid_from_types does not include "${typeId}".`,
        });
      }
    }
  }

  // ADR-037: relation types must not re-declare a base qualifier; the
  // schema engine provides epistemic_status / believed_by / known_truth_by
  // / revealed_since on every relation.
  const baseQualifierIds = new Set<string>(RELATION_BASE_QUALIFIER_IDS);
  for (const [relId, relationType] of catalogue.relationTypes) {
    for (const qualifier of relationType.qualifiers) {
      if (baseQualifierIds.has(qualifier.id)) {
        findings.push({
          code: 'RELATION_DECLARES_BASE_QUALIFIER',
          severity: 'error',
          source: relId,
          path: 'qualifiers',
          message:
            `Relation "${relId}" declares base qualifier "${qualifier.id}"; it is engine-provided and must not be re-declared (ADR-037).`,
        });
      }
    }
  }

  return findings;
}
