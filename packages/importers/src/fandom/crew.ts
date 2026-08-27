/**
 * Fandom "Crew Box" → `crew` entity mapper (ADR-109).
 *
 * The survey (149 transclusions, 39 pages sampled) shows a box that is
 * mostly EDGES pointing the wrong way for us: `captain`, `ship` and
 * `extra1` are all relations whose canonical direction starts on the
 * OTHER entity (`member-of` is character → crew; `crewed-by` is
 * ship → crew; ADR-098 deleted `captained-by` for exactly this
 * reason). They are read and reported, never mirrored into an
 * invented crew-side relation — one home per fact (ADR-098/099).
 *
 * What the mapper does emit: the name in `en` + the `ja`/`ja-latn`
 * data locales (ADR-095), anchored on the debut source from `first`.
 */
import {
  bestSince,
  type BoxMapContext,
  entityIdFor,
  paramReader,
  parseSourceRefs,
  PRESENTATION_PARAMS,
  readJapaneseName,
  slugify,
} from './box.ts';
import type { ParsedPage } from './client.ts';
import { buildQrefTable, cleanValue, findTemplate } from './wikitext.ts';

export type CrewMapResult = {
  readonly entity: {
    readonly id: string;
    readonly type: 'crew';
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
export const CREW_INFOBOX_NAMES: readonly string[] = [
  'Crew Box',
  'Crewbox',
  'Infobox crew',
];

/** Params read by {@link mapCrew} — keep in sync with `get(...)`. */
export const CREW_HANDLED_PARAMS: readonly string[] = [
  'name',
  'jname',
  'rname',
  'ename',
  'first',
  'captain',
  'ship',
  'bounty',
  'extra1',
  'extra1title',
];

/**
 * Params seen and DELIBERATELY not mapped: template colours, and
 * `jroger` (the Jolly Roger IMAGE file — ADR-107 forbids ingesting
 * Fandom images; the `flies-flag` edge is created by the image upload
 * flow, not by an importer). `captitle` is the infobox ROW LABEL
 * ("Captain" vs "Captains"), pure presentation.
 */
export const CREW_IGNORED_PARAMS: readonly string[] = [
  ...PRESENTATION_PARAMS,
  'jroger',
  'captitle',
];

/** Current crew schema_version — keep in sync with the type. */
export const CREW_SCHEMA_VERSION = 5;

export function mapCrew(page: ParsedPage, ctx: BoxMapContext = {}): CrewMapResult | null {
  const box = findTemplate(page.wikitext, ...CREW_INFOBOX_NAMES);
  if (box === null) return null;
  const get = paramReader(box.named);
  const warnings: string[] = [];
  const qrefTable = buildQrefTable(page.wikitext);

  const enName = cleanValue(get('name') ?? page.title);
  const slug = slugify(enName);
  if (slug === '') return null;
  const id = entityIdFor('crew', slug, page.title, ctx.titleIndex);
  const base = id.split(':')[1] ?? slug;

  const firstRaw = get('first');
  const debut = firstRaw === undefined ? null : bestSince(parseSourceRefs(firstRaw, qrefTable));
  if (debut === null) {
    warnings.push('no debut source in `first` — name emitted without since');
  } else {
    warnings.push(
      `debut ${debut}: add a features → ${id} edge on that source entity (ADR-105)`,
    );
  }
  const since = debut !== null ? { since: debut } : {};

  const nameKey = `crew.${base}.name.common`;
  const en: Record<string, string> = { [nameKey]: enName };
  const ja: Record<string, string> = {};
  const jaLatn: Record<string, string> = {};
  const japanese = readJapaneseName(get);
  if (japanese.ja !== null) ja[nameKey] = japanese.ja;
  if (japanese.jaLatn !== null) jaLatn[nameKey] = japanese.jaLatn;

  // Every remaining param is a fact whose home is on another entity,
  // or one the crew schema has no room for. Reported, never invented.
  const elsewhere: readonly (readonly [string, string])[] = [
    [
      'captain',
      'a captain is an incoming member-of{role: captain} on the CHARACTER (ADR-098 removed '
      + 'captained-by)',
    ],
    ['ship', 'the crewed-by edge is stored on the SHIP entity (ship → crew)'],
    [
      'extra1',
      'a named leadership role is member-of{role} on the CHARACTER; `extra1title` names the role',
    ],
    [
      'bounty',
      "the crew schema has no total_bounty property — it is the sum of the members' bounties "
      + '(derivation, left open by ADR-098)',
    ],
  ];
  for (const [param, note] of elsewhere) {
    const raw = get(param);
    if (raw !== undefined) warnings.push(`${param}: "${cleanValue(raw)}" — ${note}`);
  }
  const extraTitle = get('extra1title');
  if (extraTitle !== undefined) {
    warnings.push(`extra1title: "${cleanValue(extraTitle)}" — role label for the extra1 member`);
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
      type: 'crew',
      schema_version: CREW_SCHEMA_VERSION,
      slug,
      canonical_name_key: nameKey,
      properties: { name: [{ value_key: nameKey, name_type: 'common', ...since }] },
      relations: [],
    },
    translations,
    warnings,
  };
}
