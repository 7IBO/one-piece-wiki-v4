import type { Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * ADR-067 — unify the per-medium Japan release dates into one
 * `released_at` property carrying a `territory` qualifier.
 *
 * `published_at_jp` (manga-chapter / sbs / databook), `aired_at_jp`
 * (anime-episode / anime-special) and `released_at_jp` (film / album /
 * video-game) all expressed "first made available in Japan on date X".
 * They collapse to `released_at` with `{ territory: "jp" }`; the verb
 * (published / aired / released) is implied by the entity type.
 *
 * Returns a NEW object — the runner diffs `JSON.stringify(after)` against
 * the original, so an in-place mutation would read as "unchanged".
 */
const JP_DATE_KEYS = ['published_at_jp', 'aired_at_jp', 'released_at_jp'];

const migration: Migration = {
  id: '0002-unify-release-dates',
  description:
    'Unify published_at_jp / aired_at_jp / released_at_jp into released_at { territory: "jp" } (ADR-067).',
  up: (data) => {
    const props = data.properties as Record<string, unknown> | undefined;
    if (props === undefined) return data;
    const hit = JP_DATE_KEYS.find((key) => key in props);
    if (hit === undefined) return data;

    const nextProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (key === hit) {
        nextProps.released_at = { ...(value as Record<string, unknown>), territory: 'jp' };
      } else {
        nextProps[key] = value;
      }
    }
    return { ...data, properties: nextProps };
  },
};

export default migration;
