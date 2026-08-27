/**
 * Shared "* Box" infobox helpers (ADR-079/109).
 *
 * The One Piece wiki templates its entity pages with a family of
 * `<Thing> Box` infoboxes that share a vocabulary of conventions:
 * `jname`/`rname` for the Japanese name pair, `first` for the debut
 * chapter/episode, `ename` for the dub-title variants, `[[wikilink]]`
 * lists for anything that is really an edge, and a handful of
 * `colorscheme`/`backcolor`/`image` params that are pure Fandom
 * presentation. The 2026-08-27 structural survey
 * (`docs/audits/fandom-structure-2026-08-27.md`) classified every
 * field of all 39 templates by VALUE SHAPE; this module is the
 * shared decoding of the shapes that recur across boxes, so each
 * per-type mapper only holds what is genuinely specific to it.
 *
 * Deterministic only. Anything that needs a judgement call (a
 * "former" annotation without an `until`, a relation whose canonical
 * direction lives on the other entity, a value the schema has no home
 * for) is returned as a warning — never guessed, never widened into
 * an ad-hoc property (CLAUDE.md: "Do not invent").
 */
import { resolveTitle, type TitleIndex } from './registry.ts';
import { cleanValue, parseQrefs, parseTemplates, type QrefSource } from './wikitext.ts';

/** Lowercased label/alias → vocabulary value id, for one vocabulary. */
export type VocabularyIndex = ReadonlyMap<string, string>;
/** Vocabulary id → its {@link VocabularyIndex}. */
export type VocabularyIndexes = ReadonlyMap<string, VocabularyIndex>;

/**
 * Resolution context shared by every "* Box" mapper. Both members
 * come from COMMITTED project state (the ADR-081 sync ledger and the
 * schema catalogue) — never from a guess. Without them the mappers
 * degrade to warnings instead of relations/enum values.
 */
export type BoxMapContext = {
  /** `buildTitleIndex(registry)` over data/import/fandom-pages.json. */
  readonly titleIndex?: TitleIndex;
  /** Vocabulary indexes, keyed by vocabulary id. */
  readonly vocabularies?: VocabularyIndexes;
};

/** Reader over an infobox's named params: first non-empty alias wins. */
export type ParamReader = (...keys: readonly string[]) => string | undefined;

export function paramReader(named: Readonly<Record<string, string>>): ParamReader {
  return (...keys: readonly string[]): string | undefined => {
    for (const k of keys) {
      const v = named[k];
      if (v !== undefined && v.trim() !== '') return v;
    }
    return undefined;
  };
}

/**
 * Params that are pure Fandom PRESENTATION (template colours, the
 * infobox header override, gallery switches) or that ADR-107 forbids
 * ingesting (image file names — Fandom images are never imported).
 * Mappers list them in their `*_IGNORED_PARAMS` so the `fandom:analyze`
 * report stops counting them as gaps.
 */
export const PRESENTATION_PARAMS: readonly string[] = [
  'colorscheme',
  'backcolor',
  'textcolor',
  'switchAM',
];

/** Image-carrying params — not ingested (ADR-107 rule 7-11). */
export const IMAGE_PARAMS: readonly string[] = [
  'image',
  'imagetext',
  'multiimage',
];

/** Split a raw param value on `<br>` variants (the per-line convention). */
export function splitOnBr(raw: string): readonly string[] {
  return raw.split(/<br\s*\/?>/i).map((s) => s.trim()).filter((s) => s !== '');
}

/**
 * Split a raw param value into its sub-values: `<br>` lines first
 * (the box convention), then `;` inside a line (the survey shows both
 * separators in the same field, e.g. Ship Box `affiliation`).
 * `----` is the wiki's horizontal-rule separator inside a param and
 * splits too.
 */
export function splitSegments(raw: string): readonly string[] {
  return splitOnBr(raw)
    .flatMap((line) => line.split(/;|-{4,}/))
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** kebab-case English slug, ASCII-folded, capped at the Slug max (60). */
export function slugify(name: string, maxLength = 60): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= maxLength) return base;
  const cut = base.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

export type JapaneseName = {
  /** Native-script name (the `ja` data locale of ADR-095). */
  readonly ja: string | null;
  /** Romanization (the `ja-latn` data locale of ADR-095). */
  readonly jaLatn: string | null;
};

/**
 * `{{Ruby|base|reading}}` → the base. The survey found `jname` wrapped
 * in Ruby on ~10 boxes: the base is the written form (kanji), the
 * second parameter its furigana gloss. The written form is the name;
 * the romanization comes from `rname` (which romanizes the READING,
 * which is why we never derive one from the other).
 */
export function parseRuby(value: string): string | null {
  const t = parseTemplates(value).find((x) => x.name.toLowerCase() === 'ruby');
  if (t === undefined) return null;
  const base = (t.positional[0] ?? '').trim();
  return base === '' ? null : base;
}

/**
 * The `jname`/`rname` pair → the two Japanese data locales of ADR-095.
 * Never a plain string property: a Japanese name is a translation of
 * the entity's `name`, not a second property.
 */
export function readJapaneseName(get: ParamReader): JapaneseName {
  const jRaw = get('jname');
  const rRaw = get('rname', 'romaji', 'romanji');
  const ja = jRaw === undefined ? null : (parseRuby(jRaw) ?? cleanValue(jRaw));
  const jaLatn = rRaw === undefined ? null : cleanValue(rRaw);
  return {
    ja: ja === null || ja === '' ? null : ja,
    jaLatn: jaLatn === null || jaLatn === '' ? null : jaLatn,
  };
}

/** Wiki source pages a `first`-style param cites, in reading order. */
const SOURCE_LINK_TYPES: readonly (readonly [RegExp, string])[] = [
  [/\[\[\s*Chapter\s+(\d+)/gi, 'manga-chapter'],
  [/\[\[\s*Episode\s+(\d+)/gi, 'anime-episode'],
  [/\[\[\s*Volume\s+(\d+)/gi, 'volume'],
];

/**
 * Source ids cited by a param value. The survey classified `first` as
 * `wikilink_list` on Devil Fruit / Ship / Weapon / Crew Box — i.e.
 * `[[Chapter 156]]; [[Episode 92]]` — while Char Box adds a `{{Qref}}`.
 * Both are read here; wikilinks first (reading order), then Qrefs.
 */
export function parseSourceRefs(
  raw: string,
  qrefTable?: ReadonlyMap<string, readonly QrefSource[]>,
): readonly string[] {
  const out: string[] = [];
  for (const [pattern, type] of SOURCE_LINK_TYPES) {
    for (const m of raw.matchAll(pattern)) out.push(`${type}:${m[1]}`);
  }
  for (const s of parseQrefs(raw, qrefTable)) out.push(s.sourceId);
  return [...new Set(out)];
}

/**
 * The `since` anchor of a set of cited sources: the manga chapter when
 * one is cited (the corpus anchors on the manga), else the first ref.
 */
export function bestSince(sourceIds: readonly string[]): string | null {
  return sourceIds.find((id) => id.startsWith('manga-chapter:')) ?? sourceIds[0] ?? null;
}

export type VocabularyMatch = {
  readonly value: string;
  /** true when the whole cleaned segment equalled a label/id. */
  readonly exact: boolean;
  /** The segment text that produced the match (for warnings). */
  readonly matched: string;
};

/**
 * Match a raw infobox segment against a vocabulary index. Three
 * deterministic passes, in decreasing confidence:
 *
 *  1. EXACT label/id equality (`exact: true`);
 *  2. whole-word containment — "Black Blade; katana" → `katana`;
 *  3. IN-word containment — Fandom writes "Single-edged greatsword"
 *     where the vocabulary says "sword", and "Marines" where the
 *     vocabulary says "marine".
 *
 * Passes 2 and 3 return `exact: false`; every caller turns that into
 * a warning, so an inference is visible in the admin queue instead of
 * being inherited silently. Longest key wins inside a pass, so
 * "mythical zoan" beats "zoan".
 */
export function matchVocabulary(
  index: VocabularyIndex,
  raw: string,
): VocabularyMatch | null {
  const cleaned = cleanValue(raw).toLowerCase().replace(/\s+/g, ' ').trim();
  if (cleaned === '') return null;
  const exact = index.get(cleaned);
  if (exact !== undefined) return { value: exact, exact: true, matched: cleaned };
  const keys = [...index.keys()].sort((a, b) => b.length - a.length).filter((k) => k.length >= 3);
  const escape = (k: string): string => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Pass 2 is a whole-word match; pass 3 lets the key sit INSIDE a
  // word ("greatsword" → sword, "marines" → marine, "shotgun" → gun).
  for (const fill of ['', '[a-z]*'] as const) {
    for (const key of keys) {
      if (new RegExp(`(^|[^a-z0-9])${fill}${escape(key)}${fill}([^a-z0-9]|$)`).test(cleaned)) {
        return { value: index.get(key)!, exact: false, matched: cleaned };
      }
    }
  }
  return null;
}

/** First vocabulary hit across a param's sub-values, in reading order. */
export function matchVocabularyIn(
  index: VocabularyIndex,
  raw: string,
): VocabularyMatch | null {
  for (const segment of splitSegments(raw)) {
    const hit = matchVocabulary(index, segment);
    if (hit !== null) return hit;
  }
  return null;
}

export type ResolvedRelation = {
  readonly type: string;
  readonly target: string;
  readonly qualifiers?: Readonly<Record<string, unknown>>;
};

export type RelationResolution = {
  readonly relations: readonly ResolvedRelation[];
  readonly warnings: readonly string[];
};

/**
 * Turn a `wikilink`/`wikilink_list` param into relation edges, the
 * same way the character mapper does: `[[Target]]`s resolve through
 * the ADR-081 sync ledger (exact titles + redirect aliases), the
 * target's entity type must be one the relation accepts, and a
 * "former"/"disbanded"/struck-through segment needs an `until` that a
 * page fact cannot supply — so it stays a warning for the human pass.
 */
export function resolveRelationParam(options: {
  readonly raw: string | undefined;
  readonly param: string;
  readonly relationType: string;
  readonly targetTypes: readonly string[];
  readonly titleIndex?: TitleIndex;
  readonly since?: string | null;
}): RelationResolution {
  const { raw, param, relationType, targetTypes } = options;
  if (raw === undefined) return { relations: [], warnings: [] };
  const warnings: string[] = [];
  if (options.titleIndex === undefined) {
    return {
      relations: [],
      warnings: [`${param}: "${cleanValue(raw)}" — needs ${relationType} resolution (no ledger)`],
    };
  }
  const relations: ResolvedRelation[] = [];
  const seen = new Set<string>();
  for (const segment of splitSegments(raw)) {
    if (/<s>/i.test(segment) || /\b(former|formerly|disbanded|dissolved)\b/i.test(segment)) {
      warnings.push(
        `${param} segment "${cleanValue(segment)}" is former — needs an until qualifier (human)`,
      );
      continue;
    }
    for (const target of extractLinkTargets(segment)) {
      const link = resolveTitle(options.titleIndex, target);
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
      if (seen.has(link.entityId)) continue;
      seen.add(link.entityId);
      const since = options.since ?? null;
      relations.push({
        type: relationType,
        target: link.entityId,
        ...(since !== null ? { qualifiers: { since } } : {}),
      });
    }
  }
  return { relations, warnings };
}

/** `[[Target]]` / `[[Target|label]]` targets, files/categories excluded. */
function extractLinkTargets(wikitext: string): readonly string[] {
  const out: string[] = [];
  for (const m of wikitext.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const target = (m[1] ?? '').trim();
    if (target === '' || /^[a-z-]+:/i.test(target)) continue;
    out.push(target);
  }
  return out;
}

/**
 * Reuse the entity id the sync ledger already binds to this page, so
 * a re-import does not fork `devil-fruit:gomu-gomu` into
 * `devil-fruit:gomu-gomu-no-mi`. Falls back to `type:slug`.
 */
export function entityIdFor(
  entityType: string,
  slug: string,
  pageTitle: string,
  titleIndex?: TitleIndex,
): string {
  if (titleIndex !== undefined) {
    const known = resolveTitle(titleIndex, pageTitle);
    if (known !== null && known.entityId.startsWith(`${entityType}:`)) return known.entityId;
  }
  return `${entityType}:${slug}`;
}
