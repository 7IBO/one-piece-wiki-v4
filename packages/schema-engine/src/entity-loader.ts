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
  EntityId,
  EpistemicStatus,
  type Locale,
  ReviewStatus,
  Slug,
  ValueType,
} from '@onepiece-wiki/schemas';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import type { ValidatedCatalogue } from './meta-validator.ts';
import { UNIVERSES_DIR } from './paths.ts';

const I18nKeyString = z.string().regex(
  /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)+$/,
);

// `since` / `until` / `source` accept either a single source ref or
// an array. The array form lets a single value entry cite multiple
// mediums simultaneously (e.g. manga chapter + anime episode that
// adapt the same moment) without forcing the maintainer to duplicate
// the entry. The build pipeline normalises both forms to "the set of
// reachable sources" via the `adapted-by` relation, so the choice
// here is purely an authoring convenience.
const SourceRefOrList = z.union([EntityId, z.array(EntityId).min(1)]);

const BaseQualifierBag = z
  .object({
    since: SourceRefOrList.optional(),
    until: SourceRefOrList.optional(),
    source: SourceRefOrList.optional(),
    epistemic_status: EpistemicStatus.optional(),
    actual_value: z.unknown().optional(),
    event: EntityId.optional(),
    believed_by: z.array(EntityId).optional(),
    known_truth_by: z.array(EntityId).optional(),
    canon_scope: z.string().optional(),
    in_universe_date: z.string().optional(),
    assisted_by: z.string().optional(),
    review_status: ReviewStatus.optional(),
  })
  .passthrough();

function valueSchemaFor(valueType: ValueType): z.ZodTypeAny {
  switch (valueType) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'enum':
      return z.string();
    case 'multi_enum':
      return z.array(z.string());
    case 'date':
      return z.string();
    case 'entity_ref':
      return EntityId;
    case 'source_ref':
      return EntityId;
    case 'i18n_key':
      return I18nKeyString;
    case 'markdown':
      return z.string();
  }
}

function propertyEntrySchema(
  valueType: ValueType,
  localizable: boolean,
): z.ZodTypeAny {
  const value = valueSchemaFor(valueType);
  const entry = BaseQualifierBag.merge(
    localizable
      ? z.object({ value_key: I18nKeyString })
      : z.object({ value }),
  );
  return entry;
}

/**
 * Build a Zod schema that fully validates one entity of `entityTypeId`
 * against the resolved schema catalogue. Re-used at runtime by the
 * dashboard API to validate save payloads before opening a PR — same
 * validator the CLI uses on disk, so an edit that passes here is
 * guaranteed to pass `bun run validate` after the file lands.
 *
 * Returns `undefined` when the entity type isn't in the catalogue
 * (the caller should reject with a 400-style error in that case).
 */
export function buildEntitySchema(
  entityTypeId: string,
  catalogue: ValidatedCatalogue,
): z.ZodTypeAny | undefined {
  const entityType = catalogue.entityTypes.get(entityTypeId);
  if (!entityType) return undefined;

  const propertyShape: Record<string, z.ZodTypeAny> = {};
  for (const declared of entityType.properties) {
    const propertyType = catalogue.propertyTypes.get(declared.id);
    if (!propertyType) continue;
    const entry = propertyEntrySchema(propertyType.value_type, propertyType.localizable);
    const fieldSchema = propertyType.historical ? z.array(entry).min(1) : entry;
    propertyShape[declared.id] = declared.required ? fieldSchema : fieldSchema.optional();
  }

  const relationSchema = z.object({
    type: Slug,
    target: EntityId,
    qualifiers: z.record(z.string(), z.unknown()).optional(),
  });

  return z.object({
    $schema: z.string().optional(),
    id: EntityId,
    type: Slug,
    schema_version: z.number().int().positive(),
    slug: Slug,
    slug_history: z.array(Slug).default([]),
    canonical_name_key: I18nKeyString.optional(),
    properties: z.object(propertyShape),
    relations: z.array(relationSchema).default([]),
  }).passthrough();
}

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

async function listSubdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function listJsonFilesShallow(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => join(dir, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function loadEntities(catalogue: ValidatedCatalogue): Promise<LoadedEntities> {
  const errors: EntityValidationError[] = [];
  const entities = new Map<string, LoadedEntity>();

  const universes = await listSubdirectories(UNIVERSES_DIR);
  for (const universe of universes) {
    const entitiesRoot = join(UNIVERSES_DIR, universe, 'entities');
    const typeDirs = await listSubdirectories(entitiesRoot);
    for (const typeDir of typeDirs) {
      const entitySchema = buildEntitySchema(typeDir, catalogue);
      const typedDirPath = join(entitiesRoot, typeDir);
      const files = await listJsonFilesShallow(typedDirPath);

      for (const filePath of files) {
        let raw: unknown;
        try {
          raw = JSON.parse(await readFile(filePath, 'utf8'));
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
    typeof value === 'string' && /^[a-z0-9-]+:[a-z0-9-]+$/.test(value);
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
            if (key !== 'since' && key !== 'until' && key !== 'source' && key !== 'event') {
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
