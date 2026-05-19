/**
 * Prints a Zod expression as a TypeScript source string for a given
 * value_type + value_constraints pair. Used by the generators that emit
 * /packages/schemas/generated/**.ts at build time.
 *
 * This is NOT the runtime mapper used by the entity-loader — that one
 * lives in entity-loader.ts and produces live Zod schemas in memory.
 * The two must stay in lockstep for `value_type: 'date'` (both map to
 * IsoDate) and any future branded primitive.
 */
import type { ValueType } from '@onepiece-wiki/schemas';
import type { PropertyType } from '../meta-validator.ts';

export type ValueConstraints = NonNullable<PropertyType['value_constraints']>;

function toPascalIdentifier(kebab: string): string {
  return kebab
    .split(/[-_]/)
    .map((part) => (part[0] ?? '').toUpperCase() + part.slice(1))
    .join('');
}

function numberConstraints(constraints: ValueConstraints | undefined): string {
  if (!constraints) return '';
  const parts: string[] = [];
  if (constraints.min !== undefined) parts.push(`.min(${constraints.min})`);
  if (constraints.max !== undefined) parts.push(`.max(${constraints.max})`);
  if (constraints.step !== undefined) parts.push(`.step(${constraints.step})`);
  return parts.join('');
}

function stringConstraints(constraints: ValueConstraints | undefined): string {
  if (!constraints?.pattern) return '';
  return `.regex(/${constraints.pattern}/)`;
}

/**
 * Print a Zod expression for a value or qualifier.
 *
 * @param valueType - the meta value_type from the property/qualifier definition
 * @param opts.constraints - value_constraints (string regex, number min/max/step)
 * @param opts.enumRef - vocabulary id (kebab-case) when value_type is enum/multi_enum
 */
export function printValueTypeZod(
  valueType: ValueType,
  opts: {
    readonly constraints?: ValueConstraints | undefined;
    readonly enumRef?: string | undefined;
  } = {},
): string {
  switch (valueType) {
    case 'string':
      return `z.string()${stringConstraints(opts.constraints)}`;
    case 'number':
      return `z.number()${numberConstraints(opts.constraints)}`;
    case 'boolean':
      return 'z.boolean()';
    case 'enum':
      if (!opts.enumRef) {
        throw new Error(`enum value_type requires enum_ref`);
      }
      return `${toPascalIdentifier(opts.enumRef)}Enum`;
    case 'multi_enum':
      if (!opts.enumRef) {
        throw new Error(`multi_enum value_type requires enum_ref`);
      }
      return `z.array(${toPascalIdentifier(opts.enumRef)}Enum)`;
    case 'date':
      return 'IsoDate';
    case 'entity_ref':
      return 'EntityRef';
    case 'source_ref':
      return 'SourceRef';
    case 'i18n_key':
      return 'I18nKey';
    case 'markdown':
      return 'z.string()';
  }
}

export const VocabPascal = toPascalIdentifier;
