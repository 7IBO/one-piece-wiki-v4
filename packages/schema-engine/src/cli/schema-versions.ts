/**
 * bun run schema:versions — report, per entity type, the type's current
 * `schema_version` and the distribution of entity `schema_version`s, flagging
 * entities that lag the current type version (migration candidates). Read-only.
 *
 * The model is migrate-forward (ADR-003/029): there is one current schema and
 * data is rewritten to match it. An entity's `schema_version` records which
 * shape its data is at — this report surfaces who is behind, so you can see at
 * a glance what a pending migration would touch (and confirm a reset before a
 * release). Entities AHEAD of their type are a hard error (see `checkEntityVersions`).
 */
import { loadEntities } from '../entity-loader.ts';
import { loadSchemas } from '../loader.ts';
import { validateCatalogue } from '../meta-validator.ts';

const catalogue = await loadSchemas();
const validated = validateCatalogue(catalogue);
if (catalogue.errors.length > 0 || validated.errors.length > 0) {
  process.stderr.write('Schema catalogue has errors. Run bun run schema:check.\n');
  process.exit(1);
}
const loaded = await loadEntities(validated);

// entity type id -> (entity schema_version -> count)
const distByType = new Map<string, Map<number, number>>();
for (const entity of loaded.entities.values()) {
  const version = (entity.data as { schema_version?: unknown; }).schema_version;
  if (typeof version !== 'number') continue;
  const dist = distByType.get(entity.type) ?? new Map<number, number>();
  dist.set(version, (dist.get(version) ?? 0) + 1);
  distByType.set(entity.type, dist);
}

const lines: string[] = [];
let totalEntities = 0;
let totalBehind = 0;
const types = [...validated.entityTypes].sort(([a], [b]) => a.localeCompare(b));
for (const [typeId, entityType] of types) {
  const typeVersion = entityType.schema_version;
  const dist = distByType.get(typeId);
  if (dist === undefined) {
    lines.push(`  ${typeId.padEnd(22)} type v${typeVersion}   (no entities)`);
    continue;
  }
  const versions = [...dist.entries()].sort((a, b) => a[0] - b[0]);
  const spread = versions.map(([v, c]) => `v${v}×${c}`).join('  ');
  const behind = versions.filter(([v]) => v < typeVersion).reduce((sum, [, c]) => sum + c, 0);
  totalEntities += versions.reduce((sum, [, c]) => sum + c, 0);
  totalBehind += behind;
  lines.push(
    `  ${typeId.padEnd(22)} type v${typeVersion}   ${spread}`
      + (behind > 0 ? `   ⚠ ${behind} behind` : ''),
  );
}

process.stdout.write('Schema version report (migrate-forward; see ADR-029/059)\n\n');
process.stdout.write(`${lines.join('\n')}\n\n`);
process.stdout.write(
  `${types.length} entity types, ${totalEntities} entities; `
    + `${totalBehind} behind their type's current version.\n`,
);
