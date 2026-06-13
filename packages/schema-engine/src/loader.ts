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
import { basename, join } from 'node:path';
import { type DataSource, fsDataSource } from './data-source.ts';
import {
  ENTITY_TYPES_DIR,
  PROPERTY_TYPES_DIR,
  RELATION_TYPES_DIR,
  UNIVERSES_DIR,
  VOCABULARY_DIR,
} from './paths.ts';

/**
 * A schema file living under `data/universes/<id>/schemas/` is scoped to
 * that universe (ADR-035/036): inject `universes: [id]` into its raw so
 * the meta-validator + `forUniverse` treat it as universe-specific. An
 * explicit `universes` already on the file wins (lets one folder host a
 * schema shared with a sibling universe).
 */
function scopeToUniverse(file: LoadedFile, universeId: string): LoadedFile {
  if (file.raw === null || typeof file.raw !== 'object' || Array.isArray(file.raw)) {
    return file;
  }
  const obj = file.raw as Record<string, unknown>;
  const existing = obj['universes'];
  const universes = Array.isArray(existing) && existing.length > 0 ? existing : [universeId];
  return { ...file, raw: { ...obj, universes } };
}

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
  // Shared core: /data/schemas/** (present in every universe).
  const [entityTypes, propertyTypes, relationTypes, vocabularies] = await Promise.all([
    loadDir(source, ENTITY_TYPES_DIR, errors),
    loadDir(source, PROPERTY_TYPES_DIR, errors),
    loadDir(source, RELATION_TYPES_DIR, errors),
    loadDir(source, VOCABULARY_DIR, errors),
  ]);

  // Per-universe: /data/universes/<id>/schemas/** — auto-scoped to <id>
  // and merged into the catalogue (ADR-035/036).
  const universes = await source.listSubdirectories(UNIVERSES_DIR);
  for (const universe of universes) {
    const base = join(UNIVERSES_DIR, universe, 'schemas');
    // eslint-disable-next-line no-await-in-loop
    const [et, pt, rt, vo] = await Promise.all([
      loadDir(source, join(base, 'entity-types'), errors),
      loadDir(source, join(base, 'property-types'), errors),
      loadDir(source, join(base, 'relation-types'), errors),
      loadDir(source, join(base, 'vocabulary'), errors),
    ]);
    for (const f of et) entityTypes.push(scopeToUniverse(f, universe));
    for (const f of pt) propertyTypes.push(scopeToUniverse(f, universe));
    for (const f of rt) relationTypes.push(scopeToUniverse(f, universe));
    for (const f of vo) vocabularies.push(scopeToUniverse(f, universe));
  }

  return { entityTypes, propertyTypes, relationTypes, vocabularies, errors };
}
