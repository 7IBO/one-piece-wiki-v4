/**
 * bun run validate — validate every entity JSON file in
 * /data/universes/**​/entities/ against the schema catalogue.
 *
 * Also enforces the post-merge invariant from ADR-015 / Phase 7.1:
 * no entity JSON on `main` may contain a `staging://` URL. Those
 * are transient placeholders that the `promote-images.yml`
 * workflow rewrites to canonical public URLs after the bytes are
 * copied from `pending/` to `images/` on R2. A `staging://`
 * survivor means the workflow didn't run (or only half-ran) — CI
 * fails the PR here so a half-applied promote can't reach
 * downstream consumers (preview app, public app, db-builder).
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

if (loaded.errors.length > 0) {
  for (const error of loaded.errors) {
    process.stderr.write(`[${error.code}] ${error.path}\n  ${error.message}\n`);
  }
  process.stderr.write(`\n${loaded.errors.length} entity error(s).\n`);
  process.exit(1);
}

// Staging-URL guard (ADR-015). Walk every entity's serialized JSON
// looking for `staging://` references. They're not in the meta
// schema (the URL type is just `string`), so we catch them here.
const stagingOffenders: { id: string; matches: readonly string[]; }[] = [];
const STAGING_RE = /staging:\/\/[A-Za-z0-9._\-/]+/g;
for (const entity of loaded.entities.values()) {
  const json = JSON.stringify(entity.data);
  const matches = json.match(STAGING_RE);
  if (matches !== null && matches.length > 0) {
    stagingOffenders.push({ id: entity.id, matches: [...new Set(matches)] });
  }
}
if (stagingOffenders.length > 0) {
  process.stderr.write(
    '\nstaging:// URLs found in committed entity JSON — the\n'
      + 'promote-images workflow needs to run (or finish) before this\n'
      + 'data can land on main. See ADR-015 / docs/IMAGES.md.\n\n',
  );
  for (const o of stagingOffenders) {
    process.stderr.write(`  ${o.id}\n`);
    for (const m of o.matches) process.stderr.write(`    ${m}\n`);
  }
  process.stderr.write(`\n${stagingOffenders.length} offending entity(ies).\n`);
  process.exit(1);
}

process.stdout.write(`OK: ${loaded.entities.size} entities validated.\n`);
