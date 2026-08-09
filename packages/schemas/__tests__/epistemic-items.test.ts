/**
 * ADR-096 — the shared normalizer/serializer for the epistemic
 * entity-ref-item lists (`believed_by` / `known_truth_by`): the ONLY
 * code that understands the `EntityId | { target, source? }` union.
 */
import { describe, expect, it } from 'bun:test';
import {
  ENTITY_REF_ITEM_QUALIFIER_IDS,
  entityRefItems,
  entityRefItemSources,
  serializeEntityRefItems,
} from '../src/epistemic-items.ts';

describe('entityRefItems', () => {
  it('normalizes a plain-string list', () => {
    expect(entityRefItems(['character:luffy', 'character:ace'])).toEqual([
      { target: 'character:luffy' },
      { target: 'character:ace' },
    ]);
  });

  it('normalizes object items, keeping single-ref and list sources faithfully', () => {
    expect(
      entityRefItems([
        { target: 'character:luffy', source: 'manga-chapter:585' },
        { target: 'character:ace', source: ['manga-chapter:585', 'anime-episode:504'] },
        { target: 'character:sabo' },
      ]),
    ).toEqual([
      { target: 'character:luffy', source: 'manga-chapter:585' },
      { target: 'character:ace', source: ['manga-chapter:585', 'anime-episode:504'] },
      { target: 'character:sabo' },
    ]);
  });

  it('normalizes a mixed list preserving order', () => {
    expect(
      entityRefItems([
        { target: 'character:luffy', source: 'manga-chapter:585' },
        'character:ace',
      ]),
    ).toEqual([
      { target: 'character:luffy', source: 'manga-chapter:585' },
      { target: 'character:ace' },
    ]);
  });

  it('drops malformed items and invalid source refs', () => {
    expect(
      entityRefItems([
        42,
        'not-an-entity-id',
        { source: 'manga-chapter:1' }, // no target
        { target: 'nope' }, // target not an EntityId
        ['character:luffy'], // nested array
        null,
        { target: 'character:ace', source: ['bogus', 'manga-chapter:585'] },
        { target: 'character:sabo', source: ['bogus'] }, // all-invalid → source absent
        { target: 'character:luffy', source: 42 },
      ]),
    ).toEqual([
      { target: 'character:ace', source: ['manga-chapter:585'] },
      { target: 'character:sabo' },
      { target: 'character:luffy' },
    ]);
  });

  it('accepts lenient single-item forms and empty values', () => {
    expect(entityRefItems('character:luffy')).toEqual([{ target: 'character:luffy' }]);
    expect(entityRefItems({ target: 'character:luffy', source: 'manga-chapter:585' }))
      .toEqual([{ target: 'character:luffy', source: 'manga-chapter:585' }]);
    expect(entityRefItems(undefined)).toEqual([]);
    expect(entityRefItems(null)).toEqual([]);
    expect(entityRefItems([])).toEqual([]);
  });
});

describe('entityRefItemSources', () => {
  it('flattens absent / single / list sources', () => {
    expect(entityRefItemSources({ target: 'character:luffy' })).toEqual([]);
    expect(entityRefItemSources({ target: 'character:luffy', source: 'manga-chapter:585' }))
      .toEqual(['manga-chapter:585']);
    expect(
      entityRefItemSources({
        target: 'character:luffy',
        source: ['manga-chapter:585', 'anime-episode:504'],
      }),
    ).toEqual(['manga-chapter:585', 'anime-episode:504']);
  });
});

describe('serializeEntityRefItems', () => {
  it('emits the minimal canonical forms', () => {
    expect(
      serializeEntityRefItems([
        { target: 'character:ace' },
        { target: 'character:luffy', source: 'manga-chapter:585' },
        { target: 'character:sabo', source: ['manga-chapter:585'] }, // 1 ref → string
        { target: 'character:nami', source: ['manga-chapter:585', 'anime-episode:504'] },
      ]),
    ).toEqual([
      'character:ace',
      { target: 'character:luffy', source: 'manga-chapter:585' },
      { target: 'character:sabo', source: 'manga-chapter:585' },
      { target: 'character:nami', source: ['manga-chapter:585', 'anime-episode:504'] },
    ]);
  });

  it('round-trips a canonical mixed list unchanged', () => {
    const canonical = [
      { target: 'character:luffy', source: 'manga-chapter:585' },
      'character:ace',
    ];
    expect(serializeEntityRefItems(entityRefItems(canonical))).toEqual(canonical);
  });
});

describe('ENTITY_REF_ITEM_QUALIFIER_IDS', () => {
  it('covers exactly believed_by and known_truth_by (attested_by excluded)', () => {
    expect([...ENTITY_REF_ITEM_QUALIFIER_IDS]).toEqual(['believed_by', 'known_truth_by']);
  });
});
