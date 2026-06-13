import { z } from 'zod';
import { Slug, ValueType } from '../primitives.ts';

export const RelationLabels = z.object({
  en: z.object({ active: z.string().min(1), inverse: z.string().min(1) }),
  fr: z.object({ active: z.string().min(1), inverse: z.string().min(1) }),
});
export type RelationLabels = z.infer<typeof RelationLabels>;

export const RelationQualifier = z.object({
  id: Slug,
  value_type: ValueType,
  enum_ref: z.string().optional(),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
});
export type RelationQualifier = z.infer<typeof RelationQualifier>;

export const RelationTypeUiHint = z
  .object({
    icon: z.string().optional(),
  })
  .partial();

export const RelationTypeSchema = z.object({
  $schema: z.string().optional(),
  id: Slug,
  schema_version: z.number().int().positive(),
  /** Universe scope; omitted = shared core. See ADR-035. */
  universes: z.array(Slug).optional(),
  labels: RelationLabels,
  valid_from_types: z.array(Slug).min(1),
  valid_to_types: z.array(Slug).min(1),
  qualifiers: z.array(RelationQualifier).default([]),
  allow_multiple_concurrent: z.boolean().default(false),
  inverse_inferred: z.boolean(),
  historical: z.boolean().default(false),
  ui_hint: RelationTypeUiHint.optional(),
});
export type RelationTypeSchema = z.infer<typeof RelationTypeSchema>;
