/**
 * Resolves the project's well-known data paths relative to the repo root.
 * The schema engine never reaches above repoRoot; everything else is
 * expressed as descendants of that root.
 *
 * `DATA_ROOT` env override: when set, the schema + entity directories
 * are anchored under that path instead of the file-relative repo root.
 * Used by deploy adapters (the dashboard's Vercel postbuild) that copy
 * `data/**` to a known location next to the bundled function — the
 * bundle file's `import.meta.url` would otherwise resolve to a path
 * inside `.vercel/output/functions/.../` that bears no relation to
 * the repo layout.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const ENV_DATA_ROOT = process.env['DATA_ROOT'];

/**
 * Repo root when no override is set: three levels above this file
 * (packages/schema-engine/src/paths.ts → repo root). When DATA_ROOT
 * is set we point at its parent so the rest of the constants below
 * resolve `data/...` correctly without further adjustments.
 */
export const REPO_ROOT: string = ENV_DATA_ROOT !== undefined && ENV_DATA_ROOT !== ''
  ? resolve(ENV_DATA_ROOT, '..')
  : resolve(here, '..', '..', '..');

export const SCHEMA_DIR: string = resolve(REPO_ROOT, 'data', 'schemas');
export const ENTITY_TYPES_DIR: string = resolve(SCHEMA_DIR, 'entity-types');
export const PROPERTY_TYPES_DIR: string = resolve(SCHEMA_DIR, 'property-types');
export const RELATION_TYPES_DIR: string = resolve(SCHEMA_DIR, 'relation-types');
export const VOCABULARY_DIR: string = resolve(SCHEMA_DIR, 'vocabulary');

export const UNIVERSES_DIR: string = resolve(REPO_ROOT, 'data', 'universes');

export const GENERATED_DIR: string = resolve(
  REPO_ROOT,
  'packages',
  'schemas',
  'generated',
);
