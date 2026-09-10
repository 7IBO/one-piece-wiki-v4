/**
 * Fandom « Island Box » → entité `location`.
 *
 * **414 pages, la plus grosse boîte sans mapper de tout l'inventaire**
 * (`docs/FANDOM_ENTITY_STRUCTURE.md`). Et la mesure qui décide de sa
 * priorité n'est pas ce chiffre : c'est que les 451 personnages
 * importés portent **6 relations à eux tous**, parce que `origin`
 * (89 % des Char Box) et `residence` (62 %) pointent des lieux qui
 * n'existent pas encore. Importer les lieux débloque les personnages.
 *
 * Inventaire relevé sur les 414 pages :
 *
 *   colorscheme 100 %   présentation (ADR-109) — ignoré
 *   first       100 %   Qref de début
 *   jname       100 %   nom japonais
 *   rname       100 %   romanisation
 *   region       85 %   « East Blue (Yotsuba Island Region) »
 *   ename        75 %   variantes de doublage
 *   affiliation  30 %   équipage / organisation qui la tient
 *   image        17 %   hors périmètre (ADR-107)
 *   type         15 %   « Afternoon/Never-night Island », « Prehistoric island »
 *   log          10 %   « Less than one day », « Half a day »
 *   population    5 %   « 5,000,000 (10 years ago) »
 *
 * Trois décisions portent ce mapper.
 *
 * **`location_subtype` est requis et `type` n'est rempli qu'à 15 %.**
 * Le sous-type ne vient donc PAS de ce champ : il vient du modèle
 * lui-même. Une page qui transclut l'« Island Box » EST une île —
 * c'est un fait porté par la source, pas une supposition. Le champ
 * `type` reste lu quand il précise mieux (`sky_island`…).
 *
 * **`region` mélange deux niveaux** : « East Blue (Yotsuba Island
 * Region) » nomme la mer PUIS la sous-région. Seule la mer entre dans
 * l'énumération `location-regions` ; la parenthèse est une précision
 * (ADR-124) et part en avertissement plutôt qu'en valeur fausse.
 *
 * **`population` est daté dans son propre texte** (« 5 000 000 (il y a
 * 10 ans) »). La propriété est historisée : sans ancre lisible, on
 * prend le nombre nu et on signale la datation.
 */
import { stripParentheticals } from '../slug.ts';
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
import { buildQrefTable, cleanValue, findTemplate, parseLooseNumber } from './wikitext.ts';

export type IslandMapResult = {
  readonly entity: {
    readonly id: string;
    readonly type: 'location';
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

/** Noms d'infobox reconnus (analyseur ADR-092). */
export const ISLAND_INFOBOX_NAMES: readonly string[] = [
  'Island Box',
  'Islandbox',
  'Island box',
  'Infobox island',
];

/** Params lus par {@link mapIsland} — à garder en phase avec `get(...)`. */
export const ISLAND_HANDLED_PARAMS: readonly string[] = [
  'name',
  'jname',
  'rname',
  'ename',
  'first',
  'region',
  'affiliation',
  'type',
  'log',
  'population',
];

/**
 * Params vus et DÉLIBÉRÉMENT non mappés. `extra1`/`extra1title` sont
 * une paire libellé/valeur libre du modèle : ce que le wiki n'a pas su
 * ranger, nous ne saurons pas le ranger non plus depuis une infobox.
 */
export const ISLAND_IGNORED_PARAMS: readonly string[] = [
  ...PRESENTATION_PARAMS,
  ...IMAGE_PARAMS,
  'extra1',
  'extra1title',
];

/** Toutes les entités sont en schema_version 1 depuis le reset v1 (ADR-115). */
export const LOCATION_SCHEMA_VERSION = 1;

/**
 * La mer d'une valeur de `region`, quand elle en nomme une.
 *
 * Le champ dit « East Blue (Yotsuba Island Region) » ou « Grand Line
 * (under the Red Line) » : la mer, puis une précision entre
 * parenthèses. On ne garde que la mer, et seulement si elle figure au
 * vocabulaire — un lieu hors des neuf mers connues n'a pas de région,
 * plutôt qu'une région approchée.
 */
export function parseRegion(raw: string): string | null {
  const head = cleanValue(raw).split('(')[0] ?? '';
  const key = head.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return LOCATION_REGIONS.has(key) ? key : null;
}

/** Le vocabulaire `location-regions`, redit ici : un mapper ne lit pas le schéma. */
const LOCATION_REGIONS: ReadonlySet<string> = new Set([
  'east_blue',
  'west_blue',
  'north_blue',
  'south_blue',
  'grand_line',
  'paradise',
  'new_world',
  'calm_belt',
  'red_line',
]);

/**
 * Le sous-type, quand le champ `type` en nomme un que nous connaissons.
 *
 * Il ne remplace pas `island` : il le PRÉCISE. « Sky Island » est une
 * île du ciel, « Prehistoric island » reste une île. Ce qui ne tombe
 * dans aucun terme du vocabulaire ne devient pas une valeur inventée.
 */
export function parseSubtype(raw: string): string | null {
  const text = cleanValue(raw).toLowerCase();
  for (const [needle, subtype] of SUBTYPE_HINTS) {
    if (text.includes(needle)) return subtype;
  }
  return null;
}

/** Indices → terme de `location-subtypes`, du plus précis au plus général. */
const SUBTYPE_HINTS: readonly (readonly [string, string])[] = [
  ['sky island', 'sky_island'],
  ['floating', 'floating_island'],
  ['ghost', 'ghost_island'],
  ['undersea', 'undersea'],
  ['archipelago', 'archipelago'],
  ['kingdom', 'kingdom'],
];

export function mapIsland(page: ParsedPage, ctx: BoxMapContext = {}): IslandMapResult | null {
  const box = findTemplate(page.wikitext, ...ISLAND_INFOBOX_NAMES);
  if (box === null) return null;
  const get = paramReader(box.named);
  const warnings: string[] = [];
  const qrefTable = buildQrefTable(page.wikitext);

  const enName = cleanValue(get('name') ?? page.title);
  const slug = slugify(enName);
  if (slug === '' || isPlaceholderName(enName)) return null;
  const id = entityIdFor('location', slug, page.title, ctx.titleIndex);
  const base = id.split(':')[1] ?? slug;

  const firstRaw = get('first');
  const debut = firstRaw === undefined ? null : bestSince(parseSourceRefs(firstRaw, qrefTable));
  if (debut === null) warnings.push('no debut source in `first` — name emitted without since');
  const since = debut !== null ? { since: debut } : {};

  const nameKey = `location.${base}.name`;
  const en: Record<string, string> = { [nameKey]: enName };
  const ja: Record<string, string> = {};
  const jaLatn: Record<string, string> = {};
  const japanese = readJapaneseName(get);
  if (japanese.ja !== null) ja[nameKey] = japanese.ja;
  if (japanese.jaLatn !== null) jaLatn[nameKey] = japanese.jaLatn;

  // Le sous-type vient du MODÈLE, pas du champ : transclure l'« Island
  // Box » est ce qui fait de la page une île. `type` ne fait que
  // préciser, quand il nomme un terme du vocabulaire.
  const typeRaw = get('type');
  const precised = typeRaw === undefined ? null : parseSubtype(typeRaw);
  if (typeRaw !== undefined && precised === null) {
    warnings.push(
      `type: "${cleanValue(typeRaw)}" — aucun terme de location-subtypes, reste island`,
    );
  }
  const properties: Record<string, unknown> = {
    name: [{ value_key: nameKey, ...since }],
    location_subtype: { value: precised ?? 'island' },
  };

  const regionRaw = get('region');
  if (regionRaw !== undefined) {
    const region = parseRegion(regionRaw);
    if (region !== null) properties['region'] = { value: region };
    else warnings.push(`region: "${cleanValue(regionRaw)}" — hors des neuf mers du vocabulaire`);
  }

  const logRaw = get('log');
  if (logRaw !== undefined) {
    // `log_pose_time` est un nombre (de jours) ; « Less than one day »
    // et « Half a day » sont de la prose. On ne convertit pas une
    // approximation en nombre : ce serait inventer une précision.
    warnings.push(`log: "${cleanValue(logRaw)}" — prose, log_pose_time attend un nombre de jours`);
  }

  const populationRaw = get('population');
  if (populationRaw !== undefined) {
    const text = cleanValue(populationRaw);
    // « 5,000,000 (10 years ago) » : `parseLooseNumber` refuse a juste
    // titre de deviner. La parenthese porte une DATE, pas le nombre —
    // meme regle qu'ADR-124, et elle a deja une maison.
    const dated = /\(/.test(text);
    const value = parseLooseNumber(stripParentheticals(text));
    if (value !== null) {
      properties['population'] = [{ value, ...since }];
      if (dated) {
        warnings.push(
          `population: "${text}" — datée dans son texte, ancrée au début faute de mieux`,
        );
      }
    } else warnings.push(`population: "${text}" — illisible comme nombre`);
  }

  // `affiliation` sur un lieu nomme qui le tient. La direction
  // canonique est lieu → détenteur, et `ruled-by` n'accepte que
  // `character` et `organization` : une affiliation à un ÉQUIPAGE n'a
  // pas d'arête au schéma et repart en avertissement plutôt qu'en
  // arête invalide.
  const affiliation = resolveRelationParam({
    raw: get('affiliation'),
    param: 'affiliation',
    relationType: 'ruled-by',
    targetTypes: ['organization', 'character'],
    ...(ctx.titleIndex !== undefined ? { titleIndex: ctx.titleIndex } : {}),
    since: debut,
  });
  warnings.push(...affiliation.warnings);

  const enameRaw = get('ename');
  if (enameRaw !== undefined) {
    warnings.push(
      `ename dub variants "${cleanValue(enameRaw)}" — la propriété name n'a pas de `
        + 'qualificatif de variante de traduction ; non émis',
    );
  }

  return {
    entity: {
      id,
      type: 'location',
      schema_version: LOCATION_SCHEMA_VERSION,
      slug,
      canonical_name_key: nameKey,
      properties,
      relations: [...affiliation.relations],
    },
    translations: {
      en,
      ...(Object.keys(ja).length > 0 ? { ja } : {}),
      ...(Object.keys(jaLatn).length > 0 ? { 'ja-latn': jaLatn } : {}),
    },
    warnings,
  };
}
