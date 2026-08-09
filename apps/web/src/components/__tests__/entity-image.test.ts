import { describe, expect, test } from 'bun:test';
import { initialOf } from '../EntityImage.tsx';

describe('initialOf (the artwork mark)', () => {
  test('uppercases the first grapheme of the name', () => {
    expect(initialOf('Monkey D. Luffy')).toBe('M');
    expect(initialOf('zoro')).toBe('Z');
    expect(initialOf('  nami ')).toBe('N');
  });

  test('handles accents and multi-byte characters', () => {
    expect(initialOf('Édward')).toBe('É');
    expect(initialOf('ゾロ')).toBe('ゾ');
  });

  test('degrades to a neutral mark on empty names', () => {
    expect(initialOf('')).toBe('·');
    expect(initialOf('   ')).toBe('·');
  });
});
