/**
 * Persistent left-hand navigation, Payload-CMS style. Lists every
 * entity type discovered from the schema catalogue, grouped by
 * `ui_hint.group` so related types cluster (people, groups, places…).
 * Each entry links to /types/<id> and highlights when the current
 * route matches.
 */
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useLocation } from '@tanstack/react-router';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { api, type SchemaCatalogue } from './api';
import { useLocale } from './form/locale';

const GROUP_LABELS: Record<string, { en: string; fr: string; }> = {
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

const GROUP_ORDER: readonly string[] = [
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

type GroupedType = {
  groupId: string;
  groupLabel: string;
  items: readonly { id: string; label: string; }[];
};

export function AppSidebar(): JSX.Element {
  const locale = useLocale();
  const location = useLocation();
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);

  useEffect(() => {
    api.schemas().then(setSchemas).catch(() => {/* empty sidebar on error */});
  }, []);

  const groups = useMemo<readonly GroupedType[]>(() => {
    if (schemas === null) return [];
    const buckets = new Map<string, { id: string; label: string; }[]>();
    for (const et of Object.values(schemas.entityTypes)) {
      const gid = et.ui_hint?.group ?? 'other';
      const label = et.labels[locale] ?? et.labels.en;
      const list = buckets.get(gid) ?? [];
      list.push({ id: et.id, label });
      buckets.set(gid, list);
    }
    for (const list of buckets.values()) list.sort((a, b) => a.label.localeCompare(b.label));
    return GROUP_ORDER
      .filter((g) => buckets.has(g))
      .map((g) => ({
        groupId: g,
        groupLabel: GROUP_LABELS[g]?.[locale] ?? GROUP_LABELS[g]?.en ?? g,
        items: buckets.get(g) ?? [],
      }))
      .concat(
        // Anything with an unknown group falls through to the end.
        [...buckets.keys()]
          .filter((g) => !GROUP_ORDER.includes(g))
          .map((g) => ({
            groupId: g,
            groupLabel: g,
            items: buckets.get(g) ?? [],
          })),
      );
  }, [schemas, locale]);

  if (schemas === null) {
    return (
      <nav className='flex flex-col gap-2 p-3'>
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className='h-6 w-full' />)}
      </nav>
    );
  }

  return (
    <nav className='flex flex-col gap-4 p-3 text-sm'>
      <Link
        to='/'
        className={`block rounded-md px-2 py-1.5 text-xs uppercase tracking-wide transition-colors ${
          location.pathname === '/'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
        }`}
      >
        Overview
      </Link>
      {groups.map((g) => (
        <div key={g.groupId}>
          <p className='text-muted-foreground mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide'>
            {g.groupLabel}
          </p>
          <ul className='space-y-0.5'>
            {g.items.map((it) => {
              const active = location.pathname.startsWith(`/types/${it.id}`);
              return (
                <li key={it.id}>
                  <Link
                    to='/types/$type'
                    params={{ type: it.id }}
                    className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                    }`}
                  >
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
