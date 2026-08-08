/**
 * Cross-type audit rows for the data explorer (`GET /api/audit`).
 */
import { describe, expect, it } from 'bun:test';
import {
  type AuditContext,
  buildAuditRow,
  entryDisplay,
  entryRaw,
  entrySince,
  missingRecommendedFor,
  missingTranslationsFor,
  referencedI18nKeys,
  sourceIdDisplay,
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
  locale: 'en',
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
  const displayCtx = {
    translations,
    vocabularies,
    displayNameFor: ctx.displayNameFor,
    locale: 'en' as const,
  };

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

  it('resolves in the requested locale first, other locale as fallback', () => {
    const frCtx = { ...displayCtx, locale: 'fr' as const };
    expect(entryDisplay({ value: 'alive' }, propertyTypes.get('status'), frCtx))
      .toBe('En vie');
    // FR translation missing → EN fallback, never the raw key.
    expect(
      entryDisplay({ value_key: 'character.luffy.name.common' }, propertyTypes.get('name'), frCtx),
    ).toBe('Monkey D. Luffy');
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

describe('sourceIdDisplay', () => {
  const nameFor = (id: string) =>
    id === 'film:strong-world' ? { en: 'Strong World', fr: null } : undefined;

  it('abbreviates known source types with numeric slugs — never the raw id', () => {
    expect(sourceIdDisplay('manga-chapter:96', nameFor)).toBe('C96');
    expect(sourceIdDisplay('anime-episode:45', nameFor)).toBe('E45');
    expect(sourceIdDisplay('film:12', nameFor)).toBe('F12');
    expect(sourceIdDisplay('sbs:4', nameFor)).toBe('SBS 4');
    expect(sourceIdDisplay('databook:2', nameFor)).toBe('DB 2');
  });

  it('falls back to the display name for non-numeric slugs', () => {
    expect(sourceIdDisplay('film:strong-world', nameFor)).toBe('Strong World');
  });

  it('falls back to the (abbr-prefixed) slug for unknown ids, never type:slug', () => {
    expect(sourceIdDisplay('film:unknown-film', nameFor)).toBe('Funknown-film');
    expect(sourceIdDisplay('event:timeskip', nameFor)).toBe('timeskip');
  });
});

describe('entrySince', () => {
  const display = (id: string): string => sourceIdDisplay(id, () => undefined);

  it('resolves a string, joins arrays with the compact display, drops empties', () => {
    expect(entrySince({ since: 'manga-chapter:96' }, display)).toBe('C96');
    expect(entrySince({ since: ['manga-chapter:96', 'anime-episode:45'] }, display))
      .toBe('C96 · E45');
    expect(entrySince({ since: '' }, display)).toBeUndefined();
    expect(entrySince({ value: 1 }, display)).toBeUndefined();
    expect(entrySince(null, display)).toBeUndefined();
  });
});

describe('entryRaw', () => {
  it('extracts value / value_key / raw since ids', () => {
    expect(entryRaw({ value: 30, since: 'manga-chapter:96' }))
      .toEqual({ value: 30, since: 'manga-chapter:96' });
    expect(entryRaw({ value_key: 'a.key', since: ['manga-chapter:1', 'anime-episode:1'] }))
      .toEqual({ value_key: 'a.key', since: ['manga-chapter:1', 'anime-episode:1'] });
    // `value: null` / `value: false` still count as a stored value.
    expect(entryRaw({ value: false })).toEqual({ value: false });
  });

  it('wraps primitive legacy entries and skips empty ones', () => {
    expect(entryRaw('East Blue')).toEqual({ value: 'East Blue' });
    expect(entryRaw({ since: 'manga-chapter:1' })).toBeUndefined();
    expect(entryRaw(null)).toBeUndefined();
    expect(entryRaw(undefined)).toBeUndefined();
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
        valueType: 'i18n_key',
        entries: [{
          display: 'Monkey D. Luffy',
          since: 'C1',
          raw: { value_key: 'character.luffy.name.common', since: 'manga-chapter:1' },
        }],
      },
      {
        property: 'bounty',
        valueType: 'number',
        entries: [
          {
            display: '30,000,000 ฿',
            since: 'C96',
            raw: { value: 30_000_000, since: 'manga-chapter:96' },
          },
          {
            display: '3,000,000,000 ฿',
            since: 'C1053',
            raw: { value: 3_000_000_000, since: 'manga-chapter:1053' },
          },
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
