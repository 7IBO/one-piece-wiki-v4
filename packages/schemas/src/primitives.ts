import { z } from 'zod';

// Slugs accept hyphens for kebab-case ids (entity types, relations,
// vocabularies) AND underscores for snake_case property/qualifier ids.
// Both are in active use across the data model; the convention is to
// pick one separator per id but the validator does not enforce that.
const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const I18N_KEY = /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)+$/;
const ENTITY_ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*:[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export type Brand<TBase, TBrand extends string> = TBase & { readonly __brand: TBrand; };

export const Slug = z
  .string()
  .min(1)
  .max(60)
  .regex(
    SLUG,
    'Slug must be kebab-case or snake_case English (a-z, 0-9, hyphen or underscore separators).',
  )
  .transform((value) => value as Brand<string, 'Slug'>);
export type Slug = z.infer<typeof Slug>;

export const EntityId = z
  .string()
  .regex(ENTITY_ID, 'EntityId must follow <type>:<slug> where both are kebab-case.')
  .transform((value) => value as Brand<string, 'EntityId'>);
export type EntityId = z.infer<typeof EntityId>;

export const SourceRef = EntityId;
export type SourceRef = z.infer<typeof SourceRef>;

export const EntityRef = EntityId;
export type EntityRef = z.infer<typeof EntityRef>;

export const I18nKey = z
  .string()
  .regex(I18N_KEY, 'I18nKey must be dot-separated kebab/snake segments.')
  .transform((value) => value as Brand<string, 'I18nKey'>);
export type I18nKey = z.infer<typeof I18nKey>;

export const Locale = z.enum(['en', 'fr']);
export type Locale = z.infer<typeof Locale>;
export const LOCALES: readonly Locale[] = ['en', 'fr'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

export const LocalizedLabel = z.object({
  en: z.string().min(1),
  fr: z.string().min(1),
});
export type LocalizedLabel = z.infer<typeof LocalizedLabel>;

export const EpistemicStatus = z.enum([
  'true',
  'confirmed',
  'believed_by_world',
  'believed_by_characters',
  'revealed_to_reader',
  'rumored',
  'implied',
  'retconned',
  'disputed',
]);
export type EpistemicStatus = z.infer<typeof EpistemicStatus>;

export const CanonScope = z.enum([
  'manga',
  'anime',
  'anime_filler',
  'film_canon',
  'film_non_canon',
  'sbs',
  'databook',
  'live_action',
  'crossover',
  'video_game',
]);
export type CanonScope = z.infer<typeof CanonScope>;

export const ReviewStatus = z.enum(['reviewed', 'not_reviewed', 'flagged', 'auto_imported']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const AssistedBy = z
  .string()
  .regex(
    /^[a-z0-9]+-[a-z0-9.]+-via-(cc|api|dashboard)$/,
    'assisted_by must be <model-family>-<version>-via-<surface> where surface is cc, api, or dashboard.',
  );
export type AssistedBy = z.infer<typeof AssistedBy>;

export const ValueType = z.enum([
  'string',
  'number',
  'boolean',
  'enum',
  'multi_enum',
  'date',
  'entity_ref',
  'source_ref',
  'i18n_key',
  'markdown',
]);
export type ValueType = z.infer<typeof ValueType>;
