/**
 * Search, end to end against the real build artifact (ADR-108).
 * Skipped gracefully when `/dist/onepiece.db` has not been built, like
 * the other artifact-backed suites.
 *
 * The two spoiler tests at the bottom are the reason this feature is
 * risky enough to need integration coverage rather than unit mocks:
 * they exercise the SQL gate against the real index, on the corpus's
 * own late-reveal data (the Nika revelation at chapter 1044, Luffy's
 * "Straw Hat" epithet from chapter 96).
 */
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProgressCursor } from '../progress.ts';
import type { SearchView } from '../search.ts';

const DB_PATH = resolve(import.meta.dirname, '..', '..', '..', '..', 'dist', 'onepiece.db');
const hasArtifact = existsSync(DB_PATH);

const cursor = (manga: number | null = null, anime: number | null = null): ProgressCursor => ({
  manga,
  anime,
});

async function search(
  query: string,
  locale: 'en' | 'fr' = 'en',
  progression: ProgressCursor = cursor(),
): Promise<SearchView> {
  const { buildSearchView } = await import('../search.ts');
  return await buildSearchView(query, locale, progression);
}

/** Ids of the entities a query returns, in rank order. */
async function ids(
  query: string,
  locale: 'en' | 'fr' = 'en',
  progression: ProgressCursor = cursor(),
): Promise<readonly string[]> {
  return (await search(query, locale, progression)).results.map((r) => r.id);
}

describe.skipIf(!hasArtifact)('search (real artifact)', () => {
  // -------------------------------------------------------------------------
  // Matching

  test('exact match: a name ranks its own entity first', async () => {
    expect(await ids('Monkey D. Luffy')).toContain('character:luffy');
    expect((await ids('Monkey D. Luffy'))[0]).toBe('character:luffy');
    expect((await ids('Roronoa Zoro'))[0]).toBe('character:zoro');
  });

  test('prefix match: a partial word finds the entity', async () => {
    expect(await ids('luf')).toContain('character:luffy');
    expect(await ids('marine')).toContain('arc:marineford');
  });

  test('multi-word queries require every term', async () => {
    expect(await ids('romance dawn')).toContain('manga-chapter:1');
    expect(await ids('romance zoro')).toEqual([]);
  });

  test('entity type weighting: the character beats the chapter of the same name', async () => {
    // Chapter 8 is titled "Nami"; the character is what a reader means.
    const ranked = await ids('nami');
    expect(ranked).toContain('character:nami');
    expect(ranked).toContain('manga-chapter:8');
    expect(ranked.indexOf('character:nami')).toBeLessThan(ranked.indexOf('manga-chapter:8'));
  });

  test('an empty query returns nothing rather than everything', async () => {
    expect(await ids('')).toEqual([]);
    expect(await ids('   ')).toEqual([]);
    expect(await ids('— …')).toEqual([]);
    expect((await search('')).approximate).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Typo tolerance

  test('typo: a misspelled name still finds the entity, flagged approximate', async () => {
    const zorro = await search('zorro');
    expect(zorro.results.map((r) => r.id)).toContain('character:zoro');
    expect(zorro.approximate).toBe(true);

    expect(await ids('sandji')).toContain('character:sanji');
    expect(await ids('nammi')).toContain('character:nami');
    expect(await ids('marinford')).toContain('arc:marineford');
  });

  test('the fuzzy pass is a fallback: a query that matches is never "approximate"', async () => {
    const exact = await search('nami');
    expect(exact.results.length).toBeGreaterThan(0);
    expect(exact.approximate).toBe(false);
  });

  test('nonsense finds nothing', async () => {
    expect(await ids('qwertyuiop')).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Accents and locales

  test('accent-insensitive: an unaccented query finds an accented name', async () => {
    expect(await ids('equipage', 'fr')).toContain('crew:straw-hat-pirates');
    expect(await ids('Équipage', 'fr')).toContain('crew:straw-hat-pirates');
    expect(await ids('revelation', 'fr')).toContain('event:nika-reveal');
  });

  test('multilingual: either locale finds the entity, and the label follows the reader', async () => {
    // A French name, asked for by an English reader.
    expect(await ids('Chapeau de Paille', 'en')).toContain('crew:straw-hat-pirates');
    // An English name, asked for by a French reader.
    expect(await ids('Straw Hat Pirates', 'fr')).toContain('crew:straw-hat-pirates');

    const fr = await search('gomu', 'fr');
    const fruitFr = fr.results.find((r) => r.id === 'devil-fruit:gomu-gomu');
    expect(fruitFr?.name).toBe('Fruit du Gum-Gum');
    const en = await search('gomu', 'en');
    const fruitEn = en.results.find((r) => r.id === 'devil-fruit:gomu-gomu');
    expect(fruitEn?.name).toBe('Gomu Gomu no Mi');
  });

  test('data locales never surface: a romanized/Japanese query matches nothing', async () => {
    // `ja` / `ja-latn` exist in the artifact's translations for Luffy
    // but are dashboard-only (ADR-095) and are not indexed.
    expect(await ids('モンキー')).toEqual([]);
    expect(await ids('Mugiwara')).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Spoiler case 1 — the entity's EXISTENCE is the spoiler

  test('an entity that only exists later is unfindable, with no teaser row', async () => {
    // `event:nika-reveal` is anchored at manga-chapter:1044.
    const early = await search('Nika Revelation', 'en', cursor(100));
    expect(early.results).toEqual([]);
    // Not "hidden", not counted, not placeheld — a redacted row would
    // itself announce that something exists at chapter 1044.
    expect(early.results).toHaveLength(0);

    // Its French name, its slug and a bare "nika" are equally dead ends.
    expect(await ids('Révélation', 'fr', cursor(100))).not.toContain('event:nika-reveal');
    expect(await ids('nika-reveal', 'en', cursor(100))).toEqual([]);
    expect(await ids('nika', 'en', cursor(100))).toEqual([]);

    // A reader who has reached it finds it.
    expect(await ids('Nika Revelation', 'en', cursor(1044))).toContain('event:nika-reveal');
    expect(await ids('nika', 'en')).toContain('event:nika-reveal');
  });

  test('a chapter beyond the cursor is unfindable by its own number or title', async () => {
    expect(await ids('1053', 'en', cursor(100))).toEqual([]);
    expect(await ids('chapter-1053', 'en', cursor(100))).toEqual([]);
    expect(await ids('1053', 'en')).toContain('manga-chapter:1053');
  });

  // -------------------------------------------------------------------------
  // Spoiler case 2 — the entity exists, a LATER NAME is the spoiler

  test('a later epithet does not surface its bearer, but the earlier name does', async () => {
    // Luffy exists from chapter 1; "Straw Hat" is his only from 96.
    const atFifty = await ids('Straw Hat', 'en', cursor(50));
    expect(atFifty).not.toContain('character:luffy');
    // The CREW is named "Straw Hat Pirates" from chapter 1 — it is not
    // a spoiler and must still be found. The rule gates strings, not
    // words.
    expect(atFifty).toContain('crew:straw-hat-pirates');
    // And the character is still reachable by the name he has now.
    expect(await ids('Luffy', 'en', cursor(50))).toContain('character:luffy');
    // Same in French, on the translated epithet.
    expect(await ids('Chapeau de Paille', 'fr', cursor(50))).not.toContain('character:luffy');

    // Past chapter 96 the epithet is the reader's knowledge again.
    expect(await ids('Straw Hat', 'en', cursor(200))).toContain('character:luffy');
  });

  test('a renamed entity is found — and LABELLED — by the name it had at the cursor', async () => {
    // The Gomu Gomu no Mi is revealed to be the Hito Hito no Mi, Model:
    // Nika at chapter 1044. Before that, the fruit exists and is
    // findable, under its old name only.
    const early = await search('gomu gomu', 'en', cursor(100));
    const fruit = early.results.find((r) => r.id === 'devil-fruit:gomu-gomu');
    expect(fruit).toBeDefined();
    expect(fruit?.name).toBe('Gomu Gomu no Mi');
    // Nothing on the result card leaks the later name.
    expect(JSON.stringify(fruit)).not.toContain('Nika');
    expect(JSON.stringify(fruit)).not.toContain('Hito Hito');

    // The true name is not a way in.
    expect(await ids('Hito Hito no Mi', 'en', cursor(100))).not.toContain(
      'devil-fruit:gomu-gomu',
    );
    // Past the reveal it is.
    expect(await ids('Hito Hito no Mi', 'en', cursor(1044))).toContain('devil-fruit:gomu-gomu');
  });

  test('the cursor never hides anything from a reader who has not set one', async () => {
    const all = await ids('nika');
    expect(all).toContain('event:nika-reveal');
    expect(all).toContain('devil-fruit:gomu-gomu');
  });

  // -------------------------------------------------------------------------
  // Result shape

  test('a result explains WHICH string matched when it is not the name', async () => {
    const view = await search('Cat Burglar', 'en');
    const nami = view.results.find((r) => r.id === 'character:nami');
    expect(nami?.name).toBe('Nami');
    expect(nami?.matched).toBe('Cat Burglar');
    expect(nami?.matchedLabel).toBe('Epithet');

    // A hit on the displayed name says nothing extra.
    const direct = await search('Nami', 'en');
    expect(direct.results.find((r) => r.id === 'character:nami')?.matched).toBeNull();
  });

  test('a result carries the type label and the same card data a listing does', async () => {
    const luffy = (await search('Luffy', 'en')).results.find((r) => r.id === 'character:luffy');
    expect(luffy?.typeLabel).toBe('Character');
    expect(luffy?.type).toBe('character');
    expect(luffy?.slug).toBe('monkey-d-luffy');
    expect(luffy?.secondary).toBe('Straw Hat'); // the card's identity line
  });
});
