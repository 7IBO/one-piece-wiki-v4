#!/usr/bin/env bun
/**
 * Ship the SQLite artifact WITH the server bundle.
 *
 * Nitro traces `import`s. `server/db.ts` locates the artifact with an
 * `existsSync` walk up the tree at runtime (see `resolveDbPath`), which
 * no bundler can see — so `dist/onepiece.db` was never traced into the
 * deployment and the deployed server died with:
 *
 *     SQLite artifact not found at /var/task/dist/onepiece.db
 *
 * That path is where the upward walk *ends up* on Vercel, so dropping
 * the file next to the server entry is enough: the existing walk finds
 * it, and no `ONEPIECE_DB_PATH` is needed.
 *
 * ⚠️ NEVER copy the artifact into `public/`. It holds the entire corpus
 * at every progression cursor; served as a static asset it would hand
 * any visitor every spoiler in the work. The anti-spoiler filtering is
 * only worth anything because the database stays server-side.
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const webRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(webRoot, '..', '..');
const source = resolve(repoRoot, 'dist', 'onepiece.db');

/**
 * Where the server entry lands, per Nitro preset. `vercel` emits the
 * Build Output API layout; every other preset we use emits `.output`.
 * Both are probed because the same build script serves local runs and
 * the platform.
 */
const TARGET_DIRS = [
  resolve(webRoot, '.vercel', 'output', 'functions', '__server.func'),
  resolve(webRoot, '.output', 'server'),
] as const;

if (!existsSync(source)) {
  // oxlint-disable-next-line no-console
  console.error(
    `[web] ${source} missing — run \`bun run build:db\` before building the app.`,
  );
  process.exit(1);
}

const written: string[] = [];
for (const dir of TARGET_DIRS) {
  if (!existsSync(dir)) continue;
  const target = resolve(dir, 'dist', 'onepiece.db');
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  written.push(target);
}

if (written.length === 0) {
  // oxlint-disable-next-line no-console
  console.error(
    '[web] no server output directory found — did `vite build` run? '
      + `Looked in:\n  ${TARGET_DIRS.join('\n  ')}`,
  );
  process.exit(1);
}

for (const target of written) {
  // oxlint-disable-next-line no-console
  console.log(`[web] bundled the SQLite artifact → ${target}`);
}
