/**
 * Full-wiki structural analysis (ADR-092): sweep the MediaWiki API for
 * every category and every infobox template, sample N pages per
 * infobox to build a field inventory, and diff the whole Fandom
 * structure against OUR schema catalogue + mappers. Output: a
 * machine-readable JSON report plus a Markdown summary — build
 * artifacts (`packages/importers/reports/`, gitignored), never
 * committed data. Structure changes on Fandom's side show up as
 * report diffs between runs.
 *
 * Design notes:
 *  - Infobox discovery enumerates the whole Template namespace
 *    (`list=allpages&apnamespace=10`) and filters by NAME: this wiki
 *    follows the local "* Box" convention (Char Box, Chapter Box…),
 *    not MediaWiki's "Infobox *" convention, so an `apprefix=Infobox`
 *    query would miss every one of them. Both shapes are matched.
 *  - Per infobox, sample pages come from ONE `list=embeddedin` batch
 *    (≤500 titles): the batch size is a capped popularity signal AND
 *    the pool the field-inventory samples are drawn from — no full
 *    continuation walk per template.
 *  - The network layer is injected (any {@link FandomClient});
 *    tests drive the entire sweep with fixture-backed fetch stubs.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CHAPTER_HANDLED_PARAMS, CHAPTER_INFOBOX_NAMES } from './chapter.ts';
import { CHARACTER_HANDLED_PARAMS, CHARACTER_INFOBOX_NAMES } from './character.ts';
import type { FandomClient } from './client.ts';
import type { MapperKind } from './crawl.ts';
import {
  EPISODE_HANDLED_PARAMS,
  EPISODE_IGNORED_PARAMS,
  EPISODE_INFOBOX_NAMES,
} from './episode.ts';
import { describeShape, type FieldShape, profileField } from './field-shape.ts';
import {
  aggregateStructures,
  type PageStructure,
  type StructureAggregate,
  surveyPage,
} from './page-structure.ts';
import { VOLUME_HANDLED_PARAMS, VOLUME_INFOBOX_NAMES } from './volume.ts';
import { parseTemplates, type WikiTemplate } from './wikitext.ts';

/** One entity type of our schema catalogue (id + property ids). */
export type EntityTypeCatalogueEntry = {
  readonly id: string;
  readonly properties: readonly string[];
};

export type CategoryReport = {
  readonly name: string;
  readonly pages: number;
  readonly subcats: number;
  /** Our entity type this category plausibly corresponds to, or null. */
  readonly entityType: string | null;
};

export type FieldHandling = 'mapped' | 'ignored' | 'unmapped';

export type InfoboxFieldReport = {
  readonly name: string;
  /** In how many sampled pages the field appeared. */
  readonly occurrences: number;
  readonly handling: FieldHandling;
  /** Same-named property on the matched entity type, when one exists. */
  readonly catalogueProperty: string | null;
  /**
   * What the VALUES look like across the sample — the half of the
   * report a schema redesign is actually built from (field-shape.ts).
   */
  readonly shape: FieldShape;
};

export type InfoboxReport = {
  readonly template: string;
  /** Mapper kind that consumes this infobox, or null (gap). */
  readonly mapper: MapperKind | null;
  /** Entity type fed by this infobox (mapper's, else name-inferred). */
  readonly entityType: string | null;
  /** Transclusions seen in ONE embeddedin batch — CAPPED at 500. */
  readonly transclusionsSampled: number;
  readonly samplePages: readonly string[];
  readonly fields: readonly InfoboxFieldReport[];
  /**
   * What the sampled pages carry OUTSIDE the infobox: section
   * headings, wikitables (headers + row counts) and `{{Qref}}`
   * citations. Most of the wiki's data lives here — appearances per
   * source, chapter/episode lists, cast tables — and an infobox-only
   * inventory reports none of it (page-structure.ts).
   */
  readonly structure: StructureAggregate;
};

export type AnalyzeGaps = {
  /** Fields no mapper handles, sorted by occurrence (desc). */
  readonly unmappedInfoboxFields: readonly {
    readonly template: string;
    readonly field: string;
    readonly occurrences: number;
  }[];
  /** Categories matching no entity type, sorted by page count (desc). */
  readonly categoriesWithoutEntityType: readonly {
    readonly name: string;
    readonly pages: number;
  }[];
  /** Entity types with neither a matching infobox nor a category. */
  readonly entityTypesWithoutFandomSource: readonly string[];
};

export type AnalyzeReport = {
  readonly generatedAt: string;
  readonly wiki: string;
  readonly categories: readonly CategoryReport[];
  readonly infoboxes: readonly InfoboxReport[];
  readonly catalogue: readonly EntityTypeCatalogueEntry[];
  readonly gaps: AnalyzeGaps;
};

/**
 * Category-slug → entity-type correspondence table. This is DATA
 * maintained in code (ADR-092): extend it whenever the analyze report
 * surfaces a content category the generic slug-similarity fallback
 * (singularised category slug === entity-type id) cannot match.
 */
export const CATEGORY_ENTITY_TYPES: Readonly<Record<string, string>> = {
  'characters': 'character',
  'chapters': 'manga-chapter',
  'one-piece-chapters': 'manga-chapter',
  'manga-chapters': 'manga-chapter',
  'episodes': 'anime-episode',
  'anime-episodes': 'anime-episode',
  'one-piece-episodes': 'anime-episode',
  'volumes': 'volume',
  'one-piece-volumes': 'volume',
  'devil-fruits': 'devil-fruit',
  'devil-fruit-users': 'character',
  'crews': 'crew',
  'pirate-crews': 'crew',
  'organizations': 'organization',
  'locations': 'location',
  'islands': 'location',
  'towns': 'location',
  'ships': 'ship',
  'races': 'race',
  'races-and-tribes': 'race',
  'weapons': 'weapon',
  'swords': 'weapon',
  'techniques': 'technique',
  'fighting-techniques': 'technique',
  'story-arcs': 'arc',
  'arcs': 'arc',
  'sagas': 'saga',
  'movies': 'film',
  'films': 'film',
  'one-piece-movies': 'film',
  'specials': 'anime-special',
  'video-games': 'video-game',
  'songs': 'theme-song',
  'music': 'theme-song',
  'real-life-people': 'person',
  'sbs': 'sbs',
  'databooks': 'databook',
  'merchandise': 'merchandise',
  'titles': 'title',
  'events': 'event',
  'materials': 'material',
  'transformations': 'transformation',
};

/** Kebab-case slug of a category/template name. */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "characters" → "character", "stories" → "story"; no-op otherwise. */
function singularize(slug: string): string {
  if (slug.endsWith('ies')) return `${slug.slice(0, -3)}y`;
  if (slug.endsWith('s') && !slug.endsWith('ss')) return slug.slice(0, -1);
  return slug;
}

/**
 * Entity type a category plausibly corresponds to: the maintained
 * table first, then slug similarity (exact or singularised slug ===
 * entity-type id). Only ids present in the catalogue are returned.
 */
export function categoryEntityType(
  categoryName: string,
  typeIds: ReadonlySet<string>,
): string | null {
  const slug = slugify(categoryName);
  const fromTable = CATEGORY_ENTITY_TYPES[slug];
  if (fromTable !== undefined && typeIds.has(fromTable)) return fromTable;
  if (typeIds.has(slug)) return slug;
  const singular = singularize(slug);
  if (typeIds.has(singular)) return singular;
  return null;
}

/** Template-name test for "is this an infobox?" — both conventions. */
export function isInfoboxTemplate(name: string): boolean {
  return /^infobox\b/i.test(name.trim()) || /\bbox$/i.test(name.trim());
}

/** Underscores→spaces, collapsed, lowercased — template-name compare key. */
function normalizeTemplateName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

type InfoboxMapperInfo = {
  readonly kind: MapperKind;
  readonly entityType: string;
  readonly templates: readonly string[];
  readonly handled: readonly string[];
  readonly ignored: readonly string[];
};

/** Mapper registry — grows in lockstep with new mappers (ADR-079). */
const INFOBOX_MAPPERS: readonly InfoboxMapperInfo[] = [
  {
    kind: 'chapter',
    entityType: 'manga-chapter',
    templates: CHAPTER_INFOBOX_NAMES,
    handled: CHAPTER_HANDLED_PARAMS,
    ignored: [],
  },
  {
    kind: 'episode',
    entityType: 'anime-episode',
    templates: EPISODE_INFOBOX_NAMES,
    handled: EPISODE_HANDLED_PARAMS,
    ignored: EPISODE_IGNORED_PARAMS,
  },
  {
    kind: 'character',
    entityType: 'character',
    templates: CHARACTER_INFOBOX_NAMES,
    handled: CHARACTER_HANDLED_PARAMS,
    ignored: [],
  },
  {
    kind: 'volume',
    entityType: 'volume',
    templates: VOLUME_INFOBOX_NAMES,
    handled: VOLUME_HANDLED_PARAMS,
    ignored: [],
  },
];

function mapperForTemplate(template: string): InfoboxMapperInfo | null {
  const wanted = normalizeTemplateName(template);
  for (const m of INFOBOX_MAPPERS) {
    if (m.templates.some((t) => normalizeTemplateName(t) === wanted)) return m;
  }
  return null;
}

/** "Crew Box" → "crew", "Infobox island" → "island" — then catalogue check. */
function inferEntityTypeFromTemplate(
  template: string,
  typeIds: ReadonlySet<string>,
): string | null {
  const stripped = template
    .replace(/^infobox\s+/i, '')
    .replace(/\s*box$/i, '');
  const slug = slugify(stripped);
  if (slug === '') return null;
  if (typeIds.has(slug)) return slug;
  const singular = singularize(slug);
  return typeIds.has(singular) ? singular : null;
}

/** Find the template on a page whose name matches, nesting-safe. */
function findInfoboxOnPage(wikitext: string, template: string): WikiTemplate | null {
  const wanted = normalizeTemplateName(template);
  for (const t of parseTemplates(wikitext)) {
    if (normalizeTemplateName(t.name) === wanted) return t;
  }
  return null;
}

/** "Blood Type" / "blood_type" → "blood_type" — property compare key. */
function fieldToPropertyKey(field: string): string {
  return field.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export type AnalyzeOptions = {
  /** Pages sampled per infobox for the field inventory. Default 5. */
  readonly samplesPerInfobox?: number;
  /** Cap on infobox templates analyzed (bounded/partial runs). */
  readonly maxInfoboxes?: number;
  readonly log?: (line: string) => void;
};

/**
 * Run the full structural sweep. Sequential on purpose — the client's
 * rate limiter is the politeness contract with Fandom.
 */
export async function analyzeWiki(
  client: FandomClient,
  catalogue: readonly EntityTypeCatalogueEntry[],
  options: AnalyzeOptions = {},
): Promise<AnalyzeReport> {
  const log = options.log ?? ((): void => {});
  const samples = options.samplesPerInfobox ?? 5;
  const typeIds = new Set(catalogue.map((t) => t.id));
  const propertyKeysByType = new Map(
    catalogue.map((t) => [t.id, new Map(t.properties.map((p) => [fieldToPropertyKey(p), p]))]),
  );

  log('sweeping categories (list=allcategories)…');
  const categories: CategoryReport[] = (await client.allCategories({ log })).map((c) => ({
    name: c.name,
    pages: c.pages,
    subcats: c.subcats,
    entityType: categoryEntityType(c.name, typeIds),
  }));

  log('sweeping the Template namespace (list=allpages, ns 10)…');
  const infoboxTemplates = (await client.templateTitles({ log })).filter(isInfoboxTemplate);
  const limited = options.maxInfoboxes !== undefined
    ? infoboxTemplates.slice(0, options.maxInfoboxes)
    : infoboxTemplates;
  log(`${limited.length} infobox template(s) to sample (${samples} page(s) each)…`);

  const infoboxes: InfoboxReport[] = [];
  for (const template of limited) {
    let transcluders: readonly string[];
    try {
      transcluders = await client.embeddedIn(template);
    } catch (err) {
      // A transport failure must still fail FAST — only rethrow those.
      if (err instanceof Error && err.message.startsWith('Fandom unreachable')) throw err;
      log(`embeddedin "${template}" failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const samplePages = transcluders.slice(0, samples);
    const occurrences = new Map<string, { name: string; count: number; values: string[]; }>();
    let pagesWithBox = 0;
    const structures: PageStructure[] = [];
    for (const title of samplePages) {
      let wikitext: string;
      try {
        wikitext = (await client.fetchParse(title)).wikitext;
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Fandom unreachable')) throw err;
        log(`sample "${title}" failed: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      const box = findInfoboxOnPage(wikitext, template);
      if (box === null) {
        log(`sample "${title}": template "${template}" not found top-level — skipped`);
        continue;
      }
      pagesWithBox += 1;
      structures.push(surveyPage(wikitext));
      for (const [name, raw] of Object.entries(box.named)) {
        const key = name.trim().toLowerCase();
        const existing = occurrences.get(key);
        if (existing === undefined) {
          occurrences.set(key, { name: name.trim(), count: 1, values: [raw] });
        } else {
          existing.count += 1;
          existing.values.push(raw);
        }
      }
    }

    const mapper = mapperForTemplate(template);
    const entityType = mapper?.entityType ?? inferEntityTypeFromTemplate(template, typeIds);
    const handled = new Set((mapper?.handled ?? []).map((p) => p.trim().toLowerCase()));
    const ignored = new Set((mapper?.ignored ?? []).map((p) => p.trim().toLowerCase()));
    const propertyKeys = entityType !== null ? propertyKeysByType.get(entityType) : undefined;
    const fields: InfoboxFieldReport[] = [...occurrences.entries()]
      .map(([key, { name, count, values }]) => ({
        name,
        occurrences: count,
        handling: handled.has(key)
          ? ('mapped' as const)
          : ignored.has(key)
          ? ('ignored' as const)
          : ('unmapped' as const),
        catalogueProperty: propertyKeys?.get(fieldToPropertyKey(name)) ?? null,
        shape: profileField(values, pagesWithBox),
      }))
      .sort((a, b) => b.occurrences - a.occurrences || a.name.localeCompare(b.name));

    infoboxes.push({
      template,
      mapper: mapper?.kind ?? null,
      entityType,
      transclusionsSampled: transcluders.length,
      samplePages,
      fields,
      structure: aggregateStructures(structures),
    });
    log(
      `infobox "${template}": ${transcluders.length} transclusion(s) sampled, `
        + `${fields.length} field(s)`,
    );
  }
  infoboxes.sort((a, b) =>
    b.transclusionsSampled - a.transclusionsSampled || a.template.localeCompare(b.template)
  );

  // --- Gaps -------------------------------------------------------
  const unmappedInfoboxFields = infoboxes
    .flatMap((box) =>
      box.fields
        .filter((f) => f.handling === 'unmapped')
        .map((f) => ({ template: box.template, field: f.name, occurrences: f.occurrences }))
    )
    .sort((a, b) => b.occurrences - a.occurrences || a.field.localeCompare(b.field));

  const categoriesWithoutEntityType = categories
    .filter((c) => c.entityType === null)
    .map((c) => ({ name: c.name, pages: c.pages }))
    .sort((a, b) => b.pages - a.pages || a.name.localeCompare(b.name));

  const sourced = new Set<string>();
  for (const c of categories) if (c.entityType !== null) sourced.add(c.entityType);
  for (const box of infoboxes) if (box.entityType !== null) sourced.add(box.entityType);
  const entityTypesWithoutFandomSource = catalogue
    .map((t) => t.id)
    .filter((id) => !sourced.has(id))
    .sort();

  return {
    generatedAt: new Date().toISOString(),
    wiki: client.origin,
    categories,
    infoboxes,
    catalogue,
    gaps: { unmappedInfoboxFields, categoriesWithoutEntityType, entityTypesWithoutFandomSource },
  };
}

/**
 * Load the entity-type catalogue from schema directories (core +
 * universe overlay). Only what the analyzer needs: ids + property
 * ids — no property name is interpreted, matching stays generic.
 */
export async function loadEntityTypeCatalogue(
  dirs: readonly string[],
): Promise<readonly EntityTypeCatalogueEntry[]> {
  const entries: EntityTypeCatalogueEntry[] = [];
  for (const dir of dirs) {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      const parsed = (await Bun.file(join(dir, file)).json()) as {
        id?: string;
        properties?: readonly { id?: string; }[];
      };
      if (parsed.id === undefined) continue;
      entries.push({
        id: parsed.id,
        properties: (parsed.properties ?? [])
          .map((p) => p.id ?? '')
          .filter((id) => id !== ''),
      });
    }
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

const MD_FIELD_GAP_LIMIT = 40;
const MD_CATEGORY_GAP_LIMIT = 30;
const MD_STRUCTURE_LIMIT = 20;

/** Human-readable Markdown twin of the JSON report. */
export function renderMarkdownSummary(report: AnalyzeReport): string {
  const lines: string[] = [];
  const matchedCategories = report.categories.filter((c) => c.entityType !== null).length;
  const mappedInfoboxes = report.infoboxes.filter((b) => b.mapper !== null).length;
  lines.push(`# Fandom structural analysis — ${report.wiki}`);
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(
    `- ${report.categories.length} categories (${matchedCategories} matched to an entity type)`,
  );
  lines.push(`- ${report.infoboxes.length} infobox templates (${mappedInfoboxes} with a mapper)`);
  lines.push(`- ${report.catalogue.length} entity types in our catalogue`);
  lines.push('');
  lines.push('## Infoboxes');
  lines.push('');
  lines.push(
    '| Template | Mapper | Entity type | Transclusions (≤500) | Fields mapped/ignored/unmapped |',
  );
  lines.push('| --- | --- | --- | ---: | --- |');
  for (const box of report.infoboxes) {
    const mapped = box.fields.filter((f) => f.handling === 'mapped').length;
    const ignored = box.fields.filter((f) => f.handling === 'ignored').length;
    const unmapped = box.fields.filter((f) => f.handling === 'unmapped').length;
    lines.push(
      `| ${box.template} | ${box.mapper ?? '—'} | ${box.entityType ?? '—'} | `
        + `${box.transclusionsSampled} | ${mapped}/${ignored}/${unmapped} |`,
    );
  }
  lines.push('');
  lines.push('## Field inventory');
  lines.push('');
  lines.push(
    'Value shapes across the sampled pages — the input for schema work. '
      + '`enum_like` means few distinct values over many pages (a vocabulary candidate); '
      + '`wikilink` / `wikilink_list` mean the field points at other entities (a relation '
      + 'candidate, not a string property); `template` means the value needs its own parser.',
  );
  for (const box of report.infoboxes) {
    if (box.fields.length === 0) continue;
    lines.push('');
    lines.push(`### ${box.template}${box.entityType === null ? '' : ` → \`${box.entityType}\``}`);
    lines.push('');
    lines.push('| Field | Handling | Shape | Examples |');
    lines.push('| --- | --- | --- | --- |');
    for (const f of box.fields) {
      const examples = f.shape.examples
        .map((e) => `\`${e.replace(/\|/g, '\\|').replace(/`/g, "'")}\``)
        .join('<br>');
      lines.push(
        `| ${f.name} | ${f.handling} | ${describeShape(f.shape)} | ${examples} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Page structure (outside the infobox)');
  lines.push('');
  lines.push(
    'Where the bulk of the data actually lives: recurring section headings, '
      + 'wikitable column signatures (rows are entities or edges, not fields) '
      + 'and `{{Qref}}` citation density (the per-source anchors that fill the '
      + '`since` axis and the appearance edges).',
  );
  for (const box of report.infoboxes) {
    const st = box.structure;
    if (st.pages === 0) continue;
    lines.push('');
    lines.push(`### ${box.template} — ${st.pages} page(s) surveyed`);
    lines.push('');
    lines.push(
      `${st.qrefsPerPage.toFixed(1)} Qref citation(s) and `
        + `${st.wikilinksPerPage.toFixed(0)} wikilink(s) per page.`,
    );
    if (st.headings.length > 0) {
      lines.push('');
      lines.push('| Section heading | Pages |');
      lines.push('| --- | ---: |');
      for (const h of st.headings.slice(0, MD_STRUCTURE_LIMIT)) {
        lines.push(`| ${h.text} | ${h.pages} |`);
      }
    }
    if (st.tables.length > 0) {
      lines.push('');
      lines.push('| Table columns | Tables | Rows |');
      lines.push('| --- | ---: | ---: |');
      for (const t of st.tables.slice(0, MD_STRUCTURE_LIMIT)) {
        const cols = t.headers.length === 0
          ? '(no header row)'
          : t.headers.join(' · ').replace(/\|/g, '\\|');
        lines.push(`| ${cols} | ${t.tables} | ${t.rows} |`);
      }
    }
  }
  lines.push('');
  lines.push('## Gaps');
  lines.push('');
  lines.push(`### Unmapped infobox fields (top ${MD_FIELD_GAP_LIMIT} by occurrence)`);
  lines.push('');
  if (report.gaps.unmappedInfoboxFields.length === 0) lines.push('None.');
  else {
    lines.push('| Template | Field | Occurrences | Shape |');
    lines.push('| --- | --- | ---: | --- |');
    for (const gap of report.gaps.unmappedInfoboxFields.slice(0, MD_FIELD_GAP_LIMIT)) {
      const shape = report.infoboxes
        .find((b) => b.template === gap.template)
        ?.fields.find((f) => f.name === gap.field)?.shape;
      lines.push(
        `| ${gap.template} | ${gap.field} | ${gap.occurrences} | `
          + `${shape === undefined ? '—' : describeShape(shape)} |`,
      );
    }
  }
  lines.push('');
  lines.push(`### Categories without an entity type (top ${MD_CATEGORY_GAP_LIMIT} by page count)`);
  lines.push('');
  if (report.gaps.categoriesWithoutEntityType.length === 0) lines.push('None.');
  else {
    lines.push('| Category | Pages |');
    lines.push('| --- | ---: |');
    for (const gap of report.gaps.categoriesWithoutEntityType.slice(0, MD_CATEGORY_GAP_LIMIT)) {
      lines.push(`| ${gap.name} | ${gap.pages} |`);
    }
    const rest = report.gaps.categoriesWithoutEntityType.length - MD_CATEGORY_GAP_LIMIT;
    if (rest > 0) lines.push('', `…and ${rest} more (see the JSON report).`);
  }
  lines.push('');
  lines.push('### Entity types without a Fandom source');
  lines.push('');
  if (report.gaps.entityTypesWithoutFandomSource.length === 0) lines.push('None.');
  else for (const id of report.gaps.entityTypesWithoutFandomSource) lines.push(`- \`${id}\``);
  lines.push('');
  return lines.join('\n');
}

export type AnalyzeCliArgs = {
  readonly samples: number;
  /** Output directory; null = the CLI's default (reports/). */
  readonly out: string | null;
  readonly maxInfoboxes: number | null;
};

/**
 * Samples per infobox under `--full`. Five pages tell you a field
 * exists; forty tell you what its values look like, which is what
 * designing a property needs. At 1 req/s this is the cost of a real
 * survey, and it is meant to be paid once per schema campaign.
 */
export const FULL_SWEEP_SAMPLES = 40;

/** Parse `fandom:analyze` CLI flags; throws on anything malformed. */
export function parseAnalyzeArgs(argv: readonly string[]): AnalyzeCliArgs {
  let samples = 5;
  let samplesExplicit = false;
  let out: string | null = null;
  let maxInfoboxes: number | null = null;
  let full = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} expects a value`);
      i += 1;
      return v;
    };
    if (arg === '--samples') {
      samples = Number(next());
      samplesExplicit = true;
      if (!Number.isInteger(samples) || samples < 1) {
        throw new Error('--samples expects a positive integer');
      }
    } else if (arg === '--full') {
      full = true;
    } else if (arg === '--out') {
      out = next();
    } else if (arg === '--max-infoboxes') {
      maxInfoboxes = Number(next());
      if (!Number.isInteger(maxInfoboxes) || maxInfoboxes < 1) {
        throw new Error('--max-infoboxes expects a positive integer');
      }
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  // `--full` raises the sample depth and lifts the infobox cap, but an
  // explicit --samples still wins — the flag is a preset, not a lock.
  if (full) {
    if (!samplesExplicit) samples = FULL_SWEEP_SAMPLES;
    maxInfoboxes = null;
  }
  return { samples, out, maxInfoboxes };
}
