/**
 * api-onepiece `characters` → `character` entity mapper (ADR-101).
 *
 * Typical record: { id, name, size, age, bounty, job, status,
 * crew: {id, name, …}, fruit: {id, name, …} }. Fields vary and data is
 * dirty — everything is parsed defensively:
 *
 *  - `bounty` strings like "3.000.000.000" are numeric-parsed; the API
 *    carries NO reveal anchor, so bounty entries are emitted WITHOUT
 *    `since` and flagged in the report's unanchored section;
 *  - `job` matches EXACTLY (case-insensitive) against the
 *    `occupations` vocabulary labels; anything fuzzy stays a warning;
 *  - `crew` becomes a `member-of` edge (leadership = member-of{role}
 *    only per ADR-099 — never led-by/captains) and `fruit` an
 *    `ate-fruit` edge, both resolved against existing entities / this
 *    sweep's candidates;
 *  - `member-of.since` is REQUIRED by the relation schema but the API
 *    cannot anchor it — the edge is emitted without it and flagged
 *    (the maintainer supplies the anchor before merge).
 */
import {
  AUTO_IMPORTED,
  type CandidateEntity,
  type CandidateTranslations,
  cleanString,
  collectGaps,
  emitName,
  localizedField,
  type LocalizedRecordPair,
  type MappedCandidate,
  type MapperContext,
  matchVocabulary,
  pairField,
  parseLooseNumber,
  slugify,
} from './common.ts';

/**
 * API fields the mapper reads — everything else lands in the report's
 * gap section (ADR-092 convention; keep in sync with the reads in
 * {@link mapCharacter}).
 */
export const CHARACTER_HANDLED_FIELDS: readonly string[] = [
  'id',
  'name',
  'size',
  'age',
  'bounty',
  'job',
  'status',
  'crew',
  'fruit',
];

/** Current character schema_version — keep in sync with the type. */
export const CHARACTER_SCHEMA_VERSION = 7;

/**
 * `character-statuses` mapping, longest-match first, EN + FR spellings
 * (the FR sweep says "Vivant"/"Décédé"). Unmatched → `unknown` + a
 * warning, never a guess of "alive".
 */
const STATUS_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/presumed\s+(dead|deceased)|présumé\s+mort/, 'presumed_dead'],
  [/deceased|dead|mort|décédé/, 'dead'],
  [/missing|disparu/, 'missing'],
  [/in\s+hiding|caché/, 'in_hiding'],
  [/incapacitated|incapacité/, 'incapacitated'],
  [/unknown|inconnu/, 'unknown'],
  [/alive|vivant/, 'alive'],
];

/** Nested `{ name: … }` sub-record name (crew/fruit references). */
function nestedName(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  return cleanString((value as { name?: unknown; }).name);
}

export function mapCharacter(
  pair: LocalizedRecordPair,
  ctx: MapperContext = {},
): MappedCandidate | null {
  const name = localizedField(pair, 'name');
  if (name.en === null && name.fr === null) return null;
  const enName = name.en ?? name.fr!;
  const slug = slugify(enName);
  if (slug === '') return null;

  const warnings: string[] = [];
  const unanchored: string[] = [];
  const id = `character:${slug}`;
  const entity: CandidateEntity = {
    id,
    type: 'character',
    schema_version: CHARACTER_SCHEMA_VERSION,
    slug,
    canonical_name_key: `character.${slug}.name`,
    properties: {},
    relations: [],
  };
  const translations: CandidateTranslations = { en: {}, fr: {} };
  emitName(entity, translations, enName, name.fr);

  // Status — required by the character schema; unmapped raw values
  // degrade to `unknown` with a warning (candidate review will fix).
  const statusRaw = localizedField(pair, 'status');
  const statusText = (statusRaw.en ?? statusRaw.fr ?? '').toLowerCase();
  const statusHit = STATUS_PATTERNS.find(([pattern]) => pattern.test(statusText));
  if (statusHit !== undefined) {
    entity.properties['status'] = [{ value: statusHit[1], ...AUTO_IMPORTED }];
  } else {
    entity.properties['status'] = [{ value: 'unknown', ...AUTO_IMPORTED }];
    warnings.push(
      statusText === ''
        ? `${id}: no status in the API record — emitted as unknown`
        : `${id}: unmapped status "${statusText}" — emitted as unknown`,
    );
  }

  // Bounty — dirty strings ("3.000.000.000", "Unknown") expected. The
  // API gives no reveal chapter: entries land WITHOUT `since`.
  const bountyRaw = pairField(pair, 'bounty');
  if (bountyRaw !== undefined) {
    const bounty = parseLooseNumber(bountyRaw);
    if (bounty !== null) {
      entity.properties['bounty'] = [{ value: bounty, ...AUTO_IMPORTED }];
      unanchored.push(
        `${id} bounty ${bounty.toLocaleString('en')} emitted without since (API carries no anchor)`,
      );
    } else if (cleanString(bountyRaw) !== null) {
      warnings.push(`${id}: unparseable bounty "${String(bountyRaw)}" — skipped`);
    }
  }

  const age = parseLooseNumber(pairField(pair, 'age'));
  if (age !== null && age > 0) {
    entity.properties['age'] = [{ value: age, ...AUTO_IMPORTED }];
  }

  // `size` is the API's height field ("174 cm", "1.74m" also seen).
  const sizeRaw = pairField(pair, 'size');
  if (sizeRaw !== undefined) {
    const cm = parseHeightCm(sizeRaw);
    if (cm !== null) entity.properties['height'] = [{ value: cm, ...AUTO_IMPORTED }];
    else if (cleanString(sizeRaw) !== null) {
      warnings.push(`${id}: unparseable size "${String(sizeRaw)}" — skipped`);
    }
  }

  // `job` → occupation multi_enum: exact vocabulary label match only.
  const job = localizedField(pair, 'job');
  const jobRaw = job.en ?? job.fr;
  if (jobRaw !== null) {
    const matched: string[] = [];
    for (const item of jobRaw.split(/[;,/]/)) {
      const label = item.trim();
      if (label === '') continue;
      const valueId = matchVocabulary(ctx, 'occupations', label);
      if (valueId === null) {
        warnings.push(`${id}: occupation "${label}" has no vocabulary match — human pass`);
      } else if (!matched.includes(valueId)) matched.push(valueId);
    }
    if (matched.length > 0) {
      entity.properties['occupation'] = [{ value: matched, ...AUTO_IMPORTED }];
    }
  }

  // Crew → member-of. The relation schema REQUIRES `since`; the API
  // cannot anchor it, so the edge ships without it + a flag.
  const crewName = nestedName(pairField(pair, 'crew'));
  if (crewName !== null) {
    const target = ctx.resolveTarget?.(crewName, ['crew', 'organization']) ?? null;
    if (target !== null) {
      entity.relations.push({ type: 'member-of', target });
      unanchored.push(
        `${id} member-of ${target} emitted without since (required qualifier — anchor before merge)`,
      );
    } else {
      warnings.push(
        `${id}: crew "${crewName}" not found among existing entities or this sweep — `
          + 'member-of edge skipped (import the crew first)',
      );
    }
  }

  // Fruit → ate-fruit (since optional on that relation).
  const fruitName = nestedName(pairField(pair, 'fruit'));
  if (fruitName !== null) {
    const target = ctx.resolveTarget?.(fruitName, ['devil-fruit']) ?? null;
    if (target !== null) {
      entity.relations.push({ type: 'ate-fruit', target });
      unanchored.push(`${id} ate-fruit ${target} emitted without since (API carries no anchor)`);
    } else {
      warnings.push(
        `${id}: fruit "${fruitName}" not found among existing entities or this sweep — `
          + 'ate-fruit edge skipped (import the fruit first)',
      );
    }
  }

  return {
    entity,
    translations,
    images: [],
    gaps: collectGaps(pair, CHARACTER_HANDLED_FIELDS),
    unanchored,
    informational: [],
    warnings,
  };
}

/** "174 cm" → 174; "1.74m"/"1,74 m" → 174; bare numbers pass. */
function parseHeightCm(raw: unknown): number | null {
  const text = cleanString(raw) ?? (typeof raw === 'number' ? String(raw) : null);
  if (text === null) return null;
  const meters = /^(\d)[.,](\d{1,2})\s*m$/i.exec(text.trim());
  if (meters !== null) {
    return Math.round(Number(`${meters[1]}.${meters[2]}`) * 100);
  }
  const cm = parseLooseNumber(text);
  if (cm === null || cm <= 0) return null;
  return cm;
}
