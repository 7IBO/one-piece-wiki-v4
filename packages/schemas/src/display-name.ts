/**
 * Display-name resolution, shared by the dashboard server (`api/`) and
 * client (`src/`). Previously this exact scan was copy-pasted in three
 * places (server `nameKeyFor`, two client `resolveDisplayName`); this
 * module is the single source.
 *
 * The name-like property priority is centralised in
 * `NAME_LIKE_PROPERTY_IDS`. It is still a code-level constant rather
 * than schema-derived — making it schema-driven (a marker on
 * property-type schemas, or `canonical_name_key`-first) is a behaviour
 * change tracked separately. This module preserves the prior behaviour
 * exactly; it only removes the duplication.
 *
 * Pure and dependency-free (no sqlite, no fs) so it is safe to import
 * from both the Bun server process and the Vite browser bundle.
 */

/** Properties scanned, in priority order, for an entity's display name. */
export const NAME_LIKE_PROPERTY_IDS = ['name', 'title_key'] as const;

type EntityData = Record<string, unknown>;

/** `{ en: { key: text }, fr: { ... }, ... }` — per-locale i18n maps. */
export type LocaleTranslations = Record<string, Record<string, string>>;

function nameLikeEntries(data: EntityData): readonly unknown[][] {
  const props = data['properties'];
  if (props === null || typeof props !== 'object') return [];
  const lists: unknown[][] = [];
  for (const candidate of NAME_LIKE_PROPERTY_IDS) {
    const raw = (props as Record<string, unknown>)[candidate];
    if (raw === null || raw === undefined) continue;
    lists.push(Array.isArray(raw) ? raw : [raw]);
  }
  return lists;
}

function entryKey(entry: unknown): string | null {
  if (entry === null || typeof entry !== 'object') return null;
  const value = (entry as Record<string, unknown>)['value_key']
    ?? (entry as Record<string, unknown>)['value'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The i18n key (or literal value) of an entity's most name-like
 * property: the latest entry of the first present property among
 * {@link NAME_LIKE_PROPERTY_IDS}. Returns null when none is present.
 *
 * Translation-unaware — used server-side, where the key is resolved to
 * text per locale downstream.
 */
export function nameKeyFor(data: EntityData): string | null {
  for (const list of nameLikeEntries(data)) {
    for (let i = list.length - 1; i >= 0; i--) {
      const key = entryKey(list[i]);
      if (key !== null) return key;
    }
  }
  return null;
}

/**
 * The entity's display name resolved against `translations` for
 * `locale` (falling back to `en`). Scans latest-first across the
 * name-like properties and returns the first entry whose key resolves
 * to a non-empty translation. Returns null when none does — callers
 * choose their own fallback (slug, id, …).
 */
export function resolveDisplayName(
  data: EntityData,
  translations: LocaleTranslations,
  locale: string,
): string | null {
  for (const list of nameLikeEntries(data)) {
    for (let i = list.length - 1; i >= 0; i--) {
      const key = entryKey(list[i]);
      if (key === null) continue;
      const translated = translations[locale]?.[key] ?? translations['en']?.[key];
      if (translated !== undefined && translated.length > 0) return translated;
    }
  }
  return null;
}
