/**
 * `/<type>/<slug>` — the canonical wiki page for one entity (the
 * entity TYPE ID is the first URL segment: `/character/monkey-d-luffy`),
 * set as a BROADSHEET ARTICLE (v6 "La Gazette", WEB_APP.md
 * § Identity): headword band (small-cap overline, huge serif name,
 * double rule), then a ruled two-column body — the FICHE column
 * (photo block, WANTED-style bounty plate, almanac data table) beside
 * the main column (per-type sections, narrative prose with drop cap,
 * value history, relations in BOTH directions with per-direction
 * labels from the artifact — ADR-086) — and the contribute colophon.
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
    <div className='mx-auto max-w-md py-20 text-center'>
      <p className='overline-label'>{view.typeLabel}</p>
      <h1 className='mt-2 font-display text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.06] text-fg'>
        {view.name}
      </h1>
      <div className='mt-8 border-y-[3px] border-double border-line-strong px-6 py-5'>
        <p className='overline-label text-accent'>{t(locale, 'gatedTitle')}</p>
        <p className='mt-2 font-serif text-[15px] italic text-muted'>{t(locale, 'gatedBody')}</p>
      </div>
      <Link
        to='/'
        className='overline-label mt-8 inline-block border border-accent px-4 py-2 text-accent transition-colors duration-150 hover:bg-accent hover:text-canvas'
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
  // The bounty (or a crew's derived total) is the ONE gold plate of
  // the fiche — a WANTED-poster figure (ADR-091 binding, degrades to
  // a plain data row when absent). Every other infobox unit renders
  // as a ruled row of the almanac data table.
  const bountyRow =
    view.infobox.find((row) => row.id === 'bounty' || row.id === 'derived:total_bounty') ?? null;
  const statRows = view.infobox.filter((row) => row !== bountyRow);
  const hasFiche = view.image !== null || bountyRow !== null || statRows.length > 0
    || view.infoboxRelations.length > 0;
  return (
    <article>
      {/* Headword band */}
      <header className='rule-double pb-3'>
        <div className='flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1'>
          <Link
            to='/$type'
            params={{ type: view.type }}
            className='overline-label transition-colors duration-150 hover:text-accent'
          >
            {view.typeLabel}
            {source !== null && source.number !== null ? ` · N° ${source.number}` : ''}
          </Link>
          {source !== null ? <PrevNext template={source} /> : null}
        </div>
        <h1 className='mt-1 font-display text-[clamp(2.1rem,5.2vw,3.6rem)] font-semibold leading-[1.04] text-fg'>
          {view.name}
        </h1>
        {view.firstAppearance !== null
          ? (
            <p className='overline-label mt-2.5'>
              {t(locale, 'firstAppearance')} — <EntityChipLink chip={view.firstAppearance} />
            </p>
          )
          : null}
      </header>

      {/* Ruled two-column body: fiche | main matter. */}
      <div
        className={`pt-5 ${
          hasFiche
            ? 'grid grid-cols-1 gap-x-0 gap-y-7 min-[900px]:grid-cols-[280px_1fr]'
            : ''
        }`}
      >
        {hasFiche
          ? (
            <aside className='min-[900px]:border-r min-[900px]:border-line min-[900px]:pr-6'>
              <div className='mx-auto max-w-[280px] min-[900px]:mx-0'>
                {view.image !== null
                  ? (
                    <figure className='mb-5'>
                      <EntityImage
                        image={view.image}
                        name={view.name}
                        ratio='portrait'
                        className='w-full border border-line'
                        monogramClassName='text-6xl'
                      />
                      {view.image.attribution !== null
                        ? (
                          <figcaption className='mt-1.5 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-faint'>
                            {view.image.attribution}
                          </figcaption>
                        )
                        : null}
                    </figure>
                  )
                  : null}
                {bountyRow !== null ? <BountyPlate row={bountyRow} /> : null}
                {statRows.length > 0 || view.infoboxRelations.length > 0
                  ? (
                    <dl className='border-t border-line'>
                      {statRows.map((row) => <FicheRow key={row.id} row={row} />)}
                      {view.infoboxRelations.map((row) => (
                        <FicheRelationRow key={row.key} row={row} />
                      ))}
                    </dl>
                  )
                  : null}
              </div>
            </aside>
          )
          : null}

        <div className={`min-w-0 ${hasFiche ? 'min-[900px]:pl-7' : ''}`}>
          {source !== null ? <SourceSections template={source} /> : null}
          {view.template.kind === 'character'
            ? <CrewSections crews={view.template.crews} />
            : null}
          {view.template.kind === 'crew'
            ? (
              <>
                <MemberBlocks titleKey='members' members={view.template.members} />
                <MemberBlocks titleKey='formerMembers' members={view.template.former} />
              </>
            )
            : null}
          {view.template.kind === 'devil-fruit'
            ? (
              <>
                <MemberBlocks titleKey='currentUsers' members={view.template.users} />
                <MemberBlocks titleKey='formerUsers' members={view.template.former} />
              </>
            )
            : null}
          {view.template.kind === 'arc'
            ? (
              <>
                <SourceTable titleKey='chapters' items={view.template.chapters} />
                <SourceTable titleKey='episodes' items={view.template.episodes} />
                <SourceTable titleKey='arcs' items={view.template.arcs} />
              </>
            )
            : null}

          {view.narrative !== null
            ? (
              <section className='mb-8'>
                <SectionHead>{t(locale, 'about')}</SectionHead>
                <div className='max-w-[62ch]'>
                  <Markdown markdown={view.narrative} />
                </div>
              </section>
            )
            : null}

          {history.length > 0
            ? (
              <section className='mb-8'>
                <SectionHead count={history.length}>{t(locale, 'history')}</SectionHead>
                <dl>
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
              <section className='mb-8'>
                <SectionHead count={outgoing.length}>{t(locale, 'connections')}</SectionHead>
                <RelationColumns groups={outgoing} />
              </section>
            )
            : null}
          {incoming.length > 0
            ? (
              <section className='mb-8'>
                <SectionHead count={incoming.length}>{t(locale, 'referencedBy')}</SectionHead>
                <RelationColumns groups={incoming} />
              </section>
            )
            : null}
        </div>
      </div>

      <ContributeStrip type={view.type} slug={view.slug} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Print building blocks

/** Section head: serif title + count, closed by a double rule. */
function SectionHead(
  { children, count }: { readonly children: string; readonly count?: number; },
): JSX.Element {
  return (
    <h2 className='rule-double mb-3.5 flex items-baseline gap-2.5 pb-1.5 font-display text-[1.2rem] font-semibold text-fg'>
      {children}
      {count !== undefined
        ? <span className='text-sm font-normal tabular-nums text-faint'>{count}</span>
        : null}
    </h2>
  );
}

/**
 * The bounty plate — a WANTED-poster figure: double rules top and
 * bottom, small-cap caption, oversized tabular numerals in the only
 * gold of the page. Typographic stamp, no skeuomorphism.
 */
function BountyPlate({ row }: { readonly row: InfoboxRowView; }): JSX.Element {
  return (
    <div className='mb-5 border-y-[3px] border-double border-gold/60 py-3 text-center'>
      <p className='overline-label text-gold/85'>{row.label}</p>
      <p className='mt-1 font-display text-[1.9rem] font-bold leading-none tabular-nums text-gold'>
        {row.entry.display}
      </p>
    </div>
  );
}

/** One ruled row of the almanac data table (label / value). */
function FicheRow({ row }: { readonly row: InfoboxRowView; }): JSX.Element {
  return (
    <div className='flex items-baseline justify-between gap-3 border-b border-line py-[7px]'>
      <dt className='overline-label shrink-0'>{row.label}</dt>
      <dd className='m-0 min-w-0 text-right text-[13px] font-medium tabular-nums text-fg'>
        <PropertyEntry entry={row.entry} compact />
      </dd>
    </div>
  );
}

function FicheRelationRow({ row }: { readonly row: InfoboxRelationRowView; }): JSX.Element {
  return (
    <div className='flex items-baseline justify-between gap-3 border-b border-line py-[7px]'>
      <dt className='overline-label shrink-0'>{row.label}</dt>
      <dd className='m-0 min-w-0 text-right text-[13px] font-medium'>
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
    <section className='mb-8'>
      <SectionHead count={crews.length}>{t(locale, 'affiliations')}</SectionHead>
      <div className='space-y-6'>
        {crews.map((crew) => (
          <div key={crew.crew.id}>
            <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1'>
              <span className='overline-label'>{crew.label}</span>
              <span className='font-display text-[1.05rem] font-semibold'>
                <EntityChipLink chip={crew.crew} />
              </span>
              {[crew.role, crew.rank].filter((part) => part !== null).map((part) => (
                <span
                  key={part}
                  className='text-[9px] font-semibold uppercase tracking-[0.14em] text-muted'
                >
                  {part}
                </span>
              ))}
            </div>
            {crew.members.length > 0
              ? (
                <>
                  <p className='overline-label mb-2 mt-3'>{t(locale, 'otherMembers')}</p>
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
    </section>
  );
}

// ---------------------------------------------------------------------------
// Crew / devil-fruit: member photo blocks with roles, ranks

function MemberBlocks({ titleKey, members }: {
  readonly titleKey: ChromeKey;
  readonly members: readonly MemberRowView[];
}): JSX.Element | null {
  const locale = useLocale();
  if (members.length === 0) return null;
  return (
    <section className='mb-8'>
      <SectionHead count={members.length}>{t(locale, titleKey)}</SectionHead>
      <CardGrid>
        {members.map((member) => <MemberBlockItem key={member.chip.id} member={member} />)}
      </CardGrid>
    </section>
  );
}

function MemberBlockItem({ member }: { readonly member: MemberRowView; }): JSX.Element {
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
  const linkClass = 'overline-label transition-colors duration-150 hover:text-accent';
  return (
    <nav className='flex items-baseline divide-x divide-line-strong'>
      {template.prev !== null
        ? (
          <Link
            to='/$type/$slug'
            params={{ type: template.prev.type, slug: template.prev.slug }}
            search={search}
            className={`${linkClass} pr-3`}
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
            className={`${linkClass} pl-3`}
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
          <section className='mb-8'>
            <div className='rule-double mb-3.5 flex flex-wrap items-baseline gap-x-2.5 pb-1.5'>
              <span className='overline-label'>{template.arc.label}</span>
              <span className='font-display text-[1.2rem] font-semibold'>
                <EntityChipLink chip={template.arc.chip} />
              </span>
            </div>
            {template.arc.items.length > 0
              ? (
                <ul className='flex flex-wrap pl-px pt-px'>
                  {template.arc.items.map((item) => (
                    <SourceNumberCell key={item.chip.id} item={item} />
                  ))}
                </ul>
              )
              : null}
          </section>
        )
        : null}
      {template.cast.length > 0
        ? (
          <section className='mb-8'>
            <SectionHead>{t(locale, 'cast')}</SectionHead>
            <div className='space-y-5'>
              {template.cast.map((group) => <CastGroup key={group.type} group={group} />)}
            </div>
          </section>
        )
        : null}
      {template.availability.length > 0
        ? (
          <section className='mb-8'>
            <SectionHead>{t(locale, 'availability')}</SectionHead>
            <ul className='max-w-sm'>
              {template.availability.map((item) => (
                <AvailabilityRow key={item.platform.id} item={item} />
              ))}
            </ul>
          </section>
        )
        : null}
    </>
  );
}

/** One cell of the arc's chapter strip — a ruled table of figures. */
function SourceNumberCell({ item }: { readonly item: SourceItemView; }): JSX.Element {
  const search = useScopeSearch();
  const label = item.number === null ? item.chip.name : String(item.number);
  if (item.current) {
    return (
      <li
        aria-current='page'
        className='-ml-px -mt-px grid min-w-10 place-items-center border border-accent bg-accent px-2 py-1.5 text-xs font-semibold tabular-nums text-canvas'
      >
        {label}
      </li>
    );
  }
  return (
    <li className='-ml-px -mt-px border border-line'>
      <Link
        to='/$type/$slug'
        params={{ type: item.chip.type, slug: item.chip.slug }}
        search={search}
        title={item.chip.name}
        className='grid min-w-10 place-items-center px-2 py-1.5 text-xs font-medium tabular-nums text-muted transition-colors duration-150 hover:bg-surface hover:text-accent'
      >
        {label}
      </Link>
    </li>
  );
}

function CastGroup({ group }: { readonly group: CastGroupView; }): JSX.Element {
  return (
    <div>
      <h3 className='overline-label mb-2'>{group.typeLabel}</h3>
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

function AvailabilityRow({ item }: { readonly item: AvailabilityItemView; }): JSX.Element {
  if (item.url === null) {
    return (
      <li className='border-b border-line py-2 text-[13px] font-medium text-muted'>
        {item.platform.name}
      </li>
    );
  }
  return (
    <li className='border-b border-line'>
      <a
        href={item.url}
        target='_blank'
        rel='noreferrer'
        className='group flex items-baseline justify-between gap-3 py-2 text-[13px] font-medium text-fg transition-colors duration-150 hover:text-accent'
      >
        <span className='underline decoration-accent/50 underline-offset-3 group-hover:decoration-accent'>
          {item.platform.name}
        </span>
        <span aria-hidden className='text-faint group-hover:text-accent'>↗</span>
      </a>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Arc: ordered chapter / episode tables — the figure IS the visual.

function SourceTable({ titleKey, items }: {
  readonly titleKey: ChromeKey;
  readonly items: readonly SourceItemView[];
}): JSX.Element | null {
  const locale = useLocale();
  const search = useScopeSearch();
  if (items.length === 0) return null;
  return (
    <section className='mb-8'>
      <SectionHead count={items.length}>{t(locale, titleKey)}</SectionHead>
      <ul className='flex flex-wrap pl-px pt-px'>
        {items.map((item) => (
          <li
            key={item.chip.id}
            className='-ml-px -mt-px w-[calc(33.333%+1px)] border border-line min-[480px]:w-[108px]'
          >
            <Link
              to='/$type/$slug'
              params={{ type: item.chip.type, slug: item.chip.slug }}
              search={search}
              title={item.chip.name}
              className='group block h-full px-2 py-1.5 transition-colors duration-150 hover:bg-surface'
            >
              <span className='block font-display text-lg font-semibold leading-tight tabular-nums text-fg transition-colors duration-150 group-hover:text-accent'>
                {item.number ?? '·'}
              </span>
              <span className='block truncate text-[10px] font-medium tracking-[0.02em] text-faint'>
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

/** Epistemic marks print as bracketed small caps: [believed dead]. */
function EpistemicMark(
  { epistemic }: { readonly epistemic: { readonly label: string; } | null; },
): JSX.Element | null {
  if (epistemic === null) return null;
  return (
    <span className='whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.14em] text-muted'>
      [{epistemic.label}]
    </span>
  );
}

/**
 * One historised property inside the history section: slim small-cap
 * label column, then compact [value · provenance] rows split by
 * hairlines — a chronological table, oldest to latest.
 */
function PropertyBlock({ property }: { readonly property: PropertyView; }): JSX.Element {
  return (
    <div className='grid grid-cols-1 gap-1 border-b border-line py-2.5 sm:grid-cols-[9.5rem_1fr] sm:gap-4'>
      <dt className='overline-label pt-1'>{property.label}</dt>
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
    <div
      className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-1 ${compact ? 'justify-end' : ''}`}
    >
      {entry.valueChip !== null
        ? <EntityChipLink chip={entry.valueChip} />
        : <span className='font-medium tabular-nums text-fg'>{entry.display}</span>}
      <EpistemicMark epistemic={entry.epistemic} />
      {entry.autoImported
        ? (
          <span
            title={t(locale, 'autoImported')}
            className='whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.14em] text-faint'
          >
            [{t(locale, 'autoImported')}]
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

/** Relation groups flow as ruled columns, almanac style. */
function RelationColumns(
  { groups }: { readonly groups: readonly RelationGroupView[]; },
): JSX.Element {
  return (
    <div
      className={`gap-8 [column-rule:1px_solid_var(--color-line)] ${
        groups.length > 1 ? 'min-[640px]:columns-2 min-[1100px]:columns-3' : ''
      }`}
    >
      {groups.map((group) => <RelationGroup key={group.key} group={group} />)}
    </div>
  );
}

function RelationGroup({ group }: { readonly group: RelationGroupView; }): JSX.Element {
  const locale = useLocale();
  return (
    <div className='mb-5 min-w-0 break-inside-avoid'>
      <h3 className='overline-label mb-1 border-b border-line-strong pb-1'>
        {group.label}
      </h3>
      <ul className='divide-y divide-line'>
        {group.items.map((item, i) => (
          <li
            key={i}
            className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1 py-[7px]'
          >
            <EntityChipLink chip={item.target} showType />
            <EpistemicMark epistemic={item.epistemic} />
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
