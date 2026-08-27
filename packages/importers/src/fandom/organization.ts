/**
 * Fandom "Organization Box" → `organization` entity mapper (ADR-109).
 *
 * The survey (114 transclusions, 40 pages sampled) gives this box the
 * richest relation surface of the six: `affiliation` (the parent
 * body), `residency` (the seat), `allies` / `affiliates`. All three
 * are relations whose canonical direction starts on the organization,
 * so they are emitted as edges — `subordinate-to`, `based-in`,
 * `ally-of` — subject to the usual ledger resolution and target-type
 * check. `leader` is NOT: leadership is an incoming
 * `member-of{role}` from the character (ADR-098), so it is reported.
 *
 * `organization_type` is a REQUIRED enum with no dedicated field on
 * Fandom's side; it is inferred from `occupation`/`affiliation` prose
 * through the `org-types` vocabulary index, and every inference is
 * warned about. No match → the vocabulary's `unknown` (ADR-109).
 */
import {
  bestSince,
  type BoxMapContext,
  entityIdFor,
  IMAGE_PARAMS,
  matchVocabularyIn,
  paramReader,
  parseSourceRefs,
  PRESENTATION_PARAMS,
  readJapaneseName,
  resolveRelationParam,
  slugify,
} from './box.ts';
import type { ParsedPage } from './client.ts';
import { buildQrefTable, cleanValue, findTemplate } from './wikitext.ts';

export type OrganizationMapResult = {
  readonly entity: {
    readonly id: string;
    readonly type: 'organization';
    readonly schema_version: number;
    readonly slug: string;
    readonly canonical_name_key: string;
    readonly properties: Record<string, unknown>;
    readonly relations: readonly Record<string, unknown>[];
  };
  readonly translations: {
    readonly en: Record<string, string>;
    readonly ja?: Record<string, string>;
    readonly 'ja-latn'?: Record<string, string>;
  };
  readonly warnings: readonly string[];
};

/** Infobox template names this mapper recognises (ADR-092 analyzer). */
export const ORGANIZATION_INFOBOX_NAMES: readonly string[] = [
  'Organization Box',
  'Organizationbox',
  'Infobox organization',
];

/** Params read by {@link mapOrganization} — keep in sync with `get(...)`. */
export const ORGANIZATION_HANDLED_PARAMS: readonly string[] = [
  'name',
  'jname',
  'rname',
  'ename',
  'first',
  'affiliation',
  'occupation',
  'leader',
  'residency',
  'status',
  'bounty',
  'extra1',
  'extra1title',
  'affiliates',
  'allies',
  'transportation',
];

/** Params seen and DELIBERATELY not mapped (presentation / ADR-107 images). */
export const ORGANIZATION_IGNORED_PARAMS: readonly string[] = [
  ...PRESENTATION_PARAMS,
  ...IMAGE_PARAMS,
];

/** Every entity is at schema_version 1 since the v1 reset (ADR-115). */
export const ORGANIZATION_SCHEMA_VERSION = 1;

export function mapOrganization(
  page: ParsedPage,
  ctx: BoxMapContext = {},
): OrganizationMapResult | null {
  const box = findTemplate(page.wikitext, ...ORGANIZATION_INFOBOX_NAMES);
  if (box === null) return null;
  const get = paramReader(box.named);
  const warnings: string[] = [];
  const qrefTable = buildQrefTable(page.wikitext);

  const enName = cleanValue(get('name') ?? page.title);
  const slug = slugify(enName);
  if (slug === '') return null;
  const id = entityIdFor('organization', slug, page.title, ctx.titleIndex);
  const base = id.split(':')[1] ?? slug;

  const firstRaw = get('first');
  const debut = firstRaw === undefined ? null : bestSince(parseSourceRefs(firstRaw, qrefTable));
  if (debut === null) {
    warnings.push('no debut source in `first` — name emitted without since');
  } else {
    warnings.push(`debut ${debut}: add a features → ${id} edge on that source entity (ADR-105)`);
  }
  const since = debut !== null ? { since: debut } : {};

  const nameKey = `organization.${base}.name.common`;
  const en: Record<string, string> = { [nameKey]: enName };
  const ja: Record<string, string> = {};
  const jaLatn: Record<string, string> = {};
  const japanese = readJapaneseName(get);
  if (japanese.ja !== null) ja[nameKey] = japanese.ja;
  if (japanese.jaLatn !== null) jaLatn[nameKey] = japanese.jaLatn;

  // organization_type: required enum, no dedicated Fandom field.
  const orgTypes = ctx.vocabularies?.get('org-types');
  const typeSources = [get('occupation'), get('affiliation'), page.title]
    .filter((v): v is string => v !== undefined);
  let organizationType = 'unknown';
  if (orgTypes === undefined) {
    warnings.push('no org-types index — organization_type defaulted to unknown');
  } else {
    const hit = typeSources
      .map((source) => matchVocabularyIn(orgTypes, source))
      .find((m) => m !== null) ?? null;
    if (hit === null) {
      warnings.push(
        `organization_type not inferable from "${typeSources.map(cleanValue).join(' / ')}" — `
          + 'defaulted to unknown (the Organization Box has no type field, ADR-109)',
      );
    } else {
      organizationType = hit.value;
      warnings.push(
        `organization_type inferred as ${hit.value} from "${hit.matched}" `
          + `(${hit.exact ? 'exact' : 'keyword'} match) — verify`,
      );
    }
  }

  const properties: Record<string, unknown> = {
    name: [{ value_key: nameKey, name_type: 'common', ...since }],
    organization_type: { value: organizationType },
  };

  const relations: Record<string, unknown>[] = [];
  const edges: readonly {
    readonly param: string;
    readonly relationType: string;
    readonly targetTypes: readonly string[];
  }[] = [
    { param: 'affiliation', relationType: 'subordinate-to', targetTypes: ['crew', 'organization'] },
    { param: 'residency', relationType: 'based-in', targetTypes: ['location'] },
    {
      param: 'allies',
      relationType: 'ally-of',
      targetTypes: ['character', 'crew', 'organization'],
    },
    {
      param: 'affiliates',
      relationType: 'ally-of',
      targetTypes: ['character', 'crew', 'organization'],
    },
  ];
  const seen = new Set<string>();
  for (const edge of edges) {
    const resolved = resolveRelationParam({
      raw: get(edge.param),
      param: edge.param,
      relationType: edge.relationType,
      targetTypes: edge.targetTypes,
      ...(ctx.titleIndex !== undefined ? { titleIndex: ctx.titleIndex } : {}),
      since: debut,
    });
    warnings.push(...resolved.warnings);
    for (const r of resolved.relations) {
      const key = `${r.type}|${r.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relations.push({ ...r });
    }
  }

  const noHome: readonly (readonly [string, string])[] = [
    ['leader', 'leadership is an incoming member-of{role} on the CHARACTER (ADR-098)'],
    [
      'status',
      'the organization schema has no status/disbanded_at property (crew has disbanded_at; '
      + 'organization does not)',
    ],
    ['bounty', 'the organization schema has no total_bounty property (derivation, ADR-098)'],
    ['extra1', 'a named leadership role is member-of{role} on the CHARACTER'],
    ['extra1title', 'role label for the extra1 member'],
    ['transportation', "no relation models an organization's vehicles"],
  ];
  for (const [param, note] of noHome) {
    const raw = get(param);
    if (raw !== undefined) warnings.push(`${param}: "${cleanValue(raw)}" — ${note}`);
  }
  const enameRaw = get('ename');
  if (enameRaw !== undefined) {
    warnings.push(
      `ename dub variants "${cleanValue(enameRaw)}" — the name property has no `
        + 'translation-variant qualifier; not emitted',
    );
  }

  const translations = {
    en,
    ...(Object.keys(ja).length > 0 ? { ja } : {}),
    ...(Object.keys(jaLatn).length > 0 ? { 'ja-latn': jaLatn } : {}),
  };

  return {
    entity: {
      id,
      type: 'organization',
      schema_version: ORGANIZATION_SCHEMA_VERSION,
      slug,
      canonical_name_key: nameKey,
      properties,
      relations,
    },
    translations,
    warnings,
  };
}
