/**
 * Pluggable read-only data source. Lets `loadSchemas` /
 * `loadEntities` work against:
 *
 *  - The repo filesystem (`fsDataSource`) — used by every CLI and
 *    Bun-process consumer.
 *  - An in-memory bundle (e.g. Vite's `import.meta.glob`) — used by
 *    the dashboard's SSR bundle when deployed to a serverless host
 *    (Vercel, Cloudflare Workers) where the source `data/` tree
 *    isn't on the function filesystem (ADR-019).
 *
 * The interface mirrors the subset of `node:fs/promises` the loaders
 * actually call. Paths are absolute strings (the loaders construct
 * them via `node:path.resolve` against `REPO_ROOT`); concrete sources
 * may treat the absolute prefix as opaque or strip it to look up
 * relative keys — both are valid as long as they round-trip.
 */
import { readdir, readFile } from 'node:fs/promises';

export interface DataSource {
  /** List JSON files directly under `absoluteDir` (non-recursive).
   *  Returns absolute paths sorted ascending. Returns [] when the
   *  directory doesn't exist — never throws ENOENT. */
  readonly listJsonFiles: (absoluteDir: string) => Promise<readonly string[]>;
  /** Read the UTF-8 text content of an absolute file path. Returns
   *  `null` if the file is missing (ENOENT). Throws on any other
   *  IO error so callers see real problems loudly. */
  readonly readTextFile: (absolutePath: string) => Promise<string | null>;
  /** List immediate subdirectory NAMES (basenames, not full paths)
   *  of `absoluteDir`. Returns [] when the directory doesn't exist
   *  — never throws ENOENT. */
  readonly listSubdirectories: (absoluteDir: string) => Promise<readonly string[]>;
}

/**
 * Default fs-backed source. Used by every CLI and the dashboard
 * during dev. The dashboard's prod SSR bundle swaps this for a
 * Vite-glob source so the data tree ships inside the function.
 */
export const fsDataSource: DataSource = {
  async listJsonFiles(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith('.json'))
        .map((e) => `${dir}/${e.name}`.replace(/\\/g, '/'))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  },
  async readTextFile(path) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  },
  async listSubdirectories(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  },
};

/**
 * Build a DataSource from an in-memory map of pre-read file contents.
 *
 * Keys + lookup paths are both normalised to their `data/...`
 * suffix internally. This sidesteps the fragility of "two
 * REPO_ROOTs computed at different bundle depths might disagree":
 * as long as every key and every lookup contains `/data/` somewhere,
 * we trim everything before it and match on the relative form. The
 * dashboard's prod build feeds glob output keyed by relative paths
 * like `../../../data/schemas/...`; the loaders ask for absolute
 * paths like `/var/task/...../data/schemas/...`. Both normalise to
 * the same `data/schemas/...` key.
 *
 * Directory queries derive from the file keys: a "subdirectory" of
 * `dir` is the unique set of next-path-segments that appear in any
 * key under `dir/`. No real filesystem is consulted, so this works
 * equally well in Node and in a browser sandbox.
 */
export function inMemoryDataSource(files: Record<string, string>): DataSource {
  const normalised: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) {
    normalised[toDataRelative(k)] = v;
  }
  const keys = Object.keys(normalised);

  return {
    async listJsonFiles(dir) {
      const prefix = ensureTrailingSlash(toDataRelative(dir));
      const out: string[] = [];
      for (const k of keys) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        if (!rest.includes('/') && rest.endsWith('.json')) out.push(k);
      }
      return out.sort();
    },
    async readTextFile(path) {
      return normalised[toDataRelative(path)] ?? null;
    },
    async listSubdirectories(dir) {
      const prefix = ensureTrailingSlash(toDataRelative(dir));
      const dirs = new Set<string>();
      for (const k of keys) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash > 0) dirs.add(rest.slice(0, slash));
      }
      return [...dirs].sort();
    },
  };
}

/**
 * Strip everything before the last occurrence of `/data/` from
 * `path` so we end up with a clean `data/...` suffix. Falls back
 * to the verbatim (slash-normalised) path if `/data/` isn't found
 * — that path won't match anything in the map and lookups will
 * correctly return null / [].
 */
function toDataRelative(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/data/');
  if (idx >= 0) return norm.slice(idx + 1);
  if (norm.startsWith('data/')) return norm;
  return norm;
}

function ensureTrailingSlash(s: string): string {
  return s.endsWith('/') ? s : `${s}/`;
}
