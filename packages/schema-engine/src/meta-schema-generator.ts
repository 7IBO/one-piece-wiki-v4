/**
 * Emits JSON-Schema (draft-07) meta-schemas under
 * `packages/schema-engine/meta-schemas/`, generated from the Zod
 * meta-schemas in @onepiece-wiki/schemas. These are the files every
 * `/data/schemas/**` document's `$schema` pointer references, so they
 * are **committed** (not git-ignored) — editors resolve them on a fresh
 * clone and offer completion/validation while authoring schemas.
 *
 * Zod stays the single source of validation truth (used by
 * `schema:check`); these JSON Schemas are a generated editor aid, kept
 * in sync by `schema:meta` + a CI freshness check.
 */
import {
  EntityTypeSchema,
  PropertyTypeSchema,
  RelationTypeSchema,
  VocabularySchema,
} from '@onepiece-wiki/schemas';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { META_SCHEMAS_DIR } from './paths.ts';

/** Filename stem → Zod meta-schema. Stems match the `$schema` pointers. */
const META_SCHEMAS: ReadonlyArray<readonly [string, ZodTypeAny]> = [
  ['entity-type', EntityTypeSchema],
  ['property-type', PropertyTypeSchema],
  ['relation-type', RelationTypeSchema],
  ['vocabulary', VocabularySchema],
];

/**
 * (Re)generate every meta-schema JSON file. Returns the written paths.
 * `$refStrategy: 'none'` inlines definitions so each file is a single
 * self-contained schema (no cross-file `$ref`), which is what the flat
 * per-kind `$schema` pointers expect.
 */
export async function generateMetaSchemas(): Promise<readonly string[]> {
  await mkdir(META_SCHEMAS_DIR, { recursive: true });
  const written: string[] = [];
  for (const [stem, schema] of META_SCHEMAS) {
    const jsonSchema = zodToJsonSchema(schema, {
      $refStrategy: 'none',
      target: 'jsonSchema7',
    });
    const doc = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: `${stem} schema`,
      ...jsonSchema,
    };
    const path = join(META_SCHEMAS_DIR, `${stem}.schema.json`);
    await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`);
    written.push(path);
  }
  return written;
}
