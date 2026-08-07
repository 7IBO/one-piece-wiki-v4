/**
 * Fandom "Episode Box" → `anime-episode` entity mapper (ADR-079).
 * Param names verified against the live API (2026-06-14): the ordinal
 * is literally `#`; titles come as `Translation` (EN) / `Kanji` /
 * `Romaji`; dub airdates as `funiAirdate` / `crunchyAirdate` (the JP
 * airdate is not in section 0 — same required-field caveat as the
 * chapter mapper's release date); staff come as one name-template per
 * role (`Screen`/`Art`/`Ad`/`Ed`) and are surfaced as warnings until
 * the `person` entities + `staffed-by` emit path lands.
 *
 * NB: the infobox `rating` is the Japanese viewership share (e.g.
 * 3.9%), NOT the `tv_rating` content rating — deliberately not mapped.
 */
import type { ParsedPage } from './client.ts';
import { cleanValue, findTemplate, parseLooseNumber } from './wikitext.ts';

export type EpisodeMapResult = {
  readonly entity: {
    readonly id: string;
    readonly type: 'anime-episode';
    readonly schema_version: number;
    readonly slug: string;
    readonly properties: Record<string, unknown>;
    readonly relations: readonly Record<string, unknown>[];
  };
  readonly translations: { readonly en: Record<string, string>; };
  readonly warnings: readonly string[];
};

const INFOBOX_NAMES = ['Episode Box', 'Episodebox', 'Infobox episode'];

/** Current anime-episode schema_version — keep in sync with the type. */
export const ANIME_EPISODE_SCHEMA_VERSION = 3;

export function mapEpisode(page: ParsedPage): EpisodeMapResult | null {
  const box = findTemplate(page.wikitext, ...INFOBOX_NAMES);
  if (box === null) return null;

  const warnings: string[] = [];
  const get = (...keys: readonly string[]): string | undefined => {
    for (const k of keys) {
      const v = box.named[k];
      if (v !== undefined && v.trim() !== '') return v;
    }
    return undefined;
  };

  const fromTitle = /^Episode\s+(\d+)$/i.exec(page.title.trim());
  const numberRaw = fromTitle?.[1] ?? get('#', 'number', 'episode');
  const number = numberRaw === undefined ? null : parseLooseNumber(numberRaw);
  if (number === null) return null;

  const properties: Record<string, unknown> = {
    number: { value: number },
    title_key: { value_key: `anime-episode.${number}.title` },
  };
  const translations: Record<string, string> = {};

  const enTitle = get('Translation', 'translation', 'entitle');
  if (enTitle !== undefined) {
    translations[`anime-episode.${number}.title`] = cleanValue(enTitle);
  } else warnings.push('no Translation title in infobox');

  warnings.push(
    'no JP airdate in the infobox (required released_at — supply from the episode list or manually)',
  );

  for (const role of ['Screen', 'Art', 'Ad', 'Ed'] as const) {
    const v = get(role);
    if (v !== undefined) {
      warnings.push(
        `staff ${role}: "${
          v.replace(/[{}]/g, '').trim()
        }" — needs a person entity + staffed-by (not auto-emitted)`,
      );
    }
  }

  return {
    entity: {
      id: `anime-episode:${number}`,
      type: 'anime-episode',
      schema_version: ANIME_EPISODE_SCHEMA_VERSION,
      slug: `episode-${number}`,
      properties,
      relations: [],
    },
    translations: { en: translations },
    warnings,
  };
}
