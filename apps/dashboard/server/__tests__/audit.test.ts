/**
 * Cross-type audit rows for the data explorer (`GET /api/audit`).
 */
import { describe, expect, it } from 'bun:test';
import {
  type AuditContext,
  buildAuditRow,
  entryDisplay,
  entrySince,
  missingRecommendedFor,
  missingTranslationsFor,
  referencedI18nKeys,
} from '../audit.ts';
import { completenessExpectation } from '../completeness.ts';

const entityType = {
  properties: [
    { id: 'name', required: true, recommended: false },
    { id: 'status', required: true, recommended: false },
    { id: 'bounty', required: false, recommended: true },
    { id: 'height', required: false, recommended: false },
  ],
  recommended_relations: ['member-of'],
};

const propertyTypes = new Map([
  ['name', { value_type: 'i18n_key' }],
  ['status', { value_type: 'enum', value_constraints: { enum_ref: 'life-status' } }],
  ['bounty', { value_type: 'number', unit: '฿' }],
  ['height', { value_type: 'number' }],
  ['haki', { value_type: 'multi_enum', value_constraints: { enum_ref: 'haki-kind' } }],
  ['is-canon', { value_type: 'boolean' }],
  ['home', { value_type: 'entity_ref' }],
]);

const vocabularies = new Map([
  ['life-status', {
    values: {
      alive: { labels: { en: 'Alive', fr: 'En vie' } },
      dead: { labels: { en: 'Dead', fr: 'Mort' } },
    },
  }],
  ['haki-kind', {
    values: {
      observation: { labels: { en: 'Observation', fr: 'Observation' } },
      armament: { labels: { en: 'Armament', fr: 'Armement' } },
    },
  }],
]);

const translations = {
  en: { 'character.luffy.name.common': 'Monkey D. Luffy' },
  fr: {},
};

const ctx: AuditContext = {
  entityType,
  propertyTypes,
  vocabularies,
  translations,
  displayName: { en: 'Monkey D. Luffy', fr: null },
  displayNameFor: (id) =>
    id === 'crew:straw-hat-pirates' ? { en: 'Straw Hat Pirates', fr: null } : undefined,
};

describe('missingRecommendedFor', () => {
  const expectation = completenessExpectation(entityType);

  it('lists expected properties without content and absent recommended relations', () => {
    const data = {
      properties: {
        name: [{ value_key: 'character.luffy.name.common' }],
        status: [], // present but empty → still missing
        // bounty absent entirely.
      },
      relations: [{ type: 'enemy-of', target: 'character:kuro' }],
    };
    expect(missingRecommendedFor(data, expectation)).toEqual([
      'status',
      'bounty',
      'member-of',
    ]);
  });

  it('is empty when everything expected is filled', () => {
    const data = {
      properties: {
        name: [{ value_key: 'k' }],
        status: [{ value: 'alive' }],
        bounty: [{ value: 1 }],
      },
      relations: [{ type: 'member-of', target: 'crew:straw-hat-pirates' }],
    };
    expect(missingRecommendedFor(data, expectation)).toEqual([]);
  });

  it('handles malformed data defensively', () => {
    expect(missingRecommendedFor({}, expectation)).toEqual([
      'name',
      'status',
      'bounty',
      'member-of',
    ]);
    expect(
      missingRecommendedFor({ properties: 'nope', relations: 42 }, expectation),
    ).toEqual(['name', 'status', 'bounty', 'member-of']);
  });
});

describe('referencedI18nKeys / missingTranslationsFor', () => {
  it('collects canonical_name_key + every value_key, deduplicated', () => {
    const data = {
      canonical_name_key: 'character.luffy.name.common',
      properties: {
        name: [
          { value_key: 'character.luffy.name.common' },
          { value_key: 'character.luffy.name.true' },
        ],
        epithet: { value_key: 'character.luffy.epithet.straw-hat' },
        bounty: [{ value: 30_000_000 }],
      },
    };
    expect(referencedI18nKeys(data)).toEqual([
      'character.luffy.name.common',
      'character.luffy.name.true',
      'character.luffy.epithet.straw-hat',
    ]);
  });

  it('reports each missing locale as `key (locale)`', () => {
    const missing = missingTranslationsFor(
      ['a.key', 'b.key'],
      { en: { 'a.key': 'A' }, fr: { 'b.key': 'B' } },
    );
    expect(missing).toEqual(['a.key (fr)', 'b.key (en)']);
  });

  it('reports both locales for a key absent everywhere; empty string counts as missing', () => {
    const missing = missingTranslationsFor(
      ['gone.key', 'blank.key'],
      { en: { 'blank.key': '' }, fr: { 'blank.key': 'ok' } },
    );
    expect(missing).toEqual([
      'gone.key (en)',
      'gone.key (fr)',
      'blank.key (en)',
    ]);
  });
});

describe('entryDisplay', () => {
  const displayCtx = { translations, vocabularies, displayNameFor: ctx.displayNameFor };

  it('resolves value_key through translations (en first, fr fallback, — when untranslated)', () => {
    expect(
      entryDisplay(
        { value_key: 'character.luffy.name.common' },
        propertyTypes.get('name'),
        displayCtx,
      ),
    ).toBe('Monkey D. Luffy');
    expect(
      entryDisplay({ value_key: 'no.text.anywhere' }, propertyTypes.get('name'), displayCtx),
    ).toBe('—');
  });

  it('resolves enum + multi_enum ids through the vocabulary catalogue', () => {
    expect(entryDisplay({ value: 'alive' }, propertyTypes.get('status'), displayCtx))
      .toBe('Alive');
    expect(
      entryDisplay(
        { value: ['observation', 'armament'] },
        propertyTypes.get('haki'),
        displayCtx,
      ),
    ).toBe('Observation, Armament');
    // Unknown id never crashes — falls back to the raw id.
    expect(entryDisplay({ value: 'zombie' }, propertyTypes.get('status'), displayCtx))
      .toBe('zombie');
  });

  it('formats number + unit, plain number, boolean ✓/×', () => {
    expect(entryDisplay({ value: 30_000_000 }, propertyTypes.get('bounty'), displayCtx))
      .toBe('30,000,000 ฿');
    expect(entryDisplay({ value: 174 }, propertyTypes.get('height'), displayCtx))
      .toBe('174');
    expect(entryDisplay({ value: true }, propertyTypes.get('is-canon'), displayCtx)).toBe('✓');
    expect(entryDisplay({ value: false }, propertyTypes.get('is-canon'), displayCtx)).toBe('×');
  });

  it('resolves entity refs to display names, slug-ish fallback for unknown ids', () => {
    expect(
      entryDisplay({ value: 'crew:straw-hat-pirates' }, propertyTypes.get('home'), displayCtx),
    ).toBe('Straw Hat Pirates');
    expect(entryDisplay({ value: 'crew:unknown-crew' }, propertyTypes.get('home'), displayCtx))
      .toBe('unknown-crew');
  });

  it('stringifies values of unknown property types', () => {
    expect(entryDisplay({ value: 'East Blue' }, undefined, displayCtx)).toBe('East Blue');
    expect(entryDisplay({ value: '' }, undefined, displayCtx)).toBe('—');
  });
});

describe('entrySince', () => {
  it('passes through a string, joins arrays, drops empties', () => {
    expect(entrySince({ since: 'manga-chapter:96' })).toBe('manga-chapter:96');
    expect(entrySince({ since: ['manga-chapter:96', 'anime-episode:45'] }))
      .toBe('manga-chapter:96 · anime-episode:45');
    expect(entrySince({ since: '' })).toBeUndefined();
    expect(entrySince({ value: 1 })).toBeUndefined();
    expect(entrySince(null)).toBeUndefined();
  });
});

describe('buildAuditRow', () => {
  it('assembles the full row for a partly-filled entity', () => {
    const row = buildAuditRow(
      {
        id: 'character:luffy',
        type: 'character',
        data: {
          id: 'character:luffy',
          type: 'character',
          slug: 'monkey-d-luffy',
          canonical_name_key: 'character.luffy.name.common',
          properties: {
            name: [{ value_key: 'character.luffy.name.common', since: 'manga-chapter:1' }],
            bounty: [
              { value: 30_000_000, since: 'manga-chapter:96' },
              { value: 3_000_000_000, since: 'manga-chapter:1053' },
            ],
          },
          relations: [{ type: 'member-of', target: 'crew:straw-hat-pirates' }],
        },
      },
      ctx,
    );
    expect(row.id).toBe('character:luffy');
    expect(row.type).toBe('character');
    expect(row.slug).toBe('monkey-d-luffy');
    expect(row.displayName).toEqual({ en: 'Monkey D. Luffy', fr: null });
    // Expected: name, status, bounty, member-of → name+bounty+member-of filled.
    expect(row.completeness).toEqual({ filled: 3, expected: 4 });
    expect(row.missingRecommended).toEqual(['status']);
    // canonical + name key are the same key, translated in EN only.
    expect(row.missingTranslations).toEqual(['character.luffy.name.common (fr)']);
    expect(row.values).toEqual([
      {
        property: 'name',
        entries: [{ display: 'Monkey D. Luffy', since: 'manga-chapter:1' }],
      },
      {
        property: 'bounty',
        entries: [
          { display: '30,000,000 ฿', since: 'manga-chapter:96' },
          { display: '3,000,000,000 ฿', since: 'manga-chapter:1053' },
        ],
      },
    ]);
  });

  it('yields an inert row for an entity with no properties and no expectations', () => {
    const row = buildAuditRow(
      { id: 'thing:x', type: 'thing', data: { slug: 'x' } },
      { ...ctx, entityType: undefined, translations: { en: {}, fr: {} } },
    );
    expect(row.completeness).toEqual({ filled: 0, expected: 0 });
    expect(row.missingRecommended).toEqual([]);
    expect(row.missingTranslations).toEqual([]);
    expect(row.values).toEqual([]);
  });
});
