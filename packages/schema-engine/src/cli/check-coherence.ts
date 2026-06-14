/**
 * bun run check:coherence — cross-entity consistency rules beyond
 * single-file validation and bare reference existence. Errors fail the
 * build; warnings are printed but non-fatal.
 */
import { checkCoherence, checkEntityVersions, checkSchemaCoherence } from '../coherence.ts';
import { loadEntities } from '../entity-loader.ts';
import { loadSchemas } from '../loader.ts';
import { validateCatalogue } from '../meta-validator.ts';
import { checkUniverseScopes } from '../universe.ts';

const catalogue = await loadSchemas();
const validated = validateCatalogue(catalogue);

if (catalogue.errors.length > 0 || validated.errors.length > 0) {
  process.stderr.write('Schema catalogue has errors. Run bun run schema:check.\n');
  process.exit(1);
}

const loaded = await loadEntities(validated);
if (loaded.errors.length > 0) {
  process.stderr.write('Entity files have errors. Run bun run validate.\n');
  process.exit(1);
}

const findings = [
  ...checkSchemaCoherence(validated),
  ...checkUniverseScopes(validated),
  ...checkCoherence(loaded.entities, validated),
  ...checkEntityVersions(loaded.entities, validated),
];
const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');

for (const f of warnings) {
  process.stderr.write(`[warn] [${f.code}] ${f.source}\n  ${f.message}\n  at ${f.path}\n`);
}
for (const f of errors) {
  process.stderr.write(`[error] [${f.code}] ${f.source}\n  ${f.message}\n  at ${f.path}\n`);
}

if (errors.length > 0) {
  process.stderr.write(
    `\n${errors.length} coherence error(s), ${warnings.length} warning(s).\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `OK: ${loaded.entities.size} entities coherent`
    + (warnings.length > 0 ? ` (${warnings.length} warning(s)).\n` : '.\n'),
);
