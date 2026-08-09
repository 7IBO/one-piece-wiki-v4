/**
 * api-onepiece.com full-corpus candidate import (ADR-101).
 *
 * Orchestrates the per-resource mappers over EN+FR sweeps:
 *
 *  1. fetch every requested resource in every requested locale
 *     (polite client, ~1 req/s, response cache);
 *  2. pair EN/FR records by API id and map each pair to ONE candidate
 *     entity + per-locale translation sidecars;
 *  3. match candidates against EXISTING entities (normalized
 *     name/slug heuristics) — matches yield a DIFF entry in the
 *     report and are NEVER overwritten; only genuinely new records
 *     become candidate files;
 *  4. write candidate files in the EXACT repo layout under a
 *     gitignored candidates/ directory, plus a JSON+Markdown report
 *     (created / matched-diff / skipped / gaps / unanchored /
 *     informational).
 *
 * Resources are swept in dependency order (fruits/crews/sagas… before
 * characters/boats/arcs…) so relation targets resolve against the
 * same sweep's candidates as well as the existing corpus.
 */
import { mapBoat } from './boats.ts';
import { mapChapter } from './chapters.ts';
import { mapCharacter } from './characters.ts';
import type { OnePieceApiClient } from './client.ts';
import {
  type FieldGap,
  type LocalizedRecordPair,
  type MappedCandidate,
  type MapperContext,
  type RawRecord,
} from './common.ts';
import { mapCrew } from './crews.ts';
import { mapEpisode } from './episodes.ts';
import { mapFruit } from './fruits.ts';
import { mapLocation } from './locations.ts';
import {
  diffProperties,
  type ExistingEntity,
  matchExisting,
  type MatchIndex,
  normalizeMatchKey,
  type PropertyDiff,
} from './matching.ts';
import { mapArc, mapSaga } from './sagas-arcs.ts';
import { mapVolume } from './volumes.ts';

export type ImportLocale = 'en' | 'fr';

/** Sweep order = dependency order: relation targets first. */
export const RESOURCE_ORDER: readonly string[] = [
  'fruits',
  'crews',
  'locates',
  'sagas',
  'tomes',
  'arcs',
  'boats',
  'chapters',
  'episodes',
  'characters',
];

type Mapper = (pair: LocalizedRecordPair, ctx: MapperContext) => MappedCandidate | null;

const RESOURCE_MAPPERS: Readonly<Record<string, Mapper>> = {
  characters: mapCharacter,
  fruits: mapFruit,
  crews: mapCrew,
  boats: mapBoat,
  chapters: mapChapter,
  episodes: mapEpisode,
  tomes: mapVolume,
  sagas: mapSaga,
  arcs: mapArc,
  locates: mapLocation,
};

export type CandidateFile = {
  /** Repo-relative path (`data/universes/…`) — the exact corpus layout. */
  readonly path: string;
  /** Serialized JSON (2-space, trailing newline — dprint-clean). */
  readonly content: string;
};

export type ImportReport = {
  readonly generatedAt: string;
  readonly api: string;
  readonly locales: readonly ImportLocale[];
  readonly resources: readonly string[];
  readonly counts: {
    readonly created: number;
    readonly matchedDiff: number;
    readonly skipped: number;
    readonly imageEntities: number;
  };
  readonly created: readonly {
    readonly id: string;
    readonly resource: string;
    readonly files: readonly string[];
  }[];
  readonly matchedDiff: readonly {
    readonly id: string;
    readonly resource: string;
    readonly apiName: string;
    readonly existingPath: string;
    readonly diffs: readonly PropertyDiff[];
    readonly notes: readonly string[];
  }[];
  readonly skipped: readonly { readonly resource: string; readonly reason: string; }[];
  /** Unmapped API fields — NEVER silently dropped (ADR-101). */
  readonly gaps: readonly {
    readonly resource: string;
    readonly field: string;
    readonly occurrences: number;
    readonly example: string;
  }[];
  /** Entries emitted without a `since` anchor (bounties, edges…). */
  readonly unanchored: readonly string[];
  /** Facts deliberately not stored (derived values — ADR-099). */
  readonly informational: readonly string[];
  readonly warnings: readonly string[];
};

export type ImportRunResult = {
  readonly report: ImportReport;
  readonly files: readonly CandidateFile[];
};

export type ImportRunOptions = {
  readonly resources?: readonly string[];
  readonly locales?: readonly ImportLocale[];
  /** Existing-corpus index (never overwritten — diff-only). */
  readonly matchIndex?: MatchIndex;
  /** Vocabulary label indexes (occupations, ship-types, …). */
  readonly vocabularies?: Readonly<Record<string, ReadonlyMap<string, string>>>;
  readonly log?: (line: string) => void;
};

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const UNIVERSE = 'one-piece';

/** Corpus-layout files for one candidate (entity + non-empty sidecars). */
export function buildCandidateFiles(
  candidate: Pick<MappedCandidate, 'entity' | 'translations'>,
): readonly CandidateFile[] {
  const base = candidate.entity.id.split(':')[1] ?? '';
  if (base === '') throw new Error(`Malformed candidate id: "${candidate.entity.id}"`);
  const type = candidate.entity.type;
  const files: CandidateFile[] = [{
    path: `data/universes/${UNIVERSE}/entities/${type}/${base}.json`,
    content: serialize(candidate.entity),
  }];
  for (const locale of ['en', 'fr'] as const) {
    const sidecar = candidate.translations[locale];
    if (Object.keys(sidecar).length === 0) continue;
    files.push({
      path: `data/universes/${UNIVERSE}/translations/${locale}/${type}/${base}.json`,
      content: serialize(sidecar),
    });
  }
  return files;
}

/** Pair EN/FR sweeps of one resource by API record id. */
export function pairRecords(
  en: readonly RawRecord[],
  fr: readonly RawRecord[],
): readonly LocalizedRecordPair[] {
  const recordId = (r: RawRecord): string | null => {
    const id = r['id'];
    if (typeof id === 'number' || typeof id === 'string') return String(id);
    return null;
  };
  const frById = new Map<string, RawRecord>();
  const frLoose: RawRecord[] = [];
  for (const record of fr) {
    const id = recordId(record);
    if (id === null) frLoose.push(record);
    else if (!frById.has(id)) frById.set(id, record);
  }
  const pairs: LocalizedRecordPair[] = [];
  const consumed = new Set<string>();
  for (const record of en) {
    const id = recordId(record);
    if (id !== null && frById.has(id)) {
      pairs.push({ en: record, fr: frById.get(id)! });
      consumed.add(id);
    } else {
      pairs.push({ en: record });
    }
  }
  for (const [id, record] of frById) {
    if (!consumed.has(id)) pairs.push({ fr: record });
  }
  for (const record of frLoose) pairs.push({ fr: record });
  return pairs;
}

/** Display handles of a candidate (slug + every translated name). */
function candidateHandles(candidate: MappedCandidate): readonly string[] {
  const handles = new Set<string>([candidate.entity.slug]);
  for (const locale of ['en', 'fr'] as const) {
    for (const [key, value] of Object.entries(candidate.translations[locale])) {
      if (key.includes('.name') || key.endsWith('.title')) handles.add(value);
    }
  }
  return [...handles];
}

export async function runImport(
  client: OnePieceApiClient,
  options: ImportRunOptions = {},
): Promise<ImportRunResult> {
  const log = options.log ?? ((): void => {});
  const locales = options.locales ?? (['en', 'fr'] as const);
  const requested = options.resources ?? RESOURCE_ORDER;
  for (const resource of requested) {
    if (RESOURCE_MAPPERS[resource] === undefined) {
      throw new Error(
        `unknown resource "${resource}" — expected one of: ${RESOURCE_ORDER.join(', ')}`,
      );
    }
  }
  const resources = RESOURCE_ORDER.filter((r) => requested.includes(r));
  const matchIndex: MatchIndex = options.matchIndex ?? new Map<string, ExistingEntity>();

  // This-sweep candidate registry: `<type>|<norm name>` → entity id,
  // so later resources (characters, boats…) resolve edges to
  // candidates created earlier in the same run.
  const sweepTargets = new Map<string, string>();
  const registerSweepTarget = (type: string, handle: string, id: string): void => {
    const key = `${type}|${normalizeMatchKey(handle)}`;
    if (!sweepTargets.has(key)) sweepTargets.set(key, id);
  };
  const ctx: MapperContext = {
    ...(options.vocabularies !== undefined ? { vocabularies: options.vocabularies } : {}),
    resolveTarget: (name, types) => {
      for (const type of types) {
        const existing = matchExisting(matchIndex, type, [name]);
        if (existing !== null) return existing.id;
      }
      for (const type of types) {
        const hit = sweepTargets.get(`${type}|${normalizeMatchKey(name)}`);
        if (hit !== undefined) return hit;
      }
      return null;
    },
  };

  const files: CandidateFile[] = [];
  const created: { id: string; resource: string; files: readonly string[]; }[] = [];
  const matchedDiff: {
    id: string;
    resource: string;
    apiName: string;
    existingPath: string;
    diffs: readonly PropertyDiff[];
    notes: readonly string[];
  }[] = [];
  const skipped: { resource: string; reason: string; }[] = [];
  const gapCounts = new Map<
    string,
    { resource: string; field: string; n: number; example: string; }
  >();
  const unanchored: string[] = [];
  const informational: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  let imageEntities = 0;

  for (const resource of resources) {
    const mapper = RESOURCE_MAPPERS[resource]!;
    const sweeps = await Promise.all(
      locales.map(async (locale) => await client.fetchResource(resource, locale)),
    );
    const en = locales.includes('en') ? sweeps[locales.indexOf('en')] ?? [] : [];
    const fr = locales.includes('fr') ? sweeps[locales.indexOf('fr')] ?? [] : [];
    const pairs = pairRecords(en, fr);
    log(`${resource}: ${en.length} EN + ${fr.length} FR record(s) → ${pairs.length} pair(s)`);

    for (const pair of pairs) {
      const candidate = mapper(pair, ctx);
      if (candidate === null) {
        const hint = JSON.stringify(pair.en ?? pair.fr ?? {}).slice(0, 60);
        skipped.push({ resource, reason: `unmappable record (no usable name/number): ${hint}…` });
        continue;
      }
      for (const gap of candidate.gaps) registerGap(gapCounts, resource, gap);
      unanchored.push(...candidate.unanchored);
      informational.push(...candidate.informational);
      warnings.push(...candidate.warnings);

      if (seenIds.has(candidate.entity.id)) {
        skipped.push({
          resource,
          reason: `duplicate candidate ${candidate.entity.id} in sweep — first record wins`,
        });
        continue;
      }
      seenIds.add(candidate.entity.id);

      const handles = candidateHandles(candidate);
      const existing = matchExisting(matchIndex, candidate.entity.type, handles);
      if (existing !== null) {
        // NEVER overwrite: report the diff, keep the corpus file.
        const notes: string[] = [];
        for (const image of candidate.images) {
          const urlEntry = (image.entity.properties['url'] as { value?: string; }[])[0];
          notes.push(
            `image URL available (${urlEntry?.value ?? '?'}) — subject exists; `
              + 'attach via review, not overwrite',
          );
        }
        matchedDiff.push({
          id: existing.id,
          resource,
          apiName: handles[1] ?? handles[0] ?? candidate.entity.slug,
          existingPath: existing.path,
          diffs: diffProperties(existing.entity, candidate.entity.properties),
          notes,
        });
        for (const handle of handles) {
          registerSweepTarget(candidate.entity.type, handle, existing.id);
        }
        continue;
      }

      for (const handle of handles) {
        registerSweepTarget(candidate.entity.type, handle, candidate.entity.id);
      }
      const candidateFiles = [...buildCandidateFiles(candidate)];
      for (const image of candidate.images) {
        if (seenIds.has(image.entity.id)) continue;
        seenIds.add(image.entity.id);
        imageEntities += 1;
        candidateFiles.push(...buildCandidateFiles(image));
        if (image.spoilerFallback) {
          warnings.push(
            `${image.entity.id}: spoiler_since fell back to manga-chapter:1 — `
              + 'no anchor known for the subject; tighten during review',
          );
        }
      }
      files.push(...candidateFiles);
      created.push({
        id: candidate.entity.id,
        resource,
        files: candidateFiles.map((f) => f.path),
      });
    }
  }

  const report: ImportReport = {
    generatedAt: new Date().toISOString(),
    api: client.origin,
    locales,
    resources,
    counts: {
      created: created.length,
      matchedDiff: matchedDiff.length,
      skipped: skipped.length,
      imageEntities,
    },
    created,
    matchedDiff,
    skipped,
    gaps: [...gapCounts.values()]
      .sort((a, b) => b.n - a.n || a.field.localeCompare(b.field))
      .map((g) => ({ resource: g.resource, field: g.field, occurrences: g.n, example: g.example })),
    unanchored,
    informational,
    warnings,
  };
  return { report, files };
}

function registerGap(
  counts: Map<string, { resource: string; field: string; n: number; example: string; }>,
  resource: string,
  gap: FieldGap,
): void {
  const key = `${resource}|${gap.field}`;
  const entry = counts.get(key);
  if (entry === undefined) {
    counts.set(key, { resource, field: gap.field, n: 1, example: gap.example });
  } else entry.n += 1;
}

const MD_LIST_LIMIT = 50;

/** Human-readable Markdown twin of the JSON report (ADR-092 style). */
export function renderImportMarkdown(report: ImportReport): string {
  const lines: string[] = [];
  lines.push(`# api-onepiece.com candidate import — ${report.api}`);
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(`- Resources: ${report.resources.join(', ')} (locales: ${report.locales.join(', ')})`);
  lines.push(`- ${report.counts.created} candidate entit(y/ies) created`);
  lines.push(`- ${report.counts.imageEntities} URL-only image entit(y/ies) (ADR-101 §2)`);
  lines.push(
    `- ${report.counts.matchedDiff} matched existing entities (diff-only, NOT overwritten)`,
  );
  lines.push(`- ${report.counts.skipped} skipped record(s)`);
  lines.push('');
  lines.push('## Created candidates');
  lines.push('');
  if (report.created.length === 0) lines.push('None.');
  else {
    for (const c of report.created.slice(0, MD_LIST_LIMIT)) {
      lines.push(`- \`${c.id}\` (${c.resource}) — ${c.files.length} file(s)`);
    }
    if (report.created.length > MD_LIST_LIMIT) {
      lines.push(`…and ${report.created.length - MD_LIST_LIMIT} more (see the JSON report).`);
    }
  }
  lines.push('');
  lines.push('## Matched existing entities (diffs — nothing overwritten)');
  lines.push('');
  if (report.matchedDiff.length === 0) lines.push('None.');
  else {
    for (const m of report.matchedDiff) {
      lines.push(`### \`${m.id}\` ← API "${m.apiName}" (${m.resource})`);
      lines.push('');
      lines.push(`Existing file: \`${m.existingPath}\``);
      lines.push('');
      if (m.diffs.length === 0) lines.push('No property differences.');
      else {
        lines.push('| Property | Existing | API candidate |');
        lines.push('| --- | --- | --- |');
        for (const d of m.diffs) {
          lines.push(
            `| ${d.property} | ${mdCode(d.existing ?? '(absent)')} | ${mdCode(d.candidate)} |`,
          );
        }
      }
      for (const note of m.notes) lines.push(`- ${note}`);
      lines.push('');
    }
  }
  lines.push('## Skipped');
  lines.push('');
  if (report.skipped.length === 0) lines.push('None.');
  else for (const s of report.skipped) lines.push(`- ${s.resource}: ${s.reason}`);
  lines.push('');
  lines.push('## Gaps — unmapped API fields (never silently dropped)');
  lines.push('');
  if (report.gaps.length === 0) lines.push('None.');
  else {
    lines.push('| Resource | Field | Occurrences | Example |');
    lines.push('| --- | --- | ---: | --- |');
    for (const g of report.gaps) {
      lines.push(`| ${g.resource} | ${g.field} | ${g.occurrences} | ${mdCode(g.example)} |`);
    }
  }
  lines.push('');
  lines.push('## Unanchored entries (no `since` — anchor before merge)');
  lines.push('');
  if (report.unanchored.length === 0) lines.push('None.');
  else for (const u of report.unanchored) lines.push(`- ${u}`);
  lines.push('');
  lines.push('## Informational (derived facts, not stored)');
  lines.push('');
  if (report.informational.length === 0) lines.push('None.');
  else for (const i of report.informational) lines.push(`- ${i}`);
  lines.push('');
  lines.push('## Warnings');
  lines.push('');
  if (report.warnings.length === 0) lines.push('None.');
  else for (const w of report.warnings) lines.push(`- ${w}`);
  lines.push('');
  return lines.join('\n');
}

function mdCode(text: string): string {
  return `\`${text.replace(/\|/g, '\\|').replace(/`/g, "'")}\``;
}

export type ImportCliArgs = {
  readonly resources: readonly string[] | null;
  readonly locales: readonly ImportLocale[] | null;
  /** Output directory; null = the CLI's default (candidates/). */
  readonly out: string | null;
  readonly dryRun: boolean;
};

/** Parse `onepiece-api:import` CLI flags; throws on anything malformed. */
export function parseImportArgs(argv: readonly string[]): ImportCliArgs {
  let resources: readonly string[] | null = null;
  let locales: readonly ImportLocale[] | null = null;
  let out: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} expects a value`);
      i += 1;
      return v;
    };
    if (arg === '--resources') {
      resources = next().split(',').map((r) => r.trim()).filter((r) => r !== '');
      for (const r of resources) {
        if (!RESOURCE_ORDER.includes(r)) {
          throw new Error(
            `unknown resource "${r}" — expected one of: ${RESOURCE_ORDER.join(', ')}`,
          );
        }
      }
    } else if (arg === '--locales') {
      const parsed = next().split(',').map((l) => l.trim()).filter((l) => l !== '');
      for (const l of parsed) {
        if (l !== 'en' && l !== 'fr') throw new Error(`unknown locale "${l}" — expected en/fr`);
      }
      locales = parsed as ImportLocale[];
    } else if (arg === '--out') {
      out = next();
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  return { resources, locales, out, dryRun };
}
