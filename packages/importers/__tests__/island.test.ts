/**
 * Island Box → `location`. Les valeurs de champ viennent des exemples
 * RÉELS relevés sur les 414 pages
 * (`docs/audits/fandom-structure-2026-08-27.json`), pas d'un cas
 * inventé : ce mapper existe pour ces formes-là.
 */
import { describe, expect, test } from 'bun:test';
import type { ParsedPage } from '../src/fandom/client.ts';
import { mapIsland, parseRegion, parseSubtype } from '../src/fandom/island.ts';
import { buildTitleIndex } from '../src/fandom/registry.ts';

const page = (title: string, body: string): ParsedPage => ({
  title,
  pageId: 1,
  wikitext: `{{Island Box\n${body}\n}}\n\nProse.`,
  url: `https://onepiece.fandom.com/wiki/${title.replace(/ /g, '_')}`,
});

const empty = { titleIndex: buildTitleIndex({ pages: [] }) };

describe('parseRegion', () => {
  test('garde la mer, jette la précision entre parenthèses', () => {
    expect(parseRegion('East Blue (Yotsuba Island Region)')).toBe('east_blue');
    expect(parseRegion('Grand Line (under the Red Line)')).toBe('grand_line');
    expect(parseRegion('New World')).toBe('new_world');
  });

  test('une région hors des neuf mers ne devient pas une valeur approchée', () => {
    expect(parseRegion('Yotsuba Island Region')).toBeNull();
    expect(parseRegion('')).toBeNull();
  });
});

describe('parseSubtype', () => {
  test('précise quand le vocabulaire a le terme', () => {
    expect(parseSubtype('Sky Island')).toBe('sky_island');
    expect(parseSubtype('Winter Island archipelago')).toBe('archipelago');
  });

  test("ce qui n'est dans aucun terme ne devient pas une valeur inventée", () => {
    // Deux valeurs réelles du relevé.
    expect(parseSubtype('Afternoon/Never-night Island')).toBeNull();
    expect(parseSubtype('Prehistoric island')).toBeNull();
  });
});

describe('mapIsland', () => {
  test('le sous-type vient du MODÈLE quand le champ ne dit rien', () => {
    const result = mapIsland(page('Gosa Village', '|jname = ゴサ村\n|rname = Gosa Mura'), empty);
    // `type` n'est rempli qu'à 15 % : transclure l'« Island Box » est
    // ce qui fait de la page une île, et c'est un fait de la source.
    expect(result?.entity.properties['location_subtype']).toEqual({ value: 'island' });
    expect(result?.entity.id).toBe('location:gosa-village');
    expect(result?.translations.ja).toEqual({ 'location.gosa-village.name': 'ゴサ村' });
  });

  test('la région entre, sa sous-région part en avertissement', () => {
    const result = mapIsland(
      page('Shimotsuki Village', '|region = [[East Blue]] (Shimotsuki Village Region)'),
      empty,
    );
    expect(result?.entity.properties['region']).toEqual({ value: 'east_blue' });
  });

  test('une région illisible ne produit pas de propriété', () => {
    const result = mapIsland(page('Nowhere', '|region = Somewhere Else'), empty);
    expect(result?.entity.properties['region']).toBeUndefined();
    expect(result?.warnings.some((w) => w.includes('hors des neuf mers'))).toBe(true);
  });

  test('la durée de Log Pose reste en prose, pas convertie en nombre', () => {
    const result = mapIsland(page('Loguetown', '|log = Less than one day'), empty);
    // Convertir « moins d'un jour » en un nombre inventerait une
    // précision que la source ne donne pas.
    expect(result?.entity.properties['log_pose_time']).toBeUndefined();
    expect(result?.warnings.some((w) => w.includes('log:'))).toBe(true);
  });

  test('la population datée dans son texte est prise, et signalée', () => {
    const result = mapIsland(
      page('Fish-Man Island', '|population = 5,000,000 (10 years ago)'),
      empty,
    );
    expect(result?.entity.properties['population']).toEqual([{ value: 5000000 }]);
    expect(result?.warnings.some((w) => w.includes('datée dans son texte'))).toBe(true);
  });

  test('une affiliation à un équipage ne devient pas une arête invalide', () => {
    // `ruled-by` va de location vers character/organization : un
    // équipage n'y est pas admis, et l'inventer casserait le corpus.
    const result = mapIsland(
      page('Whole Cake Island', '|affiliation = [[Big Mom Pirates]]'),
      {
        titleIndex: buildTitleIndex({
          pages: [{
            entityId: 'crew:big-mom-pirates',
            page: 'Big Mom Pirates',
            pageId: 2,
            redirects: [],
            lastRevId: 1,
            lastImportedAt: '',
          }],
        }),
      },
    );
    expect(result?.entity.relations).toEqual([]);
  });

  test('sans Island Box, le mapper décline', () => {
    expect(mapIsland({ ...page('X', ''), wikitext: 'juste de la prose' }, empty)).toBeNull();
  });
});
