/**
 * Page structure survey — everything on a Fandom page that is NOT the
 * infobox (ADR-092 extension, lot 1).
 *
 * The infobox is the smallest part of what a Fandom page carries. The
 * data the wiki actually needs is spread across:
 *
 *  - **wikitables** — chapter and episode lists, anime/manga
 *    differences, cast tables, stat tables. Rows, not fields: a survey
 *    that only inventories infobox params reports zero of them, which
 *    is how "we only have 37 entities" survives a structural audit.
 *  - **section headings** — the page's own taxonomy ("Abilities and
 *    Powers", "History", "Major Battles"), which is the closest thing
 *    the wiki has to a declared shape for its prose-borne facts.
 *  - **`{{Qref}}` citations** — the per-source anchors ("first seen in
 *    chapter 1044 / episode 1071"). These are the appearance and
 *    provenance data, and they are the reason our four historisation
 *    axes can be filled from Fandom at all.
 *
 * Everything here is pure and deterministic: parse wikitext in, counts
 * out, no network. Aggregation is separate from parsing so the survey
 * can be run per page and merged per infobox kind.
 */

export type SectionHeading = {
  /** `==` → 2, `===` → 3, … */
  readonly level: number;
  readonly text: string;
};

export type TableSurvey = {
  /** Column headers, in order, cleaned of markup. */
  readonly headers: readonly string[];
  /** Data rows (header row excluded). */
  readonly rows: number;
};

export type PageStructure = {
  readonly headings: readonly SectionHeading[];
  readonly tables: readonly TableSurvey[];
  /** `{{Qref}}` source citations on the page. */
  readonly qrefs: number;
  /** Total wikilinks — a rough density signal for relation mining. */
  readonly wikilinks: number;
};

const HEADING = /^(={2,6})\s*(.+?)\s*\1\s*$/gm;
const QREF = /\{\{\s*Qref\b/gi;
const WIKILINK = /\[\[[^\]]+\]\]/g;

/** Strip the markup that would make two identical headers differ. */
function cleanCell(raw: string): string {
  return raw
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    // Drop a leading cell-attribute clause (`class="x" | Header`).
    .replace(/^[^|]*\|(?!\|)/, (m) => (/=/.test(m) ? '' : m))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every `== Heading ==` on the page, in document order. */
export function parseSections(wikitext: string): readonly SectionHeading[] {
  const out: SectionHeading[] = [];
  HEADING.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADING.exec(wikitext)) !== null) {
    const text = cleanCell(m[2] ?? '');
    if (text !== '') out.push({ level: (m[1] ?? '==').length, text });
  }
  return out;
}

/**
 * Survey every `{| … |}` wikitable: its column headers and how many
 * data rows it holds. Nested tables are counted as one — the survey
 * wants orders of magnitude, not a parse tree.
 */
export function parseWikitables(wikitext: string): readonly TableSurvey[] {
  const out: TableSurvey[] = [];
  const lines = wikitext.split('\n');
  let depth = 0;
  let headers: string[] = [];
  let rows = 0;
  // A row is only closed by the NEXT `|-` or by `|}`, so the open row
  // has to be counted at close time or every table loses its last row.
  let rowOpen = false;

  const closeTable = (): void => {
    if (rowOpen) rows += 1;
    out.push({ headers, rows });
    headers = [];
    rows = 0;
    rowOpen = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('{|')) {
      depth += 1;
      continue;
    }
    if (depth === 0) continue;
    if (line.startsWith('|}')) {
      depth -= 1;
      if (depth === 0) closeTable();
      continue;
    }
    if (depth > 1) continue; // inside a nested table

    if (line.startsWith('!')) {
      // `! A !! B !! C`, or one `! A` per line.
      for (const cell of line.slice(1).split('!!')) {
        const header = cleanCell(cell);
        if (header !== '') headers.push(header);
      }
      continue;
    }
    if (line.startsWith('|-')) {
      if (rowOpen) rows += 1;
      rowOpen = false;
      continue;
    }
    if (line.startsWith('|')) rowOpen = true;
  }
  if (depth > 0) closeTable(); // unbalanced markup: keep what we saw
  return out;
}

/** Count `{{Qref}}` citations — the per-source anchors. */
export function countQrefs(wikitext: string): number {
  QREF.lastIndex = 0;
  let n = 0;
  while (QREF.exec(wikitext) !== null) n += 1;
  return n;
}

/** Survey one page's non-infobox structure. */
export function surveyPage(wikitext: string): PageStructure {
  WIKILINK.lastIndex = 0;
  let wikilinks = 0;
  while (WIKILINK.exec(wikitext) !== null) wikilinks += 1;
  return {
    headings: parseSections(wikitext),
    tables: parseWikitables(wikitext),
    qrefs: countQrefs(wikitext),
    wikilinks,
  };
}

export type StructureAggregate = {
  readonly pages: number;
  /** Headings by frequency — the page taxonomy of this entity kind. */
  readonly headings: readonly { readonly text: string; readonly pages: number; }[];
  /**
   * Distinct column-header signatures, by frequency. A signature that
   * recurs across hundreds of pages is a table worth writing a row
   * mapper for; one that appears twice is a one-off.
   */
  readonly tables: readonly {
    readonly headers: readonly string[];
    readonly tables: number;
    readonly rows: number;
  }[];
  /** Mean `{{Qref}}` citations per page. */
  readonly qrefsPerPage: number;
  /** Mean wikilinks per page. */
  readonly wikilinksPerPage: number;
};

/** Merge per-page surveys into the per-entity-kind picture. */
export function aggregateStructures(
  structures: readonly PageStructure[],
): StructureAggregate {
  const headingPages = new Map<string, number>();
  const tableSignatures = new Map<
    string,
    { headers: readonly string[]; tables: number; rows: number; }
  >();
  let qrefs = 0;
  let wikilinks = 0;

  for (const page of structures) {
    // Count each heading once per page, not once per occurrence.
    for (const text of new Set(page.headings.map((h) => h.text))) {
      headingPages.set(text, (headingPages.get(text) ?? 0) + 1);
    }
    for (const table of page.tables) {
      const key = table.headers.join(' | ');
      const existing = tableSignatures.get(key);
      if (existing === undefined) {
        tableSignatures.set(key, { headers: table.headers, tables: 1, rows: table.rows });
      } else {
        existing.tables += 1;
        existing.rows += table.rows;
      }
    }
    qrefs += page.qrefs;
    wikilinks += page.wikilinks;
  }

  const pages = structures.length;
  const byPages = <T extends { pages: number; }>(a: T, b: T): number => b.pages - a.pages;
  return {
    pages,
    headings: [...headingPages.entries()]
      .map(([text, count]) => ({ text, pages: count }))
      .sort((a, b) => byPages(a, b) || a.text.localeCompare(b.text)),
    tables: [...tableSignatures.values()]
      .sort((a, b) => b.tables - a.tables || b.rows - a.rows),
    qrefsPerPage: pages === 0 ? 0 : qrefs / pages,
    wikilinksPerPage: pages === 0 ? 0 : wikilinks / pages,
  };
}
