/**
 * bun run fandom:updates [--out DIR]
 *
 * Update detection (ADR-092) over the ADR-081 sync registry: batch-
 * query the live revision + redirect status of every page in
 * data/import/fandom-pages.json (50 titles/call) and emit the update
 * queue:
 *
 *   <out>/fandom-updates.json  — [{pageTitle, entityId,
 *       lastImportedRev/At, currentRev/At, status}] with status one of
 *       unchanged | changed | redirected | missing
 *
 * plus a human summary on stdout. `<out>` defaults to
 * packages/importers/reports/ (gitignored). This is a REPORTING tool:
 * a successful run exits 0 whatever the statuses — changed pages are
 * work to queue, not a failure. Errors (unreachable, bad flags)
 * exit 1.
 *
 * NETWORK: needs egress to onepiece.fandom.com — cloud Claude
 * sandboxes deny it at the proxy (CONNECT 403); the CLI fails fast
 * with "Fandom unreachable". Run locally or on CI with egress
 * (ADR-079 §6, /docs/FANDOM_SYNC.md).
 */
import { join } from 'node:path';
import { REPO_ROOT } from '../../../schema-engine/src/paths.ts';
import { FandomClient } from '../fandom/client.ts';
import type { FandomRegistry } from '../fandom/registry.ts';
import {
  detectUpdates,
  parseUpdatesArgs,
  renderUpdatesSummary,
  type UpdatesCliArgs,
} from '../fandom/updates.ts';

const DEFAULT_OUT = join(REPO_ROOT, 'packages', 'importers', 'reports');
const REGISTRY_PATH = join(REPO_ROOT, 'data', 'import', 'fandom-pages.json');
const USAGE = 'Usage: bun run fandom:updates [--out DIR]\n';

async function main(): Promise<number> {
  let args: UpdatesCliArgs;
  try {
    args = parseUpdatesArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n${USAGE}`);
    return 1;
  }

  const registry = (await Bun.file(REGISTRY_PATH).json()) as FandomRegistry;
  const client = new FandomClient();

  try {
    const queue = await detectUpdates(client, registry, {
      log: (line) => process.stdout.write(`  ${line}\n`),
    });
    const out = args.out ?? DEFAULT_OUT;
    const jsonPath = join(out, 'fandom-updates.json');
    await Bun.write(jsonPath, `${JSON.stringify(queue, null, 2)}\n`);
    process.stdout.write(`${renderUpdatesSummary(queue)}\nwrote ${jsonPath}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

process.exitCode = await main();
