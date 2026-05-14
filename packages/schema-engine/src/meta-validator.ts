/**
 * Meta-validator: runs each LoadedFile through the matching meta-schema
 * from @onepiece-wiki/schemas. Returns parsed/validated catalogues and a
 * structured error list.
 */
import {
  EntityTypeSchema,
  type EntityTypeSchema as EntityType,
  PropertyTypeSchema,
  type PropertyTypeSchema as PropertyType,
  RelationTypeSchema,
  type RelationTypeSchema as RelationType,
  VocabularySchema,
  type VocabularySchema as Vocabulary,
} from '@onepiece-wiki/schemas';
import { z } from 'zod';
import type { LoadedFile, SchemaCatalogue } from './loader.ts';

export type MetaValidationError = {
  readonly code: 'META_VALIDATION_FAILED' | 'ID_FILENAME_MISMATCH';
  readonly path: string;
  readonly message: string;
};

export type ValidatedCatalogue = {
  readonly entityTypes: ReadonlyMap<string, EntityType>;
  readonly propertyTypes: ReadonlyMap<string, PropertyType>;
  readonly relationTypes: ReadonlyMap<string, RelationType>;
  readonly vocabularies: ReadonlyMap<string, Vocabulary>;
  readonly errors: readonly MetaValidationError[];
};

export type { EntityType, PropertyType, RelationType, Vocabulary };

function formatZodError(error: z.ZodError): string {
  return error.errors
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
}

function validateGroup<TSchema extends z.ZodTypeAny>(
  files: readonly LoadedFile[],
  schema: TSchema,
  errors: MetaValidationError[],
): Map<string, z.infer<TSchema>> {
  const result = new Map<string, z.infer<TSchema>>();
  for (const file of files) {
    const parsed = schema.safeParse(file.raw);
    if (!parsed.success) {
      errors.push({
        code: 'META_VALIDATION_FAILED',
        path: file.path,
        message: formatZodError(parsed.error),
      });
      continue;
    }
    const value = parsed.data as { id?: string; };
    if (value.id !== undefined && value.id !== file.id) {
      errors.push({
        code: 'ID_FILENAME_MISMATCH',
        path: file.path,
        message: `Schema id "${value.id}" does not match filename "${file.id}".`,
      });
      continue;
    }
    result.set(file.id, parsed.data);
  }
  return result;
}

export function validateCatalogue(catalogue: SchemaCatalogue): ValidatedCatalogue {
  const errors: MetaValidationError[] = [];
  const entityTypes = validateGroup(catalogue.entityTypes, EntityTypeSchema, errors);
  const propertyTypes = validateGroup(catalogue.propertyTypes, PropertyTypeSchema, errors);
  const relationTypes = validateGroup(catalogue.relationTypes, RelationTypeSchema, errors);
  const vocabularies = validateGroup(catalogue.vocabularies, VocabularySchema, errors);

  return { entityTypes, propertyTypes, relationTypes, vocabularies, errors };
}
