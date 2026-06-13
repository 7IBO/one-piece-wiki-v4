/**
 * bun run schema:generate — emit Zod-related artefacts under
 * packages/schemas/generated/.
 */
import { generate } from '../generator.ts';
import { loadSchemas } from '../loader.ts';
import { generateMetaSchemas } from '../meta-schema-generator.ts';
import { validateCatalogue } from '../meta-validator.ts';

const catalogue = await loadSchemas();
const validated = validateCatalogue(catalogue);

if (catalogue.errors.length > 0 || validated.errors.length > 0) {
  process.stderr.write('Cannot generate: schema files have errors. Run bun run schema:check.\n');
  process.exit(1);
}

await generate(validated);
process.stdout.write('Generated schemas under packages/schemas/generated/\n');

const metaSchemas = await generateMetaSchemas();
process.stdout.write(
  `Generated ${metaSchemas.length} meta-schemas under packages/schema-engine/meta-schemas/\n`,
);
