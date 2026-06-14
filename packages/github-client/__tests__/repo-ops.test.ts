import { describe, expect, test } from 'bun:test';
import { parseEntityTitle, titleMatchesEntity } from '../src/repo-ops.ts';

describe('parseEntityTitle', () => {
  test('parses an Edit title with the [DATA] prefix', () => {
    expect(parseEntityTitle('[DATA] Edit character:luffy')).toEqual({
      entityType: 'character',
      entitySlug: 'luffy',
    });
  });

  test('parses a Create title (the resume bug: was never matched)', () => {
    expect(parseEntityTitle('[DATA] Create devil-fruit:gomu-gomu')).toEqual({
      entityType: 'devil-fruit',
      entitySlug: 'gomu-gomu',
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
    expect(titleMatchesEntity('[DATA] Edit character:luffy', 'character:luffy')).toBe(true);
    expect(titleMatchesEntity('[DATA] Create character:luffy', 'character:luffy')).toBe(true);
  });

  test('matches a legacy un-prefixed title', () => {
    expect(titleMatchesEntity('Edit character:luffy', 'character:luffy')).toBe(true);
  });

  test('does not match a different entity', () => {
    expect(titleMatchesEntity('[DATA] Edit character:zoro', 'character:luffy')).toBe(false);
  });
});
