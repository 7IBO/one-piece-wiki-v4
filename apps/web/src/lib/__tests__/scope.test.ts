import { describe, expect, test } from 'bun:test';
import { validateScopeSearch } from '../scope.ts';

describe('validateScopeSearch', () => {
  test('keeps a well-formed scope', () => {
    expect(validateScopeSearch({ scope: 'live_action' })).toEqual({ scope: 'live_action' });
    expect(validateScopeSearch({ scope: 'manga' })).toEqual({ scope: 'manga' });
  });

  test('drops malformed or missing scopes', () => {
    expect(validateScopeSearch({})).toEqual({});
    expect(validateScopeSearch({ scope: '' })).toEqual({});
    expect(validateScopeSearch({ scope: 'Live Action' })).toEqual({});
    expect(validateScopeSearch({ scope: '9bad' })).toEqual({});
    expect(validateScopeSearch({ scope: 42 })).toEqual({});
    expect(validateScopeSearch({ scope: { nested: true } })).toEqual({});
  });

  test('ignores unrelated params', () => {
    expect(validateScopeSearch({ scope: 'anime', utm_source: 'x' })).toEqual({ scope: 'anime' });
  });
});
