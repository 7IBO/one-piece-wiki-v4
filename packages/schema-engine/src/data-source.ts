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
 * Build a DataSource from an in-memory `Record<absolutePath, string>`
 * of pre-read file contents. The dashboard's prod build feeds this
 * with the result of `import.meta.glob('/data/**\/*.json',
 * { eager: true, query: '?raw', import: 'default' })`, after
 * normalising the glob keys to absolute paths.
 *
 * Directory queries derive from the file keys: a "subdirectory" of
 * `dir` is the unique set of next-path-segments that appear in any
 * key prefixed by `dir/`. No real filesystem is consulted, so this
 * works equally well in Node and in a browser sandbox.
 */
export function inMemoryDataSource(files: Record<string, string>): DataSource {
  const keys = Object.keys(files).map(normalise);
  const fileSet = new Map(keys.map((k) => [k, files[denormalise(k, files)]]));

  function under(dir: string): string[] {
    const prefix = ensureTrailingSlash(normalise(dir));
    return keys.filter((k) => k.startsWith(prefix));
  }

  return {
    async listJsonFiles(dir) {
      const prefix = ensureTrailingSlash(normalise(dir));
      const out: string[] = [];
      for (const k of keys) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        // direct child only (no further slash) AND ends in .json
        if (!rest.includes('/') && rest.endsWith('.json')) out.push(k);
      }
      return out.sort();
    },
    async readTextFile(path) {
      const norm = normalise(path);
      return fileSet.get(norm) ?? null;
    },
    async listSubdirectories(dir) {
      const prefix = ensureTrailingSlash(normalise(dir));
      const dirs = new Set<string>();
      for (const k of under(dir)) {
        const rest = k.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash > 0) dirs.add(rest.slice(0, slash));
      }
      return [...dirs].sort();
    },
  };
}

function normalise(p: string): string {
  return p.replace(/\\/g, '/');
}
function denormalise(k: string, files: Record<string, string>): string {
  // Files may have been keyed with backslashes originally (Windows).
  // Try the normalised key first, fall back to the raw form.
  if (files[k] !== undefined) return k;
  const alt = k.replace(/\//g, '\\');
  return files[alt] !== undefined ? alt : k;
}
function ensureTrailingSlash(s: string): string {
  return s.endsWith('/') ? s : `${s}/`;
}
