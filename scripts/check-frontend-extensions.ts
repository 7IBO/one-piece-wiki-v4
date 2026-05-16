#!/usr/bin/env bun
/**
 * CI / pre-commit guardrail.
 *
 * The dashboard frontend (`apps/dashboard/src/**`) uses Vite, which
 * resolves extension-less relative imports out of the box. To keep
 * imports clean we forbid `.ts` / `.tsx` extensions on relative paths
 * in that tree. Bun-runtime code (`apps/dashboard/api/**`,
 * `packages/**`) is exempt — Bun follows strict ESM resolution and
 * needs the explicit extension to find the source file.
 *
 * Exit code 0 if clean, 1 with offending file:line listings otherwise.
 * Run via `bun run scripts/check-frontend-extensions.ts` or through
 * the pre-commit hook in `lefthook.yml`.
 *
 * Optional filename args limit the scan to those paths (handy with
 * lefthook's `{staged_files}` glob).
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FRONTEND_ROOT = resolve(ROOT, 'apps/dashboard/src');

const PATTERN = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]((?:\.{1,2}\/|@\/)[^'"\n]+\.tsx?)['"]/g;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) yield path;
  }
}

async function filesToScan(): Promise<readonly string[]> {
  const argv = process.argv.slice(2).map((a) => resolve(a));
  if (argv.length === 0) {
    const out: string[] = [];
    for await (const p of walk(FRONTEND_ROOT)) out.push(p);
    return out;
  }
  // Filter staged files to the frontend tree only — staged files
  // from packages/ or apps/dashboard/api/ are correct as-is.
  return argv.filter((p) =>
    p.startsWith(FRONTEND_ROOT + '\\') || p.startsWith(FRONTEND_ROOT + '/')
  );
}

const offenders: { file: string; line: number; match: string; }[] = [];

for (const path of await filesToScan()) {
  // Sequential reads on purpose — keeps memory bounded and the
  // offender list deterministic (parallel reads would arrive in
  // race-y order on slow filesystems).
  // eslint-disable-next-line no-await-in-loop
  const src = await readFile(path, 'utf8');
  const lines = src.split(/\r?\n/);
  lines.forEach((line, idx) => {
    PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PATTERN.exec(line)) !== null) {
      offenders.push({
        file: relative(ROOT, path),
        line: idx + 1,
        match: m[1] ?? m[0],
      });
    }
  });
}

if (offenders.length === 0) {
  process.exit(0);
}

process.stderr.write(
  `\nFound ${offenders.length} import(s) with .ts/.tsx extension in apps/dashboard/src/**:\n\n`,
);
for (const o of offenders) {
  process.stderr.write(`  ${o.file}:${o.line}  ${o.match}\n`);
}
process.stderr.write(
  `\nVite resolves extension-less imports automatically. Strip the .ts/.tsx\n`
    + `from the import path, or run \`bun run scripts/strip-frontend-extensions.ts\`\n`
    + `to fix everything at once.\n\n`,
);
process.exit(1);
