/**
 * Spoiler filter: given a Progression, returns only the property
 * entries and relations whose `since`/`spoiler_since` source is
 * reachable. For historisable properties, returns the latest reachable
 * entry per property (matching the "candidate := entry whose since <=
 * progression" semantics in /docs/EPISTEMIC_MODEL.md § Filtering).
 */
import type { PropertyRecord, RelationRecord } from './client.ts';
import { isReachable, type Progression, sourceChapterNumber } from './progression.ts';

function compareSources(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  const numA = sourceChapterNumber(a);
  const numB = sourceChapterNumber(b);
  if (numA !== null && numB !== null) return numA - numB;
  return a.localeCompare(b);
}

export function visibleProperties(
  properties: readonly PropertyRecord[],
  progression: Progression,
): readonly PropertyRecord[] {
  const reachable = properties.filter((p) => isReachable(p.since_source, progression));
  const byProperty = new Map<string, PropertyRecord>();
  for (
    const entry of [...reachable].sort((a, b) => compareSources(a.since_source, b.since_source))
  ) {
    byProperty.set(entry.property_id, entry);
  }
  return [...byProperty.values()];
}

export function visibleRelations(
  relations: readonly RelationRecord[],
  progression: Progression,
): readonly RelationRecord[] {
  return relations.filter((r) => isReachable(r.since_source, progression));
}
