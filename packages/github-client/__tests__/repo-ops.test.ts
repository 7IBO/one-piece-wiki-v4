import { describe, expect, test } from 'bun:test';
import { parseEntityTitle, titleMatchesEntity } from '../src/repo-ops.ts';

describe('parseEntityTitle', () => {
  test('parses an Edit title with the [DATA] prefix', () => {
    expect(parseEntityTitle('[DATA] Edit character:monkey-d-luffy')).toEqual({
      entityType: 'character',
      entitySlug: 'monkey-d-luffy',
    });
  });

  test('parses a Create title (the resume bug: was never matched)', () => {
    expect(parseEntityTitle('[DATA] Create devil-fruit:gomu-gomu-no-mi')).toEqual({
      entityType: 'devil-fruit',
      entitySlug: 'gomu-gomu-no-mi',
    });
  });

  test('parses a legacy title without the [DATA] prefix', () => {
    expect(parseEntityTitle('Edit crew:straw-hats')).toEqual({
      entityType: 'crew',
      entitySlug: 'straw-hats',
    });
  });

  test('rejects titles that are not entity edits/creates', () => {
    expect(parseEntityTitle('[DATA] Update cast of manga-chapter:1')).toBeNull();
    expect(parseEntityTitle('chore: bump deps')).toBeNull();
    expect(parseEntityTitle('')).toBeNull();
  });
});

describe('titleMatchesEntity', () => {
  test('matches Edit and Create for the same entity, with prefix', () => {
    expect(titleMatchesEntity('[DATA] Edit character:monkey-d-luffy', 'character:monkey-d-luffy'))
      .toBe(true);
    expect(titleMatchesEntity('[DATA] Create character:monkey-d-luffy', 'character:monkey-d-luffy'))
      .toBe(true);
  });

  test('matches a legacy un-prefixed title', () => {
    expect(titleMatchesEntity('Edit character:monkey-d-luffy', 'character:monkey-d-luffy')).toBe(
      true,
    );
  });

  test('does not match a different entity', () => {
    expect(titleMatchesEntity('[DATA] Edit character:roronoa-zoro', 'character:monkey-d-luffy'))
      .toBe(false);
  });
});
