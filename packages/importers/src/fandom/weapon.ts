/**
 * Fandom "Weapon Box" → `weapon` entity mapper (ADR-109).
 *
 * The survey (112 transclusions, 40 pages sampled) shows `type` as
 * free English prose ("Single-edged greatsword; Black Blade") rather
 * than an enum, so `weapon_type` — a REQUIRED enum — is resolved
 * through the `weapon-types` vocabulary index with a whole-word pass
 * and a warning on every non-exact hit; no match falls back to the
 * `unknown` value added by ADR-109. The same segment list also feeds
 * the orthogonal `is_black_blade` boolean (ADR-040).
 *
 * `grade` maps onto the Meitō tiers of `weapon-grades`. `owner` is a
 * `wikilink_list` but the canonical direction is `wields-weapon`
 * (character → weapon), so it is reported rather than mirrored — the
 * weapon side owns only `forged-by` (the smith), which this box does
 * not carry.
 */
import {
  bestSince,
  type BoxMapContext,
  entityIdFor,
  IMAGE_PARAMS,
  isPlaceholderName,
  matchVocabularyIn,
  paramReader,
  parseSourceRefs,
  PRESENTATION_PARAMS,
  readJapaneseName,
  slugify,
  splitSegments,
} from './box.ts';
import type { ParsedPage } from './client.ts';
import { buildQrefTable, cleanValue, findTemplate } from './wikitext.ts';

export type WeaponMapResult = {
  readonly entity: {
    readonly id: string;
    readonly type: 'weapon';
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
export const WEAPON_INFOBOX_NAMES: readonly string[] = [
  'Weapon Box',
  'Weaponbox',
  'Infobox weapon',
];

/** Params read by {@link mapWeapon} — keep in sync with `get(...)`. */
export const WEAPON_HANDLED_PARAMS: readonly string[] = [
  'name',
  'jname',
  'rname',
  'ename',
  'first',
  'type',
  'grade',
  'owner',
  'meaning',
  'price',
];

/** Params seen and DELIBERATELY not mapped (presentation / ADR-107 images). */
export const WEAPON_IGNORED_PARAMS: readonly string[] = [
  ...PRESENTATION_PARAMS,
  ...IMAGE_PARAMS,
];

/** Every entity is at schema_version 1 since the v1 reset (ADR-115). */
export const WEAPON_SCHEMA_VERSION = 1;

export function mapWeapon(page: ParsedPage, ctx: BoxMapContext = {}): WeaponMapResult | null {
  const box = findTemplate(page.wikitext, ...WEAPON_INFOBOX_NAMES);
  if (box === null) return null;
  const get = paramReader(box.named);
  const warnings: string[] = [];
  const qrefTable = buildQrefTable(page.wikitext);

  const enName = cleanValue(get('name') ?? page.title);
  const slug = slugify(enName);
  // A template placeholder is not a thing (see isPlaceholderName).
  if (slug === '' || isPlaceholderName(enName)) return null;
  const id = entityIdFor('weapon', slug, page.title, ctx.titleIndex);
  const base = id.split(':')[1] ?? slug;

  const firstRaw = get('first');
  const debut = firstRaw === undefined ? null : bestSince(parseSourceRefs(firstRaw, qrefTable));
  if (debut === null) {
    warnings.push('no debut source in `first` — entries emitted without since');
  } else {
    warnings.push(`debut ${debut}: add a features → ${id} edge on that source entity (ADR-105)`);
  }
  const since = debut !== null ? { since: debut } : {};

  const nameKey = `weapon.${base}.name.common`;
  const en: Record<string, string> = { [nameKey]: enName };
  const ja: Record<string, string> = {};
  const jaLatn: Record<string, string> = {};
  const japanese = readJapaneseName(get);
  if (japanese.ja !== null) ja[nameKey] = japanese.ja;
  if (japanese.jaLatn !== null) jaLatn[nameKey] = japanese.jaLatn;

  const names: Record<string, unknown>[] = [{ value_key: nameKey, name_type: 'common', ...since }];
  const meaningRaw = get('meaning');
  if (meaningRaw !== undefined) {
    const meaning = cleanValue(meaningRaw);
    if (meaning !== '') {
      const key = `weapon.${base}.name.literal-meaning`;
      en[key] = meaning;
      names.push({ value_key: key, name_type: 'literal_meaning', ...since });
    }
  }

  const properties: Record<string, unknown> = { name: names };

  // weapon_type: required enum, sourced from prose.
  const weaponTypes = ctx.vocabularies?.get('weapon-types');
  const typeRaw = get('type');
  let weaponType = 'unknown';
  if (weaponTypes === undefined) {
    warnings.push('no weapon-types index — weapon_type defaulted to unknown');
  } else if (typeRaw === undefined) {
    warnings.push('no `type` param — weapon_type defaulted to unknown');
  } else {
    const hit = matchVocabularyIn(weaponTypes, typeRaw);
    if (hit === null) {
      warnings.push(
        `weapon_type not inferable from "${cleanValue(typeRaw)}" — defaulted to unknown`,
      );
    } else {
      weaponType = hit.value;
      if (!hit.exact) {
        warnings.push(`weapon_type "${hit.matched}" matched ${hit.value} by keyword — verify`);
      }
    }
  }
  properties['weapon_type'] = { value: weaponType };

  // "Black Blade" travels in the same `type` list but is an
  // orthogonal boolean since ADR-040.
  if (typeRaw !== undefined && splitSegments(typeRaw).some((s) => /black\s+blade/i.test(s))) {
    properties['is_black_blade'] = [{ value: true, ...since }];
  }

  const gradeRaw = get('grade');
  if (gradeRaw !== undefined) {
    const grades = ctx.vocabularies?.get('weapon-grades');
    const hit = grades === undefined ? null : matchVocabularyIn(grades, gradeRaw);
    if (hit === null) {
      warnings.push(`unmapped weapon grade "${cleanValue(gradeRaw)}" — not emitted`);
    } else {
      properties['weapon_grade'] = { value: hit.value };
      if (!hit.exact) {
        warnings.push(`weapon_grade "${hit.matched}" matched ${hit.value} by keyword — verify`);
      }
    }
  }

  const ownerRaw = get('owner');
  if (ownerRaw !== undefined) {
    warnings.push(
      `owner: "${cleanValue(ownerRaw)}" — the wields-weapon edge is stored on the CHARACTER `
        + '(character → weapon); the weapon side owns only forged-by (the smith)',
    );
  }
  const priceRaw = get('price');
  if (priceRaw !== undefined) {
    warnings.push(`price: "${cleanValue(priceRaw)}" — the weapon schema has no price property`);
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
      type: 'weapon',
      schema_version: WEAPON_SCHEMA_VERSION,
      slug,
      canonical_name_key: nameKey,
      properties,
      relations: [],
    },
    translations,
    warnings,
  };
}
