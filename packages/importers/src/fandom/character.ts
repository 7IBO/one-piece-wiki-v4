/**
 * Fandom "Char Box" → `character` entity mapper (ADR-079). Param
 * names verified against the live Hyougoro response (2026-06-14):
 * `jname`/`rname`/`ename`, `first` (debut chapter+episode Qref),
 * `alias`/`epithet` ({{Nihongo}} values), `age`/`birth`/`height`/
 * `blood type` (note the space) sourced to Vivre Card Qrefs
 * (`card=N` → our `databook-card:N`), `jva`/`Funi eva` (voice
 * actors), `affiliation`/`occupation`/`origin`/`residence`.
 *
 * Deterministic scalars only. Everything needing entity resolution
 * (affiliations → member-of, VAs → person + voiced-by, occupations →
 * the `occupations` vocab) or judgement is surfaced as warnings for
 * the AI-extraction / human pass — never guessed.
 */
import type { ParsedPage } from './client.ts';
import {
  buildQrefTable,
  cleanValue,
  findTemplate,
  parseLooseNumber,
  parseNihongo,
  parseQrefs,
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

const INFOBOX_NAMES = ['Char Box', 'Charbox', 'Character Box', 'Infobox character'];

/** Current character schema_version — keep in sync with the type. */
export const CHARACTER_SCHEMA_VERSION = 5;

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

export function mapCharacter(page: ParsedPage): CharacterMapResult | null {
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
  // Named-Qref definitions from the whole page — `name=`-only
  // backrefs on params resolve against it.
  const qrefTable = buildQrefTable(page.wikitext);
  /** First Qref-cited source of a param value (per-value provenance). */
  const sourceOf = (raw: string | undefined): string | null => {
    if (raw === undefined) return null;
    return parseQrefs(raw, qrefTable)[0]?.sourceId ?? null;
  };

  const enName = get('ename');
  if (enName === undefined) {
    // Without an English name there is no slug — not mappable.
    return null;
  }
  const slug = slugify(cleanValue(enName));
  if (slug === '') return null;
  const id = `character:${slug}`;

  // Debut source ("first" carries the chapter+episode Qref) anchors
  // the initial entries, mirroring the corpus (`since: chapter of
  // first appearance`).
  const debut = sourceOf(get('first'));
  if (debut === null) warnings.push('no debut Qref in `first` — entries emitted without since');
  const since = debut !== null ? { since: debut } : {};

  const translations: Record<string, string> = {};
  const nameKey = `character.${slug}.name.common`;
  translations[nameKey] = cleanValue(enName);
  const properties: Record<string, unknown> = {
    name: [{ value_key: nameKey, name_type: 'common', ...since }],
  };

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
    const value = cleaned.includes('deceased') ? 'deceased' : null;
    if (value !== null) properties['status'] = [{ value, ...since }];
    else {
      properties['status'] = [{ value: 'alive', ...since }];
      warnings.push(`unmapped status "${cleanValue(statusRaw)}" — defaulted to alive`);
    }
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

  // Needs-resolution params → warnings (AI/human pass; never guessed).
  for (
    const [param, note] of [
      ['affiliation', 'member-of relations (targets must resolve to crew/organization entities)'],
      ['occupation', 'occupation multi_enum (map against the occupations vocabulary)'],
      ['origin', 'origin/birthplace relation (resolve to location entities)'],
      ['residence', 'resides-in relation (resolve to location entities)'],
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
      relations: [],
    },
    translations: { en: translations },
    warnings,
  };
}
