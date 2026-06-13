import { z } from 'zod';
import { LocalizedLabel, Slug } from '../primitives.ts';

export const PropertyDeclaration = z.object({
  id: Slug,
  required: z.boolean().default(false),
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
  labels: LocalizedLabel,
  url_segment: Slug,
  properties: z.array(PropertyDeclaration),
  allowed_relations: z.array(Slug).default([]),
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
