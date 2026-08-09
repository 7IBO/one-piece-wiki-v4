/**
 * api-onepiece.com importer family (ADR-101): polite client + the
 * per-resource mappers — all on hand-crafted fixture envelopes, zero
 * network. Fixtures live in fixtures/onepiece-api/ and mirror the
 * documented v2 record shapes, dirty data included.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { mapBoat } from '../src/onepiece-api/boats.ts';
import { mapChapter } from '../src/onepiece-api/chapters.ts';
import { mapCharacter } from '../src/onepiece-api/characters.ts';
import { OnePieceApiClient } from '../src/onepiece-api/client.ts';
import {
  inferImageFormat,
  type LocalizedRecordPair,
  parseLooseNumber,
  type RawRecord,
} from '../src/onepiece-api/common.ts';
import { mapCrew } from '../src/onepiece-api/crews.ts';
import { mapEpisode } from '../src/onepiece-api/episodes.ts';
import { mapFruit } from '../src/onepiece-api/fruits.ts';
import { mapLocation } from '../src/onepiece-api/locations.ts';
import { mapArc, mapSaga } from '../src/onepiece-api/sagas-arcs.ts';
import { mapVolume } from '../src/onepiece-api/volumes.ts';

async function fixture(name: string): Promise<readonly RawRecord[]> {
  return (await Bun.file(
    join(import.meta.dir, 'fixtures', 'onepiece-api', `${name}.json`),
  ).json()) as readonly RawRecord[];
}

async function fixturePair(resource: string, index: number): Promise<LocalizedRecordPair> {
  const en = await fixture(`${resource}-en`);
  const fr = await fixture(`${resource}-fr`);
  const pair: { en?: RawRecord; fr?: RawRecord; } = {};
  if (en[index] !== undefined) pair.en = en[index];
  if (fr[index] !== undefined) pair.fr = fr[index];
  return pair;
}

const OCCUPATIONS = new Map([['pirate', 'pirate'], ['marine', 'marine']]);

describe('OnePieceApiClient', () => {
  it('builds resource URLs on the v2 pattern', () => {
    const client = new OnePieceApiClient({ minDelayMs: 0 });
    expect(client.resourceUrl('characters', 'fr')).toBe(
      'https://api.api-onepiece.com/v2/characters/fr',
    );
  });

  it('parses a bare-array envelope and tolerates { data: [...] }', async () => {
    const bare = new OnePieceApiClient({
      minDelayMs: 0,
      fetchImpl: (() =>
        Promise.resolve(
          new Response('[{"id":1,"name":"Luffy"}]', { status: 200 }),
        )) as typeof fetch,
    });
    expect(await bare.fetchResource('characters', 'en')).toEqual([{ id: 1, name: 'Luffy' }]);

    const wrapped = new OnePieceApiClient({
      minDelayMs: 0,
      fetchImpl: (() =>
        Promise.resolve(
          new Response('{"data":[{"id":2}]}', { status: 200 }),
        )) as typeof fetch,
    });
    expect(await wrapped.fetchResource('fruits', 'en')).toEqual([{ id: 2 }]);
  });

  it('rejects a malformed envelope with a clear error', async () => {
    const client = new OnePieceApiClient({
      minDelayMs: 0,
      fetchImpl: (() =>
        Promise.resolve(new Response('{"nope":true}', { status: 200 }))) as typeof fetch,
    });
    await expect(client.fetchResource('crews', 'en')).rejects.toThrow(/Malformed envelope/);
  });

  it('fails FAST with "api-onepiece unreachable" when there is no egress', async () => {
    const client = new OnePieceApiClient({
      minDelayMs: 0,
      fetchImpl: (() =>
        Promise.reject(new TypeError('Unable to connect'))) as unknown as typeof fetch,
    });
    await expect(client.fetchResource('characters', 'en')).rejects.toThrow(
      /api-onepiece unreachable/,
    );
  });

  it('treats a proxy-denial 403 response as unreachable too', async () => {
    // The cloud sandbox proxy answers CONNECT denials with a plain
    // HTTP 403 (same behaviour as for Fandom) — not a fetch rejection.
    const client = new OnePieceApiClient({
      minDelayMs: 0,
      fetchImpl: (() => Promise.resolve(new Response('denied', { status: 403 }))) as typeof fetch,
    });
    await expect(client.fetchResource('characters', 'en')).rejects.toThrow(
      /api-onepiece unreachable.*CONNECT 403/,
    );
  });
});

describe('parseLooseNumber', () => {
  it('parses dirty bounty strings with dot/comma separators', () => {
    expect(parseLooseNumber('3.000.000.000')).toBe(3000000000);
    expect(parseLooseNumber('320,000,000 Berries')).toBe(320000000);
    expect(parseLooseNumber(1500)).toBe(1500);
    expect(parseLooseNumber('Unknown')).toBeNull();
    expect(parseLooseNumber('')).toBeNull();
    expect(parseLooseNumber(undefined)).toBeNull();
  });
});

describe('mapCharacter', () => {
  it('merges the EN+FR sweep into one entity + two translation sidecars', async () => {
    const pair = await fixturePair('characters', 0); // Luffy
    const result = mapCharacter(pair, {
      vocabularies: { occupations: OCCUPATIONS },
      resolveTarget: (name) =>
        name === 'Straw Hat Pirates' ? 'crew:straw-hat-pirates' : 'devil-fruit:gomu-gomu',
    });
    expect(result).not.toBeNull();
    expect(result!.entity.id).toBe('character:monkey-d-luffy');
    expect(result!.translations.en['character.monkey-d-luffy.name']).toBe('Monkey D. Luffy');
    expect(result!.translations.fr['character.monkey-d-luffy.name']).toBe('Monkey D. Luffy');

    // Dirty bounty "3.000.000.000" → 3000000000, auto_imported, NO
    // since (the API carries no anchor) — flagged as unanchored.
    expect(result!.entity.properties['bounty']).toEqual([
      { value: 3000000000, review_status: 'auto_imported' },
    ]);
    expect(result!.unanchored.some((u) => u.includes('bounty 3,000,000,000'))).toBe(true);

    expect(result!.entity.properties['status']).toEqual([
      { value: 'alive', review_status: 'auto_imported' },
    ]);
    expect(result!.entity.properties['height']).toEqual([
      { value: 174, review_status: 'auto_imported' },
    ]);
    expect(result!.entity.properties['age']).toEqual([
      { value: 19, review_status: 'auto_imported' },
    ]);
    expect(result!.entity.properties['occupation']).toEqual([
      { value: ['pirate'], review_status: 'auto_imported' },
    ]);

    // member-of (leadership = member-of{role} only, ADR-099 — no
    // led-by/captains) + ate-fruit, both since-less and flagged.
    expect(result!.entity.relations).toEqual([
      { type: 'member-of', target: 'crew:straw-hat-pirates' },
      { type: 'ate-fruit', target: 'devil-fruit:gomu-gomu' },
    ]);
    expect(result!.unanchored.some((u) => u.includes('member-of'))).toBe(true);
    expect(result!.gaps).toEqual([]); // every Luffy field is handled
  });

  it('reports every unmapped field as a gap — never silently dropped', async () => {
    const pair = await fixturePair('characters', 1); // Bonney
    const result = mapCharacter(pair, { vocabularies: { occupations: OCCUPATIONS } });
    expect(result).not.toBeNull();
    const fields = result!.gaps.map((g) => g.field).sort();
    expect(fields).toEqual(['doriki', 'first_apparition']);
    // No resolveTarget → crew/fruit edges are skipped with warnings.
    expect(result!.entity.relations).toEqual([]);
    expect(result!.warnings.some((w) => w.includes('Heart Pirates'))).toBe(true);
  });

  it('maps FR status spellings and degrades unknown ones safely', () => {
    const fr = mapCharacter({ fr: { name: 'Portgas D. Ace', status: 'Décédé' } });
    expect(fr!.entity.properties['status']).toEqual([
      { value: 'dead', review_status: 'auto_imported' },
    ]);
    const odd = mapCharacter({ en: { name: 'Mystery', status: 'sleeping???' } });
    expect(odd!.entity.properties['status']).toEqual([
      { value: 'unknown', review_status: 'auto_imported' },
    ]);
    expect(odd!.warnings.some((w) => w.includes('unmapped status'))).toBe(true);
  });

  it('returns null on records without a usable name', async () => {
    const pair = await fixturePair('characters', 2); // blank name
    expect(mapCharacter(pair)).toBeNull();
  });
});

describe('mapFruit', () => {
  it('creates the devil-fruit entity and a URL-only image entity + depicted-by', async () => {
    const pair = await fixturePair('fruits', 1); // Mera Mera no Mi
    const result = mapFruit(pair);
    expect(result).not.toBeNull();
    expect(result!.entity.id).toBe('devil-fruit:mera-mera-no-mi');
    expect(result!.entity.properties['classification']).toEqual([
      { value: 'logia', review_status: 'auto_imported' },
    ]);

    // URL-only image (ADR-101 §2): external URL as-is, unverified
    // license, API attribution, `other` origin, NO binary download.
    expect(result!.images).toHaveLength(1);
    const image = result!.images[0]!;
    expect(image.entity.id).toBe('image:mera-mera-no-mi-api-onepiece');
    expect(image.entity.properties['url']).toEqual([
      {
        value: 'https://images.api-onepiece.com/fruits/mera-mera-no-mi.jpg',
        review_status: 'auto_imported',
      },
    ]);
    expect(image.entity.properties['license']).toEqual({ value: 'unverified-external' });
    expect(image.entity.properties['attribution']).toEqual({ value: 'api-onepiece.com' });
    expect(image.entity.properties['source_origin']).toEqual({ value: 'other' });
    expect(image.entity.properties['format']).toEqual({ value: 'jpg' });
    // No anchor known for the subject → manga-chapter:1 fallback, flagged.
    expect(image.entity.properties['spoiler_since']).toEqual({ value: 'manga-chapter:1' });
    expect(image.spoilerFallback).toBe(true);
    expect(image.translations.en['image.mera-mera-no-mi-api-onepiece.alt']).toContain(
      'Mera Mera no Mi',
    );

    expect(result!.entity.relations).toEqual([
      {
        type: 'depicted-by',
        target: 'image:mera-mera-no-mi-api-onepiece',
        qualifiers: { role: 'primary_portrait' },
      },
    ]);
    expect(result!.gaps.map((g) => g.field)).toEqual(['technicalFile']);
  });

  it('skips non-http or format-less image URLs instead of guessing', () => {
    const result = mapFruit({
      en: { id: 7, name: 'Suke Suke no Mi', type: 'Paramecia', filename: 'suke.bin' },
    });
    expect(result!.images).toHaveLength(0);
    expect(result!.warnings.some((w) => w.includes('image URL'))).toBe(true);
  });
});

describe('inferImageFormat', () => {
  it('maps known extensions and rejects the rest', () => {
    expect(inferImageFormat('https://x/y.png')).toBe('png');
    expect(inferImageFormat('https://x/y.JPEG?w=200')).toBe('jpg');
    expect(inferImageFormat('https://x/y.webp#frag')).toBe('webp');
    expect(inferImageFormat('https://x/y.exe')).toBeNull();
    expect(inferImageFormat('https://x/y')).toBeNull();
  });
});

describe('mapCrew', () => {
  it('never stores total_prime (derived per ADR-099) — reports it instead', async () => {
    const pair = await fixturePair('crews', 0); // Straw Hats
    const result = mapCrew(pair);
    expect(result).not.toBeNull();
    expect(result!.entity.id).toBe('crew:straw-hat-pirates');
    expect(result!.entity.properties['total_bounty']).toBeUndefined();
    expect(result!.entity.properties['total_prime']).toBeUndefined();
    expect(result!.informational.some((i) => i.includes('total_prime 8,816,001,000'))).toBe(true);
    expect(result!.informational.some((i) => i.includes('member count'))).toBe(true);
    expect(result!.informational.some((i) => i.includes('is_yonko'))).toBe(true);
    // roman_name → a `romanized` name entry + both sidecars.
    const names = result!.entity.properties['name'] as readonly Record<string, unknown>[];
    expect(names).toHaveLength(2);
    expect(names[1]).toMatchObject({ name_type: 'romanized' });
    expect(result!.translations.fr['crew.straw-hat-pirates.name']).toBe(
      "L'Équipage du Chapeau de Paille",
    );
  });
});

describe('mapBoat', () => {
  it('maps ship type via the vocabulary and crews the ship', async () => {
    const pair = await fixturePair('boats', 0); // Thousand Sunny
    const result = mapBoat(pair, {
      vocabularies: { 'ship-types': new Map([['sloop', 'sloop']]) },
      resolveTarget: () => 'crew:straw-hat-pirates',
    });
    expect(result).not.toBeNull();
    expect(result!.entity.id).toBe('ship:thousand-sunny');
    expect(result!.entity.properties['ship_type']).toEqual({ value: 'sloop' });
    expect(result!.entity.relations).toEqual([
      { type: 'crewed-by', target: 'crew:straw-hat-pirates' },
    ]);
  });
});

describe('mapChapter / mapVolume / mapEpisode', () => {
  it('maps the chapter ordinal, EN+FR titles and part-of-volume', async () => {
    const pair = await fixturePair('chapters', 0);
    const result = mapChapter(pair);
    expect(result).not.toBeNull();
    expect(result!.entity.id).toBe('manga-chapter:1044');
    expect(result!.entity.slug).toBe('chapter-1044');
    expect(result!.entity.properties['number']).toEqual({ value: 1044 });
    expect(result!.entity.properties['title_key']).toEqual({
      value_key: 'manga-chapter.1044.title',
    });
    expect(result!.entity.properties['released_at']).toEqual({
      value: '2022-03-07',
      territory: 'jp',
    });
    expect(result!.translations.en['manga-chapter.1044.title']).toBe('Warrior of Liberation');
    expect(result!.translations.fr['manga-chapter.1044.title']).toBe('Le guerrier libérateur');
    expect(result!.entity.relations).toEqual([
      { type: 'part-of-volume', target: 'volume:102' },
    ]);
  });

  it('rejects chapter rows without a parseable ordinal', async () => {
    const pair = await fixturePair('chapters', 1); // "not-a-number"
    expect(mapChapter(pair)).toBeNull();
  });

  it('maps tomes to volumes; the FR release stays informational', async () => {
    const pair = await fixturePair('tomes', 0);
    const result = mapVolume(pair);
    expect(result).not.toBeNull();
    expect(result!.entity.id).toBe('volume:102');
    expect(result!.entity.properties['released_at']).toEqual({
      value: '2022-04-04',
      territory: 'jp',
    });
    expect(result!.informational.some((i) => i.includes('French release 2022-10-05'))).toBe(true);
  });

  it('maps episodes with a resolved part-of-arc edge', async () => {
    const pair = await fixturePair('episodes', 0);
    const result = mapEpisode(pair, { resolveTarget: () => 'arc:romance-dawn' });
    expect(result).not.toBeNull();
    expect(result!.entity.id).toBe('anime-episode:1');
    expect(result!.entity.relations).toEqual([
      { type: 'part-of-arc', target: 'arc:romance-dawn' },
    ]);
    // Saga is implied by the arc chain — informational, not stored.
    expect(result!.informational.some((i) => i.includes('saga "East Blue"'))).toBe(true);
  });
});

describe('mapSaga / mapArc / mapLocation', () => {
  it('maps sagas; chapter/volume/episode ranges stay informational', async () => {
    const pair = await fixturePair('sagas', 0);
    const result = mapSaga(pair);
    expect(result).not.toBeNull();
    expect(result!.entity.id).toBe('saga:east-blue');
    expect(result!.entity.properties['saga_number']).toEqual({ value: 1 });
    expect(result!.informational.some((i) => i.includes('chapter range "1-100"'))).toBe(true);
  });

  it('maps arcs with part-of-saga resolved through the sweep', async () => {
    const pair = await fixturePair('arcs', 0);
    const result = mapArc(pair, { resolveTarget: () => 'saga:east-blue' });
    expect(result!.entity.id).toBe('arc:romance-dawn');
    expect(result!.entity.relations).toEqual([
      { type: 'part-of-saga', target: 'saga:east-blue' },
    ]);
  });

  it('maps locations with a region vocabulary match; affiliation stays a warning', async () => {
    const pair = await fixturePair('locates', 0);
    const result = mapLocation(pair, {
      vocabularies: { 'location-regions': new Map([['east blue', 'east_blue']]) },
    });
    expect(result!.entity.id).toBe('location:foosha-village');
    expect(result!.entity.properties['region']).toEqual({ value: 'east_blue' });
    expect(result!.warnings.some((w) => w.includes('Goa Kingdom'))).toBe(true);
    expect(result!.translations.fr['location.foosha-village.name']).toBe('Le Village de Fuchsia');
  });
});
