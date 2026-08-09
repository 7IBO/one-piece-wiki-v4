/**
 * api-onepiece candidate-pool orchestration (ADR-101): EN/FR record
 * pairing, existing-entity matching (diff — NEVER overwrite),
 * candidate file layout, the JSON/Markdown report and the CLI flag
 * parsing — all on fixture-backed fetch stubs, zero network.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { REPO_ROOT } from '../../schema-engine/src/paths.ts';
import { OnePieceApiClient } from '../src/onepiece-api/client.ts';
import {
  buildCandidateFiles,
  type ImportRunResult,
  pairRecords,
  parseImportArgs,
  renderImportMarkdown,
  runImport,
} from '../src/onepiece-api/import.ts';
import {
  buildMatchIndex,
  diffProperties,
  type ExistingEntity,
  loadExistingEntities,
  matchExisting,
  normalizeMatchKey,
} from '../src/onepiece-api/matching.ts';

/** Fixture-backed client: serves fixtures/onepiece-api/<res>-<loc>.json. */
function fixtureClient(): OnePieceApiClient {
  return new OnePieceApiClient({
    minDelayMs: 0,
    fetchImpl: (async (url: string | URL | Request) => {
      const parts = new URL(String(url)).pathname.split('/').filter((p) => p !== '');
      const resource = parts[parts.length - 2] ?? '';
      const locale = parts[parts.length - 1] ?? '';
      const path = join(import.meta.dir, 'fixtures', 'onepiece-api', `${resource}-${locale}.json`);
      const file = Bun.file(path);
      const body = (await file.exists()) ? await file.text() : '[]';
      return new Response(body, { status: 200 });
    }) as typeof fetch,
  });
}

/** Minimal committed-corpus snapshot (Luffy, his fruit, his crew). */
function existingCorpus(): readonly ExistingEntity[] {
  return [
    {
      id: 'character:luffy',
      type: 'character',
      slug: 'monkey-d-luffy',
      path: 'data/universes/one-piece/entities/character/luffy.json',
      entity: {
        id: 'character:luffy',
        type: 'character',
        properties: {
          bounty: [
            { value: 30000000, since: 'manga-chapter:96' },
            { value: 3000000000, since: 'manga-chapter:1053' },
          ],
          status: [{ value: 'alive', since: 'manga-chapter:1' }],
        },
      },
      names: ['Monkey D. Luffy', 'Straw Hat'],
    },
    {
      id: 'devil-fruit:gomu-gomu',
      type: 'devil-fruit',
      slug: 'gomu-gomu-no-mi',
      path: 'data/universes/one-piece/entities/devil-fruit/gomu-gomu.json',
      entity: { id: 'devil-fruit:gomu-gomu', type: 'devil-fruit', properties: {} },
      names: ['Gomu Gomu no Mi', 'Hito Hito no Mi, Model: Nika'],
    },
    {
      id: 'crew:straw-hat-pirates',
      type: 'crew',
      slug: 'straw-hat-pirates',
      path: 'data/universes/one-piece/entities/crew/straw-hat-pirates.json',
      entity: { id: 'crew:straw-hat-pirates', type: 'crew', properties: {} },
      names: ['Straw Hat Pirates'],
    },
  ];
}

const VOCABULARIES = {
  occupations: new Map([['pirate', 'pirate']]),
  'ship-types': new Map([['sloop', 'sloop']]),
  'location-regions': new Map([['east blue', 'east_blue']]),
};

async function runFixtureImport(): Promise<ImportRunResult> {
  return await runImport(fixtureClient(), {
    matchIndex: buildMatchIndex(existingCorpus()),
    vocabularies: VOCABULARIES,
  });
}

describe('pairRecords', () => {
  it('pairs EN/FR by API id and keeps unpaired records', () => {
    const pairs = pairRecords(
      [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      [{ id: 1, name: 'A-fr' }, { id: 3, name: 'C-fr' }],
    );
    expect(pairs).toEqual([
      { en: { id: 1, name: 'A' }, fr: { id: 1, name: 'A-fr' } },
      { en: { id: 2, name: 'B' } },
      { fr: { id: 3, name: 'C-fr' } },
    ]);
  });
});

describe('matching', () => {
  it('matches by normalized slug, id slug and translated names', () => {
    const index = buildMatchIndex(existingCorpus());
    expect(matchExisting(index, 'character', ['Monkey D. Luffy'])?.id).toBe('character:luffy');
    expect(matchExisting(index, 'character', ['monkey-d-luffy'])?.id).toBe('character:luffy');
    expect(matchExisting(index, 'character', ['luffy'])?.id).toBe('character:luffy');
    // Devil fruits match with and without the "no Mi" suffix.
    expect(matchExisting(index, 'devil-fruit', ['Gomu Gomu'])?.id).toBe('devil-fruit:gomu-gomu');
    // Crews match with and without a leading "The".
    expect(matchExisting(index, 'crew', ['The Straw Hat Pirates'])?.id).toBe(
      'crew:straw-hat-pirates',
    );
    expect(matchExisting(index, 'character', ['Jewelry Bonney'])).toBeNull();
    // Type-scoped: a crew name never matches in character space.
    expect(matchExisting(index, 'character', ['Straw Hat Pirates'])).toBeNull();
  });

  it('normalizeMatchKey strips diacritics and punctuation', () => {
    expect(normalizeMatchKey("L'Équipage du Chapeau de Paille")).toBe(
      'lequipageduchapeaudepaille',
    );
  });

  it('diffProperties reports value differences without bookkeeping stamps', () => {
    const existing = existingCorpus()[0]!;
    const diffs = diffProperties(existing.entity, {
      bounty: [{ value: 3000000000, review_status: 'auto_imported' }],
      status: [{ value: 'alive', review_status: 'auto_imported' }],
    });
    const byProp = new Map(diffs.map((d) => [d.property, d]));
    expect(byProp.get('bounty')?.candidate).toBe('[{"value":3000000000}]');
    expect(byProp.get('bounty')?.existing).toContain('manga-chapter:96');
    expect(byProp.get('status')?.candidate).not.toContain('review_status');
  });

  it('loads the committed corpus and matches Luffy against the real index', async () => {
    const entities = await loadExistingEntities(REPO_ROOT);
    const index = buildMatchIndex(entities);
    expect(matchExisting(index, 'character', ['Monkey D. Luffy'])?.id).toBe('character:luffy');
  });
});

describe('runImport (fixture sweep, EN+FR)', () => {
  it('creates candidates, diffs matches, and never overwrites', async () => {
    const { report, files } = await runFixtureImport();

    // Existing entities → matched diff, NOT created, NO files.
    const matchedIds = report.matchedDiff.map((m) => m.id).sort();
    expect(matchedIds).toEqual([
      'character:luffy',
      'crew:straw-hat-pirates',
      'devil-fruit:gomu-gomu',
    ]);
    const createdIds = report.created.map((c) => c.id);
    for (const id of matchedIds) expect(createdIds).not.toContain(id);
    expect(files.some((f) => f.path.includes('/character/luffy.json'))).toBe(false);
    expect(files.some((f) => f.path.includes('/character/monkey-d-luffy.json'))).toBe(false);

    // The Luffy diff shows existing vs candidate values (bounty differs
    // in shape: the corpus has the anchored history).
    const luffy = report.matchedDiff.find((m) => m.id === 'character:luffy')!;
    expect(luffy.existingPath).toBe('data/universes/one-piece/entities/character/luffy.json');
    const bountyDiff = luffy.diffs.find((d) => d.property === 'bounty')!;
    expect(bountyDiff.existing).toContain('manga-chapter:96');
    expect(bountyDiff.candidate).toBe('[{"value":3000000000}]');

    // Matched fruit: its image URL is a note, not a new image entity.
    const gomu = report.matchedDiff.find((m) => m.id === 'devil-fruit:gomu-gomu')!;
    expect(gomu.notes.some((n) => n.includes('gomu-gomu-no-mi.png'))).toBe(true);
    expect(files.some((f) => f.path.includes('gomu-gomu-no-mi-api-onepiece'))).toBe(false);

    // Genuinely new records became candidates in the EXACT repo layout.
    expect(createdIds).toEqual(expect.arrayContaining([
      'devil-fruit:mera-mera-no-mi',
      'crew:heart-pirates',
      'ship:thousand-sunny',
      'manga-chapter:1044',
      'volume:102',
      'saga:east-blue',
      'arc:romance-dawn',
      'anime-episode:1',
      'location:foosha-village',
      'character:jewelry-bonney',
    ]));
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining([
      'data/universes/one-piece/entities/character/jewelry-bonney.json',
      'data/universes/one-piece/translations/en/character/jewelry-bonney.json',
      'data/universes/one-piece/translations/fr/character/jewelry-bonney.json',
      'data/universes/one-piece/entities/image/mera-mera-no-mi-api-onepiece.json',
      'data/universes/one-piece/translations/fr/manga-chapter/1044.json',
    ]));
    expect(report.counts.imageEntities).toBe(1);

    // Cross-resource resolution: Bonney joined the Heart Pirates
    // candidate created earlier in the same sweep; the Sunny is crewed
    // by the EXISTING Straw Hats entity; the arc chains to the saga.
    const bonney = JSON.parse(
      files.find((f) => f.path.endsWith('entities/character/jewelry-bonney.json'))!.content,
    ) as { relations: readonly { type: string; target: string; }[]; };
    expect(
      bonney.relations.some((r) => r.type === 'member-of' && r.target === 'crew:heart-pirates'),
    ).toBe(true);
    const sunny = JSON.parse(
      files.find((f) => f.path.endsWith('entities/ship/thousand-sunny.json'))!.content,
    ) as { relations: readonly { type: string; target: string; }[]; };
    expect(sunny.relations).toEqual([
      { type: 'crewed-by', target: 'crew:straw-hat-pirates' },
    ]);
    const arc = JSON.parse(
      files.find((f) => f.path.endsWith('entities/arc/romance-dawn.json'))!.content,
    ) as { relations: readonly { type: string; target: string; }[]; };
    expect(arc.relations).toEqual([{ type: 'part-of-saga', target: 'saga:east-blue' }]);

    // Gap reporting: unmapped fields are NEVER silently dropped.
    const gapFields = report.gaps.map((g) => `${g.resource}.${g.field}`);
    expect(gapFields).toEqual(expect.arrayContaining([
      'characters.doriki',
      'characters.first_apparition',
      'fruits.technicalFile',
    ]));

    // Unanchored + informational + skipped bookkeeping.
    expect(report.unanchored.some((u) => u.includes('character:jewelry-bonney bounty 320,000,000')))
      .toBe(true);
    expect(report.informational.some((i) => i.includes('total_prime'))).toBe(true);
    expect(report.skipped).toHaveLength(2); // blank-name character + corrupt chapter row
    expect(report.counts.created).toBe(report.created.length);
  });

  it('stamps review_status: auto_imported on historisable entries', async () => {
    const { files } = await runFixtureImport();
    const bonney = JSON.parse(
      files.find((f) => f.path.endsWith('entities/character/jewelry-bonney.json'))!.content,
    ) as { properties: Record<string, readonly Record<string, unknown>[]>; };
    for (const property of ['name', 'status', 'bounty', 'occupation']) {
      for (const entry of bonney.properties[property]!) {
        expect(entry['review_status']).toBe('auto_imported');
      }
    }
  });

  it('propagates the unreachable fast-fail', async () => {
    const client = new OnePieceApiClient({
      minDelayMs: 0,
      fetchImpl: (() =>
        Promise.reject(new TypeError('Unable to connect'))) as unknown as typeof fetch,
    });
    await expect(runImport(client, { resources: ['fruits'] })).rejects.toThrow(
      /api-onepiece unreachable/,
    );
  });

  it('rejects unknown resources up front', async () => {
    await expect(runImport(fixtureClient(), { resources: ['swordsmen'] })).rejects.toThrow(
      /unknown resource "swordsmen"/,
    );
  });
});

describe('buildCandidateFiles', () => {
  it('emits the exact corpus layout and skips empty sidecars', () => {
    const files = buildCandidateFiles({
      entity: {
        id: 'manga-chapter:1044',
        type: 'manga-chapter',
        schema_version: 8,
        slug: 'chapter-1044',
        properties: {},
        relations: [],
      },
      translations: { en: { 'manga-chapter.1044.title': 'Warrior of Liberation' }, fr: {} },
    });
    expect(files.map((f) => f.path)).toEqual([
      'data/universes/one-piece/entities/manga-chapter/1044.json',
      'data/universes/one-piece/translations/en/manga-chapter/1044.json',
    ]);
    expect(files[0]!.content.endsWith('\n')).toBe(true);
  });
});

describe('renderImportMarkdown', () => {
  it('renders every report section including the gaps table', async () => {
    const { report } = await runFixtureImport();
    const md = renderImportMarkdown(report);
    expect(md).toContain('# api-onepiece.com candidate import');
    expect(md).toContain('## Created candidates');
    expect(md).toContain('## Matched existing entities (diffs — nothing overwritten)');
    expect(md).toContain('### `character:luffy` ← API "Monkey D. Luffy" (characters)');
    expect(md).toContain('## Gaps — unmapped API fields (never silently dropped)');
    expect(md).toContain('| characters | doriki |');
    expect(md).toContain('## Unanchored entries');
    expect(md).toContain('## Informational (derived facts, not stored)');
  });
});

describe('parseImportArgs', () => {
  it('applies defaults and parses every flag', () => {
    expect(parseImportArgs([])).toEqual({
      resources: null,
      locales: null,
      out: null,
      dryRun: false,
    });
    expect(
      parseImportArgs([
        '--resources',
        'fruits,crews',
        '--locales',
        'en',
        '--out',
        '/tmp/c',
        '--dry-run',
      ]),
    ).toEqual({
      resources: ['fruits', 'crews'],
      locales: ['en'],
      out: '/tmp/c',
      dryRun: true,
    });
  });

  it('rejects malformed values and unknown flags', () => {
    expect(() => parseImportArgs(['--resources'])).toThrow('expects a value');
    expect(() => parseImportArgs(['--resources', 'swords'])).toThrow('unknown resource');
    expect(() => parseImportArgs(['--locales', 'de'])).toThrow('unknown locale');
    expect(() => parseImportArgs(['--nope'])).toThrow('unknown flag');
  });
});
