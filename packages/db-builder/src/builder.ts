/**
 * Build pipeline: load schemas + entities (validated through the
 * schema engine), extract rows, materialize inverse relations, load
 * translations + narratives, write SQLite, emit manifest. Returns the
 * final manifest plus counts.
 */
import {
  loadEntities,
  loadSchemas,
  resolveEntityReferences,
  resolveReferences,
  validateCatalogue,
} from '@onepiece-wiki/schema-engine';
import { loadNarrativeRows, loadTranslationRows } from './content.ts';
import { extract } from './extract.ts';
import { type Manifest, writeManifest } from './manifest.ts';
import { DB_PATH, MANIFEST_PATH } from './paths.ts';
import { writeDatabase, type WriteResult } from './writer.ts';

export type BuildResult = {
  readonly dbPath: string;
  readonly manifestPath: string;
  readonly manifest: Manifest;
  readonly write: WriteResult;
};

export type BuildOptions = {
  readonly dbPath?: string;
  readonly manifestPath?: string;
};

export async function build(options: BuildOptions = {}): Promise<BuildResult> {
  const catalogue = await loadSchemas();
  const validated = validateCatalogue(catalogue);

  if (catalogue.errors.length > 0 || validated.errors.length > 0) {
    throw new Error('Schema catalogue has errors. Run bun run schema:check.');
  }

  const schemaRefErrors = resolveReferences(validated);
  if (schemaRefErrors.length > 0) {
    throw new Error(
      `Schema references unresolved: ${schemaRefErrors.length}. Run bun run check:references.`,
    );
  }

  const loaded = await loadEntities(validated);
  if (loaded.errors.length > 0) {
    throw new Error(`Entity files have errors: ${loaded.errors.length}. Run bun run validate.`);
  }

  const entityRefErrors = resolveEntityReferences(loaded.entities, validated);
  if (entityRefErrors.length > 0) {
    throw new Error(
      `Entity references unresolved: ${entityRefErrors.length}. Run bun run check:references.`,
    );
  }

  const rows = extract(loaded.entities, validated);
  const translations = await loadTranslationRows();
  const narratives = await loadNarrativeRows();

  // Narrative files pair 1:1 with entity files (DATA_MODEL § Narratives);
  // a narrative pointing at an unknown entity is a build error.
  const orphanNarratives = narratives.filter((n) => !loaded.entities.has(n.entity_id));
  if (orphanNarratives.length > 0) {
    const ids = orphanNarratives.map((n) => n.entity_id).join(', ');
    throw new Error(`Narratives reference unknown entities: ${ids}`);
  }

  const dbPath = options.dbPath ?? DB_PATH;
  const manifestPath = options.manifestPath ?? MANIFEST_PATH;
  const write = writeDatabase(dbPath, { ...rows, translations, narratives });
  const manifest = writeManifest(manifestPath, write);

  return { dbPath, manifestPath, manifest, write };
}
