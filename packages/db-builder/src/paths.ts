import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT: string = resolve(here, '..', '..', '..');
export const DIST_DIR: string = resolve(REPO_ROOT, 'dist');
export const DB_PATH: string = resolve(DIST_DIR, 'onepiece.db');
export const MANIFEST_PATH: string = resolve(DIST_DIR, 'manifest.json');
