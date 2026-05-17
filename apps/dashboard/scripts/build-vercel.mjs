/**
 * Vercel Build Output API postbuild for the TanStack Start dashboard.
 *
 * Start v1.167+ produces:
 *   - apps/dashboard/dist/client/   → static assets
 *   - apps/dashboard/dist/server/   → Node SSR + API handler
 *
 * Vercel doesn't ship a TanStack Start preset, but its Build Output
 * API (https://vercel.com/docs/build-output-api/v3) is framework-
 * neutral: any folder at `<root>/.vercel/output/` with the documented
 * structure gets served verbatim. We assemble that structure here
 * after `vite build` runs.
 *
 * Layout written:
 *
 *   apps/dashboard/.vercel/output/
 *     config.json
 *     static/                  ← copy of dist/client/
 *     functions/
 *       _render.func/
 *         .vc-config.json      ← runtime metadata (nodejs22.x)
 *         package.json         ← "type": "module"
 *         index.mjs            ← thin wrapper around server/index.mjs
 *         server/              ← copy of dist/server/
 *         data/                ← copy of repo `data/` (snapshot reads)
 *
 * The function runtime resolves data files via the DATA_ROOT env var
 * (see packages/schema-engine/src/paths.ts + src/server/catalogue.ts),
 * which the wrapper sets to its own bundled `./data` directory.
 *
 * Vercel project settings:
 *   - Root Directory: apps/dashboard
 *   - Build Command:  bun run vercel-build
 *   - (no Output Directory — Vercel auto-detects .vercel/output)
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardDir = resolve(here, '..');
const repoRoot = resolve(dashboardDir, '..', '..');

const distDir = resolve(dashboardDir, 'dist');
const clientDist = resolve(distDir, 'client');
const serverDist = resolve(distDir, 'server');
const dataSrc = resolve(repoRoot, 'data');

const outDir = resolve(dashboardDir, '.vercel', 'output');
const staticDir = resolve(outDir, 'static');
const funcDir = resolve(outDir, 'functions', '_render.func');

async function exists(path) {
  try {
    const { stat } = await import('node:fs/promises');
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(clientDist))) {
    throw new Error(`Missing ${clientDist} — run \`vite build\` first.`);
  }
  if (!(await exists(serverDist))) {
    throw new Error(
      `Missing ${serverDist} — the TanStack Start plugin should produce it. `
        + `Check vite.config.ts (the tanstackStart() plugin must be present).`,
    );
  }
  if (!(await exists(dataSrc))) {
    throw new Error(`Missing ${dataSrc} — the repo's data folder is required at runtime.`);
  }

  // Fresh output dir every build.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(staticDir, { recursive: true });
  await mkdir(funcDir, { recursive: true });

  // Copy client assets verbatim to .vercel/output/static. Vercel
  // serves these straight from its CDN; nothing about the names or
  // paths is rewritten.
  await cp(clientDist, staticDir, { recursive: true });

  // Copy the SSR + API server bundle into the function folder. The
  // wrapper below imports from `./server/index.mjs`.
  await cp(serverDist, resolve(funcDir, 'server'), { recursive: true });

  // Copy `data/` next to the bundle. DATA_ROOT in the wrapper points
  // here so the schema-engine + catalogue locate JSON files without
  // having to walk a build-time-relative path.
  await cp(dataSrc, resolve(funcDir, 'data'), { recursive: true });

  // package.json with type:module so the function can `import` ESM.
  await writeFile(
    resolve(funcDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2) + '\n',
    'utf8',
  );

  // Vercel function metadata. Node 22 supports the Web-standard
  // `(Request) => Response` signature natively; supportsResponseStreaming
  // keeps the Start render handler's streaming behaviour intact.
  await writeFile(
    resolve(funcDir, '.vc-config.json'),
    JSON.stringify(
      {
        runtime: 'nodejs22.x',
        handler: 'index.mjs',
        launcherType: 'Nodejs',
        supportsResponseStreaming: true,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  // Thin wrapper. Sets DATA_ROOT before importing the server bundle
  // so `paths.ts` reads it during the bundle's own top-level init
  // (some constants there are computed at module load).
  const wrapper = `import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
process.env.DATA_ROOT ??= resolve(here, 'data');

// TanStack Start v1.167+ emits the SSR entry at dist/server/server.js
// (not index.mjs — that name is reserved for the rsbuild variant).
const { default: server } = await import('./server/server.js');

export default function handler(request) {
  return server.fetch(request);
}
`;
  await writeFile(resolve(funcDir, 'index.mjs'), wrapper, 'utf8');

  // Routing config. \`filesystem\` matches /assets/foo.js etc.;
  // anything not on disk falls through to the render function.
  await writeFile(
    resolve(outDir, 'config.json'),
    JSON.stringify(
      {
        version: 3,
        routes: [
          { handle: 'filesystem' },
          { src: '/(.*)', dest: '/_render' },
        ],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  process.stdout.write(`[build-vercel] wrote ${outDir}\n`);
}

await main();
