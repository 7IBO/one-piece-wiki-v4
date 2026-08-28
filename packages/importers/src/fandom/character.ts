/**
 * Fandom "Char Box" → `character` entity mapper (ADR-079). Param
 * names verified against the live Hyougoro response (2026-06-14):
 * `jname`/`rname`/`ename`, `first` (debut chapter+episode Qref),
 * `alias`/`epithet` ({{Nihongo}} values), `bounty` (newest-first
 * `<br>`-separated history with per-value Qrefs), `age`/`birth`/
 * `height`/`blood type` (note the space) sourced to Vivre Card Qrefs
 * (`card=N` → our `databook-card:N`), `jva`/`Funi eva` (voice
 * actors), `affiliation`/`occupation`/`origin`/`residence`.
 *
 * Deterministic mapping only — but "deterministic" includes two
 * resolution passes fed by COMMITTED project state (never guessed):
 *  - `[[wikilink]]` targets in affiliation/origin/residence/devil
 *    fruit params resolve against the Fandom sync registry
 *    (data/import/fandom-pages.json) → member-of / originates-from /
 *    resides-in / ate-fruit relations when the target entity exists;
 *  - occupation strings match EXACTLY (case-insensitive) against the
 *    `occupations` vocabulary labels → the multi_enum value.
 * Anything unresolved, "former"-annotated, or fuzzy stays a warning
 * for the AI-extraction / human pass.
 */
import { isPlaceholderName } from './box.ts';
import type { ParsedPage } from './client.ts';
import { extractWikiLinks, resolveTitle, type TitleIndex } from './registry.ts';
import {
  buildQrefTable,
  cleanValue,
  findTemplate,
  parseLooseNumber,
  parseNihongo,
  parseQrefs,
  type QrefSource,
  splitLines,
} from './wikitext.ts';

export type CharacterMapResult = {
  readonly entity: {
    readonly id: string;
    readonly type: 'character';
    readonly schema_version: number;
    readonly slug: string;
    readonly canonical_name_key: string;
    readonly properties: Record<string, unknown>;
    readonly relations: readonly Record<string, unknown>[];
  };
  readonly translations: { readonly en: Record<string, string>; };
  readonly warnings: readonly string[];
};

/** Infobox template names this mapper recognises (ADR-092 analyzer). */
export const CHARACTER_INFOBOX_NAMES: readonly string[] = [
  'Char Box',
  'Charbox',
  'Character Box',
  'Infobox character',
];

/**
 * Infobox params the mapper reads — mapped to properties/relations or
 * deliberately surfaced as warnings. Consumed by the `fandom:analyze`
 * field-inventory report (ADR-092); keep in sync with the `get(...)`
 * calls in {@link mapCharacter}.
 */
export const CHARACTER_HANDLED_PARAMS: readonly string[] = [
  'ename',
  'first',
  'alias',
  'epithet',
  'status',
  'bounty',
  'age',
  'height',
  'birth',
  'birthday',
  'blood type',
  'blood_type',
  'bloodtype',
  'affiliation',
  'origin',
  'residence',
  'dfname',
  'dfename',
  'occupation',
  'jva',
  'Funi eva',
];

/** Every entity is at schema_version 1 since the v1 reset (ADR-115). */
export const CHARACTER_SCHEMA_VERSION = 1;

/**
 * Optional resolution context. Both members come from COMMITTED
 * project state; without them the mapper degrades to v1 behaviour
 * (warnings instead of relations/occupation values).
 */
export type CharacterMapContext = {
  /** `buildTitleIndex(registry)` over data/import/fandom-pages.json. */
  readonly titleIndex?: TitleIndex;
  /** Lowercased occupation label (en/fr) AND value id → value id. */
  readonly occupations?: ReadonlyMap<string, string>;
};

/**
 * `character-statuses` vocabulary mapping, longest-match first so
 * "Presumed Deceased" hits `presumed_dead` before `dead`. v1 emitted
 * the raw Fandom word "deceased", which the enum rejects.
 */
const STATUS_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/presumed\s+(dead|deceased)/, 'presumed_dead'],
  [/deceased|dead/, 'dead'],
  [/missing/, 'missing'],
  [/in\s+hiding/, 'in_hiding'],
  [/incapacitated/, 'incapacitated'],
  [/unknown/, 'unknown'],
  [/alive/, 'alive'],
];

/** Split a raw param value on `<br>` variants (per-line sub-values —
 *  the Char Box convention for bounty history and affiliation lists). */
function splitOnBr(raw: string): readonly string[] {
  return raw.split(/<br\s*\/?>/i).map((s) => s.trim()).filter((s) => s !== '');
}

/** `since` candidate from a segment's Qrefs — chapters anchor better
 *  than episodes in the corpus, so manga refs win when both cite. */
function bestSinceOf(sources: readonly QrefSource[]): string | null {
  const chapter = sources.find((s) => s.sourceId.startsWith('manga-chapter:'));
  return chapter?.sourceId ?? sources[0]?.sourceId ?? null;
}

export type BountyParse = {
  readonly entries: readonly { readonly value: number; readonly since?: string; }[];
  readonly warnings: readonly string[];
};

/**
 * Parse the Char Box `bounty` param into chronological historical
 * entries. Fandom lists the history NEWEST first, one value per
 * `<br>` line, each line citing its reveal via {{Qref}} — detected by
 * comparing first/last values and reversed when needed. Annotations
 * ("(frozen)", {{B}} symbols) are stripped; a line without a leading
 * number (e.g. "Unknown") is skipped with a warning.
 */
export function parseBountyEntries(
  raw: string,
  qrefTable: ReadonlyMap<string, readonly QrefSource[]>,
): BountyParse {
  const warnings: string[] = [];
  const parsed: { value: number; since?: string; }[] = [];
  for (const segment of splitOnBr(raw)) {
    const cleaned = cleanValue(segment);
    const numberMatch = /(\d[\d,.]*)/.exec(cleaned);
    const value = numberMatch !== null ? parseLooseNumber(numberMatch[1]!) : null;
    if (value === null) {
      if (cleaned !== '') warnings.push(`bounty line without a number: "${cleaned}" — skipped`);
      continue;
    }
    const since = bestSinceOf(parseQrefs(segment, qrefTable));
    if (since === null) {
      warnings.push(`bounty ${value.toLocaleString('en')} has no Qref — emitted without since`);
      parsed.push({ value });
    } else parsed.push({ value, since });
  }
  // Chronological order (oldest first) — the corpus convention.
  const first = parsed[0]?.value;
  const last = parsed[parsed.length - 1]?.value;
  if (first !== undefined && last !== undefined && first > last) parsed.reverse();
  return { entries: parsed, warnings };
}

const MONTHS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

/** "February 14th" → "02-14" (the corpus MM-DD birthday shape). */
export function parseBirthday(value: string): string | null {
  const m = /([A-Za-z]+)\s+(\d{1,2})/.exec(cleanValue(value));
  if (m === null) return null;
  const month = MONTHS[(m[1] ?? '').toLowerCase()];
  if (month === undefined) return null;
  const day = (m[2] ?? '').padStart(2, '0');
  return `${month}-${day}`;
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function mapCharacter(
  page: ParsedPage,
  ctx: CharacterMapContext = {},
): CharacterMapResult | null {
  const box = findTemplate(page.wikitext, ...CHARACTER_INFOBOX_NAMES);
  if (box === null) return null;

  const warnings: string[] = [];
  const get = (...keys: readonly string[]): string | undefined => {
    for (const k of keys) {
      const v = box.named[k];
      if (v !== undefined && v.trim() !== '') return v;
    }
    return undefined;
  };
  // Named-Qref definitions from the whole page — `name=`-only
  // backrefs on params resolve against it.
  const qrefTable = buildQrefTable(page.wikitext);
  /** First Qref-cited source of a param value (per-value provenance). */
  const sourceOf = (raw: string | undefined): string | null => {
    if (raw === undefined) return null;
    return parseQrefs(raw, qrefTable)[0]?.sourceId ?? null;
  };

  const enNameRaw = get('ename');
  if (enNameRaw === undefined) {
    // Without an English name there is no slug — not mappable.
    return null;
  }
  // `ename` is MULTI-VALUE: Fandom lists the canonical English name
  // first, then one line per release that spells it differently —
  // « Bell-mère<br>Bellemere (Viz Media)<br>Bell-mere (Funimation) ».
  // `cleanValue` turns `<br>` into a space, so the whole list was
  // collapsing into ONE name and then into one slug:
  // `belle-mere-viz-media-bellemere-funimation-bell-mere-opcg`.
  //
  // That is worse than cosmetic. Ids are IMMUTABLE (CLAUDE.md), so
  // every such import mints a permanently wrong URL for a real
  // character. Eight of the first 158 were affected.
  //
  // The lines after the first are exactly what `name_type: 'alias'`
  // is for — they even carry their release in parentheses already.
  const [canonicalRaw = '', ...variantRaws] = splitLines(enNameRaw);
  const enName = cleanValue(canonicalRaw);
  const slug = slugify(enName);
  // A template placeholder is not a thing (see isPlaceholderName).
  if (slug === '' || isPlaceholderName(enName)) return null;
  const id = `character:${slug}`;

  // Debut source ("first" carries the chapter+episode Qref) anchors
  // the initial entries, mirroring the corpus (`since: chapter of
  // first appearance`).
  const debut = sourceOf(get('first'));
  if (debut === null) warnings.push('no debut Qref in `first` — entries emitted without since');
  const since = debut !== null ? { since: debut } : {};

  const translations: Record<string, string> = {};
  const nameKey = `character.${slug}.name.common`;
  translations[nameKey] = enName;
  const properties: Record<string, unknown> = {
    name: [{ value_key: nameKey, name_type: 'common', ...since }],
  };

  // Les orthographes propres a une edition deviennent des ALIAS, pas
  // des morceaux du nom. Une variante qui retombe sur le meme slug que
  // le nom canonique n'apporte rien et est ecartee.
  for (const variantRaw of variantRaws) {
    const variant = cleanValue(variantRaw);
    const variantSlug = slugify(variant);
    if (variant === '' || variantSlug === '' || variantSlug === slug) continue;
    const key = `character.${slug}.name.${variantSlug}`;
    if (key in translations) continue;
    translations[key] = variant;
    (properties['name'] as unknown[]).push({
      value_key: key,
      name_type: 'alias',
      ...since,
    });
  }

  const aliasRaw = get('alias');
  if (aliasRaw !== undefined) {
    const alias = parseNihongo(aliasRaw);
    if (alias !== null) {
      const key = `character.${slug}.name.${slugify(alias.text)}`;
      translations[key] = alias.text;
      const aliasSource = sourceOf(aliasRaw);
      (properties['name'] as unknown[]).push({
        value_key: key,
        name_type: 'alias',
        ...(aliasSource !== null ? { since: aliasSource } : since),
      });
    }
  }

  const epithetRaw = get('epithet');
  if (epithetRaw !== undefined) {
    const epithet = parseNihongo(epithetRaw);
    if (epithet !== null) {
      const key = `character.${slug}.epithet.${slugify(epithet.text)}`;
      translations[key] = epithet.text;
      const epithetSource = sourceOf(epithetRaw);
      properties['epithet'] = [{
        value_key: key,
        ...(epithetSource !== null ? { since: epithetSource } : since),
      }];
    }
  }

  // Fandom convention: only non-alive characters carry a `status`
  // param. Absent → alive (flagged — an inference, not a page fact).
  const statusRaw = get('status');
  if (statusRaw === undefined) {
    properties['status'] = [{ value: 'alive', ...since }];
    warnings.push('no status param — defaulted to alive (Fandom convention; verify)');
  } else {
    const cleaned = cleanValue(statusRaw).toLowerCase();
    const hit = STATUS_PATTERNS.find(([pattern]) => pattern.test(cleaned));
    if (hit !== undefined) {
      const statusSource = sourceOf(statusRaw);
      properties['status'] = [{
        value: hit[1],
        ...(statusSource !== null ? { since: statusSource } : since),
      }];
    } else {
      properties['status'] = [{ value: 'alive', ...since }];
      warnings.push(`unmapped status "${cleanValue(statusRaw)}" — defaulted to alive`);
    }
  }

  // Bounty history — the corpus' flagship historisable property.
  const bountyRaw = get('bounty');
  if (bountyRaw !== undefined) {
    const bounty = parseBountyEntries(bountyRaw, qrefTable);
    warnings.push(...bounty.warnings);
    if (bounty.entries.length > 0) properties['bounty'] = [...bounty.entries];
  }

  const ageRaw = get('age');
  if (ageRaw !== undefined) {
    const age = parseLooseNumber(ageRaw);
    const src = sourceOf(ageRaw);
    if (age !== null) {
      properties['age'] = [{ value: age, ...(src !== null ? { source: src } : {}) }];
      if (src?.startsWith('databook-card:') === true) {
        warnings.push(`age sourced to ${src} — the databook-card entity must exist before merge`);
      }
    }
  }

  const heightRaw = get('height');
  if (heightRaw !== undefined) {
    // "100 cm (3'3\")" — take the metric figure.
    const m = /(\d+(?:\.\d+)?)\s*cm/.exec(cleanValue(heightRaw));
    const src = sourceOf(heightRaw);
    if (m !== null) {
      properties['height'] = [{
        value: Number(m[1]),
        ...(src !== null ? { source: src } : {}),
      }];
    } else warnings.push(`unparseable height: "${cleanValue(heightRaw)}"`);
  }

  const birthRaw = get('birth', 'birthday');
  if (birthRaw !== undefined) {
    const birthday = parseBirthday(birthRaw);
    if (birthday !== null) properties['birthday'] = { value: birthday };
    else warnings.push(`unparseable birthday: "${cleanValue(birthRaw)}"`);
  }

  const bloodRaw = get('blood type', 'blood_type', 'bloodtype');
  if (bloodRaw !== undefined) {
    properties['blood_type'] = { value: cleanValue(bloodRaw) };
  }

  // Relation params resolve their [[wikilinks]] through the sync
  // registry — exact-title (and redirect-alias) matches only. Lines
  // annotated "former" need an `until` a page fact can't provide, so
  // they stay warnings; so do targets we don't know or whose entity
  // type the relation doesn't accept.
  const relations: Record<string, unknown>[] = [];
  const resolveRelationParam = (
    raw: string | undefined,
    param: string,
    relationType: string,
    targetTypes: readonly string[],
  ): void => {
    if (raw === undefined) return;
    if (ctx.titleIndex === undefined) {
      warnings.push(`${param}: "${cleanValue(raw)}" — needs ${relationType} resolution`);
      return;
    }
    for (const segment of splitOnBr(raw)) {
      if (/\bformer\b/i.test(cleanValue(segment))) {
        warnings.push(
          `${param} line "${cleanValue(segment)}" is former — needs an until qualifier (human)`,
        );
        continue;
      }
      const segmentSource = bestSinceOf(parseQrefs(segment, qrefTable));
      for (const target of extractWikiLinks(segment)) {
        const link = resolveTitle(ctx.titleIndex, target);
        if (link === null) {
          warnings.push(`${param}: unresolved "[[${target}]]" — import that page first`);
          continue;
        }
        const targetType = link.entityId.split(':')[0] ?? '';
        if (!targetTypes.includes(targetType)) {
          warnings.push(
            `${param}: "[[${target}]]" resolved to ${link.entityId} — not a valid ${relationType} target`,
          );
          continue;
        }
        relations.push({
          type: relationType,
          target: link.entityId,
          ...(segmentSource !== null ? { qualifiers: { since: segmentSource } } : {}),
        });
      }
    }
  };
  resolveRelationParam(get('affiliation'), 'affiliation', 'member-of', [
    'crew',
    'organization',
  ]);
  resolveRelationParam(get('origin'), 'origin', 'originates-from', ['location']);
  resolveRelationParam(get('residence'), 'residence', 'resides-in', ['location']);
  resolveRelationParam(get('dfname', 'dfename'), 'devil fruit', 'ate-fruit', ['devil-fruit']);

  // Occupation: EXACT (case-insensitive) matches against the
  // occupations vocabulary become the multi_enum value; anything
  // fuzzy stays a warning.
  const occupationRaw = get('occupation');
  if (occupationRaw !== undefined) {
    if (ctx.occupations === undefined) {
      warnings.push(
        `occupation: "${cleanValue(occupationRaw)}" — needs occupation multi_enum mapping`,
      );
    } else {
      const matched: string[] = [];
      for (const segment of splitOnBr(occupationRaw)) {
        const cleaned = cleanValue(segment);
        if (/\bformer\b/i.test(cleaned)) {
          warnings.push(`occupation "${cleaned}" is former — needs an until qualifier (human)`);
          continue;
        }
        for (const item of cleaned.split(/[;,]/)) {
          const label = item.replace(/\([^)]*\)/g, '').trim().toLowerCase();
          if (label === '') continue;
          const valueId = ctx.occupations.get(label);
          if (valueId === undefined) {
            warnings.push(`occupation "${item.trim()}" has no vocabulary match — human pass`);
          } else if (!matched.includes(valueId)) matched.push(valueId);
        }
      }
      if (matched.length > 0) {
        const occupationSource = bestSinceOf(parseQrefs(occupationRaw, qrefTable));
        properties['occupation'] = [{
          value: matched,
          ...(occupationSource !== null ? { since: occupationSource } : since),
        }];
      }
    }
  }

  // Params still out of deterministic reach → warnings (AI/human pass).
  for (
    const [param, note] of [
      ['jva', 'voiced-by → person entity (JP)'],
      ['Funi eva', 'voiced-by → person entity (EN dub)'],
    ] as const
  ) {
    const v = get(param);
    if (v !== undefined) warnings.push(`${param}: "${cleanValue(v)}" — needs ${note}`);
  }

  return {
    entity: {
      id,
      type: 'character',
      schema_version: CHARACTER_SCHEMA_VERSION,
      slug,
      canonical_name_key: nameKey,
      properties,
      relations,
    },
    translations: { en: translations },
    warnings,
  };
}
