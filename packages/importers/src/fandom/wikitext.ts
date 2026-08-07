/**
 * Minimal wikitext utilities for the Fandom ingestion programme
 * (ADR-079). Scope: extract MediaWiki **templates** ("{{Name|a=1|b}}")
 * with correct nested-brace handling, locate an **infobox** by
 * template name, and parse **{{Qref}}** citation templates into
 * source refs.
 *
 * Deliberately NOT a full wikitext engine: no HTML, no tables, no
 * link resolution beyond stripping "[[a|b]]" → "b". Anything the
 * parser cannot express deterministically stays out — prose facts go
 * through the AI-assisted extraction path, never through here.
 */

export type WikiTemplate = {
  readonly name: string;
  /** Positional parameters, in order ("{{Qref|1044}}" → ['1044']). */
  readonly positional: readonly string[];
  /** Named parameters ("|bounty=3,000,000,000" → { bounty: '…' }). */
  readonly named: Readonly<Record<string, string>>;
};

/**
 * Extract every top-level template from a wikitext string. Nested
 * templates inside a parameter value are kept verbatim in the value
 * (callers re-parse when needed); nesting depth is tracked so inner
 * "}}" never closes the outer template.
 */
export function parseTemplates(wikitext: string): readonly WikiTemplate[] {
  const out: WikiTemplate[] = [];
  let i = 0;
  while (i < wikitext.length) {
    const open = wikitext.indexOf('{{', i);
    if (open === -1) break;
    let depth = 0;
    let j = open;
    let close = -1;
    while (j < wikitext.length - 1) {
      const pair = wikitext.slice(j, j + 2);
      if (pair === '{{') {
        depth += 1;
        j += 2;
        continue;
      }
      if (pair === '}}') {
        depth -= 1;
        j += 2;
        if (depth === 0) {
          close = j;
          break;
        }
        continue;
      }
      j += 1;
    }
    if (close === -1) break; // unbalanced — stop rather than guess.
    const body = wikitext.slice(open + 2, close - 2);
    const template = parseTemplateBody(body);
    if (template !== null) out.push(template);
    i = close;
  }
  return out;
}

/** Split a template body on top-level "|" (nesting-aware). */
function splitParams(body: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let bracket = 0;
  let current = '';
  for (let i = 0; i < body.length; i += 1) {
    const pair = body.slice(i, i + 2);
    if (pair === '{{') {
      depth += 1;
      current += '{{';
      i += 1;
      continue;
    }
    if (pair === '}}') {
      depth -= 1;
      current += '}}';
      i += 1;
      continue;
    }
    if (pair === '[[') {
      bracket += 1;
      current += '[[';
      i += 1;
      continue;
    }
    if (pair === ']]') {
      bracket -= 1;
      current += ']]';
      i += 1;
      continue;
    }
    const ch = body[i]!;
    if (ch === '|' && depth === 0 && bracket === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function parseTemplateBody(body: string): WikiTemplate | null {
  const parts = splitParams(body);
  const name = (parts[0] ?? '').trim();
  if (name === '') return null;
  const positional: string[] = [];
  const named: Record<string, string> = {};
  for (const raw of parts.slice(1)) {
    const eq = topLevelEqIndex(raw);
    if (eq === -1) {
      positional.push(raw.trim());
    } else {
      const key = raw.slice(0, eq).trim();
      const value = raw.slice(eq + 1).trim();
      if (key !== '') named[key] = value;
      else positional.push(value);
    }
  }
  return { name, positional, named };
}

/** First "=" outside any nested template/link — named-param split point. */
function topLevelEqIndex(s: string): number {
  let depth = 0;
  let bracket = 0;
  for (let i = 0; i < s.length; i += 1) {
    const pair = s.slice(i, i + 2);
    if (pair === '{{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (pair === '}}') {
      depth -= 1;
      i += 1;
      continue;
    }
    if (pair === '[[') {
      bracket += 1;
      i += 1;
      continue;
    }
    if (pair === ']]') {
      bracket -= 1;
      i += 1;
      continue;
    }
    if (s[i] === '=' && depth === 0 && bracket === 0) return i;
  }
  return -1;
}

/** Find the first template whose name matches (case-insensitive). */
export function findTemplate(
  wikitext: string,
  ...names: readonly string[]
): WikiTemplate | null {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const t of parseTemplates(wikitext)) {
    if (wanted.has(t.name.toLowerCase())) return t;
  }
  return null;
}

/**
 * Strip common wikitext markup from a parameter value: links
 * ("[[a|b]]" → "b", "[[a]]" → "a"), bold/italic quotes, <ref>…</ref>
 * bodies, <br/> → space, and nested templates (dropped — a value that
 * *is* a template must be handled by the caller before cleaning).
 */
export function cleanValue(value: string): string {
  return value
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type QrefSource = {
  /** e.g. `manga-chapter:1044` or `anime-episode:1071`. */
  readonly sourceId: string;
};

/**
 * Parse {{Qref}} citation templates into wiki source ids. Fandom's
 * Qref carries `Chapter=` / `Episode=` named params (plus prose
 * extras we ignore). Positional-only Qrefs are ambiguous → skipped.
 */
export function parseQrefs(wikitext: string): readonly QrefSource[] {
  const out: QrefSource[] = [];
  for (const t of parseTemplates(wikitext)) {
    if (t.name.toLowerCase() !== 'qref') continue;
    const chapter = t.named['Chapter'] ?? t.named['chapter'];
    if (chapter !== undefined && /^\d+$/.test(chapter.trim())) {
      out.push({ sourceId: `manga-chapter:${chapter.trim()}` });
    }
    const episode = t.named['Episode'] ?? t.named['episode'];
    if (episode !== undefined && /^\d+$/.test(episode.trim())) {
      out.push({ sourceId: `anime-episode:${episode.trim()}` });
    }
  }
  return out;
}

/** Parse "3,000,000,000" / "3.000.000.000" → 3000000000; null when NaN. */
export function parseLooseNumber(value: string): number | null {
  const cleaned = cleanValue(value).replace(/[,.\s]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Parse Fandom date formats ("July 22, 2022" / "2022-07-22") → ISO date. */
export function parseLooseDate(value: string): string | null {
  const cleaned = cleanValue(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleaned);
  if (iso !== null) return cleaned;
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return null;
  // Date-only precision — Fandom release dates carry no time.
  return parsed.toISOString().slice(0, 10);
}
