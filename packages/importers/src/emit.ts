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

/**
 * Data locales a mapper may emit (ADR-095): `en` always, plus the two
 * Japanese tiers when the source carries the original name (`jname`)
 * and its romanization (`rname`). `fr` is human-authored, never
 * imported.
 */
export type EmitTranslations = {
  readonly en: Record<string, string>;
  readonly ja?: Record<string, string>;
  readonly 'ja-latn'?: Record<string, string>;
};

export type MapperEmit = {
  readonly entity: {
    readonly id: string;
    readonly type: string;
    readonly [key: string]: unknown;
  };
  readonly translations: EmitTranslations;
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
  const locales: readonly (keyof EmitTranslations)[] = ['en', 'ja', 'ja-latn'];
  for (const locale of locales) {
    const bundle = output.translations[locale];
    if (bundle === undefined || Object.keys(bundle).length === 0) continue;
    files.push({
      path: `data/universes/${universe}/translations/${locale}/${type}/${base}.json`,
      content: serialize(bundle),
      kind: 'translation',
    });
  }
  return files;
}

/** The parts of an entity file this module reasons about. */
type EntityShape = {
  properties?: Record<string, unknown>;
  relations?: readonly { readonly type: string; readonly target: string; }[];
  [key: string]: unknown;
};

/**
 * Fold a re-import onto the file already on disk.
 *
 * The rule, in one line: **the mapper wins where it speaks, and is
 * silent everywhere else.**
 *
 * - A property the mapper produced replaces the stored one — that is
 *   the point of re-running after a fix, and a corrected value must
 *   be able to land.
 * - A property the mapper did NOT produce is kept. An infobox has no
 *   `released_at` for most chapters; that silence is not a claim that
 *   the date is wrong.
 * - Relations are UNIONED by (type, target), never replaced. An arc
 *   edge written by the arc pass and a volume edge read from the
 *   infobox are different facts about the same chapter, and neither
 *   is evidence against the other.
 */
export function mergeEntity(stored: EntityShape, incoming: EntityShape): string {
  const seen = new Set<string>();
  const relations = [...(stored.relations ?? []), ...(incoming.relations ?? [])]
    .filter((r) => {
      const key = `${r.type}\u0000${r.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const merged = {
    ...stored,
    ...incoming,
    properties: { ...stored.properties, ...incoming.properties },
    ...(relations.length > 0 ? { relations } : {}),
  };
  return `${JSON.stringify(merged, null, 2)}\n`;
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
    if (file.kind === 'entity' && exists) {
      // `--overwrite` MERGES; it does not replace. Wholesale
      // replacement was destructive in exactly the case the flag
      // exists for: re-running a category after the mapper learned to
      // read MORE fields. The 2026-08-27 chapter re-run gained one
      // `part-of-volume` and destroyed two `released_at`, two
      // `part-of-arc`, one `part-of-volume` and one `available-on` —
      // values a human or another importer had put there, which no
      // infobox carries.
      content = mergeEntity(
        (await existing.json()) as EntityShape,
        JSON.parse(file.content) as EntityShape,
      );
    }
    await Bun.write(absolute, content);
    written.push(file.path);
  }
  return { written, skipped };
}
