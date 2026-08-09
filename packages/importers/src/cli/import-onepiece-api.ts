/**
 * bun run onepiece-api:import
 *   [--resources characters,fruits,…] [--locales en,fr]
 *   [--out DIR] [--dry-run]
 *
 * Full-corpus candidate import from api.api-onepiece.com (ADR-101):
 * sweep every requested resource in EN+FR, map to OUR entity shapes,
 * match against the existing corpus (diff-only — nothing is ever
 * overwritten), and write candidate entity + translation files in the
 * EXACT repo layout under `<out>` (default
 * packages/importers/candidates/, gitignored):
 *
 *   <out>/data/universes/one-piece/entities/<type>/<slug>.json
 *   <out>/data/universes/one-piece/translations/<locale>/<type>/<slug>.json
 *   <out>/onepiece-api-import.report.json
 *   <out>/onepiece-api-import.report.md
 *
 * A maintainer reviews the report, moves the files they want into
 * /data (cp -r <out>/data/. data/), runs the gauntlet and opens a PR —
 * candidate data lands via PRs only, never auto-merged (ADR-079 §4).
 *
 * `--dry-run` prints the planned files + report summary and writes
 * NOTHING.
 *
 * NETWORK: needs egress to api.api-onepiece.com — cloud Claude
 * sandboxes deny it at the proxy (CONNECT 403); the CLI fails fast
 * with "api-onepiece unreachable". Run locally or on CI with egress
 * (ADR-101 §4, /docs/ONEPIECE_API_SYNC.md).
 */
import { join } from 'node:path';
import { REPO_ROOT } from '../../../schema-engine/src/paths.ts';
import { OnePieceApiClient } from '../onepiece-api/client.ts';
import {
  type ImportCliArgs,
  parseImportArgs,
  renderImportMarkdown,
  runImport,
} from '../onepiece-api/import.ts';
import { buildMatchIndex, loadExistingEntities } from '../onepiece-api/matching.ts';

const DEFAULT_OUT = join(REPO_ROOT, 'packages', 'importers', 'candidates');
const USAGE = 'Usage: bun run onepiece-api:import [--resources a,b,…] '
  + '[--locales en,fr] [--out DIR] [--dry-run]\n';

/**
 * Lowercased labels (en/fr) AND raw value ids → value id, for one
 * committed vocabulary file — feeds the mappers' exact-match enum
 * resolution (occupations, ship-types, location-regions).
 */
async function loadVocabularyIndex(path: string): Promise<ReadonlyMap<string, string>> {
  const vocab = (await Bun.file(path).json()) as {
    values: Record<string, { labels: { en?: string; fr?: string; }; }>;
  };
  const index = new Map<string, string>();
  for (const [id, term] of Object.entries(vocab.values)) {
    index.set(id.toLowerCase(), id);
    if (term.labels.en !== undefined) index.set(term.labels.en.toLowerCase(), id);
    if (term.labels.fr !== undefined) index.set(term.labels.fr.toLowerCase(), id);
  }
  return index;
}

async function main(): Promise<number> {
  let args: ImportCliArgs;
  try {
    args = parseImportArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n${USAGE}`);
    return 1;
  }

  const universeVocabDir = join(
    REPO_ROOT,
    'data',
    'universes',
    'one-piece',
    'schemas',
    'vocabulary',
  );
  const [existing, occupations, shipTypes, locationRegions] = await Promise.all([
    loadExistingEntities(REPO_ROOT),
    loadVocabularyIndex(join(universeVocabDir, 'occupations.json')),
    loadVocabularyIndex(join(universeVocabDir, 'ship-types.json')),
    loadVocabularyIndex(join(universeVocabDir, 'location-regions.json')),
  ]);

  const client = new OnePieceApiClient({
    cacheDir: join(REPO_ROOT, '.cache', 'onepiece-api'),
  });

  try {
    const { report, files } = await runImport(client, {
      ...(args.resources !== null ? { resources: args.resources } : {}),
      ...(args.locales !== null ? { locales: args.locales } : {}),
      matchIndex: buildMatchIndex(existing),
      vocabularies: {
        occupations,
        'ship-types': shipTypes,
        'location-regions': locationRegions,
      },
      log: (line) => process.stdout.write(`  ${line}\n`),
    });

    const out = args.out ?? DEFAULT_OUT;
    if (args.dryRun) {
      for (const file of files) process.stdout.write(`  (dry-run) ${out}/${file.path}\n`);
    } else {
      for (const file of files) {
        await Bun.write(join(out, file.path), file.content);
      }
      const jsonPath = join(out, 'onepiece-api-import.report.json');
      const mdPath = join(out, 'onepiece-api-import.report.md');
      await Bun.write(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
      await Bun.write(mdPath, renderImportMarkdown(report));
      process.stdout.write(`wrote ${files.length} candidate file(s) under ${out}\n`);
      process.stdout.write(`wrote ${jsonPath}\nwrote ${mdPath}\n`);
    }
    process.stdout.write(
      `${report.counts.created} created, ${report.counts.matchedDiff} matched (diff-only), `
        + `${report.counts.skipped} skipped, ${report.counts.imageEntities} image entit(y/ies), `
        + `${report.gaps.length} field gap(s), ${report.unanchored.length} unanchored entr(y/ies).\n`,
    );
    if (args.dryRun) {
      process.stdout.write('(dry-run — nothing written; drop --dry-run to emit candidates)\n');
    } else {
      process.stdout.write(
        'Review the report, move wanted files into /data, run the gauntlet '
          + '(schema:check, validate, check:references) and open a PR — nothing merges automatically.\n',
      );
    }
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

process.exitCode = await main();
