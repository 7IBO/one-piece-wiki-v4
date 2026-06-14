/**
 * bun run migrate:all [--dry-run] [--check]
 *
 * The numbered-migration runner (ADR-070). Discovers `/data/migrations/NNNN-*.ts`,
 * applies the ones not yet recorded in `applied.json` (in numeric order),
 * rewrites the affected entity JSON, and appends the applied IDs to the ledger.
 * The migrate-forward corpus is kept current, so an up-to-date checkout has zero
 * pending migrations; this runner is for replaying a backlog on a stale branch.
 *
 *   --dry-run     : list pending migrations + the files they would touch; write nothing.
 *   --check       : exit 1 if any migration is pending (CI gate — "you added a
 *                   migration, run it and commit the data + ledger"); write nothing.
 *   --allow-lossy : confirm migrations that remove a property/relation or delete an
 *                   entity (mirrors the single-file `migrate` CLI); refused otherwise.
 *
 * After a real run: `bun run format` (dprint normalises the JSON) then
 * `bun run validate`.
 */
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyMigrations, collectEntityFiles, detectLosses } from '../migrate/runner.ts';
import type { Migration } from '../migrate/types.ts';
import { MIGRATIONS_DIR } from '../paths.ts';

const LEDGER_PATH = join(MIGRATIONS_DIR, 'applied.json');
const FILE_RE = /^\d{4}-[a-z0-9-]+\.ts$/;

type Ledger = { applied: string[]; };

async function readLedger(): Promise<Ledger> {
  try {
    const parsed = JSON.parse(await readFile(LEDGER_PATH, 'utf8')) as Partial<Ledger>;
    return { applied: Array.isArray(parsed.applied) ? parsed.applied : [] };
  } catch {
    return { applied: [] };
  }
}

async function discover(): Promise<readonly Migration[]> {
  const names = (await readdir(MIGRATIONS_DIR)).filter((n) => FILE_RE.test(n)).sort();
  const migrations: Migration[] = [];
  for (const name of names) {
    const mod = (await import(join(MIGRATIONS_DIR, name))) as {
      default?: Migration;
      migration?: Migration;
    };
    const migration = mod.default ?? mod.migration;
    if (migration === undefined) {
      process.stderr.write(`Migration "${name}" exports no Migration; skipping.\n`);
      continue;
    }
    const expected = name.replace(/\.ts$/, '');
    if (migration.id !== expected) {
      process.stderr.write(
        `Migration "${name}" has id "${migration.id}" (expected "${expected}").\n`,
      );
      process.exit(1);
    }
    migrations.push(migration);
  }
  return migrations;
}

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has('--dry-run');
const check = flags.has('--check');
const allowLossy = flags.has('--allow-lossy');

const all = await discover();
const applied = new Set((await readLedger()).applied);
const pending = all.filter((m) => !applied.has(m.id));

if (pending.length === 0) {
  process.stdout.write(`Up to date — ${all.length} migration(s) applied, 0 pending.\n`);
  process.exit(0);
}

if (check) {
  process.stderr.write(`${pending.length} pending migration(s):\n`);
  for (const m of pending) process.stderr.write(`  - ${m.id}\n`);
  process.stderr.write('Run `bun run migrate:all` and commit the data + applied.json.\n');
  process.exit(1);
}

const files = await collectEntityFiles();
const { reports, finalFiles, changedPaths, deletedPaths } = applyMigrations(files, pending);

process.stdout.write(`Pending: ${pending.length}\n`);
for (const report of reports) {
  process.stdout.write(
    `  ${report.migrationId}: ${report.changed.length} changed, ${report.deleted.length} deleted\n`,
  );
}
process.stdout.write(
  `Net: ${changedPaths.length} file(s) to write, ${deletedPaths.length} to delete.\n`,
);

// Loss guard, mirroring the single-file `migrate` CLI (a removed property/relation
// or a deleted entity destroys four-axis history). Refuse unless --allow-lossy.
const losses = reports.flatMap((report) => detectLosses(report));
if (losses.length > 0) {
  process.stderr.write(`\n${losses.length} potentially lossy change(s):\n`);
  for (const loss of losses) {
    process.stderr.write(`  ! ${loss.path} — ${loss.reason} (${loss.detail})\n`);
  }
}

if (dryRun) {
  for (const p of changedPaths) process.stdout.write(`  ~ ${p}\n`);
  for (const p of deletedPaths) process.stdout.write(`  - ${p}\n`);
  process.stdout.write('\n(dry run — no files written, ledger untouched)\n');
  process.exit(0);
}

if (losses.length > 0 && !allowLossy) {
  process.stderr.write(
    '\nRefusing to apply lossy changes. Re-run with --allow-lossy to confirm.\n',
  );
  process.exit(1);
}

const finalByPath = new Map(finalFiles.map((f) => [f.path, f.data]));
for (const path of changedPaths) {
  await writeFile(path, `${JSON.stringify(finalByPath.get(path), null, 2)}\n`, 'utf8');
}
for (const path of deletedPaths) await rm(path);

await writeFile(
  LEDGER_PATH,
  `${JSON.stringify({ applied: [...applied, ...pending.map((m) => m.id)] }, null, 2)}\n`,
  'utf8',
);

process.stdout.write(
  `\nApplied ${pending.length} migration(s). Next: \`bun run format\` then \`bun run validate\`.\n`,
);
