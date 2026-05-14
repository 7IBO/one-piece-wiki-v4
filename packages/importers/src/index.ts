/**
 * @onepiece-wiki/importers — foundation only.
 *
 * Phase 2 ships the typed Importer<TSource, TEntity> interface, the
 * mandatory Zod-validation step, the three emit modes (dry-run,
 * stage-to-local, PR), and the provenance/logging contract. No
 * concrete importer is implemented; those land in Phase 3 with the
 * first experimental bulk import (ROADMAP Phase 3 Task 4).
 */
import type { z } from 'zod';

export type EmitMode = 'dry-run' | 'stage-to-local' | 'pr';

export type ImporterContext = {
  readonly mode: EmitMode;
  readonly assistedBy: string;
  readonly sourceUrl: string;
  readonly nowIso: string;
};

export type ImportEvent =
  | { readonly kind: 'fetched'; readonly count: number; }
  | { readonly kind: 'mapped'; readonly entityId: string; }
  | { readonly kind: 'validated'; readonly entityId: string; }
  | {
    readonly kind: 'emitted';
    readonly entityId: string;
    readonly path: string;
    readonly mode: EmitMode;
  }
  | {
    readonly kind: 'validation-failed';
    readonly entityId: string;
    readonly message: string;
  };

export type Logger = (event: ImportEvent) => void;

export type Importer<TSource, TEntity> = {
  readonly id: string;
  fetch: (ctx: ImporterContext) => Promise<TSource[]>;
  map: (source: TSource, ctx: ImporterContext) => TEntity;
  readonly entitySchema: z.ZodType<TEntity>;
};

export type RunResult = {
  readonly emitted: readonly { entityId: string; path: string; }[];
  readonly skipped: readonly { entityId: string; reason: string; }[];
};

/**
 * Run an importer end to end. The emit step writes nothing in
 * dry-run mode, writes JSON files in stage-to-local, and opens a PR
 * in pr mode. Both stage-to-local and pr modes require an emit
 * adapter; Phase 2 ships only the dry-run path so the foundation
 * stays implementation-free.
 */
export async function run<TSource, TEntity>(
  importer: Importer<TSource, TEntity>,
  ctx: ImporterContext,
  logger: Logger = () => {},
): Promise<RunResult> {
  if (ctx.mode !== 'dry-run') {
    throw new Error(
      `Importer "${importer.id}" called in mode "${ctx.mode}" but only "dry-run" is implemented in Phase 2.`,
    );
  }

  const sources = await importer.fetch(ctx);
  logger({ kind: 'fetched', count: sources.length });

  const emitted: { entityId: string; path: string; }[] = [];
  const skipped: { entityId: string; reason: string; }[] = [];

  for (const source of sources) {
    const mapped = importer.map(source, ctx);
    const candidate = mapped as { id?: string; };
    const entityId = candidate.id ?? '<unknown>';
    logger({ kind: 'mapped', entityId });

    const parsed = importer.entitySchema.safeParse(mapped);
    if (!parsed.success) {
      const message = parsed.error.errors
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ');
      logger({ kind: 'validation-failed', entityId, message });
      skipped.push({ entityId, reason: message });
      continue;
    }

    logger({ kind: 'validated', entityId });
    emitted.push({ entityId, path: `(dry-run) ${entityId}` });
    logger({ kind: 'emitted', entityId, path: `(dry-run) ${entityId}`, mode: ctx.mode });
  }

  return { emitted, skipped };
}
