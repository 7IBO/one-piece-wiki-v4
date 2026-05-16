#!/usr/bin/env bun
/**
 * One-shot codemod: strip `.ts` / `.tsx` from RELATIVE imports inside
 * the dashboard frontend (`apps/dashboard/src/**`). Frontend code is
 * served by Vite, whose resolver handles extension-less imports out
 * of the box, so the explicit extensions were noise.
 *
 * Deliberately scoped: never touches `apps/dashboard/api/**` or any
 * `packages/**` source — those are read by Bun in runtime mode, which
 * follows strict ESM resolution and *does* need the explicit
 * extension to find the file.
 *
 * Matches only relative (`./`, `../`) and aliased (`@/`) imports.
 * Bare specifiers (`react`, `@onepiece-wiki/schemas`) never carry an
 * extension anyway.
 *
 * Run: `bun run scripts/strip-frontend-extensions.ts`
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TARGET = join(ROOT, 'apps/dashboard/src');

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      yield path;
    }
  }
}

// Static imports/exports + dynamic imports. Each pattern captures
// (prefix, the path including its trailing dot-extension we want to
// drop, suffix) so the substitution is precise — we don't paint
// across whole import statements.
const PATTERNS: readonly RegExp[] = [
  // `} from '../bar.ts'` — catches both single- and multi-line imports
  // because we anchor on `from` directly, not on `import`/`export`.
  // Re-exports (`export … from '…';`) match the same way.
  /(\bfrom\s*['"])((?:\.{1,2}\/|@\/)[^'"\n]+?)\.tsx?(['"])/g,
  // import './side-effect.ts'
  /(\bimport\s*['"])((?:\.{1,2}\/|@\/)[^'"\n]+?)\.tsx?(['"])/g,
  // import('./lazy.tsx')
  /(\bimport\s*\(\s*['"])((?:\.{1,2}\/|@\/)[^'"\n]+?)\.tsx?(['"])/g,
];

let touched = 0;
let edits = 0;

for await (const path of walk(TARGET)) {
  const before = await readFile(path, 'utf8');
  let after = before;
  for (const pat of PATTERNS) {
    after = after.replace(pat, (_match, prefix: string, mid: string, suffix: string) => {
      edits += 1;
      return `${prefix}${mid}${suffix}`;
    });
  }
  if (after !== before) {
    await writeFile(path, after, 'utf8');
    touched += 1;
    process.stdout.write(`  rewrote ${relative(ROOT, path)}\n`);
  }
}

process.stdout.write(`\nDone: ${edits} imports updated across ${touched} files.\n`);
