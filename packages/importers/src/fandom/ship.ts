/**
 * Fandom "Ship Box" → `ship` entity mapper (ADR-109).
 *
 * The survey (141 transclusions, 40 pages sampled) found NO field
 * carrying the vessel's class, while `ship.ship_type` is a REQUIRED
 * enum: every import therefore lands on the `unknown` value of
 * `ship-types` (added by ADR-109 for exactly this) plus a warning.
 * That is the honest outcome — inventing a class from the ship's
 * silhouette is not something a deterministic mapper may do.
 *
 * `affiliation` is the one wikilink param whose canonical direction
 * starts here: `crewed-by` is ship → crew. `height`/`length` (the
 * vessel's dimensions) and `birthday`/`jva`/`Funi eva` (the ship's
 * klabautermann as an anime character) have no home in the ship
 * schema and are reported, not squeezed into a neighbouring property.
 */
import {
  bestSince,
  type BoxMapContext,
  entityIdFor,
  IMAGE_PARAMS,
  isPlaceholderName,
  paramReader,
  parseSourceRefs,
  PRESENTATION_PARAMS,
  readJapaneseName,
  resolveRelationParam,
  slugify,
} from './box.ts';
import type { ParsedPage } from './client.ts';
import { buildQrefTable, cleanValue, findTemplate } from './wikitext.ts';

export type ShipMapResult = {
  readonly entity: {
    readonly id: string;
    readonly type: 'ship';
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
export const SHIP_INFOBOX_NAMES: readonly string[] = [
  'Ship Box',
  'Shipbox',
  'Infobox ship',
];

/** Params read by {@link mapShip} — keep in sync with `get(...)`. */
export const SHIP_HANDLED_PARAMS: readonly string[] = [
  'name',
  'jname',
  'rname',
  'ename',
  'first',
  'affiliation',
  'height',
  'length',
  'birthday',
  'jva',
  'Funi eva',
];

/**
 * Params seen and DELIBERATELY not mapped. `status` is NOT a lifecycle
 * status: the survey shows `1`/`2`/`unknown`, i.e. the template's
 * own display switch (like `switchAM`, which picks the anime or manga
 * image). Images are never ingested (ADR-107).
 */
export const SHIP_IGNORED_PARAMS: readonly string[] = [
  ...PRESENTATION_PARAMS,
  ...IMAGE_PARAMS,
  'status',
];

/** Every entity is at schema_version 1 since the v1 reset (ADR-115). */
export const SHIP_SCHEMA_VERSION = 1;

export function mapShip(page: ParsedPage, ctx: BoxMapContext = {}): ShipMapResult | null {
  const box = findTemplate(page.wikitext, ...SHIP_INFOBOX_NAMES);
  if (box === null) return null;
  const get = paramReader(box.named);
  const warnings: string[] = [];
  const qrefTable = buildQrefTable(page.wikitext);

  const enName = cleanValue(get('name') ?? page.title);
  const slug = slugify(enName);
  // A template placeholder is not a thing (see isPlaceholderName).
  if (slug === '' || isPlaceholderName(enName)) return null;
  const id = entityIdFor('ship', slug, page.title, ctx.titleIndex);
  const base = id.split(':')[1] ?? slug;

  const firstRaw = get('first');
  const debut = firstRaw === undefined ? null : bestSince(parseSourceRefs(firstRaw, qrefTable));
  if (debut === null) {
    warnings.push('no debut source in `first` — name emitted without since');
  } else {
    warnings.push(`debut ${debut}: add a features → ${id} edge on that source entity (ADR-105)`);
  }
  const since = debut !== null ? { since: debut } : {};

  const nameKey = `ship.${base}.name.common`;
  const en: Record<string, string> = { [nameKey]: enName };
  const ja: Record<string, string> = {};
  const jaLatn: Record<string, string> = {};
  const japanese = readJapaneseName(get);
  if (japanese.ja !== null) ja[nameKey] = japanese.ja;
  if (japanese.jaLatn !== null) jaLatn[nameKey] = japanese.jaLatn;

  // ship_type is required and the box has no source for it.
  warnings.push(
    'ship_type defaulted to unknown — the Ship Box carries no vessel class (schema gap, ADR-109)',
  );
  const properties: Record<string, unknown> = {
    name: [{ value_key: nameKey, name_type: 'common', ...since }],
    ship_type: { value: 'unknown' },
  };

  const affiliation = resolveRelationParam({
    raw: get('affiliation'),
    param: 'affiliation',
    relationType: 'crewed-by',
    targetTypes: ['crew'],
    ...(ctx.titleIndex !== undefined ? { titleIndex: ctx.titleIndex } : {}),
    since: debut,
  });
  warnings.push(...affiliation.warnings);

  const noHome: readonly (readonly [string, string])[] = [
    ['height', 'the ship schema has no dimension property (height/length)'],
    ['length', 'the ship schema has no dimension property (height/length)'],
    ['birthday', "a birthday belongs to the ship's klabautermann, not to the vessel"],
    ['jva', 'voice actor → a person entity + voiced-by on the klabautermann character'],
    ['Funi eva', 'EN-dub voice actor → a person entity + voiced-by on the klabautermann character'],
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
      type: 'ship',
      schema_version: SHIP_SCHEMA_VERSION,
      slug,
      canonical_name_key: nameKey,
      properties,
      relations: [...affiliation.relations],
    },
    translations,
    warnings,
  };
}
