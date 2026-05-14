/**
 * Reference resolver: checks every cross-reference between schema files.
 *
 * - Entity-type `properties[].id` must exist in property-types.
 * - Entity-type `allowed_relations[]` must exist in relation-types.
 * - Relation-type `valid_from_types[]` and `valid_to_types[]` must exist
 *   in entity-types.
 * - Relation-type qualifier `enum_ref` (when value_type === "enum" or
 *   "multi_enum") must exist in vocabularies.
 * - Property-type `value_constraints.enum_ref` and per-qualifier
 *   `enum_ref` must exist in vocabularies.
 * - Property-type `applies_to_entity_types[]` must exist in entity-types.
 */
import type { ValidatedCatalogue } from './meta-validator.ts';

export type ReferenceError = {
  readonly code: 'REFERENCE_NOT_FOUND';
  readonly source: string;
  readonly path: string;
  readonly target: string;
};

export function resolveReferences(catalogue: ValidatedCatalogue): readonly ReferenceError[] {
  const errors: ReferenceError[] = [];
  const entityTypeIds = new Set(catalogue.entityTypes.keys());
  const propertyTypeIds = new Set(catalogue.propertyTypes.keys());
  const relationTypeIds = new Set(catalogue.relationTypes.keys());
  const vocabularyIds = new Set(catalogue.vocabularies.keys());

  for (const [id, entityType] of catalogue.entityTypes) {
    for (const [index, prop] of entityType.properties.entries()) {
      if (!propertyTypeIds.has(prop.id)) {
        errors.push({
          code: 'REFERENCE_NOT_FOUND',
          source: `entity-types/${id}`,
          path: `properties[${index}].id`,
          target: `property-types/${prop.id}`,
        });
      }
    }
    for (const [index, rel] of entityType.allowed_relations.entries()) {
      if (!relationTypeIds.has(rel)) {
        errors.push({
          code: 'REFERENCE_NOT_FOUND',
          source: `entity-types/${id}`,
          path: `allowed_relations[${index}]`,
          target: `relation-types/${rel}`,
        });
      }
    }
  }

  for (const [id, propertyType] of catalogue.propertyTypes) {
    for (const [index, target] of (propertyType.applies_to_entity_types ?? []).entries()) {
      if (!entityTypeIds.has(target)) {
        errors.push({
          code: 'REFERENCE_NOT_FOUND',
          source: `property-types/${id}`,
          path: `applies_to_entity_types[${index}]`,
          target: `entity-types/${target}`,
        });
      }
    }
    const enumRef = propertyType.value_constraints?.enum_ref;
    if (enumRef !== undefined && !vocabularyIds.has(enumRef)) {
      errors.push({
        code: 'REFERENCE_NOT_FOUND',
        source: `property-types/${id}`,
        path: 'value_constraints.enum_ref',
        target: `vocabulary/${enumRef}`,
      });
    }
    for (const [index, qual] of propertyType.allowed_qualifiers.entries()) {
      if (qual.enum_ref !== undefined && !vocabularyIds.has(qual.enum_ref)) {
        errors.push({
          code: 'REFERENCE_NOT_FOUND',
          source: `property-types/${id}`,
          path: `allowed_qualifiers[${index}].enum_ref`,
          target: `vocabulary/${qual.enum_ref}`,
        });
      }
    }
  }

  for (const [id, relationType] of catalogue.relationTypes) {
    for (const [index, target] of relationType.valid_from_types.entries()) {
      if (!entityTypeIds.has(target)) {
        errors.push({
          code: 'REFERENCE_NOT_FOUND',
          source: `relation-types/${id}`,
          path: `valid_from_types[${index}]`,
          target: `entity-types/${target}`,
        });
      }
    }
    for (const [index, target] of relationType.valid_to_types.entries()) {
      if (!entityTypeIds.has(target)) {
        errors.push({
          code: 'REFERENCE_NOT_FOUND',
          source: `relation-types/${id}`,
          path: `valid_to_types[${index}]`,
          target: `entity-types/${target}`,
        });
      }
    }
    for (const [index, qual] of relationType.qualifiers.entries()) {
      if (qual.enum_ref !== undefined && !vocabularyIds.has(qual.enum_ref)) {
        errors.push({
          code: 'REFERENCE_NOT_FOUND',
          source: `relation-types/${id}`,
          path: `qualifiers[${index}].enum_ref`,
          target: `vocabulary/${qual.enum_ref}`,
        });
      }
    }
  }

  return errors;
}
