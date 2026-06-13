/**
 * Migration runner. `collectEntityFiles` walks the corpus through a
 * DataSource (so it works against both the filesystem and an
 * in-memory bundle); `applyMigration` is pure and decides, per file,
 * whether the migration changed it, left it untouched, or deleted it.
 * Writing is left to the CLI so this module stays testable without
 * touching the filesystem.
 */
import { join } from 'node:path';
import { type DataSource, fsDataSource } from '../data-source.ts';
import { UNIVERSES_DIR } from '../paths.ts';
import type { EntityFile, Migration, MigrationChange, MigrationReport } from './types.ts';

export async function collectEntityFiles(
  source: DataSource = fsDataSource,
  universesDir: string = UNIVERSES_DIR,
): Promise<EntityFile[]> {
  const files: EntityFile[] = [];
  for (const universe of await source.listSubdirectories(universesDir)) {
    const entitiesDir = join(universesDir, universe, 'entities');
    for (const type of await source.listSubdirectories(entitiesDir)) {
      const typeDir = join(entitiesDir, type);
      for (const path of await source.listJsonFiles(typeDir)) {
        const text = await source.readTextFile(path);
        if (text === null) continue;
        files.push({ path, data: JSON.parse(text) as Record<string, unknown> });
      }
    }
  }
  return files;
}

export function applyMigration(
  files: readonly EntityFile[],
  migration: Migration,
): MigrationReport {
  const changed: MigrationChange[] = [];
  const deleted: string[] = [];
  let unchanged = 0;

  for (const file of files) {
    const after = migration.up(file.data);
    if (after === null) {
      deleted.push(file.path);
      continue;
    }
    if (JSON.stringify(after) !== JSON.stringify(file.data)) {
      changed.push({ path: file.path, before: file.data, after });
    } else {
      unchanged += 1;
    }
  }

  return { migrationId: migration.id, changed, deleted, unchanged };
}
