/**
 * Which data locales a property type's translation editor offers
 * (ADR-095). Pure and dependency-free — shared by the dashboard form
 * and any later consumer so the gating rule lives in exactly one
 * place:
 *
 *  - non-localizable → no translation inputs at all;
 *  - every localizable value → the UI locales (`en`, `fr`) plus `ja`
 *    (original Japanese script);
 *  - `ja-latn` (romanized Japanese) ONLY when the property type is
 *    flagged `romanizable: true` — name-like values (`name`,
 *    `epithet`, `title_key`), never free text.
 *
 * Display fallback chains are untouched: `ja`/`ja-latn` are stored
 * data surfaced in the form's translation inputs, not UI locales.
 */
import { type DataLocale, LOCALES } from './primitives.ts';

export type TranslationLocaleGate = {
  readonly localizable: boolean;
  readonly romanizable?: boolean | undefined;
};

export function translationLocalesFor(
  propertyType: TranslationLocaleGate,
): readonly DataLocale[] {
  if (!propertyType.localizable) return [];
  return propertyType.romanizable === true
    ? [...LOCALES, 'ja', 'ja-latn']
    : [...LOCALES, 'ja'];
}
