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
    expect(entityRefItems(['character:monkey-d-luffy', 'character:portgas-d-ace'])).toEqual([
      { target: 'character:monkey-d-luffy' },
      { target: 'character:portgas-d-ace' },
    ]);
  });

  it('normalizes object items, keeping single-ref and list sources faithfully', () => {
    expect(
      entityRefItems([
        { target: 'character:monkey-d-luffy', source: 'manga-chapter:585' },
        { target: 'character:portgas-d-ace', source: ['manga-chapter:585', 'anime-episode:504'] },
        { target: 'character:sabo' },
      ]),
    ).toEqual([
      { target: 'character:monkey-d-luffy', source: 'manga-chapter:585' },
      { target: 'character:portgas-d-ace', source: ['manga-chapter:585', 'anime-episode:504'] },
      { target: 'character:sabo' },
    ]);
  });

  it('normalizes a mixed list preserving order', () => {
    expect(
      entityRefItems([
        { target: 'character:monkey-d-luffy', source: 'manga-chapter:585' },
        'character:portgas-d-ace',
      ]),
    ).toEqual([
      { target: 'character:monkey-d-luffy', source: 'manga-chapter:585' },
      { target: 'character:portgas-d-ace' },
    ]);
  });

  it('drops malformed items and invalid source refs', () => {
    expect(
      entityRefItems([
        42,
        'not-an-entity-id',
        { source: 'manga-chapter:1' }, // no target
        { target: 'nope' }, // target not an EntityId
        ['character:monkey-d-luffy'], // nested array
        null,
        { target: 'character:portgas-d-ace', source: ['bogus', 'manga-chapter:585'] },
        { target: 'character:sabo', source: ['bogus'] }, // all-invalid → source absent
        { target: 'character:monkey-d-luffy', source: 42 },
      ]),
    ).toEqual([
      { target: 'character:portgas-d-ace', source: ['manga-chapter:585'] },
      { target: 'character:sabo' },
      { target: 'character:monkey-d-luffy' },
    ]);
  });

  it('accepts lenient single-item forms and empty values', () => {
    expect(entityRefItems('character:monkey-d-luffy')).toEqual([{
      target: 'character:monkey-d-luffy',
    }]);
    expect(entityRefItems({ target: 'character:monkey-d-luffy', source: 'manga-chapter:585' }))
      .toEqual([{ target: 'character:monkey-d-luffy', source: 'manga-chapter:585' }]);
    expect(entityRefItems(undefined)).toEqual([]);
    expect(entityRefItems(null)).toEqual([]);
    expect(entityRefItems([])).toEqual([]);
  });
});

describe('entityRefItemSources', () => {
  it('flattens absent / single / list sources', () => {
    expect(entityRefItemSources({ target: 'character:monkey-d-luffy' })).toEqual([]);
    expect(
      entityRefItemSources({ target: 'character:monkey-d-luffy', source: 'manga-chapter:585' }),
    )
      .toEqual(['manga-chapter:585']);
    expect(
      entityRefItemSources({
        target: 'character:monkey-d-luffy',
        source: ['manga-chapter:585', 'anime-episode:504'],
      }),
    ).toEqual(['manga-chapter:585', 'anime-episode:504']);
  });
});

describe('serializeEntityRefItems', () => {
  it('emits the minimal canonical forms', () => {
    expect(
      serializeEntityRefItems([
        { target: 'character:portgas-d-ace' },
        { target: 'character:monkey-d-luffy', source: 'manga-chapter:585' },
        { target: 'character:sabo', source: ['manga-chapter:585'] }, // 1 ref → string
        { target: 'character:nami', source: ['manga-chapter:585', 'anime-episode:504'] },
      ]),
    ).toEqual([
      'character:portgas-d-ace',
      { target: 'character:monkey-d-luffy', source: 'manga-chapter:585' },
      { target: 'character:sabo', source: 'manga-chapter:585' },
      { target: 'character:nami', source: ['manga-chapter:585', 'anime-episode:504'] },
    ]);
  });

  it('round-trips a canonical mixed list unchanged', () => {
    const canonical = [
      { target: 'character:monkey-d-luffy', source: 'manga-chapter:585' },
      'character:portgas-d-ace',
    ];
    expect(serializeEntityRefItems(entityRefItems(canonical))).toEqual(canonical);
  });
});

describe('ENTITY_REF_ITEM_QUALIFIER_IDS', () => {
  it('covers exactly believed_by and known_truth_by (attested_by excluded)', () => {
    expect([...ENTITY_REF_ITEM_QUALIFIER_IDS]).toEqual(['believed_by', 'known_truth_by']);
  });
});
