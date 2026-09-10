/**
 * Le mapper de saga et sa chaîne.
 *
 * Les valeurs des params viennent de l'inventaire relevé sur les 11
 * pages réelles (`docs/audits/fandom-structure-2026-08-27.json`) :
 * `chapter`/`vol` valent « auto » partout, `episode` tantôt « auto »
 * tantôt une plage, `date` mêle trois calendriers. Ce ne sont pas des
 * valeurs inventées pour faire passer le parseur — c'est ce que le
 * wiki écrit.
 */
import { describe, expect, it } from 'bun:test';
import type { ParsedPage } from '../src/fandom/client.ts';
import { orderSagas, type SagaChainLink } from '../src/fandom/saga-order.ts';
import { mapSaga, stripSagaSuffix } from '../src/fandom/saga.ts';

const page = (title: string, params: string): ParsedPage => ({
  title,
  pageId: 1,
  url: `https://onepiece.fandom.com/wiki/${title.replace(/ /g, '_')}`,
  wikitext: `{{Saga Box\n${params}\n}}`,
});

describe('mapSaga', () => {
  it('prend le titre de page comme identite, sans le mot « Saga »', () => {
    // Le corpus le fait deja a la main : `saga:east-blue` s'affiche
    // « East Blue ». Le mot « Saga » est le TYPE, pas le nom.
    const r = mapSaga(page('East Blue Saga', '|chapter = auto\n|vol = auto'));
    expect(r).not.toBeNull();
    expect(r!.entity.id).toBe('saga:east-blue');
    expect(r!.entity.slug).toBe('east-blue');
    expect(r!.translations.en['saga.east-blue.name']).toBe('East Blue');
  });

  it("n'invente pas d'ancre pour le nom", () => {
    // Le `since` serait le premier chapitre de la saga — justement ce
    // que `chapter = auto` ne dit pas. Mieux vaut aucune ancre.
    const r = mapSaga(page('Arabasta Saga', '|chapter = auto'));
    const names = r!.entity.properties['name'] as { since?: string; }[];
    expect(names[0]?.since).toBeUndefined();
  });

  it('signale « auto » au lieu de l ecrire comme une valeur', () => {
    // Le piege d'ADR-119 : lire le wikitexte donnerait la chaine
    // « auto » comme si c'etait une plage de chapitres.
    const r = mapSaga(page('Wano Country Saga', '|chapter = auto\n|vol = auto'));
    expect(r!.warnings.some((w) => w.startsWith('chapter:'))).toBe(true);
    expect(r!.warnings.some((w) => w.startsWith('vol:'))).toBe(true);
    expect(JSON.stringify(r!.entity.properties)).not.toContain('auto');
  });

  it('lit la chaine prev/next en retirant les wikiliens', () => {
    const r = mapSaga(
      page('Dressrosa Saga', '|prev = [[Fish-Man Island Saga]]\n|next = Whole Cake Island Saga'),
    );
    expect(r!.chain.previous).toBe('Fish-Man Island Saga');
    expect(r!.chain.next).toBe('Whole Cake Island Saga');
  });

  it('laisse `date` a la passe humaine plutot que d en tirer une date fausse', () => {
    // Valeur reelle : trois calendriers dans un champ.
    const r = mapSaga(page('Sky Island Saga', '|date = 2003-2007 (Manga) 2004-2007 (Japanese)'));
    expect(r!.warnings.some((w) => w.startsWith('date:'))).toBe(true);
    expect(r!.entity.properties['released_at']).toBeUndefined();
  });

  it('rend null sans Saga Box', () => {
    expect(mapSaga({ ...page('X', ''), wikitext: '{{Char Box|ename=X}}' })).toBeNull();
  });

  it('stripSagaSuffix ne mange pas un nom qui contient « saga » ailleurs', () => {
    expect(stripSagaSuffix('East Blue Saga')).toBe('East Blue');
    expect(stripSagaSuffix('Sagara Bay')).toBe('Sagara Bay');
  });
});

describe('orderSagas', () => {
  const link = (
    id: string,
    title: string,
    previous: string | null,
    next: string | null,
  ): SagaChainLink => ({ id, title, previous, next });

  it('numerote en suivant la chaine depuis la tete', () => {
    const out = orderSagas([
      link('saga:arabasta', 'Arabasta Saga', 'East Blue Saga', 'Sky Island Saga'),
      link('saga:east-blue', 'East Blue Saga', null, 'Arabasta Saga'),
      link('saga:sky-island', 'Sky Island Saga', 'Arabasta Saga', null),
    ]);
    expect(out.ranks).toEqual([
      { id: 'saga:east-blue', sagaNumber: 1 },
      { id: 'saga:arabasta', sagaNumber: 2 },
      { id: 'saga:sky-island', sagaNumber: 3 },
    ]);
    expect(out.unchained).toEqual([]);
  });

  it('compare les titres comme MediaWiki : underscores et casse', () => {
    const out = orderSagas([
      link('saga:east-blue', 'East Blue Saga', null, 'arabasta_saga'),
      link('saga:arabasta', 'Arabasta Saga', 'East Blue Saga', null),
    ]);
    expect(out.ranks.map((r) => r.id)).toEqual(['saga:east-blue', 'saga:arabasta']);
  });

  it('un cycle ne bloque pas la marche', () => {
    // Une chaine tiree d'un wiki ouvert n'est jamais garantie.
    const out = orderSagas([
      link('saga:a', 'A Saga', 'C Saga', 'B Saga'),
      link('saga:b', 'B Saga', 'A Saga', 'C Saga'),
      link('saga:c', 'C Saga', 'B Saga', 'A Saga'),
    ]);
    expect(out.ranks).toEqual([]);
    expect(out.warnings.some((w) => w.includes('aucune tete'))).toBe(true);
  });

  it('laisse SANS RANG ce qui est hors de la chaine', () => {
    // Un rang invente se propagerait dans la progression du lecteur,
    // qui groupe les arcs par saga. Mieux vaut un trou visible.
    const out = orderSagas([
      link('saga:east-blue', 'East Blue Saga', null, 'Arabasta Saga'),
      link('saga:arabasta', 'Arabasta Saga', 'East Blue Saga', null),
      link('saga:orpheline', 'Orpheline Saga', 'Inconnue Saga', null),
    ]);
    expect(out.ranks.map((r) => r.id)).toEqual(['saga:east-blue', 'saga:arabasta']);
    expect(out.unchained).toEqual(['saga:orpheline']);
    expect(out.warnings.some((w) => w.includes('hors de la chaine'))).toBe(true);
  });

  it('sur un run partiel, garde la marche la plus longue', () => {
    const out = orderSagas([
      link('saga:seule', 'Seule Saga', 'Absente Saga', null),
      link('saga:a', 'A Saga', 'Absente Saga', 'B Saga'),
      link('saga:b', 'B Saga', 'A Saga', null),
    ]);
    expect(out.ranks.map((r) => r.id)).toEqual(['saga:a', 'saga:b']);
  });
});
