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
  ui_hint: EntityTypeUiHint.optional(),
});
export type EntityTypeSchema = z.infer<typeof EntityTypeSchema>;
