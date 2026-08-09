/**
 * `/<type>/<slug>` — the canonical wiki page for one entity (the
 * entity TYPE ID is the first URL segment: `/character/monkey-d-luffy`).
 * Right-hand infobox (portrait + latest spoiler-visible values),
 * per-type sections (crew members, chapter prev/next + arc +
 * availability, fruit users…), value history, relations in BOTH
 * directions (materialized inverse rows, per-direction labels from the
 * artifact — ADR-086), narrative markdown, and the contribute strip.
 * All spoiler/scope logic ran server-side; this file only renders the
 * view-model. An optional `?scope=` search param carries the canon
 * scope context and is propagated through every entity link.
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
  type MemberThumbView,
  type PropertyEntryView,
  type PropertyView,
  type RelationGroupView,
  type SourceItemView,
  type SourceTemplateView,
} from '../api';
import { ContributeStrip } from '../components/ContributeStrip';
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
    <div className='py-28 text-center'>
      <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-faint'>
        {view.typeLabel}
      </p>
      <h1 className='mt-3 font-display text-[clamp(2.25rem,5vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-fg'>
        {view.name}
      </h1>
      <p className='mt-8 text-lg font-semibold text-accent'>{t(locale, 'gatedTitle')}</p>
      <p className='mx-auto mt-3 max-w-md text-muted'>{t(locale, 'gatedBody')}</p>
      <Link
        to='/'
        className='mt-10 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-canvas transition-colors duration-150 hover:bg-accent-hover'
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
  return (
    <article>
      <header className='mb-10 sm:mb-14'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Link
            to='/$type'
            params={{ type: view.type }}
            className='inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint transition-colors duration-150 hover:text-accent'
          >
            <span aria-hidden className='size-1.5 rounded-full bg-accent' />
            {view.typeLabel}
            {source !== null && source.number !== null ? ` · ${source.number}` : ''}
          </Link>
          {source !== null ? <PrevNext template={source} /> : null}
        </div>
        <h1 className='mt-4 max-w-3xl font-display text-[clamp(2.5rem,5.5vw,4rem)] font-bold leading-[1.02] tracking-[-0.035em] text-fg'>
          {view.name}
        </h1>
        {view.firstAppearance !== null
          ? (
            <p className='mt-4 text-sm text-muted'>
              {t(locale, 'firstAppearance')} · <EntityChipLink chip={view.firstAppearance} />
            </p>
          )
          : null}
      </header>

      <div className='flex flex-col gap-10 min-[900px]:flex-row min-[900px]:items-start min-[900px]:gap-12'>
        <div className='min-w-0 flex-1'>
          {source !== null ? <SourceSections template={source} /> : null}
          {view.template.kind === 'character' ? <CrewSections crews={view.template.crews} /> : null}
          {view.template.kind === 'crew'
            ? (
              <>
                <MemberGrid titleKey='connections' members={view.template.members} hideTitle />
                <MemberGrid titleKey='formerMembers' members={view.template.former} />
              </>
            )
            : null}
          {view.template.kind === 'devil-fruit'
            ? (
              <>
                <MemberGrid titleKey='currentUsers' members={view.template.users} />
                <MemberGrid titleKey='formerUsers' members={view.template.former} />
              </>
            )
            : null}
          {view.template.kind === 'arc'
            ? (
              <>
                <SourceList titleKey='chapters' items={view.template.chapters} />
                <SourceList titleKey='episodes' items={view.template.episodes} />
                <SourceList titleKey='arcs' items={view.template.arcs} />
              </>
            )
            : null}

          {view.narrative !== null
            ? (
              <section className='mb-12 sm:mb-16'>
                <SectionTitle>{t(locale, 'about')}</SectionTitle>
                <Markdown markdown={view.narrative} />
              </section>
            )
            : null}

          {history.length > 0
            ? (
              <section className='mb-12 sm:mb-16'>
                <SectionTitle count={history.length}>{t(locale, 'history')}</SectionTitle>
                <dl className='space-y-8'>
                  {history.map((property) => (
                    <PropertyBlock
                      key={property.id}
                      property={property}
                    />
                  ))}
                </dl>
              </section>
            )
            : null}

          {outgoing.length > 0
            ? (
              <section className='mb-12 sm:mb-16'>
                <SectionTitle count={outgoing.length}>{t(locale, 'connections')}</SectionTitle>
                <div className='space-y-3'>
                  {outgoing.map((group) => <RelationGroup key={group.key} group={group} />)}
                </div>
              </section>
            )
            : null}

          {incoming.length > 0
            ? (
              <section className='mb-12 sm:mb-16'>
                <SectionTitle count={incoming.length}>{t(locale, 'referencedBy')}</SectionTitle>
                <div className='space-y-3'>
                  {incoming.map((group) => <RelationGroup key={group.key} group={group} />)}
                </div>
              </section>
            )
            : null}
        </div>

        <Infobox view={view} />
      </div>

      <ContributeStrip type={view.type} slug={view.slug} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Infobox (right rail, sticky on wide screens, stacks first on
// mobile). The portrait block only exists when a spoiler-visible
// image entity exists at all — otherwise the infobox starts straight
// at the facts (no empty frame).

function Infobox({ view }: { readonly view: EntityView; }): JSX.Element | null {
  if (view.image === null && view.infobox.length === 0 && view.infoboxRelations.length === 0) {
    return null;
  }
  return (
    <aside className='order-first w-full shrink-0 min-[900px]:sticky min-[900px]:top-20 min-[900px]:order-none min-[900px]:w-[336px]'>
      <div className='overflow-hidden rounded-2xl border border-line bg-surface'>
        {view.image !== null
          ? (
            <figure className='m-0'>
              <EntityImage
                image={view.image}
                name={view.name}
                ratio='portrait'
                className='w-full'
                monogramClassName='text-7xl'
              />
              {view.image.attribution !== null
                ? (
                  <figcaption className='px-5 pt-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-faint'>
                    {view.image.attribution}
                  </figcaption>
                )
                : null}
            </figure>
          )
          : null}
        <dl className='px-5 py-2'>
          {view.infobox.map((row) => <InfoboxLine key={row.id} row={row} />)}
          {view.infoboxRelations.map((row) => <InfoboxRelationLine key={row.key} row={row} />)}
        </dl>
      </div>
    </aside>
  );
}

function InfoboxLine({ row }: { readonly row: InfoboxRowView; }): JSX.Element {
  return (
    <div className='border-t border-line py-3 first:border-t-0'>
      <dt className='text-[11px] font-semibold uppercase tracking-[0.1em] text-faint'>
        {row.label}
      </dt>
      <dd className='m-0 mt-1 text-[15px]'>
        <PropertyEntry entry={row.entry} compact />
      </dd>
    </div>
  );
}

function InfoboxRelationLine({ row }: { readonly row: InfoboxRelationRowView; }): JSX.Element {
  return (
    <div className='border-t border-line py-3'>
      <dt className='text-[11px] font-semibold uppercase tracking-[0.1em] text-faint'>
        {row.label}
      </dt>
      <dd className='m-0 mt-1 space-y-1 text-[15px]'>
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
  return (
    <section className='mb-12 sm:mb-16'>
      <SectionTitle count={crews.length}>{t(locale, 'affiliations')}</SectionTitle>
      <div className='space-y-3'>
        {crews.map((crew) => (
          <div key={crew.crew.id} className='rounded-xl border border-line bg-surface px-5 py-4'>
            <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
              <span className='text-xs text-faint'>{crew.label}</span>
              <span className='font-display text-lg font-semibold tracking-[-0.01em]'>
                <EntityChipLink chip={crew.crew} />
              </span>
              {crew.role !== null
                ? (
                  <span className='rounded-md bg-veil px-2 py-0.5 text-[11px] font-medium text-accent'>
                    {crew.role}
                  </span>
                )
                : null}
              {crew.rank !== null
                ? (
                  <span className='rounded-md bg-link-veil px-2 py-0.5 text-[11px] font-medium text-link'>
                    {crew.rank}
                  </span>
                )
                : null}
            </div>
            {crew.members.length > 0
              ? (
                <>
                  <p className='mt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint'>
                    {t(locale, 'otherMembers')}
                  </p>
                  <ul className='mt-2.5 flex flex-wrap gap-2'>
                    {crew.members.map((member) => (
                      <ThumbCard
                        key={member.chip.id}
                        thumb={member}
                      />
                    ))}
                  </ul>
                </>
              )
              : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ThumbCard({ thumb }: { readonly thumb: MemberThumbView; }): JSX.Element {
  const search = useScopeSearch();
  return (
    <li>
      <Link
        to='/$type/$slug'
        params={{ type: thumb.chip.type, slug: thumb.chip.slug }}
        search={search}
        className='group flex items-center gap-2.5 rounded-lg border border-line bg-canvas/60 py-1.5 pl-1.5 pr-3 transition-[border-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-line-strong'
      >
        <EntityImage
          image={thumb.image}
          name={thumb.chip.name}
          className='size-9 rounded-md'
          monogramClassName='text-base'
        />
        <span className='leading-tight'>
          <span className='block text-sm font-medium text-fg transition-colors duration-150 group-hover:text-accent'>
            {thumb.chip.name}
          </span>
          {thumb.note !== null
            ? <span className='block text-[11px] text-faint'>{thumb.note}</span>
            : null}
        </span>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Crew / devil-fruit: member rows with portraits, roles, ranks

function MemberGrid({ titleKey, members, hideTitle = false }: {
  readonly titleKey: ChromeKey;
  readonly members: readonly MemberRowView[];
  readonly hideTitle?: boolean;
}): JSX.Element | null {
  const locale = useLocale();
  if (members.length === 0) return null;
  return (
    <section className='mb-12 sm:mb-16'>
      {hideTitle ? null : <SectionTitle count={members.length}>{t(locale, titleKey)}</SectionTitle>}
      <ul className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        {members.map((member) => <MemberCard key={member.chip.id} member={member} />)}
      </ul>
    </section>
  );
}

function MemberCard({ member }: { readonly member: MemberRowView; }): JSX.Element {
  const locale = useLocale();
  const search = useScopeSearch();
  return (
    <li>
      <Link
        to='/$type/$slug'
        params={{ type: member.chip.type, slug: member.chip.slug }}
        search={search}
        className='group flex items-center gap-3.5 rounded-xl border border-line bg-surface px-3.5 py-3 transition-[border-color,background-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-line-strong hover:bg-surface-2'
      >
        <EntityImage
          image={member.image}
          name={member.chip.name}
          className='size-12 rounded-lg'
          monogramClassName='text-xl'
        />
        <span className='min-w-0 leading-snug'>
          <span className='block truncate font-medium text-fg transition-colors duration-150 group-hover:text-accent'>
            {member.chip.name}
          </span>
          <span className='block truncate text-xs text-faint'>
            {[member.role, member.rank].filter((part) => part !== null).join(' · ')}
            {member.since !== null
              ? ` · ${t(locale, 'since')} ${member.since.name}`
              : ''}
            {member.until !== null
              ? ` · ${t(locale, 'until')} ${member.until.name}`
              : ''}
          </span>
        </span>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sources (chapter / episode): prev-next, arc banner, cast, availability

function PrevNext({ template }: { readonly template: SourceTemplateView; }): JSX.Element | null {
  const locale = useLocale();
  const search = useScopeSearch();
  if (template.prev === null && template.next === null) return null;
  const linkClass =
    'rounded-lg border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-fg';
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
          <section className='mb-12 rounded-xl border border-line bg-surface px-5 py-4 sm:mb-16'>
            <div className='flex flex-wrap items-baseline gap-x-3'>
              <span className='text-xs text-faint'>{template.arc.label}</span>
              <span className='font-display text-lg font-semibold tracking-[-0.01em]'>
                <EntityChipLink chip={template.arc.chip} />
              </span>
            </div>
            {template.arc.items.length > 0
              ? (
                <ul className='mt-3.5 flex flex-wrap gap-1.5'>
                  {template.arc.items.map((item) => (
                    <SourceNumberPill key={item.chip.id} item={item} />
                  ))}
                </ul>
              )
              : null}
          </section>
        )
        : null}
      {template.cast.length > 0
        ? (
          <section className='mb-12 sm:mb-16'>
            <SectionTitle>{t(locale, 'cast')}</SectionTitle>
            <div className='space-y-3'>
              {template.cast.map((group) => <CastGroup key={group.type} group={group} />)}
            </div>
          </section>
        )
        : null}
      {template.availability.length > 0
        ? (
          <section className='mb-12 sm:mb-16'>
            <SectionTitle>{t(locale, 'availability')}</SectionTitle>
            <ul className='flex flex-wrap gap-2'>
              {template.availability.map((item) => (
                <AvailabilityPill key={item.platform.id} item={item} />
              ))}
            </ul>
          </section>
        )
        : null}
    </>
  );
}

function SourceNumberPill({ item }: { readonly item: SourceItemView; }): JSX.Element {
  const search = useScopeSearch();
  const label = item.number === null ? item.chip.name : String(item.number);
  if (item.current) {
    return (
      <li
        aria-current='page'
        className='rounded-md bg-accent px-2.5 py-1 font-mono text-xs font-semibold text-canvas'
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
        className='block rounded-md border border-line bg-canvas/60 px-2.5 py-1 font-mono text-xs text-muted transition-colors duration-150 hover:border-line-strong hover:text-fg'
      >
        {label}
      </Link>
    </li>
  );
}

function CastGroup({ group }: { readonly group: CastGroupView; }): JSX.Element {
  return (
    <div className='rounded-xl border border-line bg-surface px-5 py-4'>
      <h3 className='mb-3 text-sm font-medium text-muted'>{group.typeLabel}</h3>
      <ul className='flex flex-wrap gap-2'>
        {group.items.map((item) => <ThumbCard key={item.chip.id} thumb={item} />)}
      </ul>
    </div>
  );
}

function AvailabilityPill({ item }: { readonly item: AvailabilityItemView; }): JSX.Element {
  if (item.url === null) {
    return (
      <li className='rounded-lg border border-line bg-surface px-3.5 py-1.5 text-sm text-muted'>
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
        className='block rounded-lg border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-link transition-colors duration-150 hover:border-line-strong'
      >
        {item.platform.name} ↗
      </a>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Arc: ordered chapter / episode lists

function SourceList({ titleKey, items }: {
  readonly titleKey: ChromeKey;
  readonly items: readonly SourceItemView[];
}): JSX.Element | null {
  const locale = useLocale();
  const search = useScopeSearch();
  if (items.length === 0) return null;
  return (
    <section className='mb-12 sm:mb-16'>
      <SectionTitle count={items.length}>{t(locale, titleKey)}</SectionTitle>
      <ul className='divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface'>
        {items.map((item) => (
          <li key={item.chip.id}>
            <Link
              to='/$type/$slug'
              params={{ type: item.chip.type, slug: item.chip.slug }}
              search={search}
              className='group flex items-baseline gap-4 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-2'
            >
              <span className='w-12 shrink-0 font-mono text-xs text-faint'>
                {item.number ?? '—'}
              </span>
              <span className='truncate font-medium text-fg transition-colors duration-150 group-hover:text-accent'>
                {item.chip.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared building blocks (facts history + relation groups)

function SectionTitle(
  { children, count }: { readonly children: string; readonly count?: number; },
): JSX.Element {
  return (
    <h2 className='mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint'>
      {children}
      {count !== undefined
        ? (
          <span className='rounded-md border border-line bg-surface px-1.5 py-px font-mono text-[10px] normal-case tracking-normal text-muted'>
            {count}
          </span>
        )
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
    <span className='rounded-md bg-veil px-2 py-0.5 text-[11px] font-medium text-accent'>
      {epistemic.label}
    </span>
  );
}

/**
 * One historised property: label, then its entries down a quiet
 * timeline rail (dot + hairline), newest first as served.
 */
function PropertyBlock({ property }: { readonly property: PropertyView; }): JSX.Element {
  return (
    <div>
      <dt className='mb-3 text-sm font-semibold text-fg'>{property.label}</dt>
      <dd className='m-0'>
        <ol className='m-0 list-none space-y-0 p-0'>
          {property.entries.map((entry, i) => (
            <li key={i} className='relative pb-4 pl-6 last:pb-0'>
              {i < property.entries.length - 1
                ? (
                  <span
                    aria-hidden
                    className='absolute bottom-[-0.45em] left-[3px] top-[0.55em] w-px bg-line-strong'
                  />
                )
                : null}
              <span
                aria-hidden
                className='absolute left-0 top-[0.45em] size-[7px] rounded-full border border-line-strong bg-surface-2'
              />
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
      <span key='actual' className='text-accent/90'>
        {t(locale, 'actually')} : {entry.actualDisplay}
      </span>,
    );
  }
  return (
    <div className='space-y-1'>
      <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1'>
        {entry.valueChip !== null
          ? <EntityChipLink chip={entry.valueChip} />
          : <span className='font-medium text-fg'>{entry.display}</span>}
        <EpistemicBadge epistemic={entry.epistemic} />
        {entry.autoImported
          ? (
            <span
              title={t(locale, 'autoImported')}
              className='rounded-md bg-link-veil px-2 py-0.5 text-[11px] font-medium text-link'
            >
              ⚠ {t(locale, 'autoImported')}
            </span>
          )
          : null}
      </div>
      {details.length > 0 || (!compact && entry.qualifiers.length > 0)
        ? (
          <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-xs text-faint'>
            {details}
            {compact ? null : <QualifierList qualifiers={entry.qualifiers} />}
          </div>
        )
        : null}
    </div>
  );
}

function RelationGroup({ group }: { readonly group: RelationGroupView; }): JSX.Element {
  const locale = useLocale();
  return (
    <div className='rounded-xl border border-line bg-surface px-5 py-4'>
      <h3 className='mb-2.5 flex items-center gap-2 text-sm font-medium text-muted'>
        <span aria-hidden className='font-mono text-xs text-faint'>
          {group.inverse ? '←' : '→'}
        </span>
        {group.label}
      </h3>
      <ul className='space-y-2'>
        {group.items.map((item, i) => (
          <li key={i} className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1'>
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
