/**
 * Ordinal page titles, and the variant pages that must never claim an
 * ordinal id (ADR-107 lot 1).
 *
 * Context — the bug this exists to prevent. The chapter, episode and
 * volume mappers all derive their entity id from the page title
 * (`Episode 1071` → `anime-episode:1071`) and fall back to the
 * infobox ordinal when the title does not match. On 2026-08-07 the
 * `Episodes` crawl fetched the "Special Edited Version" recap pages —
 * titled `Episode 1 (Special Edited Version)` — whose Episode Box
 * carries `#=1`. The title regex missed, the infobox fallback hit, and
 * eight recap specials were written as `anime-episode:1..8`. Not
 * missing data: WRONG data under the right ids, which validation
 * cannot catch because the shape is perfect.
 *
 * The rule: for an ordinal-keyed entity type, only the CANONICAL title
 * page may claim the ordinal. `Episode 1` claims `1`; `Episode 1
 * (anything)` claims nothing and is skipped with a reason. A title
 * that looks nothing like the ordinal form still falls back to the
 * infobox, so oddly-titled pages keep working.
 */

export type OrdinalTitle =
  /** Exactly `<Noun> <N>` — the page that owns the ordinal. */
  | { readonly kind: 'canonical'; readonly ordinal: number; }
  /** `<Noun> <N> (<qualifier>)` — a re-edit, colour edition, recap… */
  | { readonly kind: 'variant'; readonly ordinal: number; readonly qualifier: string; }
  /** Anything else: the caller may fall back to the infobox ordinal. */
  | { readonly kind: 'other'; };

const CANONICAL = /^(\d+)$/;
const VARIANT = /^(\d+)\s*\((.+)\)$/;

/**
 * Classify a page title against the canonical `<noun> <ordinal>` form.
 * `noun` is matched case-insensitively (`Episode`, `Chapter`, `Volume`).
 */
export function readOrdinalTitle(noun: string, rawTitle: string): OrdinalTitle {
  const title = rawTitle.trim();
  const prefix = `${noun} `;
  if (title.length <= prefix.length) return { kind: 'other' };
  if (title.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) {
    return { kind: 'other' };
  }
  const rest = title.slice(prefix.length).trim();

  const canonical = CANONICAL.exec(rest);
  if (canonical !== null) return { kind: 'canonical', ordinal: Number(canonical[1]) };

  const variant = VARIANT.exec(rest);
  if (variant !== null) {
    return { kind: 'variant', ordinal: Number(variant[1]), qualifier: variant[2]!.trim() };
  }
  return { kind: 'other' };
}

/**
 * Deterministic crawl order for a set of page titles.
 *
 * A category page listing is returned by the MediaWiki API in its own
 * order, and `--limit N` truncates it. On a 1231-page category that
 * made "the first 25 episodes" mean "25 arbitrary pages" — which is
 * how the recap variants got imported ahead of every real episode.
 * Ordering rules, all total and stable:
 *
 *  1. canonical titles before parenthesised variants;
 *  2. inside each group, numerically by any trailing ordinal;
 *  3. titles with no ordinal last, alphabetically.
 *
 * The function is deliberately noun-agnostic — it reads whatever
 * trailing number a title carries — so it orders chapters, episodes
 * and volumes alike, and degrades to plain alphabetical order for
 * categories with no ordinals at all (characters, locations…).
 */
export function orderCrawlQueue(titles: readonly string[]): readonly string[] {
  const TRAILING = /^(.*?)\s+(\d+)(?:\s*\((.+)\))?$/;
  type Keyed = {
    readonly title: string;
    readonly variant: 0 | 1;
    readonly ordinal: number | null;
  };
  const keyed: Keyed[] = titles.map((title) => {
    const m = TRAILING.exec(title.trim());
    if (m === null) return { title, variant: 0, ordinal: null };
    return {
      title,
      variant: m[3] === undefined ? 0 : 1,
      ordinal: Number(m[2]),
    };
  });

  return keyed
    .slice()
    .sort((a, b) => {
      if (a.variant !== b.variant) return a.variant - b.variant;
      if (a.ordinal !== null && b.ordinal !== null && a.ordinal !== b.ordinal) {
        return a.ordinal - b.ordinal;
      }
      if (a.ordinal !== null && b.ordinal === null) return -1;
      if (a.ordinal === null && b.ordinal !== null) return 1;
      return a.title.localeCompare(b.title);
    })
    .map((k) => k.title);
}
