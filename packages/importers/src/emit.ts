/**
 * Emit adapter (ADR-079): turns a mapper result into corpus files.
 *
 * Two consumers:
 *  - `stage-to-local` — write into the working tree (the human commits
 *    through the normal PR flow, every gate applies);
 *  - `pr` — the same file list handed to github-client's
 *    `commitMultipleFiles` + `openPullRequest` (label `import`), so
 *    batches land in the admin moderation queue. The PR path lives at
 *    the call site (CI/local script) because it needs App credentials;
 *    this module stays pure file-building + local IO.
 *
 * Translation files are MERGED (existing keys win — an import must
 * never clobber a human translation); entity files are conflict-safe:
 * an existing entity is NOT overwritten unless `overwrite` is set —
 * updates belong to the diff/re-import path, not blind writes.
 */

export type MapperEmit = {
  readonly entity: {
    readonly id: string;
    readonly type: string;
    readonly [key: string]: unknown;
  };
  readonly translations: { readonly en: Record<string, string>; };
};

export type EmitFile = {
  readonly path: string;
  /** Serialized JSON content (2-space, trailing newline — dprint-clean). */
  readonly content: string;
  readonly kind: 'entity' | 'translation';
};

function fileBase(entityId: string): string {
  const slug = entityId.split(':')[1] ?? '';
  if (slug === '') throw new Error(`Malformed entity id: "${entityId}"`);
  return slug;
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Corpus paths + serialized contents for one mapper result. */
export function buildEmitFiles(
  output: MapperEmit,
  universe = 'one-piece',
): readonly EmitFile[] {
  const type = output.entity.type;
  const base = fileBase(output.entity.id);
  const files: EmitFile[] = [{
    path: `data/universes/${universe}/entities/${type}/${base}.json`,
    content: serialize(output.entity),
    kind: 'entity',
  }];
  if (Object.keys(output.translations.en).length > 0) {
    files.push({
      path: `data/universes/${universe}/translations/en/${type}/${base}.json`,
      content: serialize(output.translations.en),
      kind: 'translation',
    });
  }
  return files;
}

export type StageResult = {
  readonly written: readonly string[];
  readonly skipped: readonly { readonly path: string; readonly reason: string; }[];
};

/**
 * Write emit files into `repoRoot`'s working tree. Translation files
 * merge with any existing file (existing keys win); entity files are
 * skipped when present unless `overwrite`.
 */
export async function stageToLocal(
  files: readonly EmitFile[],
  options: { readonly repoRoot: string; readonly overwrite?: boolean; },
): Promise<StageResult> {
  const written: string[] = [];
  const skipped: { path: string; reason: string; }[] = [];
  for (const file of files) {
    const absolute = `${options.repoRoot}/${file.path}`;
    const existing = Bun.file(absolute);
    const exists = await existing.exists();

    if (file.kind === 'entity' && exists && options.overwrite !== true) {
      skipped.push({
        path: file.path,
        reason: 'entity file exists — re-import updates go through the diff path',
      });
      continue;
    }

    let content = file.content;
    if (file.kind === 'translation' && exists) {
      const current = (await existing.json()) as Record<string, string>;
      const incoming = JSON.parse(file.content) as Record<string, string>;
      // Existing keys win: imports never clobber human translations.
      content = `${JSON.stringify({ ...incoming, ...current }, null, 2)}\n`;
    }
    await Bun.write(absolute, content);
    written.push(file.path);
  }
  return { written, skipped };
}
