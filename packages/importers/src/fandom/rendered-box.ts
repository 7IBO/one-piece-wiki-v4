/**
 * Reading Fandom's PORTABLE INFOBOX out of rendered HTML (ADR-119).
 *
 * The second extraction substrate, and deliberately narrow. Some
 * infobox values do not exist in the wikitext at all: an arc page
 * writes `chapter = auto` and a Lua module computes the range at
 * template-expansion time. `prop=wikitext` can never see it.
 *
 * ## Why `data-source` and not the label
 *
 * Fandom renders each field as
 * `<div class="pi-item pi-data" data-source="chapter">` with a
 * `pi-data-label` and a `pi-data-value` inside. The attribute is the
 * WIKITEXT PARAM NAME — so the two substrates meet on the same key,
 * and a mapper written against one reads the same field in the other.
 * The visible label ("Manga Chapters:") is presentation: translatable,
 * restyleable, and no basis for extraction.
 *
 * ## Verified against real pages, not an invented shape
 *
 * The fixtures under `__tests__/fixtures/rendered/` are SLICES of
 * pages captured by `fandom-render.yml` — cut out of the real
 * response, never authored. That distinction is the whole reason this
 * file exists: the arc mapper's previous fixture was synthetic, and a
 * synthetic fixture only proves a parser agrees with whatever was
 * invented for it. It is how an arc import returned zero relations
 * while looking correct.
 */

/** Decode the handful of entities Fandom emits inside infobox values. */
function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/** Tags out, entities decoded, whitespace collapsed. */
function textOf(html: string): string {
  return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Every `data-source` field of a rendered portable infobox, keyed by
 * the wikitext param name. A page with no portable infobox yields an
 * empty map rather than throwing — "no infobox" is a normal answer.
 */
export function parseRenderedInfobox(html: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  // TWO shapes carry `data-source`, and only the real pages show it:
  //
  //   <div class="pi-item pi-data" data-source="chapter">
  //     <h3 class="pi-data-label">Manga Chapters:</h3>
  //     <div class="pi-data-value">155-217, 63 chapters</div>
  //   </div>
  //
  //   <th class="… pi-data-label" data-source="prev">← Previous</th>
  //   <td class="… pi-data-value" data-source="prev"><a …>Little Garden</a></td>
  //
  // In the second — a `pi-horizontal-group` table — the attribute
  // appears TWICE per field, once on the label cell and once on the
  // value cell. Keying on the attribute alone would take whichever
  // came first and store « ← Previous » as the previous arc.
  const element = /<(div|td|th)\b([^>]*\bdata-source="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = element.exec(html)) !== null) {
    const attrs = match[2] ?? '';
    const key = match[3];
    const body = match[4] ?? '';
    if (key === undefined) continue;
    // A label cell is presentation — translatable, restyleable, and
    // never the value.
    if (/\bpi-data-label\b/.test(attrs)) continue;

    const nested = [...body.matchAll(
      /<div[^>]*class="[^"]*pi-data-value[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
    )];
    const text = nested.length > 0
      ? nested.map((v) => textOf(v[1] ?? '')).join(' ').trim()
      : textOf(body.replace(/<h3[^>]*pi-data-label[\s\S]*?<\/h3>/g, ''));
    // First value wins: an outer wrapper repeating an inner field
    // must not overwrite the precise one.
    if (text !== '' && !out.has(key)) out.set(key, text);
  }
  return out;
}

/** An inclusive ordinal span read off an infobox value. */
export type OrdinalRange = {
  readonly from: number;
  readonly to: number;
};

/**
 * Read a range out of a rendered value.
 *
 * The real shapes, from the captured pages:
 *   "Manga Chapters: 155-217, 63 chapters"  → 155…217
 *   "Anime Episodes: 92-130, 39 episodes"   → 92…130
 *   "Volumes 17-24, 8 volumes"              → 17…24
 *   "Chapter 1, 1 chapter"                  → 1…1
 *
 * The label prefix is skipped rather than matched, so a renamed or
 * translated label cannot break this. A value with no range — the
 * `-, chapters` an arc with none renders — yields null, never a
 * fabricated span.
 */
export function parseOrdinalRange(value: string): OrdinalRange | null {
  const span = /(\d+)\s*[-–—]\s*(\d+)/.exec(value);
  if (span !== null) {
    const from = Number(span[1]);
    const to = Number(span[2]);
    // A descending range is a parse gone wrong, not a fact.
    return from <= to ? { from, to } : null;
  }
  const single = /(?:^|\D)(\d+)\s*,/.exec(value);
  if (single !== null) {
    const only = Number(single[1]);
    return { from: only, to: only };
  }
  return null;
}
