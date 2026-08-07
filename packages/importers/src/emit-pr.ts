/**
 * Batch-PR emit mode (ADR-079): one crawl run → one reviewable PR,
 * labelled `via-dashboard` + `import` so it lands in the dashboard's
 * admin moderation queue (list, in-app diff, Approve/Reject).
 *
 * Requires GitHub App credentials at the call site (CI secrets or a
 * local .env) — this module only assembles branch/commit/PR from the
 * crawl report; all GitHub IO goes through @onepiece-wiki/github-client.
 */
import {
  commitMultipleFiles,
  createBranch,
  type GitHubAppConfig,
  type Octokit,
  openPullRequest,
} from '@onepiece-wiki/github-client';
import { buildEmitFiles, type EmitFile } from './emit.ts';
import type { CrawlReport } from './fandom/crawl.ts';

export type ImportPRPlan = {
  readonly branch: string;
  readonly title: string;
  readonly body: string;
  readonly files: readonly EmitFile[];
};

/** Pure assembly — unit-testable without credentials. */
export function buildImportPRPlan(
  report: CrawlReport,
  options: { readonly runId: string; readonly universe?: string; },
): ImportPRPlan | null {
  const files = report.results.flatMap((r) => buildEmitFiles(r.mapped, options.universe));
  if (files.length === 0) return null;

  const byKind = new Map<string, number>();
  for (const r of report.results) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
  const kinds = [...byKind.entries()].map(([k, n]) => `${n} ${k}`).join(', ');

  const warningLines = report.results.flatMap((r) =>
    r.mapped.warnings.map((w) => `- \`${r.mapped.entity.id}\`: ${w}`)
  );
  const failureLines = report.failures.map((f) => `- "${f.page}": ${f.reason}`);

  return {
    branch: `import/fandom-${options.runId}`,
    title: `[DATA] Import ${report.results.length} entities from Fandom (${kinds})`,
    body: [
      `**Contributors**`,
      `- _Fandom importer (ADR-079)_`,
      ``,
      `**Entities:**`,
      ...report.results.map((r) => `- \`${r.mapped.entity.id}\` ← "${r.page.title}"`),
      ``,
      ...(warningLines.length > 0
        ? [`**Warnings (review before merge):**`, ...warningLines, ``]
        : []),
      ...(failureLines.length > 0 ? [`**Not imported:**`, ...failureLines, ``] : []),
      `Deterministic infobox extraction only — facts needing`,
      `resolution/judgement are listed above, never guessed.`,
    ].join('\n'),
    files,
  };
}

/** Execute the plan: branch → one commit → PR into the admin queue. */
export async function emitToPR(
  octokit: Octokit,
  config: GitHubAppConfig,
  plan: ImportPRPlan,
): Promise<{ number: number; htmlUrl: string; }> {
  await createBranch(octokit, config, plan.branch);
  await commitMultipleFiles(octokit, config, {
    branch: plan.branch,
    message: `data(import): ${plan.title.replace(/^\[DATA\] /, '')}\n`,
    files: plan.files.map((f) => ({ path: f.path, content: f.content })),
  });
  const pr = await openPullRequest(octokit, config, {
    headBranch: plan.branch,
    title: plan.title,
    body: plan.body,
    labels: ['via-dashboard', 'import'],
  });
  return { number: pr.number, htmlUrl: pr.htmlUrl };
}
