/**
 * Entity loader: walks /data/universes/<u>/entities/<type>/*.json and
 * validates each file against a Zod schema synthesised from the schema
 * catalogue at runtime. Returns the loaded entities grouped by type plus
 * a structured error list.
 *
 * The synthesis is intentionally schema-driven (no per-type code paths)
 * — every entity is treated identically by walking the catalogue.
 */
import {
  type AssistedBy,
  type CanonScope,
  ENTITY_ID_PATTERN,
  type Locale,
} from '@onepiece-wiki/schemas';
import { basename, join } from 'node:path';
import { type DataSource, fsDataSource } from './data-source.ts';
// The schema-synthesis half lives in entity-schema.ts — a browser-safe
// module (no node:path/fs) so the dashboard client can run the exact
// same validator live. Re-exported below to keep this module's public
// surface unchanged.
import { buildEntitySchema as buildEntitySchemaPure } from './entity-schema.ts';
import type { ValidatedCatalogue } from './meta-validator.ts';
import { UNIVERSES_DIR } from './paths.ts';

export {
  BaseQualifierBag,
  buildEntitySchema,
  type EntitySchemaCatalogue,
  I18nKeyString,
  propertyEntrySchema,
  RelationQualifierBag,
  valueSchemaFor,
} from './entity-schema.ts';

export type LoadedEntity = {
  readonly id: string;
  readonly type: string;
  readonly path: string;
  readonly data: Record<string, unknown>;
};

export type EntityValidationError = {
  readonly code:
    | 'READ_FAILED'
    | 'JSON_PARSE_FAILED'
    | 'UNKNOWN_ENTITY_TYPE'
    | 'ENTITY_VALIDATION_FAILED'
    | 'ID_TYPE_MISMATCH'
    | 'ID_FILENAME_MISMATCH';
  readonly path: string;
  readonly message: string;
};

export type LoadedEntities = {
  readonly entities: ReadonlyMap<string, LoadedEntity>;
  readonly errors: readonly EntityValidationError[];
};

export async function loadEntities(
  catalogue: ValidatedCatalogue,
  source: DataSource = fsDataSource,
): Promise<LoadedEntities> {
  const errors: EntityValidationError[] = [];
  const entities = new Map<string, LoadedEntity>();

  const universes = await source.listSubdirectories(UNIVERSES_DIR);
  for (const universe of universes) {
    const entitiesRoot = join(UNIVERSES_DIR, universe, 'entities');
    // eslint-disable-next-line no-await-in-loop
    const typeDirs = await source.listSubdirectories(entitiesRoot);
    for (const typeDir of typeDirs) {
      const entitySchema = buildEntitySchemaPure(typeDir, catalogue);
      const typedDirPath = join(entitiesRoot, typeDir);
      // eslint-disable-next-line no-await-in-loop
      const files = await source.listJsonFiles(typedDirPath);

      for (const filePath of files) {
        let raw: unknown;
        try {
          // eslint-disable-next-line no-await-in-loop
          const text = await source.readTextFile(filePath);
          if (text === null) {
            errors.push({
              code: 'READ_FAILED',
              path: filePath,
              message: 'File not found.',
            });
            continue;
          }
          raw = JSON.parse(text);
        } catch (error) {
          errors.push({
            code: error instanceof SyntaxError ? 'JSON_PARSE_FAILED' : 'READ_FAILED',
            path: filePath,
            message: error instanceof Error ? error.message : String(error),
          });
          continue;
        }

        if (!entitySchema) {
          errors.push({
            code: 'UNKNOWN_ENTITY_TYPE',
            path: filePath,
            message: `No entity-type schema found for "${typeDir}".`,
          });
          continue;
        }

        const parsed = entitySchema.safeParse(raw);
        if (!parsed.success) {
          errors.push({
            code: 'ENTITY_VALIDATION_FAILED',
            path: filePath,
            message: parsed.error.errors
              .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
              .join('; '),
          });
          continue;
        }

        const data = parsed.data as { id: string; type: string; };
        const expectedId = `${typeDir}:${basename(filePath, '.json')}`;
        if (data.id !== expectedId) {
          errors.push({
            code: 'ID_FILENAME_MISMATCH',
            path: filePath,
            message: `Entity id "${data.id}" must equal "${expectedId}" (derived from path).`,
          });
          continue;
        }
        if (data.type !== typeDir) {
          errors.push({
            code: 'ID_TYPE_MISMATCH',
            path: filePath,
            message:
              `Entity "${data.id}" declares type "${data.type}" but lives under entities/${typeDir}/.`,
          });
          continue;
        }

        entities.set(data.id, {
          id: data.id,
          type: data.type,
          path: filePath,
          data: parsed.data as Record<string, unknown>,
        });
      }
    }
  }

  return { entities, errors };
}

export type EntityReferenceError = {
  readonly code: 'ENTITY_REFERENCE_NOT_FOUND';
  readonly source: string;
  readonly path: string;
  readonly target: string;
};

export function resolveEntityReferences(
  entities: ReadonlyMap<string, LoadedEntity>,
  catalogue: ValidatedCatalogue,
): readonly EntityReferenceError[] {
  const errors: EntityReferenceError[] = [];
  const isEntityRef = (value: unknown): value is string =>
    typeof value === 'string' && ENTITY_ID_PATTERN.test(value);
  // `since` / `until` / `source` accept a single ref or an array. Walk
  // both shapes so reference-resolution covers both.
  const refOrRefList = (value: unknown): readonly string[] => {
    if (isEntityRef(value)) return [value];
    if (Array.isArray(value)) return value.filter(isEntityRef);
    return [];
  };

  for (const entity of entities.values()) {
    const data = entity.data as { properties?: Record<string, unknown>; relations?: unknown[]; };

    if (data.properties) {
      for (const [propertyId, value] of Object.entries(data.properties)) {
        const propertyType = catalogue.propertyTypes.get(propertyId);
        if (!propertyType) continue;
        const entries = Array.isArray(value) ? value : [value];
        for (const [index, entry] of entries.entries()) {
          if (entry === null || entry === undefined || typeof entry !== 'object') continue;
          const record = entry as Record<string, unknown>;
          const refTargets = ['since', 'until', 'source', 'event'] as const;
          for (const field of refTargets) {
            for (const ref of refOrRefList(record[field])) {
              if (!entities.has(ref)) {
                errors.push({
                  code: 'ENTITY_REFERENCE_NOT_FOUND',
                  source: entity.id,
                  path: `properties.${propertyId}[${index}].${field}`,
                  target: ref,
                });
              }
            }
          }
          if (
            (propertyType.value_type === 'entity_ref' || propertyType.value_type === 'source_ref')
            && isEntityRef(record['value'])
            && !entities.has(record['value'] as string)
          ) {
            errors.push({
              code: 'ENTITY_REFERENCE_NOT_FOUND',
              source: entity.id,
              path: `properties.${propertyId}[${index}].value`,
              target: record['value'] as string,
            });
          }
        }
      }
    }

    if (Array.isArray(data.relations)) {
      for (const [index, rel] of data.relations.entries()) {
        if (rel === null || rel === undefined || typeof rel !== 'object') continue;
        const record = rel as Record<string, unknown>;
        const target = record['target'];
        if (typeof target === 'string' && !entities.has(target)) {
          errors.push({
            code: 'ENTITY_REFERENCE_NOT_FOUND',
            source: entity.id,
            path: `relations[${index}].target`,
            target,
          });
        }
        const qualifiers = record['qualifiers'];
        if (qualifiers !== null && qualifiers !== undefined && typeof qualifiers === 'object') {
          for (const [key, qValue] of Object.entries(qualifiers as Record<string, unknown>)) {
            // Source/entity-ref-bearing qualifiers: the temporal/citation
            // axes plus the relation epistemic base qualifiers (ADR-037)
            // `revealed_since` (source_ref) and `believed_by` /
            // `known_truth_by` (entity_ref[]).
            if (
              key !== 'since' && key !== 'until' && key !== 'source' && key !== 'event'
              && key !== 'revealed_since' && key !== 'believed_by' && key !== 'known_truth_by'
            ) {
              continue;
            }
            for (const ref of refOrRefList(qValue)) {
              if (!entities.has(ref)) {
                errors.push({
                  code: 'ENTITY_REFERENCE_NOT_FOUND',
                  source: entity.id,
                  path: `relations[${index}].qualifiers.${key}`,
                  target: ref,
                });
              }
            }
          }
        }
      }
    }
  }

  return errors;
}

export type _UnusedExports = AssistedBy | CanonScope | Locale;
