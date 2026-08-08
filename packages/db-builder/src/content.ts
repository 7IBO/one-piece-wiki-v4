/**
 * Content loaders for the two non-entity trees the artifact carries:
 *
 *  - `/data/universes/<u>/translations/<locale>/<entityType>/<file>.json`
 *    — flat `key → string` maps (I18N_STRATEGY.md).
 *  - `/data/universes/<u>/narratives/<locale>/<entityType>/<fileBase>.md`
 *    — one Markdown file per entity per locale, where `<fileBase>` is
 *    the entity id's slug part (DATA_MODEL.md § Narratives).
 *
 * Both loaders are deterministic: directories and files are walked in
 * sorted order and the returned rows are fully sorted. Missing trees
 * yield empty results (narratives, in particular, may not exist yet).
 */
import { UNIVERSES_DIR } from '@onepiece-wiki/schema-engine';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type TranslationRow = {
  universe: string;
  locale: string;
  key: string;
  value: string;
};

export type NarrativeRow = {
  universe: string;
  entity_id: string;
  locale: string;
  markdown: string;
};

async function listDirNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function listFiles(dir: string, extension: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(extension))
      .map((e) => e.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function loadTranslationRows(
  universesDir: string = UNIVERSES_DIR,
): Promise<TranslationRow[]> {
  const rows: TranslationRow[] = [];
  for (const universe of await listDirNames(universesDir)) {
    const localesDir = join(universesDir, universe, 'translations');
    const seen = new Map<string, string>();
    for (const locale of await listDirNames(localesDir)) {
      for (const typeDir of await listDirNames(join(localesDir, locale))) {
        for (const file of await listFiles(join(localesDir, locale, typeDir), '.json')) {
          const path = join(localesDir, locale, typeDir, file);
          const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(`Translation file is not a flat object: ${path}`);
          }
          for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof value !== 'string') {
              throw new Error(`Translation value for "${key}" is not a string: ${path}`);
            }
            const dedupKey = `${locale} ${key}`;
            const previous = seen.get(dedupKey);
            if (previous !== undefined) {
              throw new Error(
                `Duplicate translation key "${key}" (${locale}) in ${path} (already in ${previous})`,
              );
            }
            seen.set(dedupKey, path);
            rows.push({ universe, locale, key, value });
          }
        }
      }
    }
  }
  rows.sort((a, b) =>
    a.universe.localeCompare(b.universe)
    || a.locale.localeCompare(b.locale)
    || a.key.localeCompare(b.key)
  );
  return rows;
}

export async function loadNarrativeRows(
  universesDir: string = UNIVERSES_DIR,
): Promise<NarrativeRow[]> {
  const rows: NarrativeRow[] = [];
  for (const universe of await listDirNames(universesDir)) {
    const localesDir = join(universesDir, universe, 'narratives');
    for (const locale of await listDirNames(localesDir)) {
      for (const typeDir of await listDirNames(join(localesDir, locale))) {
        for (const file of await listFiles(join(localesDir, locale, typeDir), '.md')) {
          const path = join(localesDir, locale, typeDir, file);
          const fileBase = file.slice(0, -'.md'.length);
          rows.push({
            universe,
            entity_id: `${typeDir}:${fileBase}`,
            locale,
            markdown: await readFile(path, 'utf8'),
          });
        }
      }
    }
  }
  rows.sort((a, b) => a.entity_id.localeCompare(b.entity_id) || a.locale.localeCompare(b.locale));
  return rows;
}
