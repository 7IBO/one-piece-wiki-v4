/**
 * ADR-096 — per-item provenance on the epistemic entity-ref-list
 * qualifiers `believed_by` / `known_truth_by`.
 *
 * Items of those two lists accept two forms:
 *
 *  - plain `EntityId` string — canonical when the item carries no
 *    provenance (all pre-ADR-096 data);
 *  - `{ target, source? }` object — canonical when THAT item cites its
 *    own source (e.g. Luffy believes Sabo dead, as depicted in
 *    `manga-chapter:585`). `source` mirrors the `SourceRefOrList`
 *    authoring convenience: a single ref or a list.
 *
 * `entityRefItems` is the ONLY reader of this union — every consumer
 * (coherence, reference resolution, history diff, dashboard form, web
 * views) normalizes through it instead of re-parsing the two shapes.
 * `serializeEntityRefItems` is the inverse: it emits the MINIMAL
 * canonical JSON (plain string when an item has no source), so editing
 * a list never rewrites provenance-free items into objects.
 *
 * `attested_by` is intentionally NOT covered: its targets are
 * `reference:*` entities, where a per-item source is meaningless.
 */
import { ENTITY_ID_PATTERN } from './primitives.ts';

/**
 * The qualifier ids whose values are entity-ref-ITEM lists (this
 * module's union). Consumers that treat these qualifiers specially
 * (per-item source affordance, ref counting) gate on this constant
 * instead of hand-copying the two ids. `attested_by` is deliberately
 * absent — see the module doc.
 */
export const ENTITY_REF_ITEM_QUALIFIER_IDS = ['believed_by', 'known_truth_by'] as const;

/** Normalized item of a `believed_by` / `known_truth_by` list. */
export type EntityRefItem = {
  readonly target: string;
  /** Source(s) depicting THIS item's belief/knowledge, when cited. */
  readonly source?: string | readonly string[];
};

/** Serialized (on-disk) item form — see `serializeEntityRefItems`. */
export type SerializedEntityRefItem =
  | string
  | { readonly target: string; readonly source: string | readonly string[]; };

const isEntityId = (value: unknown): value is string =>
  typeof value === 'string' && ENTITY_ID_PATTERN.test(value);

/** Faithful normalization of an item's `source`: a valid ref stays a
 *  string, an array keeps its valid refs (empty → absent). */
function itemSource(value: unknown): string | readonly string[] | undefined {
  if (isEntityId(value)) return value;
  if (Array.isArray(value)) {
    const refs = value.filter(isEntityId);
    return refs.length > 0 ? refs : undefined;
  }
  return undefined;
}

/**
 * Normalize a raw `believed_by` / `known_truth_by` value into a flat
 * item list. Accepts an array (the schema shape), a bare string or a
 * bare object (lenient single-item forms), and `undefined`/`null`
 * (empty). Malformed items — non-EntityId strings, objects without a
 * valid `target`, numbers, nested arrays — are dropped, matching the
 * tolerant-reader convention of the coherence layer's ref scans.
 */
export function entityRefItems(value: unknown): readonly EntityRefItem[] {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  const out: EntityRefItem[] = [];
  for (const item of list) {
    if (isEntityId(item)) {
      out.push({ target: item });
      continue;
    }
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const target = record['target'];
      if (!isEntityId(target)) continue;
      const source = itemSource(record['source']);
      out.push(source === undefined ? { target } : { target, source });
    }
  }
  return out;
}

/** An item's source refs as a flat list (`[]` when it cites none). */
export function entityRefItemSources(item: EntityRefItem): readonly string[] {
  if (item.source === undefined) return [];
  return typeof item.source === 'string' ? [item.source] : item.source;
}

/**
 * Serialize normalized items back to the minimal canonical JSON:
 * an item without a source becomes a plain string (never an object —
 * the serialized data must stay as small as pre-ADR-096); an item
 * with exactly one source ref carries it as a string, several as an
 * array (the `SourceRefOrList` convention).
 */
export function serializeEntityRefItems(
  items: readonly EntityRefItem[],
): readonly SerializedEntityRefItem[] {
  return items.map((item): SerializedEntityRefItem => {
    const sources = entityRefItemSources(item);
    if (sources.length === 0) return item.target;
    return { target: item.target, source: sources.length === 1 ? sources[0]! : sources };
  });
}
