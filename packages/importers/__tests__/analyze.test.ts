/**
 * Full-wiki structural analysis (ADR-092): category sweep + infobox
 * field inventory + catalogue diff, driven entirely by fixture-backed
 * fetch stubs (hand-crafted MediaWiki envelopes + the real Hyougoro
 * capture) — zero network.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  analyzeWiki,
  categoryEntityType,
  type EntityTypeCatalogueEntry,
  FULL_SWEEP_SAMPLES,
  isInfoboxTemplate,
  loadEntityTypeCatalogue,
  parseAnalyzeArgs,
  renderMarkdownSummary,
} from '../src/fandom/analyze.ts';
import { FandomClient } from '../src/fandom/client.ts';

async function fixtureRaw(name: string): Promise<string> {
  return await Bun.file(join(import.meta.dir, 'fixtures', `${name}.json`)).text();
}

/** Ordered-route stub: first matching needle wins (crawl.test style). */
function stubClient(routes: readonly (readonly [string, string])[]): FandomClient {
  return new FandomClient({
    minDelayMs: 0,
    fetchImpl: ((url: string | URL | Request) => {
      const s = decodeURIComponent(String(url)).replace(/\+/g, ' ');
      for (const [needle, raw] of routes) {
        if (s.includes(needle)) return Promise.resolve(new Response(raw, { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'missingtitle', info: 'nope' } })),
      );
    }) as typeof fetch,
  });
}

const catalogue: readonly EntityTypeCatalogueEntry[] = [
  {
    id: 'character',
    properties: [
      'name',
      'epithet',
      'occupation',
      'bounty',
      'age',
      'height',
      'weight',
      'birthday',
      'blood_type',
      'status',
    ],
  },
  { id: 'crew', properties: ['name', 'total_bounty'] },
  { id: 'location', properties: ['name'] },
  { id: 'manga-chapter', properties: ['number', 'title_key', 'released_at'] },
  { id: 'theme-song', properties: ['title_key'] },
  { id: 'video-game', properties: ['title_key'] },
];

const luffyPage = JSON.stringify({
  parse: {
    title: 'Monkey D. Luffy',
    pageid: 1444,
    wikitext: '{{Char Box|ename=Monkey D. Luffy|jname=モンキー・D・ルフィ'
      + '|bounty=3,000,000,000|status=Alive}}',
  },
});

const crewPage = JSON.stringify({
  parse: {
    title: 'Straw Hat Pirates',
    pageid: 22181,
    wikitext: '{{Crew Box|name=Straw Hat Pirates|captain=[[Monkey D. Luffy]]'
      + '|total bounty=8,816,001,000}}',
  },
});

async function analyzedFixtures(): Promise<ReturnType<typeof analyzeWiki>> {
  const client = stubClient([
    ['accontinue=Islands', await fixtureRaw('allcategories-page2')],
    ['list=allcategories', await fixtureRaw('allcategories-page1')],
    ['apnamespace=10', await fixtureRaw('allpages-templates')],
    ['eititle=Template:Char Box', await fixtureRaw('embeddedin-char-box')],
    ['eititle=Template:Crew Box', await fixtureRaw('embeddedin-crew-box')],
    ['page=Hyougoro', await fixtureRaw('hyougoro')],
    ['page=Monkey D. Luffy', luffyPage],
    ['page=Straw Hat Pirates', crewPage],
  ]);
  return analyzeWiki(client, catalogue);
}

describe('category ↔ entity-type matching', () => {
  const typeIds = new Set(catalogue.map((t) => t.id));

  it('uses the maintained table, then slug similarity, else null', () => {
    expect(categoryEntityType('Characters', typeIds)).toBe('character');
    expect(categoryEntityType('Islands', typeIds)).toBe('location'); // table
    expect(categoryEntityType('Video Games', typeIds)).toBe('video-game'); // singularised slug
    expect(categoryEntityType('Article Maintenance', typeIds)).toBeNull();
  });
});

describe('isInfoboxTemplate', () => {
  it('matches both the "* Box" and "Infobox *" conventions only', () => {
    expect(isInfoboxTemplate('Char Box')).toBe(true);
    expect(isInfoboxTemplate('Infobox island')).toBe(true);
    expect(isInfoboxTemplate('Navibox')).toBe(false);
    expect(isInfoboxTemplate('Qref')).toBe(false);
  });
});

describe('analyzeWiki', () => {
  it('sweeps categories across continuation and matches entity types', async () => {
    const report = await analyzedFixtures();
    expect(report.categories.map((c) => [c.name, c.entityType])).toEqual([
      ['Characters', 'character'],
      ['Article Maintenance', null],
      ['Islands', 'location'],
      ['Video Games', 'video-game'],
    ]);
    expect(report.categories[0]?.pages).toBe(1310);
  });

  it('inventories infobox fields with occurrence counts and mapper marks', async () => {
    const report = await analyzedFixtures();
    // Sorted by transclusions (Char Box 2 > Crew Box 1); doc subpage,
    // Navibox and Qref filtered out.
    expect(report.infoboxes.map((b) => b.template)).toEqual(['Char Box', 'Crew Box']);

    const charBox = report.infoboxes[0]!;
    expect(charBox.mapper).toBe('character');
    expect(charBox.entityType).toBe('character');
    expect(charBox.transclusionsSampled).toBe(2);
    expect(charBox.samplePages).toEqual(['Hyougoro', 'Monkey D. Luffy']);

    const field = (name: string): { occurrences: number; handling: string; } | undefined =>
      charBox.fields.find((f) => f.name === name);
    // Aggregated across both samples.
    expect(field('ename')).toMatchObject({ occurrences: 2, handling: 'mapped' });
    expect(field('jname')).toMatchObject({ occurrences: 2, handling: 'unmapped' });
    expect(field('colorscheme')).toMatchObject({ occurrences: 1, handling: 'unmapped' });
    expect(field('bounty')).toMatchObject({ occurrences: 1, handling: 'mapped' });
    // "blood type" ties back to our blood_type property.
    expect(charBox.fields.find((f) => f.name === 'blood type')?.catalogueProperty).toBe(
      'blood_type',
    );
  });

  it('infers the entity type of mapper-less infoboxes from their name', async () => {
    const report = await analyzedFixtures();
    const crewBox = report.infoboxes[1]!;
    expect(crewBox.mapper).toBeNull();
    expect(crewBox.entityType).toBe('crew');
    expect(crewBox.fields.every((f) => f.handling === 'unmapped')).toBe(true);
    // Field ↔ catalogue-property hint works without a mapper too.
    expect(crewBox.fields.find((f) => f.name === 'total bounty')?.catalogueProperty).toBe(
      'total_bounty',
    );
  });

  it('reports the three gap sections, sorted', async () => {
    const report = await analyzedFixtures();
    // Most-frequent unmapped field first.
    expect(report.gaps.unmappedInfoboxFields[0]).toEqual({
      template: 'Char Box',
      field: 'jname',
      occurrences: 2,
    });
    expect(report.gaps.categoriesWithoutEntityType).toEqual([
      { name: 'Article Maintenance', pages: 40 },
    ]);
    // manga-chapter: mapper exists but this wiki sweep saw no Chapter
    // Box/category → correctly reported as source-less for THIS run.
    expect(report.gaps.entityTypesWithoutFandomSource).toEqual(['manga-chapter', 'theme-song']);
  });

  it('renders a Markdown summary with overview + gaps', async () => {
    const report = await analyzedFixtures();
    const md = renderMarkdownSummary(report);
    expect(md).toContain('# Fandom structural analysis');
    expect(md).toContain('| Char Box | character | character | 2 |');
    expect(md).toContain('| Char Box | jname | 2 |');
    expect(md).toContain('- `theme-song`');
  });

  it('fails FAST with "Fandom unreachable" when there is no egress', async () => {
    const client = new FandomClient({
      minDelayMs: 0,
      fetchImpl: (() =>
        Promise.reject(new TypeError('Unable to connect'))) as unknown as typeof fetch,
    });
    await expect(analyzeWiki(client, catalogue)).rejects.toThrow(/Fandom unreachable/);
  });
});

describe('loadEntityTypeCatalogue', () => {
  it('loads core + universe entity types with their property ids', async () => {
    const repoRoot = join(import.meta.dir, '..', '..', '..');
    const loaded = await loadEntityTypeCatalogue([
      join(repoRoot, 'data', 'schemas', 'entity-types'),
      join(repoRoot, 'data', 'universes', 'one-piece', 'schemas', 'entity-types'),
    ]);
    const ids = loaded.map((t) => t.id);
    expect(ids).toContain('manga-chapter'); // core
    expect(ids).toContain('character'); // universe overlay
    const character = loaded.find((t) => t.id === 'character');
    expect(character?.properties).toContain('bounty');
  });
});

describe('field value shapes', () => {
  it("profiles each field's values, not just its name", async () => {
    const report = await analyzedFixtures();
    const crew = report.infoboxes.find((b) => b.template === 'Crew Box');
    const captain = crew?.fields.find((f) => f.name === 'captain');
    // A bare [[wikilink]] is a relation candidate, and the report has
    // to say so — a field inventory that only counted names would show
    // `captain` and `total bounty` as indistinguishable strings.
    expect(captain?.shape.kind).toBe('wikilink');
    expect(captain?.shape.examples).toEqual(['Monkey D. Luffy']);
    expect(crew?.fields.find((f) => f.name === 'total bounty')?.shape.kind).toBe('number');
  });

  it('carries the shape into the unmapped-field gap table', async () => {
    const report = await analyzedFixtures();
    const md = renderMarkdownSummary(report);
    expect(md).toContain('## Field inventory');
    expect(md).toContain('wikilink');
  });
});

describe('parseAnalyzeArgs', () => {
  it('applies defaults and parses every flag', () => {
    expect(parseAnalyzeArgs([])).toEqual({ samples: 5, out: null, maxInfoboxes: null });
    expect(
      parseAnalyzeArgs(['--samples', '3', '--out', '/tmp/x', '--max-infoboxes', '10']),
    ).toEqual({ samples: 3, out: '/tmp/x', maxInfoboxes: 10 });
  });

  it('--full deepens the sample and lifts the infobox cap', () => {
    expect(parseAnalyzeArgs(['--full'])).toEqual({
      samples: FULL_SWEEP_SAMPLES,
      out: null,
      maxInfoboxes: null,
    });
    // An explicit --samples still wins; --full is a preset, not a lock.
    expect(parseAnalyzeArgs(['--full', '--samples', '7']).samples).toBe(7);
    // …and --full lifts a cap set before it on the same line.
    expect(parseAnalyzeArgs(['--max-infoboxes', '3', '--full']).maxInfoboxes).toBeNull();
  });

  it('rejects malformed values and unknown flags', () => {
    expect(() => parseAnalyzeArgs(['--samples', 'many'])).toThrow('--samples');
    expect(() => parseAnalyzeArgs(['--samples'])).toThrow('expects a value');
    expect(() => parseAnalyzeArgs(['--frobnicate'])).toThrow('unknown flag');
  });
});
