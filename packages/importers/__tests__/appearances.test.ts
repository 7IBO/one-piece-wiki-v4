/**
 * Les apparitions, sur les pages RÉELLEMENT rendues (workflow
 * `fandom-render`, run 34500959677). Une fixture synthétique ne
 * prouverait que l'accord du parseur avec ce qu'on a inventé pour lui
 * — la leçon que le workflow lui-même porte en commentaire.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  type Appearance,
  parseAppearanceType,
  parseChapterAppearances,
  parseEpisodeAppearances,
} from '../src/fandom/appearances.ts';

async function fixture(name: string): Promise<string> {
  return await Bun.file(
    join(import.meta.dir, 'fixtures', 'rendered', `${name}.characters.html`),
  ).text();
}

const titles = (list: readonly Appearance[]): readonly string[] => list.map((a) => a.title);

describe('parseAppearanceType', () => {
  test('les annotations relevées sur les pages rendues', () => {
    // 21 `(flashback)` et 7 `(cover)` sur six pages.
    expect(parseAppearanceType('flashback')).toBe('flashback');
    expect(parseAppearanceType('cover')).toBe('cover_story');
    expect(parseAppearanceType('Mentioned')).toBe('mentioned');
  });

  test('une annotation composée ne garde que ce qui a un terme', () => {
    // « (flashback, as Kouzuki Momonosuke) » porte DEUX choses ;
    // « as X » n'a pas de qualificatif au schéma.
    expect(parseAppearanceType('flashback, as Kouzuki Momonosuke')).toBe('flashback');
  });

  test('une annotation inconnue ne devient pas une valeur', () => {
    expect(parseAppearanceType('as a child')).toBeNull();
    expect(parseAppearanceType('')).toBeNull();
  });
});

describe('parseChapterAppearances', () => {
  test('lit la CharTable du chapitre 1044', async () => {
    const list = parseChapterAppearances(await fixture('Chapter_1044'));
    expect(titles(list)).toContain('Monkey D. Luffy');
    expect(titles(list)).toContain('Kaidou');
    expect(titles(list)).toContain('Trafalgar D. Water Law');
    expect(list.length).toBeGreaterThan(10);
  });

  test("l'annotation (cover) devient cover_story", async () => {
    const list = parseChapterAppearances(await fixture('Chapter_1044'));
    const oven = list.find((a) => a.title === 'Charlotte Oven');
    expect(oven?.appearanceType).toBe('cover_story');
  });

  test('les colonnes et les équipages ne deviennent pas des apparitions', async () => {
    const list = parseChapterAppearances(await fixture('Chapter_1044'));
    // « Pirates » est un en-tête de colonne, « Straw Hat Pirates » un
    // sous-titre `<dt>` : ils groupent, ils n'apparaissent pas.
    expect(titles(list)).not.toContain('Pirate');
    expect(titles(list)).not.toContain('Straw Hat Pirates');
    expect(titles(list)).not.toContain('World Government');
  });

  test('un chapitre sans CharTable rend une liste vide, pas une erreur', () => {
    expect(parseChapterAppearances('<p>rien ici</p>')).toEqual([]);
  });

  test('le chapitre 1 aussi, pour ne pas prouver le parseur sur une seule page', async () => {
    const list = parseChapterAppearances(await fixture('Chapter_1'));
    expect(titles(list)).toContain('Monkey D. Luffy');
    expect(list.length).toBeGreaterThan(3);
  });
});

describe('parseEpisodeAppearances', () => {
  test("lit la liste ordonnée de l'épisode 1071", async () => {
    const list = parseEpisodeAppearances(await fixture('Episode_1071'));
    // La section s'appelle « in Order of Appearance » : le rang est
    // une donnée de la source, pas une invention du parseur.
    expect(list[0]).toMatchObject({ title: 'Monkey D. Luffy', order: 1 });
    expect(list[1]?.title).toBe('Zunesha');
    expect(list.every((a) => a.order !== undefined)).toBe(true);
  });

  test('le titre de page prime sur le libellé du lien', async () => {
    const list = parseEpisodeAppearances(await fixture('Episode_1071'));
    // Le lien affiche « Marco » mais pointe /wiki/Polo_Marco : c'est
    // la CIBLE qui identifie l'entité, pas le texte affiché.
    expect(titles(list)).toContain('Polo Marco');
    expect(titles(list)).not.toContain('Marco');
  });

  test("l'épisode 1 aussi", async () => {
    const list = parseEpisodeAppearances(await fixture('Episode_1'));
    expect(list.length).toBeGreaterThan(3);
    expect(list[0]?.order).toBe(1);
  });

  test('une page sans la section rend une liste vide', () => {
    expect(parseEpisodeAppearances('<p>rien</p>')).toEqual([]);
  });
});
