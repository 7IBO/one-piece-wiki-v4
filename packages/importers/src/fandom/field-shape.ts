/**
 * Infobox field value profiling — the input a schema redesign actually
 * needs (ADR-092 extension, lot 1).
 *
 * `fandom:analyze` used to report field NAMES and how many sampled
 * pages carried each. That answers "does a field exist", which is
 * enough to notice drift but nowhere near enough to design a property:
 * choosing between a `string`, an `enum`, a historised value and a
 * relation depends on what the values LOOK like across hundreds of
 * pages, not on whether the key is present.
 *
 * So this module profiles the raw values themselves: how often the
 * field is filled, how many distinct values it takes, whether those
 * values are numbers, dates, wikilinks, templates or free prose,
 * whether they are lists, and a handful of real examples. Everything
 * here is pure and deterministic — the network stays in `client.ts`,
 * and the whole profiler is unit-testable without it.
 */
import { cleanValue, parseLooseDate, parseLooseNumber } from './wikitext.ts';

export type FieldShapeKind =
  /** Every filled value parses as a number. */
  | 'number'
  /** Every filled value parses as a date. */
  | 'date'
  /** Values are exactly one `[[wikilink]]` — a relation candidate. */
  | 'wikilink'
  /** Values are several wikilinks — a multi-valued relation candidate. */
  | 'wikilink_list'
  /** Values carry templates (`{{...}}`) — needs a dedicated parser. */
  | 'template'
  /** Few distinct values over many pages — an enum candidate. */
  | 'enum_like'
  /** Long free text — narrative, not structured data. */
  | 'prose'
  /** Short free text with no stronger signal. */
  | 'text';

export type FieldShape = {
  readonly kind: FieldShapeKind;
  /** Filled occurrences / pages sampled for this infobox, 0..1. */
  readonly fillRate: number;
  /** Distinct non-empty values across the sample. */
  readonly distinct: number;
  /** Longest cleaned value seen, in characters. */
  readonly maxLength: number;
  /** True when values commonly carry a list separator. */
  readonly multiValue: boolean;
  /** Distinct cleaned values, longest-first, capped and truncated. */
  readonly examples: readonly string[];
};

/** Separators the wiki uses for in-cell lists. */
const LIST_SEPARATOR = /<br\s*\/?>|\n\s*\*|;|\s\/\s/i;
const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const TEMPLATE = /\{\{/;

/** Longest example kept in the report, in characters. */
const EXAMPLE_MAX_LENGTH = 120;
/** How many distinct examples to carry per field. */
const EXAMPLE_COUNT = 5;

function countWikilinks(value: string): number {
  WIKILINK.lastIndex = 0;
  let n = 0;
  while (WIKILINK.exec(value) !== null) n += 1;
  return n;
}

function truncate(value: string): string {
  return value.length <= EXAMPLE_MAX_LENGTH
    ? value
    : `${value.slice(0, EXAMPLE_MAX_LENGTH - 1)}…`;
}

/**
 * Profile one field from the raw values seen across a sample.
 *
 * Structure is read from the RAW wikitext, not from `cleanValue`'s
 * output: cleaning is what strips `[[links]]`, `{{templates}}` and
 * `<br>` separators, i.e. exactly the three signals that decide
 * whether a field wants a relation, a parser or `allow_multiple`.
 * Cleaned values are used only for what humans read — the examples —
 * and for cardinality, where `[[Zoro]]` and `Zoro` are the same value.
 *
 * @param rawValues one entry per page where the field was present;
 *   blank entries count as "present but empty" and lower the fill rate.
 * @param pagesSampled how many pages carried the infobox at all.
 */
export function profileField(
  rawValues: readonly string[],
  pagesSampled: number,
): FieldShape {
  const filled = rawValues.map((v) => v.trim()).filter((v) => v !== '');
  // A value that cleans away entirely (a bare `{{Qref|…}}`) still has
  // to show up somewhere, so fall back to its collapsed raw form.
  const display = filled.map((raw) => {
    const cleaned = cleanValue(raw);
    return cleaned === '' ? raw.replace(/\s+/g, ' ') : cleaned;
  });
  const distinctValues = [...new Set(display)];
  const fillRate = pagesSampled === 0 ? 0 : filled.length / pagesSampled;
  const maxLength = display.reduce((max, v) => Math.max(max, v.length), 0);
  const multiValue = filled.length > 0
    && filled.filter((v) => LIST_SEPARATOR.test(v) || countWikilinks(v) > 1).length * 2
      >= filled.length;

  const examples = distinctValues
    .slice()
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, EXAMPLE_COUNT)
    .map(truncate);

  const shape: Omit<FieldShape, 'kind'> = {
    fillRate,
    distinct: distinctValues.length,
    maxLength,
    multiValue,
    examples,
  };

  if (filled.length === 0) return { kind: 'text', ...shape };

  // Order matters: the strongest structural signal wins. Numbers and
  // dates first (they are unambiguous), then link shape, then
  // templates, then the statistical enum guess, then length.
  if (display.every((v) => parseLooseNumber(v) !== null)) return { kind: 'number', ...shape };
  if (display.every((v) => parseLooseDate(v) !== null)) return { kind: 'date', ...shape };

  const linkCounts = filled.map(countWikilinks);
  // "Exactly one link and nothing else" is the relation candidate; a
  // link with prose around it is text that happens to link.
  const isSoleLink = (v: string): boolean =>
    countWikilinks(v) === 1 && v.replace(WIKILINK, '').trim() === '';
  if (filled.every(isSoleLink)) return { kind: 'wikilink', ...shape };
  if (linkCounts.every((n) => n >= 1) && linkCounts.some((n) => n > 1)) {
    return { kind: 'wikilink_list', ...shape };
  }
  if (filled.some((v) => TEMPLATE.test(v))) return { kind: 'template', ...shape };

  // An enum candidate: many pages, few distinct values. The floor of 4
  // filled samples keeps a tiny sample from reading as an enum just
  // because nothing has repeated yet.
  if (filled.length >= 4 && distinctValues.length <= Math.max(2, filled.length * 0.5)) {
    return { kind: 'enum_like', ...shape };
  }

  if (maxLength > 200) return { kind: 'prose', ...shape };
  return { kind: 'text', ...shape };
}

/**
 * One-line human summary of a shape, for the Markdown report — this is
 * what makes a 900-field report readable at a glance.
 */
export function describeShape(shape: FieldShape): string {
  const pct = `${Math.round(shape.fillRate * 100)}%`;
  const list = shape.multiValue ? ', multi' : '';
  return `${shape.kind} (${pct} filled, ${shape.distinct} distinct${list})`;
}
