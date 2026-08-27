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
    // `<nowiki>` is an ESCAPE, not content: editors wrap punctuation in
    // it to stop MediaWiki interpreting the characters. Unwrap it —
    // dropping the tags, KEEPING what they protect. Missing this put
    // literal markup in front of readers: 41 of 400 imported episode
    // titles read `We are Friends<nowiki>!!</nowiki>`.
    //
    // Unwrapped FIRST, so the inner text then goes through the same
    // link/template cleaning as everything else. That is a deliberate
    // simplification: a strictly correct reader would shield nowiki
    // spans from those passes. In this corpus they wrap punctuation
    // (`!!`, `?!`), never wiki syntax, so the difference cannot bite —
    // revisit if a `<nowiki>[[…]]</nowiki>` ever shows up.
    .replace(/<\/?nowiki\s*\/?>/gi, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    // Inline PRESENTATION tags around text that is otherwise content:
    // `<s>3D</s>2Y` is chapter 597's real title, struck-through in the
    // magazine, and it reached readers as literal angle brackets on the
    // home page. Same family as the `<nowiki>` leak above — drop the
    // tag, keep what it wraps. Only this closed set, so an unexpected
    // tag still shows up rather than being silently swallowed.
    .replace(/<\/?(?:s|u|i|b|em|strong|small|sub|sup|span|div)\b[^>]*>/gi, '')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type QrefSource = {
  /** e.g. `manga-chapter:1044` or `anime-episode:1071`. */
  readonly sourceId: string;
};

/**
 * Templates at every nesting level (infobox params carry Qrefs —
 * verified on the live Char Box, 2026-06-14). Depth-first, outer
 * before inner.
 */
export function parseTemplatesDeep(wikitext: string): readonly WikiTemplate[] {
  const out: WikiTemplate[] = [];
  const visit = (text: string): void => {
    for (const t of parseTemplates(text)) {
      out.push(t);
      for (const v of [...t.positional, ...Object.values(t.named)]) {
        if (v.includes('{{')) visit(v);
      }
    }
  };
  visit(wikitext);
  return out;
}

function qrefSourceIds(t: WikiTemplate): readonly QrefSource[] {
  const out: QrefSource[] = [];
  const num = (v: string | undefined): string | null => {
    if (v === undefined) return null;
    const trimmed = v.trim();
    return /^\d+$/.test(trimmed) ? trimmed : null;
  };
  const chap = num(t.named['chap'] ?? t.named['chapter'] ?? t.named['Chapter']);
  if (chap !== null) out.push({ sourceId: `manga-chapter:${chap}` });
  const ep = num(t.named['ep'] ?? t.named['episode'] ?? t.named['Episode']);
  if (ep !== null) out.push({ sourceId: `anime-episode:${ep}` });
  const sbs = num(t.named['sbs'] ?? t.named['SBS']);
  if (sbs !== null) out.push({ sourceId: `sbs:volume-${sbs}` });
  const vol = num(t.named['vol'] ?? t.named['volume']);
  if (vol !== null) out.push({ sourceId: `volume:${vol}` });
  // `cover=N` cites chapter N's cover page; `ep2=N` a second episode;
  // `card=N` a Vivre Card entry (our `databook-card`) — all verified
  // against live responses 2026-06-14.
  const cover = num(t.named['cover']);
  if (cover !== null) out.push({ sourceId: `manga-chapter:${cover}` });
  const ep2 = num(t.named['ep2']);
  if (ep2 !== null) out.push({ sourceId: `anime-episode:${ep2}` });
  const card = num(t.named['card']);
  if (card !== null) out.push({ sourceId: `databook-card:${card}` });
  return out;
}

/**
 * Every named Qref DEFINITION in a page ({{Qref|name=X|chap=…}}) →
 * its source ids. Later {{Qref|name=X}} backrefs resolve against
 * this table (verified live: the Vivre-Card Qref is defined once on
 * `age` and backreffed by `birth`/`height`/`blood type`).
 */
export function buildQrefTable(
  wikitext: string,
): ReadonlyMap<string, readonly QrefSource[]> {
  const table = new Map<string, readonly QrefSource[]>();
  for (const t of parseTemplatesDeep(wikitext)) {
    if (t.name.toLowerCase() !== 'qref') continue;
    const name = t.named['name']?.trim();
    if (name === undefined || name === '') continue;
    const ids = qrefSourceIds(t);
    if (ids.length > 0 && !table.has(name)) table.set(name, ids);
  }
  return table;
}

/**
 * Parse {{Qref}} citation templates into wiki source ids, at every
 * nesting depth. The REAL param names (verified against live API
 * responses, 2026-06-14) are `chap=` / `ep=` / `sbs=` / `vol=` /
 * `cover=` / `ep2=` / `card=` (long aliases kept defensively). Pass
 * `table` (from buildQrefTable over the whole page) to also resolve
 * `name=`-only backrefs; without it they are skipped.
 */
export function parseQrefs(
  wikitext: string,
  table?: ReadonlyMap<string, readonly QrefSource[]>,
): readonly QrefSource[] {
  const out: QrefSource[] = [];
  for (const t of parseTemplatesDeep(wikitext)) {
    if (t.name.toLowerCase() !== 'qref') continue;
    const ids = qrefSourceIds(t);
    if (ids.length > 0) {
      out.push(...ids);
      continue;
    }
    const name = t.named['name']?.trim();
    if (name !== undefined && table !== undefined) {
      out.push(...(table.get(name) ?? []));
    }
  }
  return out;
}

export type NihongoName = {
  /** The quoted display text ("Hyougoro of the Flower"). */
  readonly text: string;
  readonly kanji: string | null;
  readonly romaji: string | null;
};

/**
 * Parse a {{Nihongo|"Text"|kanji|romaji|…}} template value (the shape
 * Char Box uses for alias/epithet — verified live 2026-06-14). Returns
 * null when the value carries no Nihongo template.
 */
export function parseNihongo(value: string): NihongoName | null {
  const t = parseTemplates(value).find((x) => x.name.toLowerCase() === 'nihongo');
  if (t === undefined) return null;
  const text = (t.positional[0] ?? '').replace(/^"|"$/g, '').trim();
  if (text === '') return null;
  const kanji = t.positional[1]?.trim() ?? null;
  const romaji = t.positional[2]?.trim() ?? null;
  return {
    text,
    kanji: kanji === '' ? null : kanji,
    romaji: romaji === '' || romaji === null ? null : cleanValue(romaji),
  };
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

/**
 * Detect a MediaWiki redirect page ("#REDIRECT [[Target]]", verified
 * against a live response 2026-06-14). Returns the target title or
 * null for regular content pages.
 */
export function parseRedirect(wikitext: string): string | null {
  const m = /^\s*#REDIRECT\s*\[\[([^\]|#]+)/i.exec(wikitext);
  if (m === null || m[1] === undefined) return null;
  return m[1].trim();
}
