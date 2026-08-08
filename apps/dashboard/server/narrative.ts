/**
 * Narrative editing helpers — pure, unit-tested (no I/O, no GitHub).
 *
 * Narratives are per-locale prose Markdown files stored at
 * `data/universes/<u>/narratives/<locale>/<entityType>/<fileBase>.md`
 * (same `<fileBase>` as the entity's JSON file — see
 * /docs/DATA_MODEL.md § Narratives). The dashboard's narrative
 * endpoints read them from the data source and save them through the
 * same PR flow as entity edits (`submitNarrativeEdit`).
 *
 * Content ≠ structure: these helpers never touch entity JSON.
 */

/** Locales a narrative can exist in. Mirrors the dashboard's
 *  translation locales. */
export const NARRATIVE_LOCALES = ['en', 'fr'] as const;
export type NarrativeLocale = typeof NARRATIVE_LOCALES[number];

/**
 * Hard cap per locale. Narratives are deliberately LIGHT — one to
 * three short paragraphs, far shorter than a Fandom article
 * (maintainer guideline). 10k characters is already generous for
 * that format; anything larger is almost certainly a paste of a
 * full wiki page and gets rejected with a clear message.
 */
export const NARRATIVE_MAX_CHARS = 10_000;

/**
 * Repo-relative path of one narrative file. `fileBase` is the entity
 * id's slug part (`character:ace` → `ace`), i.e. exactly the entity
 * JSON's basename — narrative and entity files always pair up.
 */
export function narrativePath(
  universe: string,
  locale: NarrativeLocale,
  entityType: string,
  fileBase: string,
): string {
  return `data/universes/${universe}/narratives/${locale}/${entityType}/${fileBase}.md`;
}

/**
 * Normalize a submitted narrative body into what gets committed:
 *  - trims trailing whitespace per line and surrounding blank lines
 *  - guarantees exactly one trailing newline (repo text-file hygiene)
 *  - returns `null` when the text is effectively empty — the caller
 *    deletes the file instead of committing a blank one.
 */
export function normalizeNarrativeText(raw: string): string | null {
  const cleaned = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
  if (cleaned === '') return null;
  return `${cleaned}\n`;
}

export type NarrativeSavePayload = Partial<Record<NarrativeLocale, string>>;

export type ParsedNarrativeSave =
  | { readonly ok: true; readonly value: NarrativeSavePayload; }
  | { readonly ok: false; readonly error: string; };

/**
 * Validate the POST body of the narrative save endpoint:
 * `{ en?: string, fr?: string }` — at least one locale present, each
 * a string within NARRATIVE_MAX_CHARS. Unknown keys are rejected so a
 * typo (`"english"`) fails loudly instead of silently saving nothing.
 */
export function parseNarrativeSave(body: unknown): ParsedNarrativeSave {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Body must be an object with { en?, fr? }.' };
  }
  const record = body as Record<string, unknown>;
  const locales: readonly string[] = NARRATIVE_LOCALES;
  for (const key of Object.keys(record)) {
    if (!locales.includes(key)) {
      return { ok: false, error: `Unknown key "${key}" — allowed: ${locales.join(', ')}.` };
    }
  }
  const value: { en?: string; fr?: string; } = {};
  for (const locale of NARRATIVE_LOCALES) {
    const raw = record[locale];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') {
      return { ok: false, error: `${locale} must be a string.` };
    }
    if (raw.length > NARRATIVE_MAX_CHARS) {
      return {
        ok: false,
        error: `${locale} exceeds ${NARRATIVE_MAX_CHARS} characters — narratives must stay short`
          + ' (a few paragraphs at most).',
      };
    }
    value[locale] = raw;
  }
  if (value.en === undefined && value.fr === undefined) {
    return { ok: false, error: 'Nothing to save — provide at least one of { en, fr }.' };
  }
  return { ok: true, value };
}
