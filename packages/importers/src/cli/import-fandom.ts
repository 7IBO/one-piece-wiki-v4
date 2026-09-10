/**
 * bun run import:fandom <kind> <page…> [--stage] [--overwrite]
 *
 * End-to-end Fandom import (ADR-079): fetch via the MediaWiki API,
 * map deterministically, validate against the generated Zod, then
 * either report (default = dry-run) or stage files into the working
 * tree (`--stage`; the human commits through the normal PR flow).
 *
 *   bun run import:fandom chapter "Chapter 1044" "Chapter 1045"
 *   bun run import:fandom character Hyougoro --stage
 *   bun run import:fandom devil-fruit "Gomu Gomu no Mi" --stage
 *   bun run import:fandom crawl --category "Devil Fruits" --depth 2 --stage
 *   bun run import:fandom check-updates
 *
 * Kinds (ADR-079 + ADR-109): chapter, episode, character, volume,
 * devil-fruit, crew, ship, organization, weapon, arc, saga. `crawl`
 * auto-detects the infobox, so a category run needs no kind.
 *
 * `check-updates` compares the live revisions of every ledger page
 * (data/import/fandom-pages.json) and lists the stale ones — the CI
 * sync workflow runs exactly this.
 *
 * Any run that STAGES also writes the ledger back, so `--skip-known`
 * advances: chained bounded runs walk forward through a category
 * instead of re-fetching its first `limit` pages every time.
 *
 * NETWORK: needs egress to onepiece.fandom.com (blocked in cloud
 * Claude sandboxes; fine locally and on CI runners — ADR-079 §6).
 */
import { join } from 'node:path';
import { REPO_ROOT } from '../../../schema-engine/src/paths.ts';
import { buildEmitFiles, type MapperEmit, mergeEntity, stageToLocal } from '../emit.ts';
import { type ArcSpans, findOverlaps, orderArcs, planArcEdges } from '../fandom/arc-ranges.ts';
import { mapArc } from '../fandom/arc.ts';
import type { BoxMapContext } from '../fandom/box.ts';
import { enrichChapterFromRendered, isSeededChapterTitle } from '../fandom/chapter-rendered.ts';
import { mapChapter } from '../fandom/chapter.ts';
import { mapCharacter } from '../fandom/character.ts';
import { citedSourceIds, stubForCitedSource } from '../fandom/cited-sources.ts';
import { FandomClient, type ParsedPage } from '../fandom/client.ts';
import { crawl, type CrawlResult, type MapperKind } from '../fandom/crawl.ts';
import { mapCrew } from '../fandom/crew.ts';
import { mapDevilFruit } from '../fandom/devil-fruit.ts';
import { mapEpisode } from '../fandom/episode.ts';
import { mapIsland } from '../fandom/island.ts';
import { mapOrganization } from '../fandom/organization.ts';
import {
  buildTitleIndex,
  type FandomRegistry,
  findTitleClashes,
  type ImportedPage,
  recordImports,
  recordRedirects,
  staleEntries,
} from '../fandom/registry.ts';
import { parseOrdinalRange, parseRenderedInfobox } from '../fandom/rendered-box.ts';
import { orderSagas, type SagaChainLink } from '../fandom/saga-order.ts';
import { mapSaga } from '../fandom/saga.ts';
import { mapShip } from '../fandom/ship.ts';
import { loadVocabularyIndexes } from '../fandom/vocabulary.ts';
import { mapVolume } from '../fandom/volume.ts';
import { mapWeapon } from '../fandom/weapon.ts';

const MAPPER_KINDS: readonly MapperKind[] = [
  'chapter',
  'episode',
  'character',
  'volume',
  'devil-fruit',
  'crew',
  'ship',
  'organization',
  'weapon',
  'arc',
  'saga',
  'island',
];

const REGISTRY_PATH = join(REPO_ROOT, 'data', 'import', 'fandom-pages.json');

async function loadRegistry(): Promise<FandomRegistry> {
  return (await Bun.file(REGISTRY_PATH).json()) as FandomRegistry;
}

/**
 * Write the ledger back after a staging run.
 *
 * Until this existed the ledger was read and never written: three
 * entries against 881 imported entities, so `--skip-known` skipped
 * nothing and every bounded run re-crawled the same first `limit`
 * pages of a category. Chaining runs to walk 1145 chapters only works
 * because the frontier is now PERSISTED.
 *
 * Only `--stage` writes. A dry run must leave the tree untouched, and
 * a ledger entry for an entity whose file was never written would
 * make the next run skip a page it has not actually imported.
 */
async function saveRegistry(registry: FandomRegistry): Promise<void> {
  await Bun.write(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
}

/**
 * The ordinals a source type actually holds on disk.
 *
 * Read from the FILES, not from a range: a plage of 155-217 licenses
 * an edge only for the chapters that exist, and a relation pointing
 * at a missing entity is what `check:references` refuses.
 */
async function ordinalsOnDisk(type: string): Promise<ReadonlySet<number>> {
  const dir = join(REPO_ROOT, 'data', 'universes', 'one-piece', 'entities', type);
  const out = new Set<number>();
  const glob = new Bun.Glob('*.json');
  for await (const file of glob.scan({ cwd: dir })) {
    const n = Number(file.replace(/\.json$/, ''));
    if (Number.isInteger(n)) out.add(n);
  }
  return out;
}

/**
 * Fold a fragment onto an entity already on disk, returning whether
 * anything changed.
 *
 * `mergeEntity` is the same fold `--overwrite` uses, so the same rule
 * holds: what is already there survives, relations union, and a
 * repeated run writes nothing the second time.
 */
async function addToEntity(entityId: string, fragment: unknown): Promise<boolean> {
  const [type, base] = entityId.split(':');
  if (type === undefined || base === undefined) return false;
  const path = join(
    REPO_ROOT,
    'data',
    'universes',
    'one-piece',
    'entities',
    type,
    `${base}.json`,
  );
  const file = Bun.file(path);
  if (!(await file.exists())) return false;
  const before = await file.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the
  // shape is the corpus entity file; mergeEntity is what types it.
  const after = mergeEntity(JSON.parse(before) as any, fragment as any);
  if (after === before) return false;
  await Bun.write(path, after);
  return true;
}

/** What the ledger records about one page a run mapped. */
function importedFrom(
  page: ParsedPage,
  entityId: string,
  importedAt: string,
  alias?: string,
): ImportedPage {
  return {
    entityId,
    page: page.title,
    pageId: page.pageId,
    ...(page.revId !== undefined ? { revId: page.revId } : {}),
    ...(alias !== undefined ? { alias } : {}),
    importedAt,
  };
}

async function buildMappers(): Promise<
  Record<MapperKind, (page: ParsedPage) => (MapperEmit & { warnings: readonly string[]; }) | null>
> {
  const [registry, vocabularies] = await Promise.all([
    loadRegistry(),
    loadVocabularyIndexes(REPO_ROOT),
  ]);
  const titleIndex = buildTitleIndex(registry);
  const occupations = vocabularies.get('occupations');
  const ctx = { titleIndex, ...(occupations !== undefined ? { occupations } : {}) };
  const boxCtx: BoxMapContext = { titleIndex, vocabularies };
  return {
    chapter: mapChapter,
    episode: mapEpisode,
    character: (page) => mapCharacter(page, ctx),
    volume: mapVolume,
    'devil-fruit': (page) => mapDevilFruit(page, boxCtx),
    crew: (page) => mapCrew(page, boxCtx),
    ship: (page) => mapShip(page, boxCtx),
    organization: (page) => mapOrganization(page, boxCtx),
    weapon: (page) => mapWeapon(page, boxCtx),
    arc: (page) => mapArc(page, boxCtx),
    saga: mapSaga,
    island: (page) => mapIsland(page, boxCtx),
  };
}

const args = process.argv.slice(2);
/** Le rang injecte dans l'entite mappee, sans muter la sortie du mapper. */
function withSagaNumber<T extends MapperEmit>(emit: T, sagaNumber: number): T {
  const properties = emit.entity['properties'];
  const base = typeof properties === 'object' && properties !== null
    ? properties as Record<string, unknown>
    : {};
  return {
    ...emit,
    entity: { ...emit.entity, properties: { ...base, saga_number: { value: sagaNumber } } },
  };
}

/**
 * `saga_number` est `required` au schema et absent du Saga Box : il se
 * deduit de la CHAINE des pages mappees dans le run (`orderSagas`).
 *
 * Le rang n'arrive donc pas du mapper mais d'ici, apres le crawl,
 * quand l'ensemble est connu. `crawl()` efface structurellement le
 * champ `chain` de `SagaMapResult` — le re-mapper est pur et sans
 * reseau, c'est le chemin type plutot qu'un cast.
 */
function rankSagas(
  results: readonly CrawlResult[],
): { readonly ranks: ReadonlyMap<string, number>; readonly warnings: readonly string[]; } {
  const links: SagaChainLink[] = [];
  for (const r of results) {
    if (r.kind !== 'saga') continue;
    const remapped = mapSaga(r.page);
    if (remapped === null) continue;
    links.push({
      id: remapped.entity.id,
      title: r.page.title,
      previous: remapped.chain.previous,
      next: remapped.chain.next,
    });
  }
  if (links.length === 0) return { ranks: new Map(), warnings: [] };
  const ordering = orderSagas(links);
  return {
    ranks: new Map(ordering.ranks.map((r) => [r.id, r.sagaNumber])),
    warnings: ordering.warnings,
  };
}

const stage = args.includes('--stage');
const overwrite = args.includes('--overwrite');
/**
 * Flags that take a VALUE. Without this list the value was read as a
 * positional: `render "Arabasta Arc" --out docs/audits/rendered` sent
 * the importer looking for a Fandom page called "docs/audits/rendered"
 * — after correctly capturing all five real pages, so the run failed
 * having done its job and committed nothing.
 */
const VALUE_FLAGS = new Set(['--category', '--page', '--limit', '--depth', '--out']);
const positional = args.filter((a, i) =>
  !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1] ?? '')
);
const [kind, ...pages] = positional;

const client = new FandomClient({
  cacheDir: join(REPO_ROOT, '.cache', 'fandom'),
});

if (kind === 'crawl') {
  // bun run import:fandom crawl --category "One Piece Chapters" --depth 2
  //   [--page "Monkey D. Luffy"] [--limit 50] [--skip-known] [--stage]
  const opt = (name: string): readonly string[] =>
    args.flatMap((a, i) => (a === `--${name}` && args[i + 1] !== undefined ? [args[i + 1]!] : []));
  const categories = opt('category');
  const seedPages = opt('page');
  const limit = Number(opt('limit')[0] ?? '25');
  const categoryDepth = Number(opt('depth')[0] ?? '2');
  const registry = await loadRegistry();
  const vocabularies = await loadVocabularyIndexes(REPO_ROOT);

  // Successive bounded runs should ADVANCE through a category, not
  // re-fetch the same first `limit` pages (run 5, 2026-08-07).
  const skipKnown = args.includes('--skip-known');

  const report = await crawl(client, { categories, pages: seedPages }, {
    limit,
    categoryDepth,
    registry,
    vocabularies,
    skipKnown,
    log: (line) => process.stdout.write(`  ${line}\n`),
  });

  const sagas = rankSagas(report.results);
  for (const w of sagas.warnings) process.stdout.write(`  saga: ${w}\n`);

  const importedAt = new Date().toISOString();
  const imported: ImportedPage[] = [];
  /** Sagas mappees mais hors chaine : sans rang, le fichier serait invalide. */
  const unranked: string[] = [];
  /** Sources citees par Qref (`sbs:`, `databook-card:`) a materialiser. */
  const citedSources = new Set<string>();
  // Deux pages distinctes qui produisent le MEME id sont deux entites
  // confondues, pas une re-import. `stageToLocal` ne peut pas faire la
  // difference : il voit un fichier deja present et le saute (ou, avec
  // `--overwrite`, fond les deux en une chimere). Le run, lui, sait
  // de quelle page vient chaque id — c'est donc ici que ca se refuse.
  // Le cas est devenu atteignable en retirant les parentheses du slug
  // (`../slug.ts`) : Fandom desambigue par parenthese.
  const pageOfId = new Map<string, string>();
  const collisions: { readonly page: string; readonly id: string; readonly first: string; }[] = [];
  for (const r of report.results) {
    const seenOn = pageOfId.get(r.mapped.entity.id);
    if (seenOn !== undefined && seenOn !== r.page.title) {
      collisions.push({ page: r.page.title, id: r.mapped.entity.id, first: seenOn });
      continue;
    }
    pageOfId.set(r.mapped.entity.id, r.page.title);
    let emit = r.mapped;
    if (r.kind === 'saga') {
      const rank = sagas.ranks.get(r.mapped.entity.id);
      // Sans rang, ecrire le fichier produirait une entite invalide
      // (`saga_number` requis). On refuse la page plutot que le corpus.
      if (rank === undefined) {
        unranked.push(r.mapped.entity.id);
        continue;
      }
      emit = withSagaNumber(r.mapped, rank);
    }
    for (const sourceId of citedSourceIds(emit)) citedSources.add(sourceId);
    const files = buildEmitFiles(emit);
    if (stage) {
      // eslint-disable-next-line no-await-in-loop
      const staged = await stageToLocal(files, { repoRoot: REPO_ROOT, overwrite });
      for (const p of staged.written) process.stdout.write(`  wrote ${p}\n`);
      for (const sk of staged.skipped) process.stdout.write(`  skip ${sk.path}: ${sk.reason}\n`);
    }
    // Recorded even when the entity file was SKIPPED as already
    // present: "this page is imported" is exactly what that skip
    // means, and the ledger is how the next run knows it.
    imported.push(importedFrom(r.page, r.mapped.entity.id, importedAt, r.redirectedFrom));
  }
  if (stage && imported.length > 0) {
    const next = recordImports(registry, imported);
    await saveRegistry(next);
    process.stdout.write(
      `  ledger: ${imported.length} page(s) recorded, ${next.pages.length} tracked total\n`,
    );
  }
  if (unranked.length > 0) {
    process.stdout.write(
      `\n${unranked.length} saga(s) NON ECRITE(S) — hors de la chaine, donc sans rang :\n`
        + `  ${unranked.join(', ')}\n`
        + '  Relancer avec les pages manquantes de la chaine (prev/next).\n',
    );
  }
  // Les sources citees existent, ou la reference est pendante. On les
  // ecrit APRES les entites, et sans `--overwrite` : une fiche deja
  // renseignee a la main ne doit pas retomber a son stub.
  if (stage && citedSources.size > 0) {
    let written = 0;
    for (const sourceId of [...citedSources].sort()) {
      const stub = stubForCitedSource(sourceId);
      if (stub === null) continue;
      // eslint-disable-next-line no-await-in-loop
      const staged = await stageToLocal(buildEmitFiles(stub), {
        repoRoot: REPO_ROOT,
        overwrite: false,
      });
      written += staged.written.length;
    }
    if (written > 0) {
      process.stdout.write(
        `  sources citees : ${written} fichier(s) ecrit(s) pour ${citedSources.size} source(s)\n`,
      );
    }
  }

  if (collisions.length > 0) {
    process.stdout.write(
      `\n${collisions.length} page(s) REFUSEE(S) — id deja produit dans ce run :\n`,
    );
    for (const c of collisions) {
      process.stdout.write(`  ${c.page} → ${c.id} (deja pris par ${c.first})\n`);
    }
    process.stdout.write(
      '  Deux pages Fandom pour une seule entite, ou une desambiguisation perdue.\n',
    );
  }
  const skipNote = report.skippedKnown > 0 ? `, ${report.skippedKnown} already known` : '';
  process.stdout.write(
    `\n${report.results.length} mapped, ${report.failures.length} failed${skipNote}.\n`,
  );
  // The reasons were collected all along and thrown away at print time
  // — run 5 reported "8 mapped, 17 failed" and nothing else, which is
  // unactionable. Group them so a 1000-page run stays readable.
  if (report.failures.length > 0) {
    const byReason = new Map<string, string[]>();
    for (const f of report.failures) {
      const bucket = byReason.get(f.reason) ?? [];
      bucket.push(f.page);
      byReason.set(f.reason, bucket);
    }
    process.stdout.write('Failures:\n');
    const worstFirst = [...byReason.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [reason, titles] of worstFirst) {
      process.stdout.write(`  ${titles.length}× ${reason}\n`);
      for (const t of titles.slice(0, 5)) process.stdout.write(`      ${t}\n`);
      if (titles.length > 5) process.stdout.write(`      … and ${titles.length - 5} more\n`);
    }
  }
  if (report.unknownBoxes.length > 0) {
    process.stdout.write('Next mappers to build (infobox kinds seen):\n');
    for (const b of report.unknownBoxes.slice(0, 10)) {
      process.stdout.write(`  ${b.count}× ${b.box}\n`);
    }
  }
  if (report.frontier.length > 0) {
    process.stdout.write('Import frontier (most-linked unknown pages):\n');
    for (const f of report.frontier.slice(0, 15)) {
      process.stdout.write(`  ${f.count}× ${f.title}\n`);
    }
  }
  if (!stage) process.stdout.write('(dry-run — pass --stage to write files)\n');
} else if (kind === 'arc-edges') {
  // bun run import:fandom arc-edges --category "Story Arcs" [--stage]
  //
  // The one place the two substrates work together. The WIKITEXT
  // gives each arc its identity (the arc mapper derives the entity id
  // from the page); the RENDERED html gives the chapter and episode
  // ranges, which the wikitext writes as `auto` (ADR-119).
  //
  // The edges themselves land on the SOURCES — `part-of-arc` is
  // stored on each chapter and episode (ADR-033) — and the ordering
  // lands on the arcs as `arc_number`. Both go through `mergeEntity`,
  // so an existing file gains the edge and loses nothing.
  const opt = (name: string): readonly string[] =>
    args.flatMap((a, i) => (a === `--${name}` && args[i + 1] !== undefined ? [args[i + 1]!] : []));
  const categories = opt('category');
  const limit = Number(opt('limit')[0] ?? '100');
  const registry = await loadRegistry();
  const vocabularies = await loadVocabularyIndexes(REPO_ROOT);

  const report = await crawl(client, {
    categories: categories.length > 0 ? categories : ['Story Arcs'],
  }, {
    limit,
    categoryDepth: Number(opt('depth')[0] ?? '2'),
    registry,
    vocabularies,
    log: (line) => process.stdout.write(`  ${line}\n`),
  });

  const spans: ArcSpans[] = [];
  for (const result of report.results) {
    if (result.kind !== 'arc') continue;
    // eslint-disable-next-line no-await-in-loop
    const rendered = await client.fetchRendered(result.page.title);
    const box = parseRenderedInfobox(rendered.html);
    spans.push({
      arcId: result.mapped.entity.id,
      page: result.page.title,
      chapters: parseOrdinalRange(box.get('chapter') ?? ''),
      episodes: parseOrdinalRange(box.get('episode') ?? ''),
    });
  }
  process.stdout.write(`\n${spans.length} arc(s) with a rendered infobox.\n`);

  const corpus = {
    chapters: await ordinalsOnDisk('manga-chapter'),
    episodes: await ordinalsOnDisk('anime-episode'),
  };
  const edges = planArcEdges(spans, corpus);
  const numbers = orderArcs(spans);
  const overlaps = findOverlaps(spans, corpus);

  process.stdout.write(
    `${edges.length} part-of-arc edge(s), ${numbers.length} arc_number(s)`
      + `${overlaps.length > 0 ? `, ${overlaps.length} contested source(s)` : ''}.\n`,
  );
  // A source claimed by two arcs is a DATA problem. The planner had
  // to pick one; saying nothing would bury it.
  for (const clash of overlaps.slice(0, 10)) {
    process.stdout.write(`  contested ${clash.sourceId}: ${clash.arcIds.join(', ')}\n`);
  }

  if (stage) {
    let written = 0;
    for (const edge of edges) {
      // eslint-disable-next-line no-await-in-loop
      if (
        await addToEntity(edge.sourceId, {
          relations: [{ type: 'part-of-arc', target: edge.arcId }],
        })
      ) {
        written += 1;
      }
    }
    for (const { arcId, arcNumber } of numbers) {
      // eslint-disable-next-line no-await-in-loop
      if (await addToEntity(arcId, { properties: { arc_number: { value: arcNumber } } })) {
        written += 1;
      }
    }
    process.stdout.write(`Staged: ${written} entity file(s) updated.\n`);
  } else {
    process.stdout.write('(dry-run — pass --stage to write files)\n');
  }
} else if (kind === 'chapter-render') {
  // bun run import:fandom chapter-render [--from N] [--to N] [--limit N] [--stage]
  //
  // The chapter substrate switch (ADR-119 applied to chapters).
  // Measured on the corpus after a full 1193-page category crawl of
  // WIKITEXT: part-of-volume 1/1193, adapted-by 0/1193, released_at
  // 10/1193 — and all ten of those were hand-seeded, none imported.
  // The same pages fetched with `prop=text` carry every one of them.
  //
  // One rendered fetch per chapter, so it is chunked: `--from`/`--to`
  // bound the range and `--limit` bounds the run, letting CI walk the
  // corpus in passes instead of one 20-minute request storm.
  const opt = (name: string): string | undefined =>
    args.flatMap((
      a,
      i,
    ) => (a === `--${name}` && args[i + 1] !== undefined ? [args[i + 1]!] : []))[0];
  const from = Number(opt('from') ?? '0');
  const to = Number(opt('to') ?? String(Number.MAX_SAFE_INTEGER));
  const limit = Number(opt('limit') ?? '50');

  const onDisk = [...await ordinalsOnDisk('manga-chapter')]
    .filter((n) => n >= from && n <= to)
    .sort((a, b) => a - b)
    .slice(0, limit);
  process.stdout.write(`${onDisk.length} chapter(s) in range, fetching rendered pages…\n`);

  let entitiesWritten = 0;
  let titlesWritten = 0;
  let seedsReplaced = 0;
  const failures: string[] = [];
  for (const number of onDisk) {
    const title = `Chapter ${number}`;
    let enrichment: ReturnType<typeof enrichChapterFromRendered> = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      const rendered = await client.fetchRendered(title);
      enrichment = enrichChapterFromRendered(rendered.html);
    } catch (error) {
      failures.push(`${title}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (enrichment === null) {
      failures.push(`${title}: no chapter infobox in the rendered page`);
      continue;
    }
    // The infobox names the chapter it belongs to. If that disagrees
    // with the page we asked for, the page is a redirect or a
    // disambiguation and folding it in would corrupt a neighbour.
    if (enrichment.number !== number) {
      failures.push(`${title}: infobox says chapter ${enrichment.number}`);
      continue;
    }
    for (const warning of enrichment.warnings) {
      process.stdout.write(`  warn ${title}: ${warning}\n`);
    }
    if (!stage) continue;

    // eslint-disable-next-line no-await-in-loop
    if (
      await addToEntity(`manga-chapter:${number}`, {
        properties: enrichment.properties,
        relations: enrichment.relations,
      })
    ) entitiesWritten += 1;

    for (const [locale, bundle] of Object.entries(enrichment.translations)) {
      const path = join(
        REPO_ROOT,
        'data',
        'universes',
        'one-piece',
        'translations',
        locale,
        'manga-chapter',
        `${number}.json`,
      );
      const file = Bun.file(path);
      // eslint-disable-next-line no-await-in-loop
      const current = (await file.exists())
        // eslint-disable-next-line no-await-in-loop
        ? (await file.json()) as Record<string, string>
        : {};
      const next = { ...current };
      for (const [key, value] of Object.entries(bundle)) {
        const stored = current[key];
        // Existing keys win — an import must never clobber a human
        // translation. The ONE exception is the seed the project
        // wrote for itself, which is not a translation at all.
        if (stored === undefined) next[key] = value;
        else if (isSeededChapterTitle(number, stored) && stored !== value) {
          next[key] = value;
          seedsReplaced += 1;
          process.stdout.write(`  seed → real: ${locale} ${key} "${stored}" → "${value}"\n`);
        }
      }
      const before = (await file.exists()) ? await file.text() : '';
      const after = `${JSON.stringify(next, null, 2)}\n`;
      if (after !== before) {
        // eslint-disable-next-line no-await-in-loop
        await Bun.write(path, after);
        titlesWritten += 1;
      }
    }
  }

  process.stdout.write(
    `\n${onDisk.length - failures.length} enriched, ${failures.length} failed.\n`,
  );
  if (stage) {
    process.stdout.write(
      `Staged: ${entitiesWritten} entity file(s), ${titlesWritten} translation file(s)`
        + `, ${seedsReplaced} seeded title(s) replaced.\n`,
    );
  } else process.stdout.write('(dry-run — pass --stage to write files)\n');
  for (const failure of failures.slice(0, 20)) process.stdout.write(`  ${failure}\n`);
  if (failures.length > 20) {
    process.stdout.write(`  … and ${failures.length - 20} more\n`);
  }
} else if (kind === 'render') {
  // bun run import:fandom render "Alabasta Arc" --out docs/audits/rendered
  //
  // Capture the RENDERED html of pages, verbatim, as fixtures. This
  // exists because the parser for that html must be written against
  // the real thing: the arc mapper's previous fixture was synthetic,
  // and a synthetic fixture only ever proves the parser agrees with
  // whatever was invented for it. Cloud sessions cannot reach Fandom
  // (403 at the proxy), so CI captures and commits; the session reads
  // the repository.
  const outFlag = args.flatMap((a, i) =>
    a === '--out' && args[i + 1] !== undefined ? [args[i + 1]!] : []
  );
  const outDir = outFlag[0] ?? join(REPO_ROOT, 'docs', 'audits', 'rendered');
  if (pages.length === 0) {
    process.stderr.write('render: give at least one page title.\n');
    process.exitCode = 1;
  } else {
    for (const page of pages) {
      // eslint-disable-next-line no-await-in-loop
      const rendered = await client.fetchRendered(page);
      const safe = rendered.title.replace(/[^A-Za-z0-9._-]/g, '_');
      const path = join(outDir, `${safe}.html`);
      // eslint-disable-next-line no-await-in-loop
      await Bun.write(path, rendered.html);
      process.stdout.write(`  wrote ${path} (${rendered.html.length} bytes)\n`);
    }
  }
} else if (kind === 'check-updates') {
  const registry = await loadRegistry();
  const titles = registry.pages.map((p) => p.page);
  const info = await client.queryInfo(titles);
  const live = new Map([...info.entries()].map(([t, i]) => [t, i.lastRevId]));

  // `queryInfo` demande `prop=info|redirects` et rend les alias — que
  // ce bloc jetait, en ne gardant que la revision. Le registre montrait
  // donc 1 redirection sur 2485 pages alors que l'appel qui les
  // rapporte tourne sur les 2485 a chaque sync. On les ecrit.
  const observed = new Map(
    [...info.entries()].map(([t, i]) => [t, { pageId: i.pageId, redirects: i.redirects }]),
  );
  const withRedirects = recordRedirects(registry, observed);
  const before = registry.pages.reduce((n, p) => n + p.redirects.length, 0);
  const after = withRedirects.pages.reduce((n, p) => n + p.redirects.length, 0);
  if (after !== before) {
    await saveRegistry(withRedirects);
    process.stdout.write(
      `  ledger: ${after - before} redirection(s) apprise(s) (${after} au total)\n`,
    );
  }

  // Deux entites pour une seule page Fandom : le doublon d'entite que
  // le mainteneur cherchait. Signale, jamais corrige tout seul — fondre
  // deux entites demande de savoir laquelle garde son id.
  const clashes = findTitleClashes(withRedirects);
  if (clashes.length > 0) {
    process.stdout.write(`\n${clashes.length} page(s) revendiquee(s) par PLUSIEURS entites :\n`);
    for (const c of clashes) {
      process.stdout.write(`  "${c.title}" ← ${c.entityIds.join(', ')}\n`);
    }
    process.stdout.write('  Doublon probable : une page Fandom, deux entites chez nous.\n\n');
  }

  const stale = staleEntries(withRedirects, live);
  if (stale.length === 0) {
    process.stdout.write(`OK: ${titles.length} tracked page(s), none stale.\n`);
  } else {
    process.stdout.write(`${stale.length} stale page(s):\n`);
    for (const s of stale) {
      process.stdout.write(
        `  ${s.entityId} ← "${s.page}" (imported rev ${s.lastRevId ?? 'never'})\n`,
      );
    }
    process.exitCode = 2; // distinct from crash — "work to do".
  }
} else if (
  kind !== undefined && (MAPPER_KINDS as readonly string[]).includes(kind)
  && pages.length > 0
) {
  const mapper = (await buildMappers())[kind as MapperKind];
  const importedAt = new Date().toISOString();
  const imported: ImportedPage[] = [];
  let failures = 0;
  for (const page of pages) {
    // eslint-disable-next-line no-await-in-loop
    const parsed = await client.fetchParse(page);
    const result = mapper(parsed);
    if (result === null) {
      process.stderr.write(`SKIP "${page}": no mappable infobox.\n`);
      failures += 1;
      continue;
    }
    for (const w of result.warnings) process.stdout.write(`  warn: ${w}\n`);
    const files = buildEmitFiles(result);
    if (stage) {
      // eslint-disable-next-line no-await-in-loop
      const staged = await stageToLocal(files, { repoRoot: REPO_ROOT, overwrite });
      for (const p of staged.written) process.stdout.write(`  wrote ${p}\n`);
      for (const s of staged.skipped) process.stdout.write(`  skip ${s.path}: ${s.reason}\n`);
    } else {
      for (const f of files) process.stdout.write(`  (dry-run) ${f.path}\n`);
    }
    imported.push(importedFrom(parsed, result.entity.id, importedAt));
    process.stdout.write(`OK "${page}" → ${result.entity.id}\n`);
  }
  if (stage) {
    if (imported.length > 0) {
      const next = recordImports(await loadRegistry(), imported);
      await saveRegistry(next);
      process.stdout.write(
        `  ledger: ${imported.length} page(s) recorded, ${next.pages.length} tracked total\n`,
      );
    }
    process.stdout.write(
      'Staged. Run the gauntlet (schema:check, validate, check:references) before committing.\n',
    );
  }
  if (failures > 0) process.exitCode = 1;
} else {
  process.stderr.write(
    `Usage: bun run import:fandom <${MAPPER_KINDS.join('|')}> <page…> [--stage] [--overwrite]\n`
      + '       bun run import:fandom crawl --category <name>… [--depth N] [--page <title>…] [--limit N] [--skip-known] [--stage]\n'
      + '       bun run import:fandom arc-edges [--category <name>…] [--limit N] [--stage]\n'
      + '       bun run import:fandom chapter-render [--from N] [--to N] [--limit N] [--stage]\n'
      + '       bun run import:fandom render <page…> [--out <dir>]\n'
      + '       bun run import:fandom check-updates\n',
  );
  process.exitCode = 1;
}
