/**
 * Schema catalogue for the public reader app. Labels (entity types,
 * property types, relation directions, vocabulary values, qualifier
 * registry) are never hardcoded — they are re-read from `/data/schemas`
 * through schema-engine, exactly like the dashboard does (ADR-019):
 *
 *  - dev (`vite dev`): `fsDataSource` reads the working tree, so
 *    schema edits reflect on refresh;
 *  - prod (`vite build` output): an in-memory source built from a
 *    Vite `import.meta.glob` of `/data/**​/*.json` inlined in the SSR
 *    bundle (serverless targets have no repo filesystem).
 *
 * The validated catalogue is loaded once per process and cached.
 */
import {
  type DataSource,
  fsDataSource,
  inMemoryDataSource,
  loadSchemas,
  validateCatalogue,
  type ValidatedCatalogue,
} from '@onepiece-wiki/schema-engine';

/** See `apps/dashboard/server/data-source.ts` for the full rationale
 *  of the glob form (relative pattern, literal call sites, raw text). */
function buildBundleSource(): DataSource {
  const rawJson = (import.meta as {
    glob: <T>(
      pattern: string,
      opts: { eager: true; query: '?raw'; import: 'default'; },
    ) => Record<string, T>;
  }).glob<string>('../../../data/**/*.json', {
    eager: true,
    query: '?raw',
    import: 'default',
  });
  return inMemoryDataSource(rawJson);
}

const PROD = (import.meta as { env?: { PROD?: boolean; }; }).env?.PROD ?? false;

const source: DataSource = PROD ? buildBundleSource() : fsDataSource;

let cached: Promise<ValidatedCatalogue> | null = null;

/** Load (once per process) and meta-validate the full schema catalogue. */
export function getCatalogue(): Promise<ValidatedCatalogue> {
  cached ??= loadSchemas(source).then(validateCatalogue);
  return cached;
}
