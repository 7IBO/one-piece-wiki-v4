/**
 * `/e/<type>/<slug>` — the wiki page for one entity: right-hand
 * infobox (portrait + latest spoiler-visible values), per-type
 * sections (crew members, chapter prev/next + arc + availability,
 * fruit users…), value history, relations in BOTH directions
 * (materialized inverse rows, per-direction labels from the artifact
 * — ADR-086), narrative markdown, and the contribute strip. All
 * spoiler/scope logic ran server-side; this file only renders the
 * view-model. An optional `?scope=` search param carries the canon
 * scope context and is propagated through every entity link.
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
import { useLocale } from './__root';

const SCOPE_PATTERN = /^[a-z][a-z0-9_]*$/;

export const Route = createFileRoute('/e/$type/$slug')({
  validateSearch: (search: Record<string, unknown>): { scope?: string; } => {
    const scope = search['scope'];
    return typeof scope === 'string' && SCOPE_PATTERN.test(scope) ? { scope } : {};
  },
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
    <div className='py-24 text-center'>
      <p className='font-mono text-[0.7rem] uppercase tracking-[0.2em] text-faint'>
        {view.typeLabel}
      </p>
      <h1 className='mt-2 font-display text-4xl font-semibold tracking-tight text-fg'>
        {view.name}
      </h1>
      <p className='mt-6 font-display text-xl text-gold'>{t(locale, 'gatedTitle')}</p>
      <p className='mx-auto mt-3 max-w-md text-muted'>{t(locale, 'gatedBody')}</p>
      <Link
        to='/'
        className='mt-8 inline-block rounded-full border border-gold/40 px-5 py-2 text-sm text-gold transition-colors hover:bg-veil'
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
      <header className='mb-8'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Link
            to='/t/$type'
            params={{ type: view.type }}
            className='font-mono text-[0.7rem] uppercase tracking-[0.2em] text-faint transition-colors hover:text-gold'
          >
            {view.typeLabel}
            {source !== null && source.number !== null ? ` · ${source.number}` : ''}
          </Link>
          {source !== null ? <PrevNext template={source} /> : null}
        </div>
        <h1 className='mt-2 font-display text-4xl font-semibold tracking-tight text-fg'>
          {view.name}
        </h1>
        {view.firstAppearance !== null
          ? (
            <p className='mt-3 text-sm text-muted'>
              {t(locale, 'firstAppearance')} · <EntityChipLink chip={view.firstAppearance} />
            </p>
          )
          : null}
      </header>

      <div className='flex flex-col gap-8 min-[900px]:flex-row min-[900px]:items-start'>
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
              <section className='mb-10'>
                <SectionTitle>{t(locale, 'about')}</SectionTitle>
                <Markdown markdown={view.narrative} />
              </section>
            )
            : null}

          {history.length > 0
            ? (
              <section className='mb-10'>
                <SectionTitle>{t(locale, 'history')}</SectionTitle>
                <dl className='overflow-hidden rounded-xl border border-line bg-panel'>
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
              <section className='mb-10'>
                <SectionTitle>{t(locale, 'connections')}</SectionTitle>
                <div className='space-y-4'>
                  {outgoing.map((group) => <RelationGroup key={group.key} group={group} />)}
                </div>
              </section>
            )
            : null}

          {incoming.length > 0
            ? (
              <section className='mb-10'>
                <SectionTitle>{t(locale, 'referencedBy')}</SectionTitle>
                <div className='space-y-4'>
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
// Infobox (right rail, stacks first on mobile)

function Infobox({ view }: { readonly view: EntityView; }): JSX.Element | null {
  if (view.image === null && view.infobox.length === 0 && view.infoboxRelations.length === 0) {
    return null;
  }
  return (
    <aside className='order-first w-full shrink-0 min-[900px]:order-none min-[900px]:w-72'>
      <div className='overflow-hidden rounded-xl border border-line bg-panel'>
        <EntityImage
          image={view.image}
          name={view.name}
          className='aspect-square w-full'
          initialClassName='text-7xl'
        />
        {view.image !== null && view.image.attribution !== null
          ? <p className='px-4 pt-2 text-[0.65rem] text-faint'>{view.image.attribution}</p>
          : null}
        <dl>
          {view.infobox.map((row) => <InfoboxLine key={row.id} row={row} />)}
          {view.infoboxRelations.map((row) => <InfoboxRelationLine key={row.key} row={row} />)}
        </dl>
      </div>
    </aside>
  );
}

function InfoboxLine({ row }: { readonly row: InfoboxRowView; }): JSX.Element {
  return (
    <div className='border-t border-line/60 px-4 py-2.5 first:border-t-0'>
      <dt className='text-[0.7rem] font-medium uppercase tracking-wide text-faint'>{row.label}</dt>
      <dd className='m-0 mt-0.5 text-sm'>
        <PropertyEntry entry={row.entry} compact />
      </dd>
    </div>
  );
}

function InfoboxRelationLine({ row }: { readonly row: InfoboxRelationRowView; }): JSX.Element {
  return (
    <div className='border-t border-line/60 px-4 py-2.5'>
      <dt className='text-[0.7rem] font-medium uppercase tracking-wide text-faint'>{row.label}</dt>
      <dd className='m-0 mt-0.5 space-y-0.5 text-sm'>
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
    <section className='mb-10'>
      <SectionTitle>{t(locale, 'affiliations')}</SectionTitle>
      <div className='space-y-4'>
        {crews.map((crew) => (
          <div key={crew.crew.id} className='rounded-xl border border-line bg-panel px-4 py-3.5'>
            <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1'>
              <span className='text-xs text-faint'>{crew.label}</span>
              <span className='font-display text-lg font-semibold'>
                <EntityChipLink chip={crew.crew} />
              </span>
              {crew.role !== null
                ? (
                  <span className='rounded-full bg-veil px-2 py-0.5 text-[0.7rem] text-gold'>
                    {crew.role}
                  </span>
                )
                : null}
              {crew.rank !== null
                ? (
                  <span className='rounded-full bg-sea-veil px-2 py-0.5 text-[0.7rem] text-sea'>
                    {crew.rank}
                  </span>
                )
                : null}
            </div>
            {crew.members.length > 0
              ? (
                <>
                  <p className='mt-3 text-[0.7rem] font-medium uppercase tracking-wide text-faint'>
                    {t(locale, 'otherMembers')}
                  </p>
                  <ul className='mt-2 flex flex-wrap gap-2'>
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
        to='/e/$type/$slug'
        params={{ type: thumb.chip.type, slug: thumb.chip.slug }}
        search={search}
        className='group flex items-center gap-2.5 rounded-lg border border-line/70 bg-canvas/50 py-1.5 pl-1.5 pr-3 transition-colors hover:border-gold/50'
      >
        <EntityImage
          image={thumb.image}
          name={thumb.chip.name}
          className='size-9 rounded-md'
          initialClassName='text-base'
        />
        <span className='leading-tight'>
          <span className='block text-sm text-fg transition-colors group-hover:text-gold'>
            {thumb.chip.name}
          </span>
          {thumb.note !== null
            ? <span className='block text-[0.7rem] text-faint'>{thumb.note}</span>
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
    <section className='mb-10'>
      {hideTitle ? null : <SectionTitle>{t(locale, titleKey)}</SectionTitle>}
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
        to='/e/$type/$slug'
        params={{ type: member.chip.type, slug: member.chip.slug }}
        search={search}
        className='group flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 transition-colors hover:border-gold/50 hover:bg-panel-2'
      >
        <EntityImage
          image={member.image}
          name={member.chip.name}
          className='size-12 shrink-0 rounded-lg'
          initialClassName='text-xl'
        />
        <span className='min-w-0 leading-tight'>
          <span className='block truncate font-medium text-fg transition-colors group-hover:text-gold'>
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
    'rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-gold/50 hover:text-fg';
  return (
    <nav className='flex items-center gap-2'>
      {template.prev !== null
        ? (
          <Link
            to='/e/$type/$slug'
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
            to='/e/$type/$slug'
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
          <section className='mb-10 rounded-xl border border-line bg-panel px-4 py-3.5'>
            <div className='flex flex-wrap items-baseline gap-x-2.5'>
              <span className='text-xs text-faint'>{template.arc.label}</span>
              <span className='font-display text-lg font-semibold'>
                <EntityChipLink chip={template.arc.chip} />
              </span>
            </div>
            {template.arc.items.length > 0
              ? (
                <ul className='mt-3 flex flex-wrap gap-1.5'>
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
          <section className='mb-10'>
            <SectionTitle>{t(locale, 'cast')}</SectionTitle>
            <div className='space-y-4'>
              {template.cast.map((group) => <CastGroup key={group.type} group={group} />)}
            </div>
          </section>
        )
        : null}
      {template.availability.length > 0
        ? (
          <section className='mb-10'>
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
        className='rounded-lg bg-gold px-2.5 py-1 font-mono text-xs font-semibold text-canvas'
      >
        {label}
      </li>
    );
  }
  return (
    <li>
      <Link
        to='/e/$type/$slug'
        params={{ type: item.chip.type, slug: item.chip.slug }}
        search={search}
        title={item.chip.name}
        className='block rounded-lg border border-line bg-canvas/50 px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-gold/50 hover:text-fg'
      >
        {label}
      </Link>
    </li>
  );
}

function CastGroup({ group }: { readonly group: CastGroupView; }): JSX.Element {
  return (
    <div className='rounded-xl border border-line bg-panel px-4 py-3.5'>
      <h3 className='mb-2 text-sm font-medium text-muted'>{group.typeLabel}</h3>
      <ul className='flex flex-wrap gap-2'>
        {group.items.map((item) => <ThumbCard key={item.chip.id} thumb={item} />)}
      </ul>
    </div>
  );
}

function AvailabilityPill({ item }: { readonly item: AvailabilityItemView; }): JSX.Element {
  if (item.url === null) {
    return (
      <li className='rounded-full border border-line bg-panel px-3.5 py-1.5 text-sm text-muted'>
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
        className='block rounded-full border border-line bg-panel px-3.5 py-1.5 text-sm text-sea transition-colors hover:border-sea/50'
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
    <section className='mb-10'>
      <SectionTitle>{t(locale, titleKey)}</SectionTitle>
      <ul className='divide-y divide-line/60 overflow-hidden rounded-xl border border-line bg-panel'>
        {items.map((item) => (
          <li key={item.chip.id}>
            <Link
              to='/e/$type/$slug'
              params={{ type: item.chip.type, slug: item.chip.slug }}
              search={search}
              className='group flex items-baseline gap-3 px-4 py-2.5 transition-colors hover:bg-panel-2'
            >
              <span className='w-12 shrink-0 font-mono text-xs text-faint'>
                {item.number ?? '—'}
              </span>
              <span className='truncate font-medium text-fg transition-colors group-hover:text-gold'>
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

function SectionTitle({ children }: { readonly children: string; }): JSX.Element {
  return (
    <h2 className='mb-3 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-faint'>
      {children}
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
    <span className='rounded-full bg-veil px-2 py-0.5 text-[0.7rem] text-gold'>
      {epistemic.label}
    </span>
  );
}

function PropertyBlock({ property }: { readonly property: PropertyView; }): JSX.Element {
  return (
    <div className='grid grid-cols-1 gap-1 border-b border-line/60 px-4 py-3.5 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-4'>
      <dt className='pt-0.5 text-sm font-medium text-muted'>{property.label}</dt>
      <dd className='m-0 space-y-2.5'>
        {property.entries.map((entry, i) => <PropertyEntry key={i} entry={entry} />)}
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
      <span key='actual' className='text-gold/90'>
        {t(locale, 'actually')} : {entry.actualDisplay}
      </span>,
    );
  }
  return (
    <div className='space-y-1'>
      <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1'>
        {entry.valueChip !== null
          ? <EntityChipLink chip={entry.valueChip} />
          : <span className='text-fg'>{entry.display}</span>}
        <EpistemicBadge epistemic={entry.epistemic} />
        {entry.autoImported
          ? (
            <span
              title={t(locale, 'autoImported')}
              className='rounded-full bg-sea-veil px-2 py-0.5 text-[0.7rem] text-sea'
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
    <div className='rounded-xl border border-line bg-panel px-4 py-3.5'>
      <h3 className='mb-2 flex items-center gap-2 text-sm font-medium text-muted'>
        <span aria-hidden className='text-faint'>{group.inverse ? '←' : '→'}</span>
        {group.label}
      </h3>
      <ul className='space-y-1.5'>
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
