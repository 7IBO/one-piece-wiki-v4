/**
 * "All links of an entity" panel — every linked value in BOTH
 * directions plus inverse-coherence findings, from
 * `GET /api/entities/:type/:slug/links` (computed server-side in
 * server/links.ts; this component only composes the payload).
 *
 * Qualifier keys resolve through the qualifier-type registry and
 * enum values through vocabularies, so rows read "Camp : Alliés de
 * Barbe Blanche", never "side: whitebeard_allies". Each row carries
 * an edit affordance: outgoing links scroll to the relation editor
 * above (the stored side lives on THIS entity), incoming links jump
 * to the entity that stores the edge.
 *
 * Double-stored symmetric edges are an INFORMATIVE note, not an
 * error: the pipeline generates inverses, so one stored direction is
 * canonical and a missing opposite is by design (maintainer decision
 * 2026-08-08). Only duplicate edges and qualifier mismatches stay
 * amber.
 *
 * Rendered below the entity form. Lazy: fetches on mount via
 * useApiResource, independent of the form's own resources.
 * Collapsed by default on EVERY viewport ("par défaut, rien
 * d'ouvert", maintainer decision 2026-08-08) — the user opens it
 * explicitly.
 */
import { Badge } from '@/components/ui/badge';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  entityRefItems,
  entityRefItemSources,
  type QualifierTypeSchema,
  type RelationTypeSchema,
  type VocabularySchema,
} from '@onepiece-wiki/schemas';
import { Link } from '@tanstack/react-router';
import { ChevronDown, Info, Link2, Pencil, TriangleAlert } from 'lucide-react';
import { type JSX, useState } from 'react';
import {
  api,
  type DisplayName,
  type EntityRoute,
  type LinkConflict,
  type LinkConflictKind,
} from '../api';
import { useLocale, useT } from '../form/locale';
import { relationAnchorId } from '../form/PropertyNav';
import { useApiResource } from '../hooks/use-api-resource';
import { LoadFailed } from './LoadFailed';

type Props = {
  readonly type: string;
  readonly slug: string;
  readonly relationTypes: Record<string, RelationTypeSchema>;
  readonly qualifierTypes: Record<string, QualifierTypeSchema>;
  readonly vocabularies: Record<string, VocabularySchema>;
  /**
   * ADR-097 — when provided, each INCOMING group whose relation
   * accepts this page's type as a target (`valid_to_types`) gains a
   * "Manage" button that calls back with the relation-type id. The
   * entity page routes it to the generic incoming-edge manager (or
   * the /sources cast manager for appears-in on a source page).
   */
  readonly onManageIncoming?: (relationTypeId: string) => void;
};

/** One direction-agnostic row: who is on the other end + qualifiers. */
type LinkRow = {
  readonly relationType: string;
  readonly otherId: string;
  readonly otherRoute: EntityRoute;
  readonly otherDisplayName: DisplayName;
  readonly qualifiers: Record<string, unknown>;
};

/** Lookup context for resolving qualifier keys/values to labels.
 *  Exported for the read-only inferred-relations section
 *  (`InferredRelations` in form/RelationsEditor), which resolves the
 *  same incoming rows. */
export type LabelCtx = {
  readonly relationTypes: Record<string, RelationTypeSchema>;
  readonly qualifierTypes: Record<string, QualifierTypeSchema>;
  readonly vocabularies: Record<string, VocabularySchema>;
  readonly locale: 'en' | 'fr';
};

function formatQualifierValue(value: unknown, enumRef: string | undefined, ctx: LabelCtx): string {
  if (Array.isArray(value)) {
    return value.map((v) => formatQualifierValue(v, enumRef, ctx)).join(', ');
  }
  if (typeof value === 'string' && enumRef !== undefined) {
    const vocabValue = ctx.vocabularies[enumRef]?.values[value];
    if (vocabValue !== undefined) {
      return vocabValue.labels[ctx.locale] ?? vocabValue.labels.en;
    }
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // ADR-096 — believed_by / known_truth_by items may carry per-item
  // provenance as `{ target, source? }`: "character:luffy (manga-chapter:585)".
  if (value !== null && typeof value === 'object') {
    const [item] = entityRefItems([value]);
    if (item !== undefined) {
      const sources = entityRefItemSources(item);
      return sources.length > 0 ? `${item.target} (${sources.join(', ')})` : item.target;
    }
  }
  return JSON.stringify(value) ?? '';
}

/** `Depuis : Chapitre 1 · Camp : Alliés de Barbe Blanche` — keys via
 *  the qualifier-type registry, enum values via vocabularies (the
 *  relation type's qualifier declaration carries the `enum_ref`).
 *  Exported for the inferred-relations section (see LabelCtx). */
export function formatQualifiers(
  relationTypeId: string,
  qualifiers: Record<string, unknown>,
  ctx: LabelCtx,
): string {
  const declarations = ctx.relationTypes[relationTypeId]?.qualifiers ?? [];
  return Object.entries(qualifiers)
    .map(([key, value]) => {
      const registry = ctx.qualifierTypes[key];
      const keyLabel = registry?.labels[ctx.locale] ?? registry?.labels.en ?? key;
      const enumRef = declarations.find((d) => d.id === key)?.enum_ref;
      return `${keyLabel} : ${formatQualifierValue(value, enumRef, ctx)}`;
    })
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
  { rows, direction, ctx, manageGroup }: {
    readonly rows: readonly LinkRow[];
    /** Which label of the relation type describes this direction. */
    readonly direction: 'active' | 'inverse';
    readonly ctx: LabelCtx;
    /** ADR-097 — per-group manage affordance (incoming side only):
     *  returns the click handler for a manageable relation group, or
     *  null when the group has no manager. */
    readonly manageGroup?: ((relationTypeId: string) => (() => void) | null) | undefined;
  },
): JSX.Element {
  const t = useT();
  const locale = ctx.locale;
  return (
    <div className='space-y-2'>
      {groupByRelationType(rows).map(([relationType, group]) => {
        const rt = ctx.relationTypes[relationType];
        const label = rt?.labels[locale]?.[direction] ?? rt?.labels.en[direction]
          ?? relationType;
        const onManage = manageGroup !== undefined ? manageGroup(relationType) : null;
        return (
          <div key={relationType}>
            <p className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
              {label}
              {onManage !== null
                ? (
                  <button
                    type='button'
                    onClick={onManage}
                    className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px] underline-offset-2 hover:underline'
                  >
                    <Pencil className='size-3' aria-hidden />
                    {t('incomingManage')}
                  </button>
                )
                : null}
            </p>
            <ul className='divide-y divide-foreground/5'>
              {group.map((row, i) => {
                const name = row.otherDisplayName[locale]
                  ?? row.otherDisplayName.en
                  ?? row.otherId;
                const qualifierText = formatQualifiers(relationType, row.qualifiers, ctx);
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
                    {direction === 'active'
                      ? (
                        // The stored side of an outgoing link lives on
                        // THIS entity — jump to its relation editor.
                        <button
                          type='button'
                          title={t('linksEditHere')}
                          aria-label={t('linksEditHere')}
                          // `self-center` — the row is `items-baseline`
                          // (so wrapped qualifier text lines up), but a
                          // p-1 icon button has no meaningful baseline
                          // and rendered visibly low next to the text.
                          className='text-muted-foreground hover:text-foreground ml-auto shrink-0 self-center p-1 transition-colors'
                          onClick={() => {
                            document
                              .getElementById(relationAnchorId(relationType))
                              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                        >
                          <Pencil className='size-3' aria-hidden />
                        </button>
                      )
                      : row.otherRoute !== null
                      ? (
                        // Incoming edges are stored on the OTHER
                        // entity — editing happens on its page.
                        <Link
                          to='/types/$type/$slug'
                          params={row.otherRoute}
                          title={t('linksEditOnOther')}
                          aria-label={t('linksEditOnOther')}
                          // Same `self-center` fix as the button above.
                          className='text-muted-foreground hover:text-foreground ml-auto shrink-0 self-center p-1 transition-colors'
                        >
                          <Pencil className='size-3' aria-hidden />
                        </Link>
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

function ConflictList(
  { conflicts, ctx }: {
    readonly conflicts: readonly LinkConflict[];
    readonly ctx: LabelCtx;
  },
): JSX.Element {
  const t = useT();
  return (
    <ul className='divide-y divide-foreground/10'>
      {conflicts.map((conflict, i) => {
        const rt = ctx.relationTypes[conflict.relationType];
        const relationLabel = rt?.labels[ctx.locale]?.active ?? rt?.labels.en.active
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
  );
}

export function EntityLinksPanel(
  { type, slug, relationTypes, qualifierTypes, vocabularies, onManageIncoming }: Props,
): JSX.Element {
  const t = useT();
  const locale = useLocale();
  // Collapsed by default everywhere — no post-hydration auto-open
  // ("par défaut, rien d'ouvert", maintainer decision 2026-08-08).
  const [open, setOpen] = useState(false);

  const { data, error, reload } = useApiResource(
    () => api.entityLinks(type, slug),
    [type, slug],
  );

  const ctx: LabelCtx = { relationTypes, qualifierTypes, vocabularies, locale };

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

  // Both-directions storage is a design note (inverse links are
  // pipeline-generated); real coherence problems stay warnings.
  const symmetricNotes = (data?.conflicts ?? []).filter((c) => c.kind === 'duplicate-symmetric');
  const warningConflicts = (data?.conflicts ?? []).filter((c) => c.kind !== 'duplicate-symmetric');

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
          {warningConflicts.length > 0
            ? (
              <Badge variant='outline' className='text-amber-500 shrink-0 text-xs'>
                {warningConflicts.length}
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
                {warningConflicts.length > 0
                  ? (
                    <Banner variant='warning' className='flex-col items-stretch gap-1'>
                      <span className='flex items-center gap-2 font-medium'>
                        <TriangleAlert className='size-4 shrink-0 text-amber-500' />
                        {t('linksConflictsTitle').replace(
                          '{n}',
                          String(warningConflicts.length),
                        )}
                      </span>
                      <ConflictList conflicts={warningConflicts} ctx={ctx} />
                    </Banner>
                  )
                  : null}
                {symmetricNotes.length > 0
                  ? (
                    <Banner variant='info' className='flex-col items-stretch gap-1'>
                      <span className='flex items-center gap-2 font-medium'>
                        <Info className='text-primary size-4 shrink-0' />
                        {t('linksSymmetricInfoTitle').replace(
                          '{n}',
                          String(symmetricNotes.length),
                        )}
                      </span>
                      <span className='text-muted-foreground'>
                        {t('linksSymmetricInfoNote')}
                      </span>
                      <ConflictList conflicts={symmetricNotes} ctx={ctx} />
                    </Banner>
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
                          ctx={ctx}
                          manageGroup={onManageIncoming === undefined
                            ? undefined
                            : (relationTypeId) => {
                              // Only relations that accept this page's
                              // type as a target have a manager here
                              // (schema-driven — ADR-097).
                              const validTo = (relationTypes[relationTypeId]?.valid_to_types
                                ?? []) as readonly string[];
                              if (!validTo.includes(type)) return null;
                              return () => onManageIncoming(relationTypeId);
                            }}
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
                      : <LinkRows rows={outgoingRows} direction='active' ctx={ctx} />}
                  </div>
                </section>
              </div>
            )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
