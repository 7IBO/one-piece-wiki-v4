/**
 * Shared `ui_hint.group` taxonomy for entity types. The sidebar
 * navigation and the home page grid both cluster types with this
 * module so the two surfaces always agree. Group ids come from the
 * schema files' `ui_hint.group`; unknown ids fall through to the end
 * under their raw id (never dropped), and types without a group land
 * in `other`.
 */
import type { Locale } from '../form/locale';

export const GROUP_LABELS: Record<string, { en: string; fr: string; }> = {
  people: { en: 'People', fr: 'Personnages' },
  groups: { en: 'Groups', fr: 'Groupes' },
  places: { en: 'Places', fr: 'Lieux' },
  powers: { en: 'Powers', fr: 'Pouvoirs' },
  objects: { en: 'Objects', fr: 'Objets' },
  vehicles: { en: 'Vehicles', fr: 'Véhicules' },
  sources: { en: 'Sources', fr: 'Sources' },
  narrative: { en: 'Narrative', fr: 'Récit' },
  events: { en: 'Events', fr: 'Évènements' },
  abstract: { en: 'Abstract', fr: 'Abstrait' },
  concepts: { en: 'Concepts', fr: 'Concepts' },
  media: { en: 'Media', fr: 'Médias' },
  other: { en: 'Other', fr: 'Autres' },
};

export const GROUP_ORDER: readonly string[] = [
  'people',
  'groups',
  'places',
  'powers',
  'objects',
  'vehicles',
  'sources',
  'narrative',
  'events',
  'abstract',
  'concepts',
  'media',
  'other',
];

export type TypeGroup<T> = {
  readonly groupId: string;
  readonly groupLabel: string;
  readonly items: readonly T[];
};

/**
 * Bucket entity-type items by their `ui_hint.group`, sort each bucket
 * by localized label, and order the buckets by `GROUP_ORDER` (unknown
 * group ids trail alphabetically). The order is fully determined by
 * the schema catalogue + locale — never by entity counts — so callers
 * get a stable layout while asynchronous data streams in.
 */
export function groupTypesByUiHint<T>(
  types: readonly T[],
  accessors: {
    readonly group: (item: T) => string | undefined;
    readonly label: (item: T) => string;
  },
  locale: Locale,
): readonly TypeGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of types) {
    const groupId = accessors.group(item) ?? 'other';
    const list = buckets.get(groupId) ?? [];
    list.push(item);
    buckets.set(groupId, list);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => accessors.label(a).localeCompare(accessors.label(b)));
  }
  const orderedIds = [
    ...GROUP_ORDER.filter((g) => buckets.has(g)),
    ...[...buckets.keys()].filter((g) => !GROUP_ORDER.includes(g)).sort(),
  ];
  return orderedIds.map((groupId) => ({
    groupId,
    groupLabel: GROUP_LABELS[groupId]?.[locale] ?? GROUP_LABELS[groupId]?.en ?? groupId,
    items: buckets.get(groupId) ?? [],
  }));
}
