/**
 * `/<type>/<slug>` — the canonical wiki page for one entity (the
 * entity TYPE ID is the first URL segment: `/character/monkey-d-luffy`),
 * built as a HUB OF CONNECTIONS (v7 "Vignette", WEB_APP.md
 * § Identity): identity header (portrait, display-face name, key
 * facts strip, gold bounty stat), then every link to another entity
 * as an image-led module — poster grids for people (members, cast,
 * users — former ones VISIBLE with a clear ended state), connection
 * rows for everything else — grouped by relation type, ordered by
 * importance, and folded behind "Show N more" beyond a per-group
 * budget so pages scale to many relations. Narrative and value
 * history close the page. All spoiler/scope logic ran server-side
 * (including the former-member rule: a departure beyond the cursor
 * renders as current); this file only renders the view-model. An
 * optional `?scope=` search param carries the canon scope context
 * and is propagated through every entity link.
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
  type RelationItemView,
  type SourceItemView,
  type SourceTemplateView,
} from '../api';
import { ContributeStrip } from '../components/ContributeStrip';
import { CARD_GRID_CLASS, EntityCard } from '../components/EntityCard';
import { EntityChipLink, ScopeContext, useScopeSearch } from '../components/EntityChip';
import { EntityImage } from '../components/EntityImage';
import { ShowMoreList } from '../components/ShowMoreList';
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

// ---------------------------------------------------------------------------
// Importance ordering of connection groups (ADR-091 presentation
// binding: well-known relation ids rank first; unknown ids fall to
// the end sorted by volume — the page still renders every group).

const RELATION_PRIORITY: readonly string[] = [
  'member-of',
  'ate-fruit',
  'uses-technique',
  'wields-weapon',
  'family-of',
  'mentor-of',
  'ally-of',
  'rival-of',
  'enemy-of',
  'crewed-by',
  'controls-territory',
  'resides-in',
  'participant',
  'features',
  'part-of-arc',
  'occurs-during-arc',
  'part-of-saga',
  'adapted-by',
  'available-on',
  'issued-by',
  'described-by',
];

function relationRank(key: string): number {
  const index = RELATION_PRIORITY.indexOf(key.replace(/\.inverse$/, ''));
  return index === -1 ? RELATION_PRIORITY.length : index;
}

/** Collapsed budget of a connection-row group. */
const ROW_LIMIT = 8;
/** Collapsed budget of a poster grid (members, cast…). */
const CARD_LIMIT = 12;
/** Collapsed budget of a compact number grid (chapters, episodes…). */
const NUMBER_LIMIT = 28;

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
    <div className='mx-auto max-w-md py-20 text-center'>
      <p className='label-xs'>{view.typeLabel}</p>
      <h1 className='display mt-2 text-[clamp(1.9rem,4.5vw,2.8rem)] font-extrabold leading-[1.05] text-fg'>
        {view.name}
      </h1>
      <div className='mx-auto mt-8 rounded-lg px-6 py-5 ring-1 ring-line'>
        <p className='font-semibold text-gold'>{t(locale, 'gatedTitle')}</p>
        <p className='mt-2 text-sm text-muted'>{t(locale, 'gatedBody')}</p>
      </div>
      <Link
        to='/'
        className='mt-8 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas transition-colors duration-150 hover:bg-accent-hover'
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
  const history = view.properties.filter((property) => property.entries.length > 1);
  const source = view.template.kind === 'source' ? view.template : null;
  // The bounty (or a crew's derived total) is the ONE gold figure of
  // the header (ADR-091 binding, degrades to a plain fact when
  // absent). Every other infobox unit renders in the facts strip.
  const bountyRow =
    view.infobox.find((row) => row.id === 'bounty' || row.id === 'derived:total_bounty') ?? null;
  const statRows = view.infobox.filter((row) => row !== bountyRow);
  const groups = [...view.relations].sort((a, b) =>
    relationRank(a.key) - relationRank(b.key)
    || Number(a.inverse) - Number(b.inverse)
    || b.items.length - a.items.length
    || a.label.localeCompare(b.label)
  );
  return (
    <article>
      {/* Identity header */}
      <header className='flex flex-col gap-5 min-[560px]:flex-row min-[560px]:gap-7'>
        {view.image !== null
          ? (
            <div className='w-36 shrink-0 sm:w-44'>
              <EntityImage
                image={view.image}
                name={view.name}
                ratio='portrait'
                className='w-full rounded-lg ring-1 ring-line'
                monogramClassName='text-5xl'
              />
              {view.image.attribution !== null
                ? (
                  <p className='mt-1.5 truncate font-mono text-[0.58rem] uppercase tracking-[0.1em] text-faint'>
                    {view.image.attribution}
                  </p>
                )
                : null}
            </div>
          )
          : null}
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
            <Link
              to='/$type'
              params={{ type: view.type }}
              className='label-xs transition-colors duration-150 hover:text-accent'
            >
              {view.typeLabel}
              {source !== null && source.number !== null ? ` · ${source.number}` : ''}
            </Link>
            {source !== null ? <PrevNext template={source} /> : null}
          </div>
          <div className='mt-1 flex flex-wrap items-start justify-between gap-x-6 gap-y-3'>
            <h1 className='display min-w-0 text-[clamp(1.9rem,4.6vw,3rem)] font-extrabold leading-[1.04] text-fg'>
              {view.name}
            </h1>
            {bountyRow !== null
              ? (
                <div className='shrink-0 min-[560px]:text-right'>
                  <p className='label-xs text-gold/75'>{bountyRow.label}</p>
                  <p className='display mt-0.5 text-[1.7rem] font-extrabold leading-none tabular-nums text-gold'>
                    {bountyRow.entry.display}
                  </p>
                </div>
              )
              : null}
          </div>
          {view.firstAppearance !== null
            ? (
              <p className='mt-2 text-[13px] text-muted'>
                {t(locale, 'firstAppearance')} · <EntityChipLink chip={view.firstAppearance} />
              </p>
            )
            : null}
          {statRows.length > 0 || view.infoboxRelations.length > 0
            ? (
              <dl className='mt-5 flex flex-wrap gap-x-7 gap-y-3.5 border-t border-line pt-4'>
                {statRows.map((row) => <FactItem key={row.id} row={row} />)}
                {view.infoboxRelations.map((row) => <FactRelationItem key={row.key} row={row} />)}
              </dl>
            )
            : null}
        </div>
      </header>

      {/* The hub: connection sections, ordered by importance. */}
      <div className='mt-10 space-y-10'>
        {source !== null ? <SourceSections template={source} /> : null}
        {view.template.kind === 'character'
          ? <CrewSections crews={view.template.crews} />
          : null}
        {view.template.kind === 'crew'
          ? (
            <>
              <MemberGrid titleKey='members' members={view.template.members} />
              <MemberGrid titleKey='formerMembers' members={view.template.former} former />
            </>
          )
          : null}
        {view.template.kind === 'devil-fruit'
          ? (
            <>
              <MemberGrid titleKey='currentUsers' members={view.template.users} />
              <MemberGrid titleKey='formerUsers' members={view.template.former} former />
            </>
          )
          : null}
        {view.template.kind === 'arc'
          ? (
            <>
              <NumberGrid titleKey='chapters' items={view.template.chapters} />
              <NumberGrid titleKey='episodes' items={view.template.episodes} />
              <NumberGrid titleKey='arcs' items={view.template.arcs} />
            </>
          )
          : null}

        {groups.map((group) => <ConnectionGroup key={group.key} group={group} />)}

        {view.narrative !== null
          ? (
            <section>
              <SectionHead>{t(locale, 'about')}</SectionHead>
              <Markdown markdown={view.narrative} />
            </section>
          )
          : null}

        {history.length > 0
          ? (
            <section>
              <SectionHead count={history.length}>{t(locale, 'history')}</SectionHead>
              <dl className='divide-y divide-line'>
                {history.map((property) => <PropertyBlock key={property.id} property={property} />)}
              </dl>
            </section>
          )
          : null}
      </div>

      <ContributeStrip type={view.type} slug={view.slug} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Shared building blocks

/** Section head: display title + count. */
function SectionHead(
  { children, count }: { readonly children: string; readonly count?: number; },
): JSX.Element {
  return (
    <h2 className='display mb-3.5 flex items-baseline gap-2 text-[17px] font-bold text-fg'>
      {children}
      {count !== undefined
        ? <span className='font-sans text-sm font-medium tabular-nums text-faint'>{count}</span>
        : null}
    </h2>
  );
}

/** One key fact of the header strip (label over value). */
function FactItem({ row }: { readonly row: InfoboxRowView; }): JSX.Element {
  return (
    <div className='min-w-0'>
      <dt className='label-xs'>{row.label}</dt>
      <dd className='m-0 mt-0.5 text-[13.5px] font-semibold text-fg'>
        <PropertyEntry entry={row.entry} compact />
      </dd>
    </div>
  );
}

function FactRelationItem({ row }: { readonly row: InfoboxRelationRowView; }): JSX.Element {
  return (
    <div className='min-w-0'>
      <dt className='label-xs'>{row.label}</dt>
      <dd className='m-0 mt-0.5 space-y-0.5 text-[13.5px] font-semibold'>
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
// Connection groups — image-led link modules, folded beyond ROW_LIMIT.

function ConnectionGroup({ group }: { readonly group: RelationGroupView; }): JSX.Element {
  return (
    <section>
      <SectionHead count={group.items.length}>{group.label}</SectionHead>
      <ShowMoreList
        limit={ROW_LIMIT}
        listClassName='grid grid-cols-1 gap-x-8 md:grid-cols-2 xl:grid-cols-3'
        items={group.items.map((item, i) => <ConnectionRow key={i} item={item} />)}
      />
    </section>
  );
}

/**
 * One connection module: thumb + name + precise sub-label (identity
 * line or type, qualifiers, period). The whole row is the link.
 */
function ConnectionRow({ item }: { readonly item: RelationItemView; }): JSX.Element {
  const locale = useLocale();
  const search = useScopeSearch();
  const subParts: string[] = [item.secondary ?? item.target.typeLabel];
  if (item.epistemic !== null) subParts.push(item.epistemic.label);
  for (const qualifier of item.qualifiers) subParts.push(qualifier.value);
  if (item.since !== null) subParts.push(`${t(locale, 'since')} ${item.since.name}`);
  if (item.until !== null) subParts.push(`${t(locale, 'until')} ${item.until.name}`);
  const sub = subParts.join(' · ');
  return (
    <li className='border-b border-line'>
      <Link
        to='/$type/$slug'
        params={{ type: item.target.type, slug: item.target.slug }}
        search={search}
        className='group flex items-center gap-3 py-2'
      >
        <EntityImage
          image={item.image}
          name={item.target.name}
          ratio='square'
          className='size-10 rounded-[5px] ring-1 ring-line transition-shadow duration-150 group-hover:ring-accent/70'
          monogramClassName='text-base'
        />
        <span className='min-w-0 flex-1'>
          <span
            title={item.target.name}
            className='block truncate text-[13.5px] font-semibold text-fg transition-colors duration-150 group-hover:text-accent'
          >
            {item.target.name}
          </span>
          <span title={sub} className='block truncate text-[11px] text-faint'>
            {sub}
          </span>
        </span>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Character: affiliations with the other members of each crew

function CrewSections(
  { crews }: { readonly crews: readonly CrewSectionView[]; },
): JSX.Element | null {
  const locale = useLocale();
  if (crews.length === 0) return null;
  return (
    <section>
      <SectionHead count={crews.length}>{t(locale, 'affiliations')}</SectionHead>
      <div className='space-y-6'>
        {crews.map((crew) => (
          <div key={crew.crew.id}>
            <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1'>
              <span className='text-xs text-faint'>{crew.label}</span>
              <span className='display text-[15px] font-bold'>
                <EntityChipLink chip={crew.crew} />
              </span>
              {[crew.role, crew.rank].filter((part) => part !== null).map((part) => (
                <span
                  key={part}
                  className='rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted'
                >
                  {part}
                </span>
              ))}
            </div>
            {crew.members.length > 0
              ? (
                <div className='mt-3'>
                  <p className='label-xs mb-2'>{t(locale, 'otherMembers')}</p>
                  <ShowMoreList
                    limit={CARD_LIMIT}
                    listClassName={CARD_GRID_CLASS}
                    items={crew.members.map((member) => (
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
                  />
                </div>
              )
              : null}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Crew / devil-fruit: poster grids — former members VISIBLE with a
// clear ended state (spoiler-safe: the server only classifies a
// membership as ended once its departure anchor is within the cursor).

function MemberGrid({ titleKey, members, former = false }: {
  readonly titleKey: ChromeKey;
  readonly members: readonly MemberRowView[];
  readonly former?: boolean;
}): JSX.Element | null {
  const locale = useLocale();
  if (members.length === 0) return null;
  return (
    <section>
      <SectionHead count={members.length}>{t(locale, titleKey)}</SectionHead>
      <ShowMoreList
        limit={CARD_LIMIT}
        listClassName={CARD_GRID_CLASS}
        items={members.map((member) => (
          <MemberCard key={member.chip.id} member={member} former={former} />
        ))}
      />
    </section>
  );
}

function MemberCard(
  { member, former }: { readonly member: MemberRowView; readonly former: boolean; },
): JSX.Element {
  const locale = useLocale();
  const metaParts = [
    [member.role, member.rank].filter((part) => part !== null).join(' · '),
    member.since !== null ? `${t(locale, 'since')} ${member.since.name}` : '',
    member.until !== null ? `${t(locale, 'until')} ${member.until.name}` : '',
  ].filter((part) => part !== '');
  const meta = metaParts.join(' · ');
  return (
    <EntityCard
      type={member.chip.type}
      slug={member.chip.slug}
      image={member.image}
      name={member.chip.name}
      secondary={member.secondary}
      meta={meta === '' ? null : meta}
      tag={former ? t(locale, 'formerTag') : null}
      stat={member.stat}
      dimmed={former}
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
    'rounded-md px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-line transition-colors duration-150 hover:bg-surface hover:text-fg hover:ring-line-strong';
  return (
    <nav className='flex items-center gap-1.5'>
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
          <section>
            <div className='mb-3.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1'>
              <span className='text-xs text-faint'>{template.arc.label}</span>
              <span className='display text-[17px] font-bold'>
                <EntityChipLink chip={template.arc.chip} />
              </span>
            </div>
            {template.arc.items.length > 0
              ? (
                <ShowMoreList
                  limit={NUMBER_LIMIT}
                  listClassName='flex flex-wrap gap-1.5'
                  items={template.arc.items.map((item) => (
                    <SourceNumberCell key={item.chip.id} item={item} />
                  ))}
                />
              )
              : null}
          </section>
        )
        : null}
      {template.cast.length > 0
        ? (
          <section>
            <SectionHead>{t(locale, 'cast')}</SectionHead>
            <div className='space-y-5'>
              {template.cast.map((group) => <CastGroup key={group.type} group={group} />)}
            </div>
          </section>
        )
        : null}
      {template.availability.length > 0
        ? (
          <section>
            <SectionHead>{t(locale, 'availability')}</SectionHead>
            <ul className='flex flex-wrap gap-2'>
              {template.availability.map((item) => (
                <AvailabilityItem key={item.platform.id} item={item} />
              ))}
            </ul>
          </section>
        )
        : null}
    </>
  );
}

function SourceNumberCell({ item }: { readonly item: SourceItemView; }): JSX.Element {
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
        className='grid min-w-9 place-items-center rounded-md px-2 py-1.5 text-xs font-medium tabular-nums text-muted ring-1 ring-line transition-colors duration-150 hover:bg-surface hover:text-fg hover:ring-line-strong'
      >
        {label}
      </Link>
    </li>
  );
}

function CastGroup({ group }: { readonly group: CastGroupView; }): JSX.Element {
  return (
    <div>
      <h3 className='label-xs mb-2'>{group.typeLabel}</h3>
      <ShowMoreList
        limit={CARD_LIMIT}
        listClassName={CARD_GRID_CLASS}
        items={group.items.map((item) => (
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
      />
    </div>
  );
}

function AvailabilityItem({ item }: { readonly item: AvailabilityItemView; }): JSX.Element {
  if (item.url === null) {
    return (
      <li className='rounded-md px-3 py-1.5 text-[13px] font-medium text-muted ring-1 ring-line'>
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
        className='block rounded-md px-3 py-1.5 text-[13px] font-medium text-accent ring-1 ring-line transition-colors duration-150 hover:bg-surface hover:text-accent-hover hover:ring-line-strong'
      >
        {item.platform.name} ↗
      </a>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Arc: ordered chapter / episode grids — compact, folded beyond budget.

function NumberGrid({ titleKey, items }: {
  readonly titleKey: ChromeKey;
  readonly items: readonly SourceItemView[];
}): JSX.Element | null {
  const locale = useLocale();
  const search = useScopeSearch();
  if (items.length === 0) return null;
  return (
    <section>
      <SectionHead count={items.length}>{t(locale, titleKey)}</SectionHead>
      <ShowMoreList
        limit={NUMBER_LIMIT}
        listClassName='flex flex-wrap gap-2'
        items={items.map((item) => (
          <li key={item.chip.id}>
            <Link
              to='/$type/$slug'
              params={{ type: item.chip.type, slug: item.chip.slug }}
              search={search}
              title={item.chip.name}
              className='group block w-24 rounded-md p-2 ring-1 ring-line transition-[background-color,box-shadow] duration-150 hover:bg-surface hover:ring-line-strong'
            >
              <span className='display block text-base font-bold leading-tight tabular-nums text-fg transition-colors duration-150 group-hover:text-accent'>
                {item.number ?? '·'}
              </span>
              <span className='block truncate text-[10.5px] text-faint'>
                {item.chip.name}
              </span>
            </Link>
          </li>
        ))}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Facts history + shared value rendering

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
    <span className='rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted'>
      {epistemic.label}
    </span>
  );
}

/**
 * One historised property inside the history section: slim label
 * column, then compact [value · provenance] rows split by hairlines.
 */
function PropertyBlock({ property }: { readonly property: PropertyView; }): JSX.Element {
  return (
    <div className='grid grid-cols-1 gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4'>
      <dt className='label-xs pt-1'>{property.label}</dt>
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
            className='rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-faint'
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
