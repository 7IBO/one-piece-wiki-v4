import { z } from 'zod';
import { LocalizedLabel, Slug } from '../primitives.ts';

export const VocabularyValue = z
  .object({
    labels: LocalizedLabel,
    description: LocalizedLabel.optional(),
  })
  .passthrough();
export type VocabularyValue = z.infer<typeof VocabularyValue>;

export const VocabularySchema = z.object({
  $schema: z.string().optional(),
  id: Slug,
  schema_version: z.number().int().positive(),
  values: z.record(z.string(), VocabularyValue),
});
export type VocabularySchema = z.infer<typeof VocabularySchema>;
