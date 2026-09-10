/**
 * Fandom « Saga Box » → entité `saga`.
 *
 * Inventaire des champs relevé sur les 11 pages réelles
 * (`docs/audits/fandom-structure-2026-08-27.json`) :
 *
 *   chapter   100 %   toujours « auto »
 *   vol       100 %   toujours « auto »
 *   episode   100 %   tantôt « auto », tantôt « 1-61, 61 episodes; … »
 *   date      100 %   multi-valué et mêlé (manga, japonais, doublage)
 *   next       91 %   titre de la saga suivante
 *   prev       91 %   titre de la saga précédente
 *   liveact    18 %
 *
 * Deux conséquences décident de ce que ce mapper fait, et surtout de ce
 * qu'il ne fait pas :
 *
 * - **`chapter` et `vol` valent « auto ».** La valeur est calculée par
 *   un module Lua à l'expansion du modèle et n'existe pas dans le
 *   wikitexte (ADR-119, le même piège que les arcs). Les lire ici
 *   produirait la chaîne « auto » ; il faut la page RENDUE.
 * - **`date` mélange trois calendriers** dans un seul champ. Une
 *   propriété `released_at` en sortirait fausse une fois sur deux, donc
 *   elle reste un avertissement pour la passe humaine.
 *
 * Ce qui est sûr et suffisant : le NOM et la CHAÎNE. Le rang
 * (`saga_number`) ne se déduit pas d'une page isolée — voir
 * `orderSagas` dans `saga-order.ts`.
 */
import { isPlaceholderName, slugify } from './box.ts';
import type { ParsedPage } from './client.ts';
import { cleanValue, findTemplate } from './wikitext.ts';

export type SagaMapResult = {
  readonly entity: {
    readonly id: string;
    readonly type: 'saga';
    readonly schema_version: number;
    readonly slug: string;
    readonly canonical_name_key: string;
    readonly properties: Record<string, unknown>;
    readonly relations: readonly Record<string, unknown>[];
  };
  readonly translations: { readonly en: Record<string, string>; };
  /** Maillon de chaîne, consommé par `orderSagas`. */
  readonly chain: {
    readonly previous: string | null;
    readonly next: string | null;
  };
  readonly warnings: readonly string[];
};

/** Noms d'infobox que ce mapper reconnaît (analyseur ADR-092). */
export const SAGA_INFOBOX_NAMES: readonly string[] = ['Saga Box', 'Sagabox', 'Saga box'];

/** Params lus ou délibérément signalés (inventaire ADR-092). */
export const SAGA_HANDLED_PARAMS: readonly string[] = [
  'prev',
  'next',
  'chapter',
  'vol',
  'episode',
  'date',
  'liveact',
];

/** Toutes les entités sont en schema_version 1 depuis le reset v1 (ADR-115). */
export const SAGA_SCHEMA_VERSION = 1;

/**
 * « East Blue Saga » → « East Blue ».
 *
 * Le corpus le fait déjà à la main : `saga:east-blue` s'affiche
 * « East Blue ». Le mot « Saga » est le TYPE, il est déjà porté par
 * l'id et par le libellé du type ; le répéter dans le nom donnerait
 * « Saga · East Blue Saga » partout où les deux se côtoient.
 */
export function stripSagaSuffix(title: string): string {
  return title.replace(/\s+saga\s*$/i, '').trim();
}

/** Le titre nu d'un `prev`/`next`, sans wikilien ni décoration. */
function chainTitle(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const cleaned = cleanValue(raw.replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, '$1'));
  return cleaned === '' ? null : cleaned;
}

export function mapSaga(page: ParsedPage): SagaMapResult | null {
  const box = findTemplate(page.wikitext, ...SAGA_INFOBOX_NAMES);
  if (box === null) return null;

  const warnings: string[] = [];
  const get = (key: string): string | undefined => {
    const v = box.named[key];
    return v !== undefined && v.trim() !== '' ? v : undefined;
  };

  // Le titre de page EST l'identité : le Saga Box ne porte aucun
  // `ename`, contrairement au Char Box.
  const name = stripSagaSuffix(cleanValue(page.title));
  const slug = slugify(name);
  if (slug === '' || isPlaceholderName(name)) return null;
  const id = `saga:${slug}`;

  const nameKey = `saga.${slug}.name`;
  const properties: Record<string, unknown> = {
    // Pas de `since` : l'ancre serait le premier chapitre de la saga,
    // qui n'est justement pas lisible dans le wikitexte (`chapter =
    // auto`). Mieux vaut aucune ancre qu'une fausse.
    name: [{ value_key: nameKey }],
  };

  for (
    const [param, why] of [
      ['chapter', 'calcule par le modele (« auto ») — lire la page rendue'],
      ['vol', 'calcule par le modele (« auto ») — lire la page rendue'],
    ] as const
  ) {
    if (get(param) !== undefined) warnings.push(`${param}: ${why}`);
  }

  const episode = get('episode');
  if (episode !== undefined && cleanValue(episode).toLowerCase() !== 'auto') {
    warnings.push(`episode: "${cleanValue(episode)}" — plage a rapprocher des episodes du corpus`);
  }

  const date = get('date');
  if (date !== undefined) {
    warnings.push(
      `date: "${cleanValue(date).slice(0, 60)}" — trois calendriers dans un champ, passe humaine`,
    );
  }

  return {
    entity: {
      id,
      type: 'saga',
      schema_version: SAGA_SCHEMA_VERSION,
      slug,
      canonical_name_key: nameKey,
      properties,
      relations: [],
    },
    translations: { en: { [nameKey]: name } },
    chain: { previous: chainTitle(get('prev')), next: chainTitle(get('next')) },
    warnings,
  };
}
