/**
 * Region-aware `link_template` resolution for `available-on` edges
 * (WEB_APP.md availability, ADR-090 wire semantics). Pure function so
 * the resolution table is unit-testable without the artifact:
 *
 *  1. an explicit `url` qualifier on the edge always wins;
 *  2. otherwise pick the platform's `link_template` entry whose
 *     `region` qualifier matches the reader's locale (fr → "FR"),
 *     falling back to the region-less default entry, and fill `{id}`
 *     with the edge's `external_id` qualifier;
 *  3. otherwise fall back to the platform's homepage;
 *  4. no data at all → null (the row renders without a link).
 */

export type LinkTemplateEntry = {
  readonly template: string;
  readonly region: string | null;
};

/** Locale → preferred `region` qualifier value (presentation binding). */
const REGION_BY_LOCALE: Readonly<Record<string, string>> = {
  fr: 'FR',
};

export function resolveAvailabilityUrl(input: {
  readonly locale: string;
  readonly urlOverride: string | null;
  readonly externalId: string | null;
  readonly templates: readonly LinkTemplateEntry[];
  readonly homepage: string | null;
}): string | null {
  if (input.urlOverride !== null && input.urlOverride !== '') return input.urlOverride;
  if (input.externalId !== null && input.externalId !== '') {
    const wanted = REGION_BY_LOCALE[input.locale] ?? null;
    const regional = wanted === null
      ? undefined
      : input.templates.find((t) => t.region !== null && t.region.toUpperCase() === wanted);
    const fallback = input.templates.find((t) => t.region === null);
    const chosen = regional ?? fallback ?? input.templates[0];
    if (chosen !== undefined) {
      return chosen.template.replaceAll('{id}', input.externalId);
    }
  }
  return input.homepage !== null && input.homepage !== '' ? input.homepage : null;
}
