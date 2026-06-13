/**
 * Display-name resolution, shared by the dashboard server (`api/`) and
 * client (`src/`). Previously this exact scan was copy-pasted in three
 * places (server `nameKeyFor`, two client `resolveDisplayName`); this
 * module is the single source.
 *
 * The name-like property priority is **schema-driven**: each entity
 * type may declare `display_name_properties` (an ordered list) on its
 * schema, which callers pass in as `nameProperties`. When a caller has
 * no schema config to hand, the functions fall back to
 * `DEFAULT_NAME_LIKE_PROPERTY_IDS` so behaviour is unchanged for any
 * type that doesn't override it. No property name is hardcoded in app
 * code — the constant here is only the documented default.
 *
 * Pure and dependency-free (no sqlite, no fs) so it is safe to import
 * from both the Bun server process and the Vite browser bundle.
 */

/**
 * Fallback property priority when an entity type declares no
 * `display_name_properties`. Scanned in order; the first present
 * property wins.
 */
export const DEFAULT_NAME_LIKE_PROPERTY_IDS = ['name', 'title_key'] as const;

type EntityData = Record<string, unknown>;

/** `{ en: { key: text }, fr: { ... }, ... }` — per-locale i18n maps. */
export type LocaleTranslations = Record<string, Record<string, string>>;

function nameLikeEntries(
  data: EntityData,
  nameProperties: readonly string[],
): readonly unknown[][] {
  const props = data['properties'];
  if (props === null || typeof props !== 'object') return [];
  const lists: unknown[][] = [];
  for (const candidate of nameProperties) {
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
 * `nameProperties` (an entity type's `display_name_properties`, or
 * {@link DEFAULT_NAME_LIKE_PROPERTY_IDS} when not supplied). Returns
 * null when none is present.
 *
 * Translation-unaware — used server-side, where the key is resolved to
 * text per locale downstream.
 */
export function nameKeyFor(
  data: EntityData,
  nameProperties: readonly string[] = DEFAULT_NAME_LIKE_PROPERTY_IDS,
): string | null {
  for (const list of nameLikeEntries(data, nameProperties)) {
    for (let i = list.length - 1; i >= 0; i--) {
      const key = entryKey(list[i]);
      if (key !== null) return key;
    }
  }
  return null;
}

/**
 * The entity's display name resolved against `translations` for
 * `locale` (falling back to `en`). Scans latest-first across
 * `nameProperties` (an entity type's `display_name_properties`, or
 * {@link DEFAULT_NAME_LIKE_PROPERTY_IDS} when not supplied) and returns
 * the first entry whose key resolves to a non-empty translation.
 * Returns null when none does — callers choose their own fallback
 * (slug, id, …).
 */
export function resolveDisplayName(
  data: EntityData,
  translations: LocaleTranslations,
  locale: string,
  nameProperties: readonly string[] = DEFAULT_NAME_LIKE_PROPERTY_IDS,
): string | null {
  for (const list of nameLikeEntries(data, nameProperties)) {
    for (let i = list.length - 1; i >= 0; i--) {
      const key = entryKey(list[i]);
      if (key === null) continue;
      const translated = translations[locale]?.[key] ?? translations['en']?.[key];
      if (translated !== undefined && translated.length > 0) return translated;
    }
  }
  return null;
}
