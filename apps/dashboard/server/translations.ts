/**
 * Translation-record plumbing for the dashboard API (ADR-095).
 *
 * A translation record covers every DATA locale (`en`, `fr`, `ja`,
 * `ja-latn`) — the locales a stored translation VALUE can exist in —
 * while the dashboard chrome keeps rendering in the UI locales
 * (`en`/`fr`) only. Missing/malformed locale files normalize to `{}`
 * so the form can index any data locale without branching; locale
 * directories (`translations/ja/…`) simply appear on disk the first
 * time a save writes them.
 *
 * Pure (no fs, no globals): the reader takes a `read` callback so the
 * same code serves the local-checkout path and the PR-branch path,
 * and unit tests exercise the round-trip without a repo on disk.
 */
import { DATA_LOCALES, type DataLocale } from '@onepiece-wiki/schemas';

/** Per-entity translation maps, one per data locale — every key
 *  present, missing locales normalized to `{}`. */
export type TranslationRecord = Record<DataLocale, Record<string, string>>;

export function emptyTranslationRecord(): TranslationRecord {
  return { en: {}, fr: {}, ja: {}, 'ja-latn': {} };
}

/** Repo-relative path of one locale's translation file for an entity. */
export function translationsRelativePath(
  universe: string,
  locale: DataLocale,
  type: string,
  fileBase: string,
): string {
  return `data/universes/${universe}/translations/${locale}/${type}/${fileBase}.json`;
}

/**
 * Parse one translation file's text into a flat map. Forgiving on
 * purpose (same behaviour the server always had): absent file,
 * malformed JSON, or a non-object payload all yield `{}` — the form
 * still renders every key, just untranslated.
 */
export function parseTranslationMap(text: string | null): Record<string, string> {
  if (text === null) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // malformed file → empty translations for this locale; that's fine.
  }
  return {};
}

/**
 * Read every data locale's translation file for an entity through the
 * supplied reader (local checkout or PR branch — the caller decides).
 * The reader returns the file text or `null` when absent; reader
 * failures count as absent.
 */
export async function readTranslationRecord(
  read: (relativePath: string) => Promise<string | null>,
  universe: string,
  type: string,
  fileBase: string,
): Promise<TranslationRecord> {
  const out = emptyTranslationRecord();
  await Promise.all(DATA_LOCALES.map(async (locale) => {
    let text: string | null = null;
    try {
      text = await read(translationsRelativePath(universe, locale, type, fileBase));
    } catch {
      // read failure → treated as absent, same as the historical
      // behaviour of readTranslationsFor.
    }
    out[locale] = parseTranslationMap(text);
  }));
  return out;
}

/**
 * Build the extra PR files for a save payload's translations: one file
 * per data locale that carries at least one non-empty string value.
 * Empty strings are "no translation" and are never written; a locale
 * with nothing left is skipped entirely so empty files never appear
 * in the PR (and `ja`/`ja-latn` directories only materialize once a
 * real translation exists).
 */
export function translationExtraFiles(
  universe: string,
  type: string,
  fileBase: string,
  translations: Partial<Record<DataLocale, Record<string, string>>> | undefined,
): { path: string; content: string; }[] {
  const files: { path: string; content: string; }[] = [];
  if (translations === undefined) return files;
  for (const locale of DATA_LOCALES) {
    const map = translations[locale];
    if (map === undefined) continue;
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === 'string' && v.length > 0) filtered[k] = v;
    }
    if (Object.keys(filtered).length === 0) continue;
    files.push({
      path: translationsRelativePath(universe, locale, type, fileBase),
      content: `${JSON.stringify(filtered, null, 2)}\n`,
    });
  }
  return files;
}
