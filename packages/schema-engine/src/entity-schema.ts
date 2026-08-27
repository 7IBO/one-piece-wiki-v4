/**
 * Runtime entity-schema synthesis — the PURE half of the entity
 * loader, extracted so browser code can import it (no node:path, no
 * fs). The dashboard uses it for live client-side validation with the
 * exact validator the server applies on save and the CLI applies on
 * disk: one Zod, three boundaries.
 */
import {
  EntityId,
  EpistemicStatus,
  I18N_KEY_PATTERN,
  IsoDate,
  ReviewStatus,
  SincePrecision,
  Slug,
  type ValueType,
} from '@onepiece-wiki/schemas';
import { z } from 'zod';
import type { PropertyType, ValidatedCatalogue, Vocabulary } from './meta-validator.ts';

export const I18nKeyString = z.string().regex(I18N_KEY_PATTERN);

// `since` / `until` / `source` accept either a single source ref or
// an array. The array form lets a single value entry cite multiple
// mediums simultaneously (e.g. manga chapter + anime episode that
// adapt the same moment) without forcing the maintainer to duplicate
// the entry. The build pipeline normalises both forms to "the set of
// reachable sources" via the `adapted-by` relation, so the choice
// here is purely an authoring convenience.
const SourceRefOrList = z.union([EntityId, z.array(EntityId).min(1)]);

// ADR-096 — items of `believed_by` / `known_truth_by` accept a plain
// `EntityId` (no provenance; all pre-ADR-096 data) or `{ target,
// source? }` when the specific item cites its own source. Consumers
// read the union through `entityRefItems` (@onepiece-wiki/schemas);
// nothing re-parses these two shapes ad hoc.
const EntityRefItem = z.union([
  EntityId,
  z.object({ target: EntityId, source: SourceRefOrList.optional() }).passthrough(),
]);

export const BaseQualifierBag = z
  .object({
    since: SourceRefOrList.optional(),
    // ADR-113 — comment lire `since` ; absent vaut `exact`.
    since_precision: SincePrecision.optional(),
    until: SourceRefOrList.optional(),
    source: SourceRefOrList.optional(),
    epistemic_status: EpistemicStatus.optional(),
    actual_value: z.unknown().optional(),
    event: EntityId.optional(),
    believed_by: z.array(EntityRefItem).optional(),
    known_truth_by: z.array(EntityRefItem).optional(),
    canon_scope: z.string().optional(),
    in_universe_date: z.string().optional(),
    assisted_by: z.string().optional(),
    review_status: ReviewStatus.optional(),
    // ADR-093 — external attestation (reference:* ids).
    attested_by: z.array(EntityId).optional(),
  })
  .passthrough();

// Epistemic base qualifiers implicit on every relation (ADR-037), typed
// inside the relation's `qualifiers` object. Relation-specific qualifiers
// (role, since, until, mastery_level, …) ride the passthrough. Mirror of
// the lines emitted by printers/entities.ts — keep the two in sync.
export const RelationQualifierBag = z
  .object({
    epistemic_status: EpistemicStatus.optional(),
    believed_by: z.array(EntityRefItem).optional(),
    known_truth_by: z.array(EntityRefItem).optional(),
    revealed_since: SourceRefOrList.optional(),
  })
  .passthrough();

type Constraints = PropertyType['value_constraints'];

function applyNumberConstraints(schema: z.ZodNumber, c: Constraints): z.ZodNumber {
  if (c === undefined) return schema;
  let s = schema;
  if (c.min !== undefined) s = s.min(c.min);
  if (c.max !== undefined) s = s.max(c.max);
  if (c.step !== undefined) s = s.step(c.step);
  return s;
}

/**
 * Resolve an `enum` / `multi_enum` ref to `z.enum([...vocab keys])`.
 * Falls back to `z.string()` when the ref is missing or the vocabulary
 * isn't in the catalogue, so a malformed schema degrades instead of
 * throwing mid-load (the meta-validator / coherence layer flags those).
 */
function enumSchemaFor(
  enumRef: string | undefined,
  vocabularies: ReadonlyMap<string, Vocabulary>,
): z.ZodTypeAny {
  if (enumRef === undefined) return z.string();
  const vocab = vocabularies.get(enumRef);
  if (vocab === undefined) return z.string();
  const values = Object.keys(vocab.values);
  if (values.length === 0) return z.string();
  return z.enum(values as [string, ...string[]]);
}

/**
 * Live Zod for a property/qualifier value. Honours enum membership and
 * numeric/string `value_constraints` so this runtime validator matches
 * the generated schema (and therefore `bun run validate`): an edit the
 * dashboard accepts here is the same edit CI accepts on disk.
 */
export function valueSchemaFor(
  valueType: ValueType,
  constraints: Constraints,
  vocabularies: ReadonlyMap<string, Vocabulary>,
): z.ZodTypeAny {
  switch (valueType) {
    case 'string': {
      const pattern = constraints?.pattern;
      return pattern !== undefined ? z.string().regex(new RegExp(pattern)) : z.string();
    }
    case 'number':
      return applyNumberConstraints(z.number(), constraints);
    case 'boolean':
      return z.boolean();
    case 'enum':
      return enumSchemaFor(constraints?.enum_ref, vocabularies);
    case 'multi_enum':
      return z.array(enumSchemaFor(constraints?.enum_ref, vocabularies));
    case 'date':
      return IsoDate;
    case 'entity_ref':
      return EntityId;
    case 'source_ref':
      return EntityId;
    case 'i18n_key':
      return I18nKeyString;
    case 'markdown':
      return z.string();
  }
}

export function propertyEntrySchema(
  valueType: ValueType,
  localizable: boolean,
  constraints: Constraints,
  vocabularies: ReadonlyMap<string, Vocabulary>,
): z.ZodTypeAny {
  const value = valueSchemaFor(valueType, constraints, vocabularies);
  const entry = BaseQualifierBag.merge(
    localizable
      ? z.object({ value_key: I18nKeyString })
      : z.object({ value }),
  );
  return entry;
}

/**
 * The minimal catalogue slice `buildEntitySchema` needs — the full
 * `ValidatedCatalogue` satisfies it structurally, and browser callers
 * can assemble it from the `/api/schemas` payload with three `Map`s.
 */
export type EntitySchemaCatalogue = {
  readonly entityTypes: ReadonlyMap<
    string,
    ValidatedCatalogue['entityTypes'] extends ReadonlyMap<string, infer T> ? T : never
  >;
  readonly propertyTypes: ReadonlyMap<string, PropertyType>;
  readonly vocabularies: ReadonlyMap<string, Vocabulary>;
};

/**
 * Build a Zod schema that fully validates one entity of `entityTypeId`
 * against the resolved schema catalogue. Re-used at runtime by the
 * dashboard API to validate save payloads before opening a PR — same
 * validator the CLI uses on disk, so an edit that passes here is
 * guaranteed to pass `bun run validate` after the file lands.
 *
 * Returns `undefined` when the entity type isn't in the catalogue
 * (the caller should reject with a 400-style error in that case).
 */
export function buildEntitySchema(
  entityTypeId: string,
  catalogue: EntitySchemaCatalogue,
): z.ZodTypeAny | undefined {
  const entityType = catalogue.entityTypes.get(entityTypeId);
  if (!entityType) return undefined;

  const propertyShape: Record<string, z.ZodTypeAny> = {};
  for (const declared of entityType.properties) {
    const propertyType = catalogue.propertyTypes.get(declared.id);
    if (!propertyType) continue;
    const entry = propertyEntrySchema(
      propertyType.value_type,
      propertyType.localizable,
      propertyType.value_constraints,
      catalogue.vocabularies,
    );
    const fieldSchema = propertyType.historical ? z.array(entry).min(1) : entry;
    propertyShape[declared.id] = declared.required ? fieldSchema : fieldSchema.optional();
  }

  const relationSchema = z.object({
    type: Slug,
    target: EntityId,
    qualifiers: RelationQualifierBag.optional(),
  });

  return z.object({
    $schema: z.string().optional(),
    id: EntityId,
    type: Slug,
    schema_version: z.number().int().positive(),
    slug: Slug,
    slug_history: z.array(Slug).default([]),
    canonical_name_key: I18nKeyString.optional(),
    properties: z.object(propertyShape),
    relations: z.array(relationSchema).default([]),
  }).passthrough();
}
