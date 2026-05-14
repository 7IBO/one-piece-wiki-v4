/**
 * @onepiece-wiki/i18n — locale type, key resolution, Zod error map.
 *
 * The translation file layout and key naming convention are documented in
 * /docs/I18N_STRATEGY.md. This package exposes the runtime helpers; the
 * build pipeline (Phase 2) bundles the actual translation values.
 */
import { DEFAULT_LOCALE, type Locale, LOCALES } from '@onepiece-wiki/schemas';
import type { z } from 'zod';

export type { Locale };
export { DEFAULT_LOCALE, LOCALES };

export type LocaleBundle = Readonly<Record<string, string>>;

export type TranslationStore = ReadonlyMap<Locale, LocaleBundle>;

const I18N_KEY_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)+$/;

export function isI18nKey(value: unknown): value is string {
  return typeof value === 'string' && I18N_KEY_RE.test(value);
}

export type ResolveOptions = {
  readonly fallbackLocale?: Locale;
};

export function resolveKey(
  store: TranslationStore,
  key: string,
  locale: Locale,
  options: ResolveOptions = {},
): string | undefined {
  const direct = store.get(locale)?.[key];
  if (direct !== undefined) return direct;
  const fallback = options.fallbackLocale ?? DEFAULT_LOCALE;
  if (fallback === locale) return undefined;
  return store.get(fallback)?.[key];
}

/**
 * Zod error map that renders messages from a translation store. Falls
 * back to the default English Zod messages when no key matches.
 */
export function makeZodErrorMap(
  store: TranslationStore,
  locale: Locale,
): z.ZodErrorMap {
  return (issue, ctx) => {
    const key = `form.error.${issue.code}`;
    const translated = resolveKey(store, key, locale);
    return { message: translated ?? ctx.defaultError };
  };
}
