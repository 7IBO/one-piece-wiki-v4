/**
 * bun run migrate <path-to-migration.ts> [--dry-run] [--allow-lossy] [--force]
 *
 * Applies a migration to the entity corpus in `/data/universes/**`.
 * The migration file must default-export a `Migration` (see
 * `/data/migrations/README.md`). With `--dry-run`, reports the
 * affected files without writing anything.
 *
 * Safety: refuses to run when `data/universes` has uncommitted changes
 * (a clean tree keeps a bad migration reversible with `git checkout
 * data/`; `--force` overrides), and refuses lossy changes — deleted
 * files or dropped properties/relations — unless `--allow-lossy` is
 * passed.
 *
 * After a real run, run `bun run format` (dprint normalises the
 * rewritten JSON) and `bun run validate` (confirms the corpus still
 * parses against the schema).
 */
import { execSync } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyMigration, collectEntityFiles, detectLosses } from '../migrate/runner.ts';
import type { Migration } from '../migrate/types.ts';
import { REPO_ROOT } from '../paths.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const allowLossy = args.includes('--allow-lossy');
const fileArg = args.find((arg) => !arg.startsWith('--'));

if (fileArg === undefined) {
  process.stderr.write('usage: bun run migrate <path-to-migration.ts> [--dry-run]\n');
  process.exit(1);
}

const migrationPath = resolve(REPO_ROOT, fileArg);
const mod = (await import(migrationPath)) as {
  default?: Migration;
  migration?: Migration;
};
const migration = mod.default ?? mod.migration;

if (migration === undefined) {
  process.stderr.write(
    `Migration file "${fileArg}" must export a Migration as default or named \`migration\`.\n`,
  );
  process.exit(1);
}

const files = await collectEntityFiles();
const report = applyMigration(files, migration);

process.stdout.write(`Migration ${report.migrationId}\n`);
process.stdout.write(`  changed:   ${report.changed.length}\n`);
process.stdout.write(`  deleted:   ${report.deleted.length}\n`);
process.stdout.write(`  unchanged: ${report.unchanged}\n`);

if (dryRun) {
  for (const change of report.changed) process.stdout.write(`  ~ ${change.path}\n`);
  for (const path of report.deleted) process.stdout.write(`  - ${path}\n`);
  process.stdout.write('\n(dry run — no files written)\n');
  process.exit(0);
}

// A clean tree makes a bad migration fully reversible with
// `git checkout data/`. Refuse to write over uncommitted data unless
// forced (e.g. CI on a throwaway checkout).
if (!force) {
  const dirty = execSync('git status --porcelain data/universes', {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  if (dirty !== '') {
    process.stderr.write(
      'Refusing to migrate: data/universes has uncommitted changes.\n'
        + 'Commit or stash them first so this migration stays reversible, or pass --force.\n',
    );
    process.exit(1);
  }
}

// Lossy changes (deleted files, dropped properties/relations) take
// historisation metadata with them — require explicit opt-in.
const losses = detectLosses(report);
if (losses.length > 0 && !allowLossy) {
  process.stderr.write(
    `Refusing to migrate: ${losses.length} change(s) would drop data. `
      + 'Re-run with --allow-lossy to confirm:\n',
  );
  for (const loss of losses) {
    process.stderr.write(`  ! ${loss.path} — ${loss.reason} (${loss.detail})\n`);
  }
  process.exit(1);
}

for (const change of report.changed) {
  await writeFile(change.path, `${JSON.stringify(change.after, null, 2)}\n`, 'utf8');
}
for (const path of report.deleted) {
  await rm(path);
}

process.stdout.write('\nDone. Next: `bun run format` then `bun run validate`.\n');
