import { z } from 'zod';
import { LocalizedLabel, Slug } from '../primitives.ts';

export const PropertyDeclaration = z.object({
  id: Slug,
  required: z.boolean().default(false),
  /**
   * Wikipedia-style completeness tier (ADR-083): a complete article of
   * this type is expected to carry this property, but its absence is
   * never a validation error. Drives the dashboard's completeness
   * meter and the "recommended, still empty" field state. `required`
   * implies recommended — do not set both.
   */
  recommended: z.boolean().default(false),
  historical: z.boolean().default(false),
  localizable: z.boolean().default(false),
});
export type PropertyDeclaration = z.infer<typeof PropertyDeclaration>;

export const EntityTypeUiHint = z
  .object({
    icon: z.string().optional(),
    group: z.string().optional(),
    color: z.string().optional(),
  })
  .partial();

export const EntityTypeSchema = z.object({
  $schema: z.string().optional(),
  id: Slug,
  schema_version: z.number().int().positive(),
  /** Universe scope; omitted = shared core (e.g. `character`, `image`). See ADR-035. */
  universes: z.array(Slug).optional(),
  labels: LocalizedLabel,
  url_segment: Slug,
  properties: z.array(PropertyDeclaration),
  allowed_relations: z.array(Slug).default([]),
  /**
   * Subset of `allowed_relations` a complete article is expected to
   * carry (ADR-083) — the relation half of the completeness meter.
   * Checked against `allowed_relations` by `schema:check`.
   */
  recommended_relations: z.array(Slug).optional(),
  requires_translations: z.boolean().optional(),
  /**
   * Property ids scanned, in priority order, to resolve this type's
   * display name (the latest entry of the first present one wins). When
   * omitted, callers fall back to a code-level default (`['name',
   * 'title_key']`). This is what keeps display-name resolution
   * schema-driven rather than hardcoding property names in app code.
   */
  display_name_properties: z.array(Slug).optional(),
  ui_hint: EntityTypeUiHint.optional(),
});
export type EntityTypeSchema = z.infer<typeof EntityTypeSchema>;
