/**
 * Schema loader: reads every JSON file under /data/schemas/** and returns
 * a typed catalogue grouped by file kind. Performs no semantic checks —
 * that's the meta-validator's job. File-system errors and JSON parse
 * errors are caught and accumulated.
 */
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
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

async function listJsonFiles(dir: string): Promise<string[]> {
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

async function loadDir(dir: string, errors: LoadError[]): Promise<LoadedFile[]> {
  const files = await listJsonFiles(dir);
  const loaded: LoadedFile[] = [];

  for (const path of files) {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      errors.push({
        code: 'READ_FAILED',
        path,
        message: error instanceof Error ? error.message : String(error),
      });
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

export async function loadSchemas(): Promise<SchemaCatalogue> {
  const errors: LoadError[] = [];
  const [entityTypes, propertyTypes, relationTypes, vocabularies] = await Promise.all([
    loadDir(ENTITY_TYPES_DIR, errors),
    loadDir(PROPERTY_TYPES_DIR, errors),
    loadDir(RELATION_TYPES_DIR, errors),
    loadDir(VOCABULARY_DIR, errors),
  ]);

  return { entityTypes, propertyTypes, relationTypes, vocabularies, errors };
}
