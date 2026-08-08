/**
 * Update detection over the ADR-081 sync registry (ADR-092): read the
 * committed ledger (`data/import/fandom-pages.json`), batch-query the
 * live revision + redirect status of every registered page
 * (`prop=revisions&rvprop=ids|timestamp&redirects=1`, 50 titles per
 * call), and emit an **update queue** — which pages changed since our
 * last import, which got redirected (renamed), which vanished. The
 * queue is a build artifact consumed by the existing per-page import
 * flow (re-import → PR → admin queue); nothing is merged
 * automatically (ADR-079 §5 unchanged).
 *
 * The network layer is injected (any {@link FandomClient}); tests
 * drive detection with fixture-backed fetch stubs.
 */
import type { FandomClient } from './client.ts';
import type { FandomRegistry } from './registry.ts';

export type UpdateStatus = 'unchanged' | 'changed' | 'redirected' | 'missing';

export type UpdateQueueEntry = {
  readonly pageTitle: string;
  readonly entityId: string;
  /** Revision we last imported; null = never imported (→ changed). */
  readonly lastImportedRev: number | null;
  readonly lastImportedAt: string | null;
  readonly currentRev: number | null;
  readonly currentAt: string | null;
  /** New canonical title, when status is `redirected`. */
  readonly redirectTarget?: string;
  readonly status: UpdateStatus;
};

export type UpdateQueue = {
  readonly generatedAt: string;
  readonly counts: Readonly<Record<UpdateStatus, number>>;
  readonly entries: readonly UpdateQueueEntry[];
};

/** MediaWiki caps multi-title queries at 50 for anonymous clients. */
const BATCH_SIZE = 50;

/**
 * Compare every registry page against its live revision. Statuses:
 *  - `unchanged`  — live revid ≤ the revid we imported;
 *  - `changed`    — live revid moved past it, or never imported;
 *  - `redirected` — the canonical title now redirects elsewhere
 *                   (page renamed → re-import + refresh the ledger);
 *  - `missing`    — the wiki reports the title as nonexistent.
 */
export async function detectUpdates(
  client: FandomClient,
  registry: FandomRegistry,
  options: { readonly log?: (line: string) => void; } = {},
): Promise<UpdateQueue> {
  const log = options.log ?? ((): void => {});
  const entries: UpdateQueueEntry[] = [];

  for (let i = 0; i < registry.pages.length; i += BATCH_SIZE) {
    const batch = registry.pages.slice(i, i + BATCH_SIZE);
    const result = await client.queryRevisions(batch.map((p) => p.page));
    log(`batch ${i / BATCH_SIZE + 1}: queried ${batch.length} title(s)`);

    for (const link of batch) {
      const base = {
        pageTitle: link.page,
        entityId: link.entityId,
        lastImportedRev: link.lastRevId ?? null,
        lastImportedAt: link.lastImportedAt ?? null,
      };
      const redirectTarget = result.redirects.get(link.page);
      if (redirectTarget !== undefined) {
        const target = result.pages.get(redirectTarget);
        entries.push({
          ...base,
          currentRev: target?.revId ?? null,
          currentAt: target?.timestamp ?? null,
          redirectTarget,
          status: 'redirected',
        });
        continue;
      }
      const live = result.pages.get(link.page);
      if (result.missing.has(link.page) || live === undefined) {
        // Not returned and not redirected → gone (defensive default).
        entries.push({ ...base, currentRev: null, currentAt: null, status: 'missing' });
        continue;
      }
      const status: UpdateStatus = link.lastRevId !== undefined && live.revId <= link.lastRevId
        ? 'unchanged'
        : 'changed';
      entries.push({
        ...base,
        currentRev: live.revId,
        currentAt: live.timestamp,
        status,
      });
    }
  }

  const counts: Record<UpdateStatus, number> = {
    unchanged: 0,
    changed: 0,
    redirected: 0,
    missing: 0,
  };
  for (const e of entries) counts[e.status] += 1;
  return { generatedAt: new Date().toISOString(), counts, entries };
}

/** Human summary printed to stdout by the `fandom:updates` CLI. */
export function renderUpdatesSummary(queue: UpdateQueue): string {
  const lines: string[] = [];
  const { counts } = queue;
  lines.push(
    `${queue.entries.length} tracked page(s): ${counts.unchanged} unchanged, `
      + `${counts.changed} changed, ${counts.redirected} redirected, ${counts.missing} missing.`,
  );
  for (const e of queue.entries) {
    if (e.status === 'unchanged') continue;
    const detail = e.status === 'redirected'
      ? `→ "${e.redirectTarget ?? '?'}"`
      : e.status === 'missing'
      ? '(page gone — investigate)'
      : `rev ${e.lastImportedRev ?? 'never-imported'} → ${e.currentRev ?? '?'}`;
    lines.push(`  ${e.status.toUpperCase().padEnd(10)} ${e.entityId} ← "${e.pageTitle}" ${detail}`);
  }
  if (counts.changed + counts.redirected + counts.missing === 0) {
    lines.push('Nothing to re-import.');
  } else {
    lines.push(
      'Re-import changed pages via `bun run import:fandom <kind> "<page>" --stage` '
        + '(PR flow — nothing merges automatically).',
    );
  }
  return lines.join('\n');
}

export type UpdatesCliArgs = {
  /** Output directory; null = the CLI's default (reports/). */
  readonly out: string | null;
};

/** Parse `fandom:updates` CLI flags; throws on anything malformed. */
export function parseUpdatesArgs(argv: readonly string[]): UpdatesCliArgs {
  let out: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--out') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error('--out expects a value');
      out = v;
      i += 1;
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  return { out };
}
