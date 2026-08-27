/**
 * Search-index extraction (ADR-108). Two things are asserted here, on
 * synthetic fixtures so the corpus can change without breaking them:
 *
 *  1. **what becomes searchable is decided by the SCHEMA** — a
 *     localizable (`i18n_key`) property is indexed, a numeric/enum one
 *     is not, and `romanizable` is what separates a name from free
 *     text (CLAUDE.md: no property name is hardcoded in the pipeline);
 *  2. **every string carries the anchors that gate it** — the entity's
 *     own existence anchors PLUS the entry's `since`, so the reader's
 *     cursor can filter in SQL.
 *
 * The end-to-end behaviour of those gates (a later name is unfindable,
 * an entity whose existence is a spoiler is unfindable) is asserted
 * against the real artifact in `apps/web/server/__tests__/search.test.ts`.
 */
import type { EntityType, PropertyType, ValidatedCatalogue } from '@onepiece-wiki/schema-engine';
import { describe, expect, it } from 'bun:test';
import type { TranslationRow } from '../src/content.ts';
import type { EntityRow } from '../src/extract.ts';
import { buildSearchRows } from '../src/search.ts';

function propertyType(
  id: string,
  overrides: Partial<PropertyType> = {},
): PropertyType {
  return {
    id,
    schema_version: 1,
    labels: { en: id, fr: id },
    value_type: 'i18n_key',
    historical: true,
    localizable: true,
    spoiler_sensitive: false,
    default_qualifiers: [],
    allowed_qualifiers: [],
    ...overrides,
  } as PropertyType;
}

function entityType(id: string, overrides: Partial<EntityType> = {}): EntityType {
  return {
    id,
    schema_version: 1,
    labels: { en: id, fr: id },
    url_segment: id,
    properties: [],
    allowed_relations: [],
    ...overrides,
  } as EntityType;
}

const catalogue: ValidatedCatalogue = {
  entityTypes: new Map([
    ['character', entityType('character')],
    [
      'manga-chapter',
      entityType('manga-chapter', {
        display_name_properties: ['title_key'],
      } as Partial<EntityType>),
    ],
  ]),
  propertyTypes: new Map([
    ['name', propertyType('name', { romanizable: true })],
    ['epithet', propertyType('epithet', { romanizable: true })],
    ['title_key', propertyType('title_key', { romanizable: true })],
    ['description_key', propertyType('description_key')],
    ['bounty', propertyType('bounty', { value_type: 'number', localizable: false })],
    ['status', propertyType('status', { value_type: 'enum', localizable: false })],
  ]),
  relationTypes: new Map(),
  vocabularies: new Map(),
  qualifierTypes: new Map(),
  rules: new Map(),
  errors: [],
};

function entityRow(overrides: Partial<EntityRow> & { data: unknown; }): EntityRow {
  const { data, ...rest } = overrides;
  return {
    id: 'character:hero',
    type: 'character',
    slug: 'the-hero',
    schema_version: 1,
    first_appearance_source: null,
    last_appearance_source: null,
    primary_canon_scope: null,
    canonical_name_key: null,
    ...rest,
    data: JSON.stringify(data),
  };
}

const HERO = entityRow({
  first_appearance_source: 'manga-chapter:1',
  canonical_name_key: 'character.hero.name',
  data: {
    canonical_name_key: 'character.hero.name',
    properties: {
      name: [{ value_key: 'character.hero.name', since: 'manga-chapter:1' }],
      epithet: [{ value_key: 'character.hero.epithet.late', since: 'manga-chapter:900' }],
      description_key: [{ value_key: 'character.hero.description' }],
      bounty: [{ value: 3_000_000_000, since: 'manga-chapter:1053' }],
      status: [{ value: 'alive', since: 'manga-chapter:1' }],
    },
  },
});

const TRANSLATIONS: readonly TranslationRow[] = [
  { universe: 'u', locale: 'en', key: 'character.hero.name', value: 'The Hero' },
  { universe: 'u', locale: 'fr', key: 'character.hero.name', value: 'Le Héros' },
  { universe: 'u', locale: 'en', key: 'character.hero.epithet.late', value: 'Dawn Bringer' },
  { universe: 'u', locale: 'en', key: 'character.hero.description', value: 'A rubber pirate.' },
  // Data locales (ADR-095) — present in the corpus, never indexed.
  { universe: 'u', locale: 'ja', key: 'character.hero.name', value: 'ヒーロー' },
  { universe: 'u', locale: 'ja-latn', key: 'character.hero.name', value: 'Hiiroo' },
];

const rows = buildSearchRows([HERO], TRANSLATIONS, catalogue);
const docs = rows.docs;
const gatesOf = (docId: number): readonly { source_type: string; ordinal: number; }[] =>
  rows.gates.filter((g) => g.doc_id === docId)
    .map((g) => ({ source_type: g.source_type, ordinal: g.ordinal }));

describe('buildSearchRows — what is searchable comes from the schema', () => {
  it('indexes every localizable (i18n_key) property and nothing else', () => {
    const fields = new Set(docs.map((d) => d.field));
    expect(fields).toEqual(new Set(['slug', 'name', 'epithet', 'description_key']));
    // A number and an enum are not text and never enter the index.
    expect(fields.has('bounty')).toBe(false);
    expect(fields.has('status')).toBe(false);
  });

  it('classifies a `romanizable` property as a NAME and the rest as text', () => {
    const kindOf = (field: string): string | undefined => docs.find((d) => d.field === field)?.kind;
    expect(kindOf('name')).toBe('name');
    expect(kindOf('epithet')).toBe('name');
    expect(kindOf('description_key')).toBe('text');
    expect(kindOf('slug')).toBe('slug');
  });

  it('ranks display names from canonical_name_key then the declared order', () => {
    const name = docs.find((d) => d.field === 'name' && d.locale === 'en');
    expect(name?.name_rank).toBe(0); // it IS canonical_name_key
    expect(docs.find((d) => d.field === 'epithet')?.name_rank).toBeNull();
    expect(docs.find((d) => d.field === 'description_key')?.name_rank).toBeNull();
  });

  it('emits the slug as a locale-neutral row', () => {
    const slug = docs.find((d) => d.field === 'slug');
    expect(slug?.locale).toBe('*');
    expect(slug?.text).toBe('the-hero');
  });
});

describe('buildSearchRows — locales', () => {
  it('indexes the UI locales only: ja / ja-latn never reach the public index', () => {
    expect(new Set(docs.map((d) => d.locale))).toEqual(new Set(['en', 'fr', '*']));
    expect(docs.some((d) => d.text.includes('ヒーロー'))).toBe(false);
    expect(docs.some((d) => d.text === 'Hiiroo')).toBe(false);
  });

  it('emits one row per locale that actually differs', () => {
    const nameRows = docs.filter((d) => d.field === 'name');
    expect(nameRows.map((d) => d.text).sort()).toEqual(['Le Héros', 'The Hero']);
    // The epithet has no FR value: the EN row alone serves both readers.
    expect(docs.filter((d) => d.field === 'epithet')).toHaveLength(1);
  });

  it('drops a locale whose value is identical to one already emitted', () => {
    const identical = buildSearchRows([HERO], [
      { universe: 'u', locale: 'en', key: 'character.hero.name', value: 'Nami' },
      { universe: 'u', locale: 'fr', key: 'character.hero.name', value: 'Nami' },
    ], catalogue);
    expect(identical.docs.filter((d) => d.field === 'name')).toHaveLength(1);
  });
});

describe('buildSearchRows — spoiler gates', () => {
  it('gates every string of an entity by the entity existence anchor', () => {
    const slug = docs.find((d) => d.field === 'slug');
    expect(gatesOf(slug?.doc_id ?? -1)).toEqual([{ source_type: 'manga-chapter', ordinal: 1 }]);
  });

  it("gates a value by the LATER of the entity's anchor and its own `since`", () => {
    const epithet = docs.find((d) => d.field === 'epithet');
    // The entity exists from chapter 1, the epithet only from 900.
    expect(gatesOf(epithet?.doc_id ?? -1)).toEqual([
      { source_type: 'manga-chapter', ordinal: 900 },
    ]);
  });

  it('gates an entity whose own id is a numbered source', () => {
    const chapter = buildSearchRows([
      entityRow({
        id: 'manga-chapter:1044',
        type: 'manga-chapter',
        slug: 'chapter-1044',
        first_appearance_source: null,
        data: { properties: { title_key: { value_key: 'manga-chapter.1044.title' } } },
      }),
    ], [
      { universe: 'u', locale: 'en', key: 'manga-chapter.1044.title', value: 'The Reveal' },
    ], catalogue);
    // The title carries no `since` at all: only the chapter's own
    // number stands between the reader and a spoiler.
    const title = chapter.docs.find((d) => d.field === 'title_key');
    expect(title?.name_rank).toBe(1); // 1 + index in display_name_properties
    expect(chapter.gates.filter((g) => g.doc_id === title?.doc_id)).toEqual([
      { doc_id: title?.doc_id ?? -1, source_type: 'manga-chapter', ordinal: 1044 },
    ]);
  });

  it('leaves a non-numeric anchor ungated (it is not on an ordered axis)', () => {
    const built = buildSearchRows(
      [
        entityRow({
          id: 'character:ghost',
          slug: 'ghost',
          first_appearance_source: 'sbs:volume-4',
          data: { properties: { name: [{ value_key: 'k', since: 'film:one' }] } },
        }),
      ],
      [{ universe: 'u', locale: 'en', key: 'k', value: 'Ghost' }],
      catalogue,
    );
    expect(built.gates).toEqual([]);
  });

  it('never indexes `actual_value` — a concealed truth is not searchable', () => {
    const built = buildSearchRows([
      entityRow({
        data: {
          properties: {
            name: [{
              value_key: 'k.believed',
              since: 'manga-chapter:1',
              epistemic_status: 'believed_by_world',
              actual_value: 'k.truth',
            }],
          },
        },
      }),
    ], [
      { universe: 'u', locale: 'en', key: 'k.believed', value: 'Sogeking' },
      { universe: 'u', locale: 'en', key: 'k.truth', value: 'Usopp' },
    ], catalogue);
    expect(built.docs.map((d) => d.text)).toContain('Sogeking');
    expect(built.docs.map((d) => d.text)).not.toContain('Usopp');
  });
});

describe('buildSearchRows — determinism', () => {
  it('produces identical rows for identical input', () => {
    const again = buildSearchRows([HERO], TRANSLATIONS, catalogue);
    expect(JSON.stringify(again)).toBe(JSON.stringify(rows));
  });

  it('emits per-word trigram postings sized by their own word', () => {
    const name = docs.find((d) => d.field === 'name' && d.locale === 'en');
    const postings = rows.trigrams.filter((t) => t.doc_id === name?.doc_id);
    // "the hero" → two words, each with its own posting group.
    expect(new Set(postings.map((t) => t.word_index))).toEqual(new Set([0, 1]));
    for (const posting of postings) {
      const group = postings.filter((t) => t.word_index === posting.word_index);
      expect(posting.word_size).toBe(group.length);
    }
  });
});
