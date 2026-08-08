/**
 * "All links of an entity" panel — every linked value in BOTH
 * directions plus inverse-coherence conflicts, from
 * `GET /api/entities/:type/:slug/links` (computed server-side in
 * server/links.ts; this component only composes the payload).
 *
 * Rendered below the entity form. Lazy: fetches on mount via
 * useApiResource, independent of the form's own resources.
 * Collapsed by default on mobile, open from `sm:` up (decided in a
 * post-hydration effect so SSR markup stays deterministic).
 */
import { Badge } from '@/components/ui/badge';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { RelationTypeSchema } from '@onepiece-wiki/schemas';
import { Link } from '@tanstack/react-router';
import { ChevronDown, Link2, TriangleAlert } from 'lucide-react';
import { type JSX, useEffect, useState } from 'react';
import {
  api,
  type DisplayName,
  type EntityRoute,
  type LinkConflict,
  type LinkConflictKind,
} from '../api';
import { useLocale, useT } from '../form/locale';
import { useApiResource } from '../hooks/use-api-resource';
import { LoadFailed } from './LoadFailed';

type Props = {
  readonly type: string;
  readonly slug: string;
  readonly relationTypes: Record<string, RelationTypeSchema>;
};

/** One direction-agnostic row: who is on the other end + qualifiers. */
type LinkRow = {
  readonly relationType: string;
  readonly otherId: string;
  readonly otherRoute: EntityRoute;
  readonly otherDisplayName: DisplayName;
  readonly qualifiers: Record<string, unknown>;
};

function formatQualifierValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(formatQualifierValue).join(', ');
  return JSON.stringify(value) ?? '';
}

/** `since: manga-chapter:1 · relation_kind: sworn_brother` */
function formatQualifiers(qualifiers: Record<string, unknown>): string {
  return Object.entries(qualifiers)
    .map(([k, v]) => `${k}: ${formatQualifierValue(v)}`)
    .join(' · ');
}

/** Stable-order grouping by relation type (first-seen order). */
function groupByRelationType(rows: readonly LinkRow[]): ReadonlyArray<[string, LinkRow[]]> {
  const groups = new Map<string, LinkRow[]>();
  for (const row of rows) {
    const list = groups.get(row.relationType) ?? [];
    list.push(row);
    groups.set(row.relationType, list);
  }
  return [...groups.entries()];
}

const CONFLICT_KIND_LABEL_KEY = {
  'duplicate-symmetric': 'linksConflictDuplicateSymmetric',
  'duplicate-edge': 'linksConflictDuplicateEdge',
  'qualifier-mismatch': 'linksConflictQualifierMismatch',
} as const satisfies Record<LinkConflictKind, string>;

function LinkRows(
  { rows, direction, relationTypes }: {
    readonly rows: readonly LinkRow[];
    /** Which label of the relation type describes this direction. */
    readonly direction: 'active' | 'inverse';
    readonly relationTypes: Record<string, RelationTypeSchema>;
  },
): JSX.Element {
  const locale = useLocale();
  return (
    <div className='space-y-2'>
      {groupByRelationType(rows).map(([relationType, group]) => {
        const rt = relationTypes[relationType];
        const label = rt?.labels[locale]?.[direction] ?? rt?.labels.en[direction]
          ?? relationType;
        return (
          <div key={relationType}>
            <p className='text-muted-foreground text-xs font-medium'>{label}</p>
            <ul className='divide-y divide-foreground/5'>
              {group.map((row, i) => {
                const name = row.otherDisplayName[locale]
                  ?? row.otherDisplayName.en
                  ?? row.otherId;
                const qualifierText = formatQualifiers(row.qualifiers);
                return (
                  <li
                    key={`${row.otherId}-${i}`}
                    className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5'
                  >
                    {row.otherRoute !== null
                      ? (
                        <Link
                          to='/types/$type/$slug'
                          params={row.otherRoute}
                          className='text-xs font-medium hover:underline'
                        >
                          {name}
                        </Link>
                      )
                      : <span className='font-mono text-xs'>{row.otherId}</span>}
                    {qualifierText !== ''
                      ? (
                        <span className='text-muted-foreground min-w-0 text-xs'>
                          {qualifierText}
                        </span>
                      )
                      : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ConflictsBanner(
  { conflicts, relationTypes }: {
    readonly conflicts: readonly LinkConflict[];
    readonly relationTypes: Record<string, RelationTypeSchema>;
  },
): JSX.Element {
  const locale = useLocale();
  const t = useT();
  return (
    <Banner variant='warning' className='flex-col items-stretch gap-1'>
      <span className='flex items-center gap-2 font-medium'>
        <TriangleAlert className='size-4 shrink-0 text-amber-500' />
        {t('linksConflictsTitle').replace('{n}', String(conflicts.length))}
      </span>
      <ul className='divide-y divide-amber-500/20'>
        {conflicts.map((conflict, i) => {
          const rt = relationTypes[conflict.relationType];
          const relationLabel = rt?.labels[locale]?.active ?? rt?.labels.en.active
            ?? conflict.relationType;
          return (
            <li key={i} className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5'>
              <span className='font-medium'>{t(CONFLICT_KIND_LABEL_KEY[conflict.kind])}</span>
              <span>{relationLabel}</span>
              <span className='font-mono'>{conflict.otherEntityId}</span>
              <span className='text-muted-foreground basis-full'>{conflict.detail}</span>
            </li>
          );
        })}
      </ul>
    </Banner>
  );
}

export function EntityLinksPanel({ type, slug, relationTypes }: Props): JSX.Element {
  const t = useT();
  // Collapsed by default on mobile, open ≥sm. Decided post-hydration
  // (same pattern as LocaleProvider) so SSR + first client render
  // agree; the one-frame collapsed flash on desktop is accepted.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(min-width: 640px)').matches) setOpen(true);
  }, []);

  const { data, error, reload } = useApiResource(
    () => api.entityLinks(type, slug),
    [type, slug],
  );

  const incomingRows: readonly LinkRow[] = (data?.incoming ?? []).map((i) => ({
    relationType: i.relationType,
    otherId: i.sourceEntityId,
    otherRoute: i.sourceRoute,
    otherDisplayName: i.sourceDisplayName,
    qualifiers: i.qualifiers,
  }));
  const outgoingRows: readonly LinkRow[] = (data?.outgoing ?? []).map((o) => ({
    relationType: o.relationType,
    otherId: o.target,
    otherRoute: o.targetRoute,
    otherDisplayName: o.targetDisplayName,
    qualifiers: o.qualifiers,
  }));

  return (
    <Card bleed size='sm' className='gap-0 py-0'>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className='flex w-full items-center gap-2 px-3 py-3 text-left'>
          <Link2 className='text-muted-foreground size-3.5 shrink-0' />
          <span className='text-sm font-medium'>{t('linksPanelTitle')}</span>
          {data !== null
            ? (
              <span className='text-muted-foreground text-xs'>
                {t('linksPanelCounts')
                  .replace('{in}', String(data.incoming.length))
                  .replace('{out}', String(data.outgoing.length))}
              </span>
            )
            : null}
          {data !== null && data.conflicts.length > 0
            ? (
              <Badge variant='outline' className='text-amber-500 shrink-0 text-xs'>
                {data.conflicts.length}
              </Badge>
            )
            : null}
          <ChevronDown
            className={cn(
              'text-muted-foreground ml-auto size-4 shrink-0 transition-transform',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className='border-border border-t'>
          {error !== null
            ? (
              <div className='p-3'>
                <LoadFailed message={error} onRetry={reload} />
              </div>
            )
            : data === null
            ? (
              <div className='space-y-2 p-3'>
                <Skeleton className='h-4 w-40' />
                <Skeleton className='h-4 w-56' />
                <Skeleton className='h-4 w-48' />
              </div>
            )
            : (
              <div className='space-y-4 p-3'>
                {data.conflicts.length > 0
                  ? (
                    <ConflictsBanner
                      conflicts={data.conflicts}
                      relationTypes={relationTypes}
                    />
                  )
                  : null}
                <section aria-label={t('linksIncomingTitle')}>
                  <h3 className='text-xs font-semibold tracking-wide uppercase'>
                    {t('linksIncomingTitle')}
                  </h3>
                  <div className='mt-1.5'>
                    {incomingRows.length === 0
                      ? <p className='text-muted-foreground text-xs'>{t('linksIncomingEmpty')}</p>
                      : (
                        <LinkRows
                          rows={incomingRows}
                          direction='inverse'
                          relationTypes={relationTypes}
                        />
                      )}
                  </div>
                </section>
                <section aria-label={t('linksOutgoingTitle')}>
                  <h3 className='text-xs font-semibold tracking-wide uppercase'>
                    {t('linksOutgoingTitle')}
                  </h3>
                  <div className='mt-1.5'>
                    {outgoingRows.length === 0
                      ? <p className='text-muted-foreground text-xs'>{t('linksOutgoingEmpty')}</p>
                      : (
                        <LinkRows
                          rows={outgoingRows}
                          direction='active'
                          relationTypes={relationTypes}
                        />
                      )}
                  </div>
                </section>
              </div>
            )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
