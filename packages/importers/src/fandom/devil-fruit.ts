/**
 * Fandom "Devil Fruit Box" → `devil-fruit` entity mapper (ADR-109).
 *
 * Field handling follows the 2026-08-27 structural survey
 * (`docs/audits/fandom-structure-2026-08-27.md`, 211 transclusions,
 * 40 pages sampled), which classified every param by value shape:
 *
 *  - `jname` (template `{{Ruby}}`) / `rname` → the `ja` / `ja-latn`
 *    data locales of ADR-095, i.e. TRANSLATIONS of `name`, never a
 *    second string property;
 *  - `first` (`wikilink_list`) → the debut source, which the corpus
 *    stores as the `since` axis of the first `name`/`classification`
 *    values (cf. `devil-fruit:gomu-gomu`). It is deliberately NOT a
 *    property: the appearance EDGE is `features`, whose canonical
 *    direction is `manga-chapter → devil-fruit` (ADR-033/105), so it
 *    belongs on the chapter file, not here — surfaced as a warning;
 *  - `user` (`wikilink_list`) → `held-by` edges (the one relation of
 *    this shape whose canonical direction starts at the fruit);
 *  - `type` (`template`, 4 distinct) → the `devil-fruit-classifications`
 *    vocabulary;
 *  - `meaning` → a `name` entry typed `literal_meaning` (ADR-038);
 *  - `backcolor`/`textcolor`/`image`/`title` → presentation or image,
 *    explicitly ignored (ADR-107 for images).
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
  splitSegments,
} from './box.ts';
import type { ParsedPage } from './client.ts';
import { buildQrefTable, cleanValue, findTemplate } from './wikitext.ts';

export type DevilFruitMapResult = {
  readonly entity: {
    readonly id: string;
    readonly type: 'devil-fruit';
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
export const DEVIL_FRUIT_INFOBOX_NAMES: readonly string[] = [
  'Devil Fruit Box',
  'Devilfruitbox',
  'Infobox devil fruit',
];

/** Params read by {@link mapDevilFruit} — keep in sync with `get(...)`. */
export const DEVIL_FRUIT_HANDLED_PARAMS: readonly string[] = [
  'name',
  'jname',
  'rname',
  'ename',
  'first',
  'user',
  'previous',
  'type',
  'meaning',
  'fruit',
];

/** Params seen and DELIBERATELY not mapped (presentation / ADR-107 images
 *  / the infobox header override, which duplicates the page title). */
export const DEVIL_FRUIT_IGNORED_PARAMS: readonly string[] = [
  ...PRESENTATION_PARAMS,
  ...IMAGE_PARAMS,
  'title',
];

/** Current devil-fruit schema_version — keep in sync with the type. */
export const DEVIL_FRUIT_SCHEMA_VERSION = 4;

/** "Inu Inu no Mi, Model: Dachshund" → "Dachshund". */
export function parseZoanModel(name: string): string | null {
  const m = /\bmodel\b:?\s*(.+)$/i.exec(name);
  const raw = m?.[1]
    ?.replace(/^[«"'“「『]+/, '')
    .replace(/[»"'”」』]+$/, '')
    .trim();
  return raw === undefined || raw === '' ? null : raw;
}

export function mapDevilFruit(
  page: ParsedPage,
  ctx: BoxMapContext = {},
): DevilFruitMapResult | null {
  const box = findTemplate(page.wikitext, ...DEVIL_FRUIT_INFOBOX_NAMES);
  if (box === null) return null;
  const get = paramReader(box.named);
  const warnings: string[] = [];
  const qrefTable = buildQrefTable(page.wikitext);

  // The EN name is the wiki's own page title (or the box's explicit
  // `name` override). `ename` is a LIST of dub variants — see below.
  const enName = cleanValue(get('name') ?? page.title);
  const slug = slugify(enName);
  if (slug === '') return null;
  const id = entityIdFor('devil-fruit', slug, page.title, ctx.titleIndex);
  const base = id.split(':')[1] ?? slug;

  const firstRaw = get('first');
  const debut = firstRaw === undefined ? null : bestSince(parseSourceRefs(firstRaw, qrefTable));
  if (debut === null) {
    warnings.push('no debut source in `first` — entries emitted without since');
  } else {
    warnings.push(
      `debut ${debut}: add a features → ${id} edge on that source entity `
        + '(the appearance edge is source → entity, ADR-105)',
    );
  }
  const since = debut !== null ? { since: debut } : {};

  const nameKey = `devil-fruit.${base}.name.common`;
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
      const key = `devil-fruit.${base}.name.literal-meaning`;
      en[key] = meaning;
      names.push({ value_key: key, name_type: 'literal_meaning', ...since });
    }
  }

  const properties: Record<string, unknown> = { name: names };

  // classification is REQUIRED — an unmatched value lands on the
  // vocabulary's own `unknown`, never on a fabricated string.
  const classifications = ctx.vocabularies?.get('devil-fruit-classifications');
  const typeRaw = get('type');
  let classification = 'unknown';
  if (typeRaw === undefined) {
    warnings.push('no `type` param — classification defaulted to unknown');
  } else if (classifications === undefined) {
    warnings.push(
      `type: "${cleanValue(typeRaw)}" — no devil-fruit-classifications index; defaulted to unknown`,
    );
  } else {
    const segments = splitSegments(typeRaw);
    const hit = segments.length > 0 ? matchVocabularyIn(classifications, segments[0]!) : null;
    if (hit === null) {
      warnings.push(`unmapped classification "${cleanValue(typeRaw)}" — defaulted to unknown`);
    } else {
      classification = hit.value;
      if (!hit.exact) {
        warnings.push(`classification "${hit.matched}" matched ${hit.value} by keyword — verify`);
      }
    }
    if (segments.length > 1) {
      warnings.push(
        `type lists ${segments.length} classifications ("${cleanValue(typeRaw)}") — only the first `
          + 'is emitted; a retcon/reveal needs its own entry with epistemic_status (human)',
      );
    }
  }
  properties['classification'] = [{ value: classification, ...since }];

  const model = parseZoanModel(enName);
  if (model !== null) properties['zoan_model'] = [{ value: model, ...since }];

  // `user` is the one wikilink param whose canonical direction starts
  // here: held-by is devil-fruit → character/organization/crew.
  const users = resolveRelationParam({
    raw: get('user'),
    param: 'user',
    relationType: 'held-by',
    targetTypes: ['character', 'organization', 'crew'],
    ...(ctx.titleIndex !== undefined ? { titleIndex: ctx.titleIndex } : {}),
    since: debut,
  });
  warnings.push(...users.warnings);

  const previousRaw = get('previous');
  if (previousRaw !== undefined) {
    warnings.push(
      `previous user "${cleanValue(previousRaw)}" — a past holder needs held-by with an until `
        + 'qualifier the infobox does not carry (human)',
    );
  }
  const enameRaw = get('ename');
  if (enameRaw !== undefined) {
    warnings.push(
      `ename dub variants "${cleanValue(enameRaw)}" — the name property has no translation-variant `
        + 'qualifier; not emitted',
    );
  }
  const fruitRaw = get('fruit');
  if (fruitRaw !== undefined) {
    warnings.push(
      `fruit "${cleanValue(fruitRaw)}" — source of the fruit's own first depiction; no property `
        + 'holds a secondary depiction anchor',
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
      type: 'devil-fruit',
      schema_version: DEVIL_FRUIT_SCHEMA_VERSION,
      slug,
      canonical_name_key: nameKey,
      properties,
      relations: [...users.relations],
    },
    translations,
    warnings,
  };
}
