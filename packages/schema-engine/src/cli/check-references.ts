/**
 * bun run check:references — resolve every reference in the schema
 * catalogue and in every entity file.
 */
import { loadEntities, resolveEntityReferences } from '../entity-loader.ts';
import { loadSchemas } from '../loader.ts';
import { validateCatalogue } from '../meta-validator.ts';
import { resolveReferences } from '../reference-resolver.ts';

const catalogue = await loadSchemas();
const validated = validateCatalogue(catalogue);

if (catalogue.errors.length > 0 || validated.errors.length > 0) {
  process.stderr.write('Schema catalogue has errors. Run bun run schema:check.\n');
  process.exit(1);
}

const schemaErrors = resolveReferences(validated);
const loaded = await loadEntities(validated);

if (loaded.errors.length > 0) {
  process.stderr.write('Entity files have errors. Run bun run validate.\n');
  process.exit(1);
}

const entityErrors = resolveEntityReferences(loaded.entities, validated);
const allErrors = [...schemaErrors, ...entityErrors];

if (allErrors.length > 0) {
  for (const error of allErrors) {
    process.stderr.write(`[${error.code}] ${error.source} → ${error.target}\n  at ${error.path}\n`);
  }
  process.stderr.write(`\n${allErrors.length} reference error(s).\n`);
  process.exit(1);
}

process.stdout.write(
  `OK: ${schemaErrors.length === 0 ? 'schema references' : ''} `
    + `+ ${entityErrors.length === 0 ? 'entity references' : ''} resolve.\n`,
);
