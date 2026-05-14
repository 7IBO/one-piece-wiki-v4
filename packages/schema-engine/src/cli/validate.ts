/**
 * bun run validate — validate every entity JSON file in
 * /data/universes/**​/entities/ against the schema catalogue.
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

process.stdout.write(`OK: ${loaded.entities.size} entities validated.\n`);
