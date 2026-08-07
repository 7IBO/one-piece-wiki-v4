import { z } from 'zod';
import { LocalizedLabel, Slug, ValueType } from '../primitives.ts';

/**
 * Qualifier-type registry entry (ADR-078). Declares one qualifier —
 * base (implicit on every historisable entry, engine-provided) or
 * common (referenced by id from a property type's
 * `default_qualifiers` / lean `allowed_qualifiers`) — with the full
 * metadata the form generator needs: localized labels/descriptions,
 * value type, enum ref, entity-type filter, multiplicity.
 *
 * The registry is the single source the dashboard derives its
 * qualifier UI from; app code must not hardcode qualifier ids or
 * shapes (CLAUDE.md). Validation of entity JSON is unchanged — base
 * qualifiers stay typed in the generated printers/entity-loader; this
 * registry feeds discovery and presentation.
 */
export const QualifierTypeSchema = z.object({
  $schema: z.string().optional(),
  id: Slug,
  schema_version: z.number().int().positive(),
  /** See PropertyTypeSchema.universes — omitted/empty = shared core. */
  universes: z.array(Slug).optional(),
  /**
   * `base` = implicit on every historisable entry (engine-provided,
   * MUST NOT be redeclared by property types); `common` = referenced
   * by id from `default_qualifiers` / lean `allowed_qualifiers`.
   */
  kind: z.enum(['base', 'common']),
  labels: LocalizedLabel,
  /** Hint shown beneath the form input. */
  descriptions: LocalizedLabel.optional(),
  value_type: ValueType,
  enum_ref: z.string().optional(),
  /**
   * For `entity_ref` values: restrict the picker to these entity
   * types. Omitted = every type allowed.
   */
  entity_type_filter: z.array(Slug).optional(),
  /** The qualifier holds an array of values (e.g. `believed_by`). */
  multi: z.boolean().default(false),
  /**
   * The qualifier's value mirrors the entry's own value type
   * (`actual_value`); `value_type` is then the fallback when the
   * entry type is unknown.
   */
  mirrors_entry_value: z.boolean().default(false),
  /** Display order among qualifiers of the same kind (ascending). */
  order: z.number().int().optional(),
});
export type QualifierTypeSchema = z.infer<typeof QualifierTypeSchema>;
