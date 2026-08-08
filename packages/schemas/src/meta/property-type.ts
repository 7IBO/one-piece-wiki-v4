import { z } from 'zod';
import { LocalizedLabel, Slug, ValueType } from '../primitives.ts';

export const ValueConstraints = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    pattern: z.string().optional(),
    enum_ref: z.string().optional(),
  })
  .partial();
export type ValueConstraints = z.infer<typeof ValueConstraints>;

export const AllowedQualifier = z.object({
  id: Slug,
  value_type: ValueType,
  enum_ref: z.string().optional(),
  required: z.boolean().default(false),
});
export type AllowedQualifier = z.infer<typeof AllowedQualifier>;

export const PropertyTypeUiHint = z
  .object({
    display_format: z.string().optional(),
    input_widget: z.string().optional(),
    icon: z.string().optional(),
  })
  .partial();

export const PropertyTypeSchema = z.object({
  $schema: z.string().optional(),
  id: Slug,
  schema_version: z.number().int().positive(),
  /**
   * Universe ids this schema belongs to. Omitted/empty = **shared core**
   * (available to every universe — e.g. `name`, `status`). A list (e.g.
   * `["one-piece"]`) scopes it to those universes only (e.g. `bounty`,
   * `classification`). A universe's effective catalogue is core ∪ its
   * own schemas. See ADR-035.
   */
  universes: z.array(Slug).optional(),
  labels: LocalizedLabel,
  value_type: ValueType,
  value_constraints: ValueConstraints.optional(),
  unit: z.string().optional(),
  historical: z.boolean(),
  localizable: z.boolean(),
  /**
   * `ja-latn` (romanized Japanese) transliteration allowed (ADR-095).
   * Only meaningful on `localizable` property types: when true, the
   * dashboard offers a `ja-latn` translation input next to `ja`.
   * Reserved for **name-like values** (`name`, `epithet`, `title_key`)
   * — free-text/description-like keys must never set it (romanizing
   * prose is meaningless). `ja` itself needs no flag: every localizable
   * value accepts original-script Japanese.
   */
  romanizable: z.boolean().optional(),
  spoiler_sensitive: z.boolean().default(false),
  applies_to_entity_types: z.array(Slug).optional(),
  default_qualifiers: z.array(Slug).default([]),
  allowed_qualifiers: z.array(AllowedQualifier).default([]),
  ui_hint: PropertyTypeUiHint.optional(),
});
export type PropertyTypeSchema = z.infer<typeof PropertyTypeSchema>;
