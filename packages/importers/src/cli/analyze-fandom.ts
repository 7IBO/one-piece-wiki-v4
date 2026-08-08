/**
 * bun run fandom:analyze [--samples N] [--out DIR] [--max-infoboxes N]
 *
 * Full-wiki STRUCTURAL sweep (ADR-092): enumerate every category
 * (member counts) and every infobox template of onepiece.fandom.com,
 * sample N pages per infobox (default 5), build the field inventory,
 * and diff it all against our schema catalogue + mappers. Writes:
 *
 *   <out>/fandom-analyze.json  — machine-readable report
 *   <out>/fandom-analyze.md    — Markdown summary (gaps first)
 *
 * `<out>` defaults to packages/importers/reports/ (gitignored — the
 * report is a build artifact; run-to-run diffs, not commits, are how
 * Fandom-side structure changes surface).
 *
 * NETWORK: needs egress to onepiece.fandom.com — cloud Claude
 * sandboxes deny it at the proxy (CONNECT 403); the CLI fails fast
 * with "Fandom unreachable". Run locally or on CI with egress
 * (ADR-079 §6, /docs/FANDOM_SYNC.md).
 */
import { join } from 'node:path';
import { ENTITY_TYPES_DIR, REPO_ROOT, UNIVERSES_DIR } from '../../../schema-engine/src/paths.ts';
import {
  type AnalyzeCliArgs,
  analyzeWiki,
  loadEntityTypeCatalogue,
  parseAnalyzeArgs,
  renderMarkdownSummary,
} from '../fandom/analyze.ts';
import { FandomClient } from '../fandom/client.ts';

const DEFAULT_OUT = join(REPO_ROOT, 'packages', 'importers', 'reports');
const USAGE = 'Usage: bun run fandom:analyze [--samples N] [--out DIR] [--max-infoboxes N]\n';

async function main(): Promise<number> {
  let args: AnalyzeCliArgs;
  try {
    args = parseAnalyzeArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n${USAGE}`);
    return 1;
  }

  const catalogue = await loadEntityTypeCatalogue([
    ENTITY_TYPES_DIR,
    join(UNIVERSES_DIR, 'one-piece', 'schemas', 'entity-types'),
  ]);
  const client = new FandomClient({ cacheDir: join(REPO_ROOT, '.cache', 'fandom') });

  try {
    const report = await analyzeWiki(client, catalogue, {
      samplesPerInfobox: args.samples,
      ...(args.maxInfoboxes !== null ? { maxInfoboxes: args.maxInfoboxes } : {}),
      log: (line) => process.stdout.write(`  ${line}\n`),
    });
    const out = args.out ?? DEFAULT_OUT;
    const jsonPath = join(out, 'fandom-analyze.json');
    const mdPath = join(out, 'fandom-analyze.md');
    await Bun.write(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    await Bun.write(mdPath, renderMarkdownSummary(report));
    process.stdout.write(`\nwrote ${jsonPath}\nwrote ${mdPath}\n`);
    process.stdout.write(
      `${report.gaps.unmappedInfoboxFields.length} unmapped infobox field(s), `
        + `${report.gaps.categoriesWithoutEntityType.length} unmatched categorie(s), `
        + `${report.gaps.entityTypesWithoutFandomSource.length} entity type(s) without a Fandom source.\n`,
    );
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

process.exitCode = await main();
