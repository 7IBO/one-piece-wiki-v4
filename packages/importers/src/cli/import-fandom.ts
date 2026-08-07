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
 *   bun run import:fandom check-updates
 *
 * `check-updates` compares the live revisions of every ledger page
 * (data/import/fandom-pages.json) and lists the stale ones — the CI
 * sync workflow runs exactly this.
 *
 * NETWORK: needs egress to onepiece.fandom.com (blocked in cloud
 * Claude sandboxes; fine locally and on CI runners — ADR-079 §6).
 */
import { join } from 'node:path';
import { REPO_ROOT } from '../../../schema-engine/src/paths.ts';
import { buildEmitFiles, type MapperEmit, stageToLocal } from '../emit.ts';
import { mapChapter } from '../fandom/chapter.ts';
import { mapCharacter } from '../fandom/character.ts';
import { FandomClient, type ParsedPage } from '../fandom/client.ts';
import { crawl } from '../fandom/crawl.ts';
import { mapEpisode } from '../fandom/episode.ts';
import { type FandomRegistry, staleEntries } from '../fandom/registry.ts';

type MapperKind = 'chapter' | 'episode' | 'character';

const MAPPERS: Record<
  MapperKind,
  (page: ParsedPage) => (MapperEmit & { warnings: readonly string[]; }) | null
> = {
  chapter: mapChapter,
  episode: mapEpisode,
  character: mapCharacter,
};

const args = process.argv.slice(2);
const stage = args.includes('--stage');
const overwrite = args.includes('--overwrite');
const positional = args.filter((a) => !a.startsWith('--'));
const [kind, ...pages] = positional;

const client = new FandomClient({
  cacheDir: join(REPO_ROOT, '.cache', 'fandom'),
});

if (kind === 'crawl') {
  // bun run import:fandom crawl --category "One Piece Chapters" --depth 2
  //   [--page "Monkey D. Luffy"] [--limit 50] [--stage]
  const opt = (name: string): readonly string[] =>
    args.flatMap((a, i) => (a === `--${name}` && args[i + 1] !== undefined ? [args[i + 1]!] : []));
  const categories = opt('category');
  const seedPages = opt('page');
  const limit = Number(opt('limit')[0] ?? '25');
  const categoryDepth = Number(opt('depth')[0] ?? '2');
  const registryPath = join(REPO_ROOT, 'data', 'import', 'fandom-pages.json');
  const registry = (await Bun.file(registryPath).json()) as FandomRegistry;

  const report = await crawl(client, { categories, pages: seedPages }, {
    limit,
    categoryDepth,
    registry,
    log: (line) => process.stdout.write(`  ${line}\n`),
  });

  for (const r of report.results) {
    const files = buildEmitFiles(r.mapped);
    if (stage) {
      // eslint-disable-next-line no-await-in-loop
      const staged = await stageToLocal(files, { repoRoot: REPO_ROOT, overwrite });
      for (const p of staged.written) process.stdout.write(`  wrote ${p}\n`);
      for (const sk of staged.skipped) process.stdout.write(`  skip ${sk.path}: ${sk.reason}\n`);
    }
  }
  process.stdout.write(`\n${report.results.length} mapped, ${report.failures.length} failed.\n`);
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
} else if (kind === 'check-updates') {
  const registryPath = join(REPO_ROOT, 'data', 'import', 'fandom-pages.json');
  const registry = (await Bun.file(registryPath).json()) as FandomRegistry;
  const titles = registry.pages.map((p) => p.page);
  const info = await client.queryInfo(titles);
  const live = new Map([...info.entries()].map(([t, i]) => [t, i.lastRevId]));
  const stale = staleEntries(registry, live);
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
} else if (kind !== undefined && kind in MAPPERS && pages.length > 0) {
  const mapper = MAPPERS[kind as MapperKind];
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
    process.stdout.write(`OK "${page}" → ${result.entity.id}\n`);
  }
  if (stage) {
    process.stdout.write(
      'Staged. Run the gauntlet (schema:check, validate, check:references) before committing.\n',
    );
  }
  if (failures > 0) process.exitCode = 1;
} else {
  process.stderr.write(
    'Usage: bun run import:fandom <chapter|episode|character> <page…> [--stage] [--overwrite]\n'
      + '       bun run import:fandom crawl --category <name>… [--depth N] [--page <title>…] [--limit N] [--stage]\n'
      + '       bun run import:fandom check-updates\n',
  );
  process.exitCode = 1;
}
