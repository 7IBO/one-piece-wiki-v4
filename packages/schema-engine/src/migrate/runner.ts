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
import type {
  EntityData,
  EntityFile,
  Migration,
  MigrationChange,
  MigrationReport,
} from './types.ts';

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

/**
 * Applies an ordered list of migrations as a pipeline: each migration sees
 * the corpus as left by the previous one (so a rename then a remove compose).
 * Returns a per-migration report plus the final state of every file, with the
 * paths that ended up changed or deleted relative to the original input — what
 * the CLI must write or `rm`. Pure: no filesystem, no mutation of `files`.
 */
export function applyMigrations(
  files: readonly EntityFile[],
  migrations: readonly Migration[],
): {
  readonly reports: readonly MigrationReport[];
  readonly finalFiles: readonly EntityFile[];
  readonly changedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
} {
  const originalJson = new Map(files.map((f) => [f.path, JSON.stringify(f.data)]));
  let current: EntityFile[] = files.map((f) => ({ path: f.path, data: f.data }));
  const reports: MigrationReport[] = [];
  const deletedPaths = new Set<string>();

  for (const migration of migrations) {
    const report = applyMigration(current, migration);
    reports.push(report);
    const changedByPath = new Map(report.changed.map((c) => [c.path, c.after]));
    for (const path of report.deleted) deletedPaths.add(path);
    const dropped = new Set(report.deleted);
    current = current
      .filter((f) => !dropped.has(f.path))
      .map((f) => {
        const after = changedByPath.get(f.path);
        return after === undefined ? f : { path: f.path, data: after };
      });
  }

  const changedPaths = current
    .filter((f) => JSON.stringify(f.data) !== originalJson.get(f.path))
    .map((f) => f.path);

  return { reports, finalFiles: current, changedPaths, deletedPaths: [...deletedPaths] };
}

export type MigrationLoss = {
  readonly path: string;
  readonly reason: 'file-deleted' | 'property-removed' | 'relations-removed';
  readonly detail: string;
};

function propsRecord(data: EntityData): Record<string, unknown> {
  const props = data['properties'];
  return props !== null && typeof props === 'object' && !Array.isArray(props)
    ? (props as Record<string, unknown>)
    : {};
}

function relationCount(data: EntityData): number {
  const relations = data['relations'];
  return Array.isArray(relations) ? relations.length : 0;
}

/**
 * Flag changes that destroy data: a deleted entity file, a removed
 * property key, or fewer relations than before. A removed property
 * takes its whole four-axis history with it, so the CLI requires an
 * explicit --allow-lossy before applying any of these (CLAUDE.md:
 * "never lose this metadata"). Renames are NOT losses — a dropped key
 * whose value reappears under a newly-added key is treated as moved.
 */
export function detectLosses(report: MigrationReport): MigrationLoss[] {
  const losses: MigrationLoss[] = [];
  for (const path of report.deleted) {
    losses.push({ path, reason: 'file-deleted', detail: 'entity file removed' });
  }
  for (const change of report.changed) {
    const before = propsRecord(change.before);
    const after = propsRecord(change.after);
    const addedValues = new Set(
      Object.keys(after).filter((k) => !(k in before)).map((k) => JSON.stringify(after[k])),
    );
    const dropped = Object.keys(before).filter(
      (k) => !(k in after) && !addedValues.has(JSON.stringify(before[k])),
    );
    if (dropped.length > 0) {
      losses.push({
        path: change.path,
        reason: 'property-removed',
        detail: `properties: ${dropped.join(', ')}`,
      });
    }
    const removedRelations = relationCount(change.before) - relationCount(change.after);
    if (removedRelations > 0) {
      losses.push({
        path: change.path,
        reason: 'relations-removed',
        detail: `${removedRelations} relation(s)`,
      });
    }
  }
  return losses;
}
