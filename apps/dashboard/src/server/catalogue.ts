/**
 * Server-only catalogue helpers shared by the Start API route files
 * under `src/routes/api.*.ts`.
 *
 * Mirrors the helpers that previously lived inline in the legacy Bun
 * server at `apps/dashboard/api/server.ts` so each route file can stay
 * a thin adapter around the existing snapshot + display-name logic.
 * The legacy server keeps its own copies for as long as it runs in
 * parallel during the Start migration (see Phase F: delete legacy).
 */
import {
  loadEntities,
  loadSchemas,
  validateCatalogue,
} from '@onepiece-wiki/schema-engine';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const UNIVERSE = 'one-piece';

export const LOCALES = ['en', 'fr'] as const;
export type Locale = typeof LOCALES[number];

/**
 * Repo root resolved from this file's location. `src/server/` lives
 * three levels under `apps/dashboard/`, which itself is two levels
 * under the repo root — so `../../../../..` from here.
 *
 * Kept as a function so the Vercel build's static analysis doesn't
 * try to pre-resolve `import.meta.url` at module init when the URL
 * scheme isn't yet known (the file lands inside `dist/server/` after
 * bundling; the relative offset to `/data` may need adjusting at
 * deploy time — see Phase E).
 */
export function repoRoot(): string {
  const here = fileURLToPath(import.meta.url);
  return resolve(here, '..', '..', '..', '..', '..');
}

export function dataPath(type: string, fileBase: string): string {
  return resolve(
    repoRoot(),
    `data/universes/${UNIVERSE}/entities/${type}/${fileBase}.json`,
  );
}

export function translationsFilePath(
  locale: Locale,
  type: string,
  fileBase: string,
): string {
  return resolve(
    repoRoot(),
    `data/universes/${UNIVERSE}/translations/${locale}/${type}/${fileBase}.json`,
  );
}

export type CatalogueSnapshot = Awaited<ReturnType<typeof snapshot>>;

/**
 * Validated schema catalogue + loaded entities. The legacy Bun server
 * called this on every request; under Start the result is cached in
 * a module-level Promise so subsequent requests on a warm function
 * reuse the parsed JSON. Schemas and entities are derived from disk
 * and only change at deploy time, so invalidation on save is not
 * required — that's a Phase D concern handled inline in the save
 * route.
 */
let snapshotPromise: Promise<{
  readonly validated: Awaited<ReturnType<typeof validateCatalogue>>;
  readonly entities: Awaited<ReturnType<typeof loadEntities>>['entities'];
}> | null = null;

export async function snapshot(): Promise<{
  readonly validated: Awaited<ReturnType<typeof validateCatalogue>>;
  readonly entities: Awaited<ReturnType<typeof loadEntities>>['entities'];
}> {
  if (snapshotPromise !== null) return snapshotPromise;
  snapshotPromise = (async () => {
    const catalogue = await loadSchemas();
    const validated = validateCatalogue(catalogue);
    if (catalogue.errors.length > 0 || validated.errors.length > 0) {
      throw new Error('Schema catalogue has errors. Run bun run schema:check.');
    }
    const loaded = await loadEntities(validated);
    if (loaded.errors.length > 0) {
      throw new Error('Entity files have errors. Run bun run validate.');
    }
    return { validated, entities: loaded.entities };
  })().catch((err) => {
    // Reset cache on error so a transient failure doesn't poison
    // every subsequent request for the lifetime of the function.
    snapshotPromise = null;
    throw err;
  });
  return snapshotPromise;
}

export function invalidateSnapshot(): void {
  snapshotPromise = null;
}

export async function readTranslationsFor(
  type: string,
  fileBase: string,
): Promise<Record<Locale, Record<string, string>>> {
  const out = { en: {}, fr: {} } as Record<Locale, Record<string, string>>;
  for (const locale of LOCALES) {
    const path = translationsFilePath(locale, type, fileBase);
    try {
      const text = await readFile(path, 'utf8');
      const parsed = JSON.parse(text) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        out[locale] = parsed as Record<string, string>;
      }
    } catch {
      // Missing file → empty translations for this locale; that's fine.
    }
  }
  return out;
}

export async function findEntity(
  snap: CatalogueSnapshot,
  type: string,
  slug: string,
): Promise<{ id: string; type: string; data: Record<string, unknown> } | undefined> {
  for (const entity of snap.entities.values()) {
    if (entity.type === type && entity.data['slug'] === slug) return entity;
  }
  return undefined;
}

/**
 * Latest `value_key` from an entity's most "name-like" property. Tries
 * `name` first, then `title_key` (used by chapters). Works whether the
 * property is historical (array) or not.
 */
export function nameKeyFor(data: Record<string, unknown>): string | null {
  const props = data['properties'];
  if (props === null || typeof props !== 'object') return null;
  for (const candidate of ['name', 'title_key'] as const) {
    const raw = (props as Record<string, unknown>)[candidate];
    if (raw === null || raw === undefined) continue;
    const list = Array.isArray(raw) ? raw : [raw];
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      if (entry !== null && typeof entry === 'object') {
        const v = (entry as Record<string, unknown>)['value_key']
          ?? (entry as Record<string, unknown>)['value'];
        if (typeof v === 'string' && v.length > 0) return v;
      }
    }
  }
  return null;
}

const SOURCE_TYPE_IDS: ReadonlySet<string> = new Set([
  'manga-chapter',
  'anime-episode',
  'film',
  'sbs',
  'databook',
]);

export function isSourceType(type: string): boolean {
  return SOURCE_TYPE_IDS.has(type);
}

/**
 * Synthetic display fallback when no `name` / `title_key` translation
 * exists. Source-type entities (chapters, episodes, films…) get null
 * so the source picker renders `number — title` cleanly. Non-source
 * entities fall back to a pretty-printed slug.
 */
export function syntheticDisplayName(
  entity: { id: string; type: string; data: Record<string, unknown> },
): { en: string | null; fr: string | null } {
  if (isSourceType(entity.type)) return { en: null, fr: null };
  const slug = String(entity.data['slug'] ?? '');
  if (slug !== '') {
    const pretty = slug
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    return { en: pretty, fr: pretty };
  }
  return { en: null, fr: null };
}

/**
 * Pre-load every entity's en/fr display name. Loaded once per request
 * (per snapshot, really). Keyed by entity id. Falls back to `null`
 * per locale if the translation is missing — callers default to slug.
 */
export async function buildDisplayNames(
  snap: CatalogueSnapshot,
): Promise<Map<string, { en: string | null; fr: string | null }>> {
  const map = new Map<string, { en: string | null; fr: string | null }>();
  const tasks: Promise<void>[] = [];
  for (const entity of snap.entities.values()) {
    const fileBase = entity.id.split(':')[1] ?? '';
    const key = nameKeyFor(entity.data);
    tasks.push((async () => {
      const fallback = syntheticDisplayName(entity);
      if (key === null) {
        map.set(entity.id, fallback);
        return;
      }
      const trs = await readTranslationsFor(entity.type, fileBase);
      map.set(entity.id, {
        en: trs.en[key] ?? fallback.en,
        fr: trs.fr[key] ?? fallback.fr,
      });
    })());
  }
  await Promise.all(tasks);
  return map;
}

export function chapterNumber(
  entity: { data: Record<string, unknown> },
): number | null {
  const props = entity.data['properties'];
  if (props === null || typeof props !== 'object') return null;
  const num = (props as Record<string, unknown>)['number'];
  if (num !== null && typeof num === 'object' && num !== undefined) {
    const v = (num as Record<string, unknown>)['value'];
    if (typeof v === 'number') return v;
  }
  return null;
}

/**
 * Recursively collect any string that *looks like* a dotted i18n key
 * (slug.slug.slug). Used to build the auto-complete list for the form.
 */
export function collectI18nKeysFrom(value: unknown, out: Set<string>): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (/^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)+$/.test(value)) {
      out.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectI18nKeysFrom(item, out);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectI18nKeysFrom(v, out);
    }
  }
}

/* ─────────────────────────── Response helpers ────────────────────── */

export function json(
  value: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

export function notFound(message: string): Response {
  return json({ error: message }, 404);
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export function serverError(message: string): Response {
  return json({ error: message }, 500);
}
