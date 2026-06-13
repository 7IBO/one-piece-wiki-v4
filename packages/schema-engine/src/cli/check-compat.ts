/**
 * bun run check:compat         — fail if the live catalogue's public contract
 *                                diverges from the committed schema-snapshot.json.
 * bun run compat:snapshot      — (--write) regenerate the snapshot (accept the change).
 *
 * The "schema lockfile" (ADR-042): a committed snapshot of the contract the
 * SDK / API and external consumers depend on. ANY change (additive or
 * breaking) fails `check:compat` until the snapshot is regenerated and
 * committed — so the contract diff is visible in review. Breaking changes are
 * listed explicitly and additionally require a `/data` migration + the
 * `schema-breaking` PR label.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildContract, diffContract, type SchemaContract, serializeContract } from '../compat.ts';
import { loadSchemas } from '../loader.ts';
import { validateCatalogue } from '../meta-validator.ts';
import { REPO_ROOT } from '../paths.ts';

const SNAPSHOT_PATH = resolve(REPO_ROOT, 'packages', 'schema-engine', 'schema-snapshot.json');
const write = process.argv.includes('--write');

const catalogue = await loadSchemas();
const validated = validateCatalogue(catalogue);
if (catalogue.errors.length > 0 || validated.errors.length > 0) {
  process.stderr.write(
    'Cannot check compatibility: the schema has validation errors. Run `bun run schema:check` first.\n',
  );
  process.exit(1);
}

const current = buildContract(validated);

if (write) {
  writeFileSync(SNAPSHOT_PATH, serializeContract(current), 'utf8');
  process.stdout.write(`Wrote schema snapshot -> ${SNAPSHOT_PATH}\n`);
  process.exit(0);
}

if (!existsSync(SNAPSHOT_PATH)) {
  process.stderr.write('No schema-snapshot.json yet. Create it with `bun run compat:snapshot`.\n');
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as SchemaContract;
const findings = diffContract(snapshot, current);

if (findings.length === 0) {
  process.stdout.write('OK: schema contract matches the snapshot.\n');
  process.exit(0);
}

const breaking = findings.filter((f) => f.kind === 'breaking');
const additive = findings.filter((f) => f.kind === 'additive');
for (const f of breaking) process.stderr.write(`[BREAKING] ${f.message}\n`);
for (const f of additive) process.stderr.write(`[additive] ${f.message}\n`);
process.stderr.write(
  `\nSchema contract changed (${breaking.length} breaking, ${additive.length} additive). `
    + 'Run `bun run compat:snapshot` to update the lockfile, then commit it.\n',
);
if (breaking.length > 0) {
  process.stderr.write(
    'BREAKING changes also require a migration in /data/migrations and the `schema-breaking` PR label (ADR-042).\n',
  );
}
process.exit(1);
