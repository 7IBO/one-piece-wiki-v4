/**
 * Picks the `DataSource` the dashboard's API uses to read schemas /
 * entities / translations (ADR-019).
 *
 * Two flavours:
 *
 *  - **dev (`bun run dev`, `bun api/server.ts`)** — `fsDataSource`
 *    from schema-engine. Reads `/data/**​/*.json` straight off the
 *    repo working tree, so every save by the maintainer reflects
 *    immediately without a rebuild.
 *  - **prod (`bun run build` → `node .output/server/index.mjs`,
 *    incl. Vercel)** — an in-memory source built from a Vite
 *    `import.meta.glob` of `/data/**​/*.json`. The glob inlines every
 *    file into the SSR bundle at build time, so the deployed
 *    function carries its own copy of the data tree and never needs
 *    to read from a filesystem that won't exist on a serverless
 *    target.
 *
 * Switching is automatic via `import.meta.env.PROD` (Vite-injected;
 * `true` only in `vite build` output, `false` in `vite dev`). The
 * legacy standalone `bun api/server.ts` entrypoint doesn't go
 * through Vite so `import.meta.env` is undefined there — the
 * `?? false` keeps it on the fs path.
 */
import {
  type DataSource,
  fsDataSource,
  inMemoryDataSource,
  REPO_ROOT,
} from '@onepiece-wiki/schema-engine';

/**
 * Critical: reuse schema-engine's `REPO_ROOT` constant instead of
 * computing our own from `import.meta.url`. Both packages get
 * bundled into the SSR output but each lands at a different position
 * in the module graph, so computing two REPO_ROOTs independently
 * produces two different absolute prefixes that don't agree — the
 * loaders then ask for paths that aren't in the in-memory map and
 * the catalogues come back empty. Importing the shared constant
 * guarantees both sides round-trip the same paths regardless of
 * bundle layout.
 */
const NORMALISED_REPO_ROOT = REPO_ROOT.replace(/\\/g, '/');

/**
 * Vite resolves `import.meta.glob` patterns at build time. We grab
 * every JSON under the monorepo's `/data/` tree as raw text (no
 * JSON.parse — the loaders do that themselves so they keep
 * ownership of error formatting), then re-key the glob result into
 * the absolute filesystem paths that `schema-engine`'s loaders
 * pass around.
 *
 * Path: we use a *relative* path (`../../../data/**​/*.json` from
 * this file in `apps/dashboard/api/`) because Vite resolves the
 * leading `/` form as project-root-relative, and the project root
 * here is `apps/dashboard/`, not the monorepo root — so `/data/...`
 * would silently match nothing. Relative paths walk the actual
 * filesystem tree and pick up the real `<repo>/data/` folder.
 *
 * The `import.meta.glob` call sits inside a function so the
 * fs-only dev path doesn't pay for it at module load. Vite's
 * static analysis still sees the call inside the body and inlines
 * accordingly; lazy invocation is purely a runtime decision.
 */
function buildBundleSource(): DataSource {
  // Glob keys arrive as `../../../data/schemas/...` (relative form
  // Vite gives back when the pattern is relative). Normalise each
  // to an absolute path under REPO_ROOT so the schema-engine
  // loaders can construct + pass absolute paths transparently.
  const raw = (import.meta as {
    glob: <T>(
      pattern: string,
      opts: { eager: true; query: '?raw'; import: 'default'; },
    ) => Record<string, T>;
  }).glob<string>('../../../data/**/*.json', {
    eager: true,
    query: '?raw',
    import: 'default',
  });
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    // k looks like '../../../data/schemas/entity-types/character.json'.
    // Strip the leading '../' segments, then prepend the shared
    // REPO_ROOT (schema-engine's constant) so the keys exactly match
    // the absolute paths the loaders construct on the read side.
    const rel = k.replace(/^(\.\.\/)+/, '');
    const absKey = `${NORMALISED_REPO_ROOT}/${rel}`;
    files[absKey] = v;
  }
  return inMemoryDataSource(files);
}

// Vite's `import.meta.env.PROD` is `true` exclusively in the
// `vite build` output (incl. the Nitro SSR bundle Start emits).
// In `vite dev` and in the legacy `bun api/server.ts` path it's
// false / undefined → fs source.
const PROD = (import.meta as { env?: { PROD?: boolean; }; }).env?.PROD ?? false;

export const dashboardDataSource: DataSource = PROD ? buildBundleSource() : fsDataSource;
