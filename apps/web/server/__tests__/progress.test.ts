/**
 * Pure unit coverage of the spoiler-cursor primitives (cookie parsing
 * + source visibility) and the region-aware availability link
 * resolution — no artifact required.
 */
import { describe, expect, test } from 'bun:test';
import { resolveAvailabilityUrl } from '../links.ts';
import {
  EMPTY_CURSOR,
  isDepartureVisible,
  isSourceVisible,
  parseProgressCookie,
} from '../progress.ts';

describe('parseProgressCookie', () => {
  test('parses plain and URI-encoded JSON', () => {
    expect(parseProgressCookie('{"manga":1044,"anime":1071}')).toEqual({
      manga: 1044,
      anime: 1071,
    });
    expect(parseProgressCookie(encodeURIComponent('{"manga":100}'))).toEqual({
      manga: 100,
      anime: null,
    });
  });

  test('tolerates junk without throwing', () => {
    expect(parseProgressCookie(undefined)).toEqual(EMPTY_CURSOR);
    expect(parseProgressCookie('')).toEqual(EMPTY_CURSOR);
    expect(parseProgressCookie('not json')).toEqual(EMPTY_CURSOR);
    expect(parseProgressCookie('[1,2]')).toEqual({ manga: null, anime: null });
    expect(parseProgressCookie('{"manga":"x","anime":-3}')).toEqual(EMPTY_CURSOR);
  });
});

describe('isSourceVisible', () => {
  const cursor = { manga: 100, anime: 50 } as const;

  test('numeric anchors compare against their axis', () => {
    expect(isSourceVisible('manga-chapter:100', cursor)).toBe(true);
    expect(isSourceVisible('manga-chapter:101', cursor)).toBe(false);
    expect(isSourceVisible('anime-episode:50', cursor)).toBe(true);
    expect(isSourceVisible('anime-episode:51', cursor)).toBe(false);
  });

  test('missing anchors and unfilterable source types pass', () => {
    expect(isSourceVisible(null, cursor)).toBe(true);
    expect(isSourceVisible(undefined, cursor)).toBe(true);
    expect(isSourceVisible('film:red', cursor)).toBe(true);
    expect(isSourceVisible('sbs:volume-105', cursor)).toBe(true);
    // Un slug non numérique sur un axe lié reste visible : il n'y a
    // rien à comparer au curseur.
    expect(isSourceVisible('manga-chapter:special', cursor)).toBe(true);
  });

  test("un axe VIDE vaut zéro dès qu'une position est déclarée ailleurs", () => {
    // C'est la promesse du produit. Avant, un lecteur au chapitre 100
    // qui n'avait rien dit de l'anime se voyait offrir le titre de
    // l'épisode 1071 — « Luffy's Peak - Attained! Gear 5 ».
    expect(isSourceVisible('anime-episode:1071', { manga: 100, anime: null })).toBe(false);
    expect(isSourceVisible('manga-chapter:9999', { manga: null, anime: 5 })).toBe(false);
    // …et l'axe renseigné continue de filtrer normalement.
    expect(isSourceVisible('anime-episode:5', { manga: null, anime: 5 })).toBe(true);
  });

  test('sans AUCUNE position déclarée, le wiki ne filtre rien', () => {
    // Un premier visiteur n'a pas demandé à être protégé, et un site
    // vide serait le mauvais accueil.
    expect(isSourceVisible('manga-chapter:9999', EMPTY_CURSOR)).toBe(true);
    expect(isSourceVisible('anime-episode:1176', EMPTY_CURSOR)).toBe(true);
  });
});

describe('isDepartureVisible (former-member spoiler rule)', () => {
  // Membership ended at Ch. 500 — e.g. a member who left the crew.
  const departure = 'manga-chapter:500';

  test('cursor BEFORE the departure: renders as current (no spoiler)', () => {
    expect(isDepartureVisible(departure, { manga: 400, anime: null })).toBe(false);
    expect(isDepartureVisible(departure, { manga: 499, anime: null })).toBe(false);
  });

  test('cursor AT or AFTER the departure: the end is known', () => {
    expect(isDepartureVisible(departure, { manga: 500, anime: null })).toBe(true);
    expect(isDepartureVisible(departure, { manga: 600, anime: null })).toBe(true);
  });

  test('no cursor (wiki default): departures are visible', () => {
    expect(isDepartureVisible(departure, EMPTY_CURSOR)).toBe(true);
  });

  test('never-ended relations have no visible departure', () => {
    expect(isDepartureVisible(null, EMPTY_CURSOR)).toBe(false);
    expect(isDepartureVisible(null, { manga: 9999, anime: null })).toBe(false);
  });

  test('non-axis departure anchors (film, sbs) stay visible (v1 rule)', () => {
    expect(isDepartureVisible('film:red', { manga: 1, anime: null })).toBe(true);
  });
});

describe('resolveAvailabilityUrl', () => {
  const templates = [
    { template: 'https://www.amazon.com/dp/{id}', region: null },
    { template: 'https://www.amazon.fr/dp/{id}', region: 'FR' },
  ];

  test('fr locale prefers the FR-region template', () => {
    expect(
      resolveAvailabilityUrl({
        locale: 'fr',
        urlOverride: null,
        externalId: '2723488527',
        templates,
        homepage: 'https://www.amazon.fr',
      }),
    ).toBe('https://www.amazon.fr/dp/2723488527');
  });

  test('en locale falls back to the region-less default', () => {
    expect(
      resolveAvailabilityUrl({
        locale: 'en',
        urlOverride: null,
        externalId: '2723488527',
        templates,
        homepage: null,
      }),
    ).toBe('https://www.amazon.com/dp/2723488527');
  });

  test('fr locale without an FR template uses the default', () => {
    expect(
      resolveAvailabilityUrl({
        locale: 'fr',
        urlOverride: null,
        externalId: '42',
        templates: [{ template: 'https://x.example/{id}', region: null }],
        homepage: null,
      }),
    ).toBe('https://x.example/42');
  });

  test('explicit url qualifier overrides everything', () => {
    expect(
      resolveAvailabilityUrl({
        locale: 'fr',
        urlOverride: 'https://direct.example/watch',
        externalId: '42',
        templates,
        homepage: 'https://home.example',
      }),
    ).toBe('https://direct.example/watch');
  });

  test('no external id degrades to the homepage, then to null', () => {
    expect(
      resolveAvailabilityUrl({
        locale: 'en',
        urlOverride: null,
        externalId: null,
        templates,
        homepage: 'https://home.example',
      }),
    ).toBe('https://home.example');
    expect(
      resolveAvailabilityUrl({
        locale: 'en',
        urlOverride: null,
        externalId: null,
        templates: [],
        homepage: null,
      }),
    ).toBeNull();
  });
});
