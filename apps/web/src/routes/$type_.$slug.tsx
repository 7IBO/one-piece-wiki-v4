/**
 * `/<type>/<slug>` — the canonical wiki page for one entity (the
 * entity TYPE ID is the first URL segment: `/character/monkey-d-luffy`).
 * Compact hero band (portrait tile + title + key-stat tiles), sticky
 * stat-list sidebar, per-type sections (crew member cards, chapter
 * prev/next + arc + availability, fruit users…), value history,
 * relations in BOTH directions (materialized inverse rows,
 * per-direction labels from the artifact — ADR-086), narrative
 * markdown, and the contribute strip. All spoiler/scope logic ran
 * server-side; this file only renders the view-model. An optional
 * `?scope=` search param carries the canon scope context and is
 * propagated through every entity link.
 *
 * File name: the `$type_` prefix un-nests this route from the
 * `/$type` listing leaf (TanStack trailing-underscore convention) —
 * the resolved path is still `/$type/$slug`.
 */
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { Fragment, type JSX, type ReactNode } from 'react';
import {
  type AvailabilityItemView,
  type CastGroupView,
  type CrewSectionView,
  type EntityView,
  fetchEntity,
  type GatedEntityView,
  type InfoboxRelationRowView,
  type InfoboxRowView,
  type LabelledValue,
  type MemberRowView,
  type PropertyEntryView,
  type PropertyView,
  type RelationGroupView,
  type SourceItemView,
  type SourceTemplateView,
} from '../api';
import { ContributeStrip } from '../components/ContributeStrip';
import { CardGrid, EntityCard } from '../components/EntityCard';
import { EntityChipLink, ScopeContext, useScopeSearch } from '../components/EntityChip';
import { EntityImage } from '../components/EntityImage';
import { type ChromeKey, t } from '../lib/chrome';
import { Markdown } from '../lib/markdown';
import { validateScopeSearch } from '../lib/scope';
import { useLocale } from './__root';

export const Route = createFileRoute('/$type_/$slug')({
  validateSearch: validateScopeSearch,
  loaderDeps: ({ search }) => ({ scope: search.scope ?? null }),
  loader: async ({ context, params, deps }) => {
    const view = await fetchEntity({
      data: {
        locale: context.locale,
        type: params.type,
        slug: params.slug,
        ...(deps.scope === null ? {} : { scope: deps.scope }),
      },
    });
    if (view === null) throw notFound();
    return view;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? 'Entry'} — One Piece Wiki` }],
  }),
  component: EntityPage,
});

function EntityPage(): JSX.Element {
  const view = Route.useLoaderData();
  if (view.kind === 'gated') return <GatedScreen view={view} />;
  return (
    <ScopeContext.Provider value={view.propagateScope}>
      <EntityArticle view={view} />
    </ScopeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Gated ("not yet in your progression")

function GatedScreen({ view }: { readonly view: GatedEntityView; }): JSX.Element {
  const locale = useLocale();
  return (
    <div className='py-20 text-center'>
      <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-faint'>
        {view.typeLabel}
      </p>
      <h1 className='mt-2 font-display text-[clamp(2rem,4.5vw,3rem)] font-bold leading-[1.05] tracking-[-0.02em] text-fg'>
        {view.name}
      </h1>
      <div className='mx-auto mt-8 max-w-md rounded-lg bg-surface px-6 py-5 ring-1 ring-inset ring-line'>
        <p className='font-semibold text-fg'>{t(locale, 'gatedTitle')}</p>
        <p className='mt-2 text-sm text-muted'>{t(locale, 'gatedBody')}</p>
      </div>
      <Link
        to='/'
        className='mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-canvas transition-colors duration-150 hover:bg-accent-hover'
      >
        {t(locale, 'backHome')}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full article

function EntityArticle({ view }: { readonly view: EntityView; }): JSX.Element {
  const locale = useLocale();
  const outgoing = view.relations.filter((group) => !group.inverse);
  const incoming = view.relations.filter((group) => group.inverse);
  const history = view.properties.filter((property) => property.entries.length > 1);
  const source = view.template.kind === 'source' ? view.template : null;
  // The bounty (or a crew's derived total) is the ONE gold plaque of
  // the hero — a typographic stamp (ADR-091 binding, degrades to a
  // plain stat row when absent). Every other infobox unit renders as
  // labeled stat tiles: the first few in the hero row, the remainder
  // (plus relation rows) in the mosaic's identity tile. A tiny
  // remainder folds into the hero row (density rule: no lone tiles).
  const bountyRow =
    view.infobox.find((row) => row.id === 'bounty' || row.id === 'derived:total_bounty') ?? null;
  const statRows = view.infobox.filter((row) => row !== bountyRow);
  const keyStats = statRows.slice(0, 4);
  const restStats = statRows.slice(4);
  const identityUnits = restStats.length + view.infoboxRelations.length;
  const foldIdentity = identityUnits > 0 && identityUnits <= 2;
  const hasIdentityTile = identityUnits > 0 && !foldIdentity;
  // Relations pack into ONE tile (both directions side by side) sized
  // by their actual volume — a lone group never claims a wide band.
  const relationGroups = outgoing.length + incoming.length;
  const relationsSpan = relationGroups >= 4
    ? 'min-[980px]:col-span-12'
    : relationGroups >= 2
    ? 'min-[980px]:col-span-6'
    : 'min-[980px]:col-span-4';
  return (
    <article>
      {/* Hero band: portrait tile + identity + bounty plaque + stat row */}
      <header className='mb-6 sm:mb-8'>
        <div className='flex flex-wrap items-start gap-4 sm:gap-6'>
          <EntityImage
            image={view.image}
            name={view.name}
            ratio='portrait'
            className='w-24 rounded-lg sm:w-32'
            monogramClassName='text-4xl'
          />
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <Link
                to='/$type'
                params={{ type: view.type }}
                className='text-[11px] font-semibold uppercase tracking-[0.14em] text-faint transition-colors duration-150 hover:text-accent'
              >
                {view.typeLabel}
                {source !== null && source.number !== null ? ` · ${source.number}` : ''}
              </Link>
              {source !== null ? <PrevNext template={source} /> : null}
            </div>
            <h1 className='mt-1 font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.08] tracking-[-0.02em] text-fg'>
              {view.name}
            </h1>
            {view.firstAppearance !== null
              ? (
                <p className='mt-1.5 text-sm text-muted'>
                  {t(locale, 'firstAppearance')} · <EntityChipLink chip={view.firstAppearance} />
                </p>
              )
              : null}
            {view.image !== null && view.image.attribution !== null
              ? (
                <p className='mt-1.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-faint'>
                  {view.image.attribution}
                </p>
              )
              : null}
          </div>
          {bountyRow !== null ? <BountyPlaque row={bountyRow} /> : null}
        </div>
        {keyStats.length > 0 || foldIdentity
          ? (
            <dl className='mt-5 flex flex-wrap gap-3'>
              {keyStats.map((row) => <StatTile key={row.id} row={row} />)}
              {foldIdentity
                ? (
                  <>
                    {restStats.map((row) => <StatTile key={row.id} row={row} />)}
                    {view.infoboxRelations.map((row) => (
                      <StatRelationTile
                        key={row.key}
                        row={row}
                      />
                    ))}
                  </>
                )
                : null}
            </dl>
          )
          : null}
      </header>

      {
        /* Dossier mosaic: sections as variable-size tiles on a 12-col
          grid (single column on mobile), packed dense. */
      }
      <div className='grid grid-cols-1 gap-4 min-[980px]:grid-flow-dense min-[980px]:grid-cols-12 min-[980px]:items-start'>
        {source !== null ? <SourceSections template={source} /> : null}
        {view.template.kind === 'character'
          ? <CrewSections crews={view.template.crews} />
          : null}
        {view.template.kind === 'crew'
          ? (
            <>
              <MemberCards
                titleKey='connections'
                members={view.template.members}
                hideTitle
                span={spanForCards(view.template.members.length)}
              />
              <MemberCards
                titleKey='formerMembers'
                members={view.template.former}
                span={spanForCards(view.template.former.length)}
              />
            </>
          )
          : null}
        {view.template.kind === 'devil-fruit'
          ? (
            <>
              <MemberCards
                titleKey='currentUsers'
                members={view.template.users}
                span={spanForCards(view.template.users.length)}
              />
              <MemberCards
                titleKey='formerUsers'
                members={view.template.former}
                span={spanForCards(view.template.former.length)}
              />
            </>
          )
          : null}
        {view.template.kind === 'arc'
          ? (
            <>
              <SourceCards
                titleKey='chapters'
                items={view.template.chapters}
                span={spanForSources(view.template.chapters.length)}
              />
              <SourceCards
                titleKey='episodes'
                items={view.template.episodes}
                span={spanForSources(view.template.episodes.length)}
              />
              <SourceCards
                titleKey='arcs'
                items={view.template.arcs}
                span={spanForSources(view.template.arcs.length)}
              />
            </>
          )
          : null}

        {view.narrative !== null
          ? (
            <Tile span='min-[980px]:col-span-8'>
              <SectionTitle>{t(locale, 'about')}</SectionTitle>
              <Markdown markdown={view.narrative} />
            </Tile>
          )
          : null}

        {history.length > 0
          ? (
            <Tile span='min-[980px]:col-span-4'>
              <SectionTitle count={history.length}>{t(locale, 'history')}</SectionTitle>
              <dl className='divide-y divide-line'>
                {history.map((property) => (
                  <PropertyBlock
                    key={property.id}
                    property={property}
                  />
                ))}
              </dl>
            </Tile>
          )
          : null}

        {hasIdentityTile
          ? (
            <Tile span='min-[980px]:col-span-4'>
              <SectionTitle>{t(locale, 'properties')}</SectionTitle>
              <dl className='divide-y divide-line'>
                {restStats.map((row) => <IdentityRow key={row.id} row={row} />)}
                {view.infoboxRelations.map((row) => (
                  <IdentityRelationRow
                    key={row.key}
                    row={row}
                  />
                ))}
              </dl>
            </Tile>
          )
          : null}

        {relationGroups > 0
          ? (
            <Tile span={relationsSpan}>
              <div className='flex flex-col gap-5 sm:flex-row sm:gap-8'>
                {outgoing.length > 0
                  ? (
                    <div className='min-w-0 flex-1'>
                      <SectionTitle count={outgoing.length}>
                        {t(locale, 'connections')}
                      </SectionTitle>
                      <div className='space-y-4'>
                        {outgoing.map((group) => <RelationGroup key={group.key} group={group} />)}
                      </div>
                    </div>
                  )
                  : null}
                {incoming.length > 0
                  ? (
                    <div className='min-w-0 flex-[2]'>
                      <SectionTitle count={incoming.length}>
                        {t(locale, 'referencedBy')}
                      </SectionTitle>
                      <div className='grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 min-[1200px]:grid-cols-3'>
                        {incoming.map((group) => <RelationGroup key={group.key} group={group} />)}
                      </div>
                    </div>
                  )
                  : null}
              </div>
            </Tile>
          )
          : null}
      </div>

      <ContributeStrip type={view.type} slug={view.slug} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Mosaic building blocks

/** Tile spans derived from actual content volume — no fixed bands. */
function spanForCards(count: number): string {
  if (count >= 5) return 'min-[980px]:col-span-12';
  if (count >= 4) return 'min-[980px]:col-span-8';
  if (count >= 2) return 'min-[980px]:col-span-6';
  return 'min-[980px]:col-span-4';
}

/** Number-led source cards are narrower — higher thresholds. */
function spanForSources(count: number): string {
  if (count >= 12) return 'min-[980px]:col-span-8';
  if (count >= 6) return 'min-[980px]:col-span-6';
  return 'min-[980px]:col-span-4';
}

/** One tile of the dossier mosaic (single radius scale: lg / md). */
function Tile(
  { span, children }: { readonly span: string; readonly children: ReactNode; },
): JSX.Element {
  return (
    <section className={`rounded-lg bg-surface/50 p-4 ring-1 ring-inset ring-line ${span}`}>
      {children}
    </section>
  );
}

/**
 * The gold plaque — oversized tabular numerals, hairline gold frame,
 * tiny uppercase caption. Typographic stamp, no skeuomorphism.
 */
function BountyPlaque({ row }: { readonly row: InfoboxRowView; }): JSX.Element {
  return (
    <div className='shrink-0 self-start rounded-lg border border-gold/40 px-3.5 py-2'>
      <p className='text-[9px] font-semibold uppercase tracking-[0.2em] text-gold/80'>
        {row.label}
      </p>
      <p className='mt-0.5 font-display text-xl font-bold leading-none tabular-nums text-gold sm:text-2xl'>
        {row.entry.display}
      </p>
    </div>
  );
}

const STAT_TILE_CLASS =
  'min-w-[calc(50%-0.375rem)] flex-1 rounded-lg bg-surface px-3.5 py-2.5 ring-1 ring-inset ring-line sm:min-w-36 sm:flex-none';

/** One labeled value as a hero-row tile. */
function StatTile({ row }: { readonly row: InfoboxRowView; }): JSX.Element {
  return (
    <div className={STAT_TILE_CLASS}>
      <dt className='text-[10px] font-semibold uppercase tracking-[0.1em] text-faint'>
        {row.label}
      </dt>
      <dd className='m-0 mt-0.5 text-sm font-semibold text-fg'>
        <PropertyEntry entry={row.entry} compact />
      </dd>
    </div>
  );
}

/** One labeled relation (chips) as a hero-row tile. */
function StatRelationTile({ row }: { readonly row: InfoboxRelationRowView; }): JSX.Element {
  return (
    <div className={STAT_TILE_CLASS}>
      <dt className='text-[10px] font-semibold uppercase tracking-[0.1em] text-faint'>
        {row.label}
      </dt>
      <dd className='m-0 mt-0.5 space-y-0.5 text-sm font-semibold'>
        {row.chips.map((chip) => (
          <div key={chip.id}>
            <EntityChipLink chip={chip} />
          </div>
        ))}
      </dd>
    </div>
  );
}

/** Identity tile rows — remaining labeled units beyond the hero row. */
function IdentityRow({ row }: { readonly row: InfoboxRowView; }): JSX.Element {
  return (
    <div className='py-2 first:pt-0 last:pb-0'>
      <dt className='text-[10px] font-semibold uppercase tracking-[0.1em] text-faint'>
        {row.label}
      </dt>
      <dd className='m-0 mt-0.5 text-sm font-medium text-fg'>
        <PropertyEntry entry={row.entry} compact />
      </dd>
    </div>
  );
}

function IdentityRelationRow({ row }: { readonly row: InfoboxRelationRowView; }): JSX.Element {
  return (
    <div className='py-2 first:pt-0 last:pb-0'>
      <dt className='text-[10px] font-semibold uppercase tracking-[0.1em] text-faint'>
        {row.label}
      </dt>
      <dd className='m-0 mt-0.5 space-y-0.5 text-sm font-medium'>
        {row.chips.map((chip) => (
          <div key={chip.id}>
            <EntityChipLink chip={chip} />
          </div>
        ))}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Character: affiliations with the other members of each crew

function CrewSections(
  { crews }: { readonly crews: readonly CrewSectionView[]; },
): JSX.Element | null {
  const locale = useLocale();
  if (crews.length === 0) return null;
  const totalMembers = crews.reduce((sum, crew) => sum + crew.members.length, 0);
  return (
    <Tile span={spanForCards(Math.max(totalMembers, 2))}>
      <SectionTitle count={crews.length}>{t(locale, 'affiliations')}</SectionTitle>
      <div className='space-y-5'>
        {crews.map((crew) => (
          <div key={crew.crew.id}>
            <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1'>
              <span className='text-xs text-faint'>{crew.label}</span>
              <span className='font-display text-lg font-semibold tracking-[-0.01em]'>
                <EntityChipLink chip={crew.crew} />
              </span>
              {[crew.role, crew.rank].filter((part) => part !== null).map((part) => (
                <span
                  key={part}
                  className='rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted'
                >
                  {part}
                </span>
              ))}
            </div>
            {crew.members.length > 0
              ? (
                <>
                  <p className='mb-2 mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint'>
                    {t(locale, 'otherMembers')}
                  </p>
                  <CardGrid>
                    {crew.members.map((member) => (
                      <EntityCard
                        key={member.chip.id}
                        type={member.chip.type}
                        slug={member.chip.slug}
                        image={member.image}
                        name={member.chip.name}
                        secondary={member.secondary}
                        meta={member.note}
                      />
                    ))}
                  </CardGrid>
                </>
              )
              : null}
          </div>
        ))}
      </div>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Crew / devil-fruit: member cards with portraits, roles, ranks

function MemberCards({ titleKey, members, hideTitle = false, span }: {
  readonly titleKey: ChromeKey;
  readonly members: readonly MemberRowView[];
  readonly hideTitle?: boolean;
  readonly span: string;
}): JSX.Element | null {
  const locale = useLocale();
  if (members.length === 0) return null;
  return (
    <Tile span={span}>
      {hideTitle ? null : <SectionTitle count={members.length}>{t(locale, titleKey)}</SectionTitle>}
      <CardGrid>
        {members.map((member) => <MemberCardItem key={member.chip.id} member={member} />)}
      </CardGrid>
    </Tile>
  );
}

function MemberCardItem({ member }: { readonly member: MemberRowView; }): JSX.Element {
  const locale = useLocale();
  const meta = [
    [member.role, member.rank].filter((part) => part !== null).join(' · '),
    member.since !== null ? `${t(locale, 'since')} ${member.since.name}` : '',
    member.until !== null ? `${t(locale, 'until')} ${member.until.name}` : '',
  ].filter((part) => part !== '').join(' · ');
  return (
    <EntityCard
      type={member.chip.type}
      slug={member.chip.slug}
      image={member.image}
      name={member.chip.name}
      secondary={member.secondary}
      meta={meta === '' ? null : meta}
      stat={member.stat}
    />
  );
}

// ---------------------------------------------------------------------------
// Sources (chapter / episode): prev-next, arc strip, cast, availability

function PrevNext({ template }: { readonly template: SourceTemplateView; }): JSX.Element | null {
  const locale = useLocale();
  const search = useScopeSearch();
  if (template.prev === null && template.next === null) return null;
  const linkClass =
    'rounded-md bg-surface px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-surface-2 hover:text-fg';
  return (
    <nav className='flex items-center gap-2'>
      {template.prev !== null
        ? (
          <Link
            to='/$type/$slug'
            params={{ type: template.prev.type, slug: template.prev.slug }}
            search={search}
            className={linkClass}
          >
            ← {t(locale, 'previous')}
          </Link>
        )
        : null}
      {template.next !== null
        ? (
          <Link
            to='/$type/$slug'
            params={{ type: template.next.type, slug: template.next.slug }}
            search={search}
            className={linkClass}
          >
            {t(locale, 'next')} →
          </Link>
        )
        : null}
    </nav>
  );
}

function SourceSections({ template }: { readonly template: SourceTemplateView; }): JSX.Element {
  const locale = useLocale();
  return (
    <>
      {template.arc !== null
        ? (
          <Tile span='min-[980px]:col-span-12'>
            <div className='flex flex-wrap items-baseline gap-x-2.5'>
              <span className='text-xs text-faint'>{template.arc.label}</span>
              <span className='font-display text-lg font-semibold tracking-[-0.01em]'>
                <EntityChipLink chip={template.arc.chip} />
              </span>
            </div>
            {template.arc.items.length > 0
              ? (
                <ul className='mt-3 flex flex-wrap gap-1.5'>
                  {template.arc.items.map((item) => (
                    <SourceNumberTile key={item.chip.id} item={item} />
                  ))}
                </ul>
              )
              : null}
          </Tile>
        )
        : null}
      {template.cast.length > 0
        ? (
          <Tile span='min-[980px]:col-span-8'>
            <SectionTitle>{t(locale, 'cast')}</SectionTitle>
            <div className='space-y-5'>
              {template.cast.map((group) => <CastGroup key={group.type} group={group} />)}
            </div>
          </Tile>
        )
        : null}
      {template.availability.length > 0
        ? (
          <Tile span='min-[980px]:col-span-4'>
            <SectionTitle>{t(locale, 'availability')}</SectionTitle>
            <ul className='flex flex-wrap gap-3'>
              {template.availability.map((item) => (
                <AvailabilityCard key={item.platform.id} item={item} />
              ))}
            </ul>
          </Tile>
        )
        : null}
    </>
  );
}

function SourceNumberTile({ item }: { readonly item: SourceItemView; }): JSX.Element {
  const search = useScopeSearch();
  const label = item.number === null ? item.chip.name : String(item.number);
  if (item.current) {
    return (
      <li
        aria-current='page'
        className='grid min-w-9 place-items-center rounded-md bg-accent px-2 py-1.5 text-xs font-semibold tabular-nums text-canvas'
      >
        {label}
      </li>
    );
  }
  return (
    <li>
      <Link
        to='/$type/$slug'
        params={{ type: item.chip.type, slug: item.chip.slug }}
        search={search}
        title={item.chip.name}
        className='grid min-w-9 place-items-center rounded-md bg-surface-2 px-2 py-1.5 text-xs font-medium tabular-nums text-muted ring-1 ring-inset ring-line transition-colors duration-150 hover:text-fg hover:ring-line-strong'
      >
        {label}
      </Link>
    </li>
  );
}

function CastGroup({ group }: { readonly group: CastGroupView; }): JSX.Element {
  return (
    <div>
      <h3 className='mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint'>
        {group.typeLabel}
      </h3>
      <CardGrid>
        {group.items.map((item) => (
          <EntityCard
            key={item.chip.id}
            type={item.chip.type}
            slug={item.chip.slug}
            image={item.image}
            name={item.chip.name}
            secondary={item.secondary}
            meta={item.note}
          />
        ))}
      </CardGrid>
    </div>
  );
}

function AvailabilityCard({ item }: { readonly item: AvailabilityItemView; }): JSX.Element {
  if (item.url === null) {
    return (
      <li className='rounded-lg bg-surface px-4 py-2.5 text-sm font-medium text-muted ring-1 ring-inset ring-line'>
        {item.platform.name}
      </li>
    );
  }
  return (
    <li>
      <a
        href={item.url}
        target='_blank'
        rel='noreferrer'
        className='block rounded-lg bg-surface px-4 py-2.5 text-sm font-medium text-accent ring-1 ring-inset ring-line transition-[background-color,box-shadow] duration-150 hover:bg-surface-2 hover:ring-line-strong'
      >
        {item.platform.name} ↗
      </a>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Arc: ordered chapter / episode cards — the number IS the visual.

function SourceCards({ titleKey, items, span }: {
  readonly titleKey: ChromeKey;
  readonly items: readonly SourceItemView[];
  readonly span: string;
}): JSX.Element | null {
  const locale = useLocale();
  const search = useScopeSearch();
  if (items.length === 0) return null;
  return (
    <Tile span={span}>
      <SectionTitle count={items.length}>{t(locale, titleKey)}</SectionTitle>
      <ul className='grid grid-cols-3 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(96px,118px))]'>
        {items.map((item) => (
          <li key={item.chip.id}>
            <Link
              to='/$type/$slug'
              params={{ type: item.chip.type, slug: item.chip.slug }}
              search={search}
              title={item.chip.name}
              className='group block h-full rounded-lg bg-surface p-1.5 ring-1 ring-inset ring-line transition-[background-color,box-shadow] duration-150 hover:bg-surface-2 hover:ring-line-strong'
            >
              <span className='grid h-10 place-items-center rounded-md bg-surface-2 font-display text-lg font-semibold tabular-nums text-gold/70 ring-1 ring-inset ring-line'>
                {item.number ?? '·'}
              </span>
              <span className='mb-0.5 mt-1.5 block truncate px-1 text-xs font-medium text-fg transition-colors duration-150 group-hover:text-accent'>
                {item.chip.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Shared building blocks (facts history + relation groups)

function SectionTitle(
  { children, count }: { readonly children: string; readonly count?: number; },
): JSX.Element {
  return (
    <h2 className='mb-3 flex items-baseline gap-2 font-display text-lg font-semibold tracking-[-0.01em] text-fg'>
      {children}
      {count !== undefined
        ? <span className='text-sm font-normal tabular-nums text-faint'>{count}</span>
        : null}
    </h2>
  );
}

function QualifierList(
  { qualifiers }: { readonly qualifiers: readonly LabelledValue[]; },
): JSX.Element | null {
  if (qualifiers.length === 0) return null;
  return (
    <span className='text-xs text-faint'>
      {qualifiers.map((qualifier, i) => (
        <Fragment key={qualifier.label}>
          {i > 0 ? ' · ' : ''}
          {qualifier.label.toLowerCase()}
          {' : '}
          {qualifier.chip !== undefined
            ? <EntityChipLink chip={qualifier.chip} />
            : <span className='text-muted'>{qualifier.value}</span>}
        </Fragment>
      ))}
    </span>
  );
}

function EpistemicBadge(
  { epistemic }: { readonly epistemic: { readonly label: string; } | null; },
): JSX.Element | null {
  if (epistemic === null) return null;
  return (
    <span className='rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted'>
      {epistemic.label}
    </span>
  );
}

/**
 * One historised property inside the history card: slim label column,
 * then compact [value · provenance] rows split by hairlines.
 */
function PropertyBlock({ property }: { readonly property: PropertyView; }): JSX.Element {
  return (
    <div className='grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4'>
      <dt className='pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint'>
        {property.label}
      </dt>
      <dd className='m-0'>
        <ol className='m-0 list-none divide-y divide-line p-0'>
          {property.entries.map((entry, i) => (
            <li key={i} className='py-1.5 first:pt-0 last:pb-0'>
              <PropertyEntry entry={entry} />
            </li>
          ))}
        </ol>
      </dd>
    </div>
  );
}

function PropertyEntry(
  { entry, compact = false }: { readonly entry: PropertyEntryView; readonly compact?: boolean; },
): JSX.Element {
  const locale = useLocale();
  const details: ReactNode[] = [];
  if (!compact && entry.since !== null) {
    details.push(
      <span key='since'>
        {t(locale, 'since')} <EntityChipLink chip={entry.since} />
      </span>,
    );
  }
  if (entry.until !== null) {
    details.push(
      <span key='until'>
        {t(locale, 'until')} <EntityChipLink chip={entry.until} />
      </span>,
    );
  }
  if (!compact && entry.event !== null) {
    details.push(
      <span key='event'>
        {t(locale, 'during')} <EntityChipLink chip={entry.event} />
      </span>,
    );
  }
  if (entry.actualDisplay !== null) {
    details.push(
      <span key='actual' className='text-muted'>
        {t(locale, 'actually')} : {entry.actualDisplay}
      </span>,
    );
  }
  return (
    <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1'>
      {entry.valueChip !== null
        ? <EntityChipLink chip={entry.valueChip} />
        : <span className='font-medium tabular-nums text-fg'>{entry.display}</span>}
      <EpistemicBadge epistemic={entry.epistemic} />
      {entry.autoImported
        ? (
          <span
            title={t(locale, 'autoImported')}
            className='rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted'
          >
            {t(locale, 'autoImported')}
          </span>
        )
        : null}
      {details.length > 0 || (!compact && entry.qualifiers.length > 0)
        ? (
          <span className='inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-xs text-faint'>
            {details}
            {compact ? null : <QualifierList qualifiers={entry.qualifiers} />}
          </span>
        )
        : null}
    </div>
  );
}

function RelationGroup({ group }: { readonly group: RelationGroupView; }): JSX.Element {
  const locale = useLocale();
  return (
    <div className='min-w-0'>
      <h3 className='mb-1.5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint'>
        <span aria-hidden className='font-mono normal-case tracking-normal'>
          {group.inverse ? '←' : '→'}
        </span>
        {group.label}
      </h3>
      <ul className='divide-y divide-line'>
        {group.items.map((item, i) => (
          <li
            key={i}
            className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1 py-1.5 first:pt-0 last:pb-0'
          >
            <EntityChipLink chip={item.target} showType />
            <EpistemicBadge epistemic={item.epistemic} />
            {item.since !== null
              ? (
                <span className='text-xs text-faint'>
                  {t(locale, 'since')} <EntityChipLink chip={item.since} />
                </span>
              )
              : null}
            {item.until !== null
              ? (
                <span className='text-xs text-faint'>
                  {t(locale, 'until')} <EntityChipLink chip={item.until} />
                </span>
              )
              : null}
            <QualifierList qualifiers={item.qualifiers} />
          </li>
        ))}
      </ul>
    </div>
  );
}
