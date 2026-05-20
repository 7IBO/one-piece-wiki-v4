/**
 * Unit tests for the value-type → Zod printer used by the generator.
 * These cover the matrix of ValueType × constraints and the enum_ref
 * lookup. No filesystem.
 */
import { describe, expect, it } from 'bun:test';
import { printValueTypeZod } from '../src/printers/value-type-to-zod.ts';

describe('printValueTypeZod', () => {
  it('emits plain Zod scalars for primitive value types', () => {
    expect(printValueTypeZod('string')).toBe('z.string()');
    expect(printValueTypeZod('number')).toBe('z.number()');
    expect(printValueTypeZod('boolean')).toBe('z.boolean()');
    expect(printValueTypeZod('markdown')).toBe('z.string()');
  });

  it('threads number value_constraints onto z.number()', () => {
    expect(
      printValueTypeZod('number', { constraints: { min: 0, max: 100, step: 5 } }),
    ).toBe('z.number().min(0).max(100).step(5)');
  });

  it('threads string pattern as a regex literal', () => {
    expect(
      printValueTypeZod('string', { constraints: { pattern: '^[A-Z]+$' } }),
    ).toBe('z.string().regex(/^[A-Z]+$/)');
  });

  it('emits PascalCased enum identifiers from enum_ref', () => {
    expect(printValueTypeZod('enum', { enumRef: 'blood-types' })).toBe('BloodTypesEnum');
    expect(printValueTypeZod('multi_enum', { enumRef: 'haki-types' })).toBe(
      'z.array(HakiTypesEnum)',
    );
  });

  it('throws when enum/multi_enum is missing enum_ref', () => {
    expect(() => printValueTypeZod('enum')).toThrow(/enum_ref/);
    expect(() => printValueTypeZod('multi_enum')).toThrow(/enum_ref/);
  });

  it('maps date to the branded IsoDate primitive', () => {
    expect(printValueTypeZod('date')).toBe('IsoDate');
  });

  it('maps refs to their canonical primitive identifiers', () => {
    expect(printValueTypeZod('entity_ref')).toBe('EntityRef');
    expect(printValueTypeZod('source_ref')).toBe('SourceRef');
    expect(printValueTypeZod('i18n_key')).toBe('I18nKey');
  });
});
