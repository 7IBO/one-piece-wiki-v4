/**
 * Schema loader: reads every JSON file under /data/schemas/** and returns
 * a typed catalogue grouped by file kind. Performs no semantic checks —
 * that's the meta-validator's job. File-system errors and JSON parse
 * errors are caught and accumulated.
 *
 * Sourcing is pluggable via `DataSource` (ADR-019) so the dashboard's
 * SSR bundle can swap in a Vite-glob source and ship the data tree
 * inside a Vercel function — CLIs and the build pipeline still use
 * the fs default unchanged.
 */
import { basename } from 'node:path';
import { type DataSource, fsDataSource } from './data-source.ts';
import {
  ENTITY_TYPES_DIR,
  PROPERTY_TYPES_DIR,
  RELATION_TYPES_DIR,
  VOCABULARY_DIR,
} from './paths.ts';

export type LoadedFile = {
  readonly id: string;
  readonly path: string;
  readonly raw: unknown;
};

export type LoadError = {
  readonly code: 'READ_FAILED' | 'JSON_PARSE_FAILED';
  readonly path: string;
  readonly message: string;
};

export type SchemaCatalogue = {
  readonly entityTypes: readonly LoadedFile[];
  readonly propertyTypes: readonly LoadedFile[];
  readonly relationTypes: readonly LoadedFile[];
  readonly vocabularies: readonly LoadedFile[];
  readonly errors: readonly LoadError[];
};

async function loadDir(
  source: DataSource,
  dir: string,
  errors: LoadError[],
): Promise<LoadedFile[]> {
  const files = await source.listJsonFiles(dir);
  const loaded: LoadedFile[] = [];

  for (const path of files) {
    let text: string | null;
    try {
      // eslint-disable-next-line no-await-in-loop
      text = await source.readTextFile(path);
    } catch (error) {
      errors.push({
        code: 'READ_FAILED',
        path,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (text === null) {
      errors.push({ code: 'READ_FAILED', path, message: 'File not found.' });
      continue;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      errors.push({
        code: 'JSON_PARSE_FAILED',
        path,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const id = basename(path, '.json');
    loaded.push({ id, path, raw });
  }

  return loaded;
}

export async function loadSchemas(source: DataSource = fsDataSource): Promise<SchemaCatalogue> {
  const errors: LoadError[] = [];
  const [entityTypes, propertyTypes, relationTypes, vocabularies] = await Promise.all([
    loadDir(source, ENTITY_TYPES_DIR, errors),
    loadDir(source, PROPERTY_TYPES_DIR, errors),
    loadDir(source, RELATION_TYPES_DIR, errors),
    loadDir(source, VOCABULARY_DIR, errors),
  ]);

  return { entityTypes, propertyTypes, relationTypes, vocabularies, errors };
}
