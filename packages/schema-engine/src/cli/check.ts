/**
 * bun run schema:check — meta-validate every schema file in /data/schemas/.
 * Exits 0 on success, 1 on any error.
 */
import { loadSchemas } from '../loader.ts';
import { validateCatalogue } from '../meta-validator.ts';

const catalogue = await loadSchemas();
const validated = validateCatalogue(catalogue);

const allErrors = [...catalogue.errors, ...validated.errors];

if (allErrors.length > 0) {
  for (const error of allErrors) {
    process.stderr.write(`[${error.code}] ${error.path}\n  ${error.message}\n`);
  }
  process.stderr.write(`\n${allErrors.length} schema error(s).\n`);
  process.exit(1);
}

process.stdout.write(
  `OK: ${validated.entityTypes.size} entity types, `
    + `${validated.propertyTypes.size} property types, `
    + `${validated.relationTypes.size} relation types, `
    + `${validated.vocabularies.size} vocabularies.\n`,
);
