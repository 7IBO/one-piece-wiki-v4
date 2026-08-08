#!/usr/bin/env bun
/**
 * Dev convenience: `bun run dev` reads `/dist/onepiece.db`, which is a
 * disposable build artifact. When it is missing (fresh clone, cleaned
 * dist), run the db-builder CLI once before starting Vite so the
 * server routes have something to read. Turbo owns the dependency for
 * `build` (`@onepiece-wiki/web#build` dependsOn
 * `@onepiece-wiki/db-builder#build:db`); this script is the dev-mode
 * equivalent only — it never rebuilds an existing artifact.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const dbPath = resolve(repoRoot, 'dist', 'onepiece.db');

if (!existsSync(dbPath)) {
  // oxlint-disable-next-line no-console
  console.error(`[web] ${dbPath} missing — running the build pipeline once…`);
  const proc = Bun.spawnSync(
    ['bun', 'packages/db-builder/src/cli/build.ts'],
    { cwd: repoRoot, stdout: 'inherit', stderr: 'inherit' },
  );
  if (proc.exitCode !== 0) {
    // oxlint-disable-next-line no-console
    console.error('[web] build:db failed — cannot start the dev server without the artifact.');
    process.exit(proc.exitCode ?? 1);
  }
}
