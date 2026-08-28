/**
 * `/<type>/<slug>` — the canonical wiki page for one entity (the
 * entity TYPE ID is the first URL segment: `/character/monkey-d-luffy`).
 *
 * v9 (ADR-105): the page is no longer ONE stack of sections for every
 * type. It is a set of MODULES — data sheet, narrative, roster,
 * contents ledger, cast, gallery, appearances, leftover connections —
 * arranged by a per-type layout (`lib/entity-layout.ts`) into bands:
 * a lead module at full width, a wide main column beside a narrow
 * aside (on either edge), and a balanced masonry for everything small.
 * That masonry is the answer to the maintainer's complaint: a column
 * of one-item sections used to leave half the screen empty, and now
 * small modules pack side by side while big ones span.
 *
 * Two rules hold whatever the type:
 * - **No data can be dropped** (ADR-091/105): `bandsFor()` appends a
 *   trailing band with every slot the layout forgot, and the
 *   `connections` module renders every relation group no other module
 *   consumed. An unknown entity type gets the generic layout and
 *   still shows all of its properties and relations.
 * - **Every historised property carries its own history INLINE**, in
 *   the data sheet, where the property lives — not exiled to a global
 *   "History" block at the foot of the page.
 *
 * All spoiler/scope logic ran server-side (`server/views.ts`); this
 * file renders the view model and holds no business logic. An
 * optional `?scope=` search param carries the canon scope context and
 * is propagated through every entity link.
 *
 * File name: the `$type_` prefix un-nests this route from the
 * `/$type` listing leaf (TanStack trailing-underscore convention) —
 * the resolved path is still `/$type/$slug`.
 */
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { type CSSProperties, Fragment, type ReactElement, type ReactNode } from 'react';
import {
  type AppearanceGroupView,
  type AvailabilityItemView,
  type CastGroupView,
  type ContainerGroupView,
  type CrewSectionView,
  type EntityView,
  fetchEntity,
  type GatedEntityView,
  type ImageView,
  type InfoboxRelationRowView,
  type LabelledValue,
  type MemberRowView,
  type PropertyEntryView,
  type PropertyView,
  type RelationGroupView,
  type RelationItemView,
  type SequenceView,
  type SourceItemView,
  type SourceTemplateView,
} from '../api';
import { ContributeStrip } from '../components/ContributeStrip';
import { CARD_GRID_CLASS, EntityCard } from '../components/EntityCard';
import { EntityChipLink, ScopeContext, useScopeSearch } from '../components/EntityChip';
import { EntityHero } from '../components/EntityHero';
import { EntityImage } from '../components/EntityImage';
import { HeroChips } from '../components/HeroChips';
import { HeroStats } from '../components/HeroStats';
import { HoverPreview } from '../components/HoverPreview';
import { IncompletePanel } from '../components/IncompletePanel';
import { ShowMoreList } from '../components/ShowMoreList';
import { SourceRow } from '../components/SourceRow';
import { SourceTabs } from '../components/SourceTabs';
import { type ChromeKey, t } from '../lib/chrome';
import {
  bandsFor,
  type GridCell,
  type LayoutBand,
  layoutFor,
  type SlotKey,
  slotsOfBand,
} from '../lib/entity-layout';
import {
  type EntitySection,
  restrictBands,
  sectionCount,
  slotHasContent,
  slotsForSection,
  visibleSections,
} from '../lib/entity-sections';
import { entityTint } from '../lib/entity-tint';
import { heroStatRows } from '../lib/hero-stats';
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
const ROW_LIMIT = 6;
/** Collapsed budget of a poster grid (members, cast…). */
const CARD_LIMIT = 12;
/** Collapsed budget of a compact number grid (chapters, episodes…). */
const NUMBER_LIMIT = 36;
/**
 * Budget replié d'une liste d'APPARITIONS. Une rangée fait ~54 px
 * (vignette 40 + 2×7 de marge), donc douze remplissent déjà un écran —
 * là où trente-six numéros tenaient dans un bloc. Le reste part
 * derrière « voir les N autres », comme partout ailleurs.
 */
const APPEARANCE_LIMIT = 12;

/**
 * Column count of a full-width row list, derived from how many rows
 * there are: two rows make two columns, one row spans. A fixed
 * three-column grid holding a single item is precisely the hole this
 * page had to lose.
 */
function rowColumns(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
  return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';
}

function EntityPage(): ReactElement {
  const view = Route.useLoaderData();
  if (view.kind === 'gated') return <GatedScreen view={view} />;
  return (
    <ScopeContext.Provider value={view.propagateScope}>
      <EntityArticle view={view} section={null} />
    </ScopeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Gated ("not yet in your progression")

export function GatedScreen({ view }: { readonly view: GatedEntityView; }): ReactElement {
  const locale = useLocale();
  return (
    <div className='page-column mx-auto max-w-md py-20 text-center'>
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
        className='mt-8 inline-block rounded-md bg-gold px-4 py-2 text-sm font-semibold text-canvas transition-colors duration-150 hover:bg-gold/85'
      >
        {t(locale, 'backHome')}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The article: hero, then the type's bands.

/**
 * The entity article, on its overview (`section === null`) or on one
 * of its sub-pages (ADR-110). The authored bands are computed once and
 * then RESTRICTED to the slots this page owns, so a sub-page inherits
 * the type's layout instead of forking it: a crew's roster still leads
 * at full width, an aside is still an aside.
 */
export function EntityArticle(
  { view, section }: {
    readonly view: EntityView;
    readonly section: EntitySection | null;
  },
): ReactElement {
  const locale = useLocale();
  const tint = entityTint(view.id);
  const layout = layoutFor(view.type);
  const bands = restrictBands(bandsFor(view.type), slotsForSection(view.type, section));
  return (
    <article className='tinted' style={tint.vars as CSSProperties}>
      <EntityHero
        entityId={view.id}
        entityType={view.type}
        name={view.name}
        image={view.image}
        figure={layout.figure}
        nav={view.sequence === null ? null : <SequenceNav sequence={view.sequence} />}
      >
        <Identity view={view} />
      </EntityHero>

      <SectionNav view={view} current={section} />

      {/* The plates open the grid 14px under the band, not 36px. */}
      <div className='page-column space-y-3 pt-3.5'>
        {bands.map((band) => (
          // Une bande est identifiee par ce qu'elle CONTIENT — le
          // gabarit est fige par type d'entite, donc deux bandes ne
          // peuvent pas porter les memes creneaux.
          <Band key={`${band.kind}:${slotsOfBand(band).join(',')}`} band={band} view={view} />
        ))}
        {bands.length === 0 ? <EmptySection /> : null}
        {
          /*
           * Only on the overview: a sub-page is a slice of the entity,
           * and telling a reader on `/appearances` that the birth date
           * is missing is answering a question they did not ask.
           */
        }
        {section === null
          ? (
            <IncompletePanel
              missing={view.missingProperties}
              typeLabel={view.typeLabel}
              type={view.type}
              slug={view.slug}
              locale={locale}
            />
          )
          : null}
        <ContributeStrip type={view.type} slug={view.slug} />
      </div>
    </article>
  );
}

/**
 * The sub-page navigation (ADR-110). Real links to real URLs — an
 * indexable, shareable destination each, which is the whole point of
 * choosing sub-pages over tabs. Rendered only when the entity actually
 * has something to split: a lone tab is not navigation.
 */
function SectionNav(
  { view, current }: {
    readonly view: EntityView;
    readonly current: EntitySection | null;
  },
): ReactElement | null {
  const locale = useLocale();
  const search = useScopeSearch();
  const sections = visibleSections(view);
  if (sections.length === 0) return null;
  // `design/v2`: 12.5px in SENTENCE case, not 12px uppercase with
  // letter-spacing. The count sits beside the label in a dimmer ink —
  // the plates print `Apparitions 342`, never `APPARITIONS`.
  const item = 'block border-b-2 px-0.5 py-3 text-[12.5px] transition-colors duration-150';
  const active = 'border-gold font-semibold text-fg';
  const idle = 'border-transparent text-muted hover:text-fg';
  return (
    <nav className='page-column border-b border-line'>
      <ul className='-mb-px flex flex-wrap items-center gap-x-6'>
        <li>
          <Link
            to='/$type/$slug'
            params={{ type: view.type, slug: view.slug }}
            search={search}
            aria-current={current === null ? 'page' : undefined}
            className={`${item} ${current === null ? active : idle}`}
          >
            {t(locale, 'sectionOverview')}
          </Link>
        </li>
        {sections.map((section) => {
          const count = sectionCount(section, view);
          return (
            <li key={section.id}>
              <Link
                to='/$type/$slug/$section'
                params={{ type: view.type, slug: view.slug, section: section.id }}
                search={search}
                aria-current={current?.id === section.id ? 'page' : undefined}
                className={`${item} ${current?.id === section.id ? active : idle}`}
              >
                {t(locale, section.labelKey)}
                {count === null
                  ? null
                  : <span className='ml-1.5 tabular-nums text-faint'>{count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A sub-page URL that resolves but has nothing in it (yet). */
function EmptySection(): ReactElement {
  const locale = useLocale();
  return <p className='py-10 text-sm text-muted'>{t(locale, 'emptySection')}</p>;
}

/** Overline, name, identity line and the ONE headline figure. */
/**
 * The identity block of the hero, laid out as `design/v2` lays it:
 * a small-caps KICKER of dotted segments, the name at 42px in its own
 * case, a subtitle of resolved facts, a row of chips, and the stat
 * strip pushed to the right edge of the band.
 *
 * Three things changed from v9 and each was visible in the plates:
 * the title is NOT uppercased (`Monkey D. Luffy`, not
 * `MONKEY D. LUFFY`), the kicker carries the entity's own
 * classification rather than only its type, and the single floating
 * gold figure became the bordered multi-cell strip.
 */
function Identity({ view }: { readonly view: EntityView; }): ReactElement {
  const locale = useLocale();
  const stats = heroStatRows(view.type, view.infobox);
  // The kicker's extra segments come from the relations the infobox
  // already resolved — a crew, a role, a classification. Capped so a
  // richly-linked entity cannot wrap the line (ADR-091: absent =
  // simply not rendered).
  const kickerChips = view.infoboxRelations
    .flatMap((relation) => relation.chips.slice(0, 1))
    .slice(0, 2);
  return (
    <div className='flex flex-wrap items-start justify-between gap-x-8 gap-y-5'>
      <div className='min-w-0'>
        <p className='label-xs'>
          <Link
            to='/$type'
            params={{ type: view.type }}
            className='transition-colors duration-150 hover:text-link-hover'
          >
            {view.typeLabel}
          </Link>
          {kickerChips.map((chip) => (
            <span key={chip.id}>
              <span className='mx-1.5 text-faint'>·</span>
              <Link
                to='/$type/$slug'
                params={{ type: chip.type, slug: chip.slug }}
                className='transition-colors duration-150 hover:text-link-hover'
              >
                {chip.name}
              </Link>
            </span>
          ))}
          {view.sequence !== null
            ? <span className='ml-2 tabular-nums text-gold/85'>№ {view.sequence.number}</span>
            : null}
        </p>
        <h1 className='display mt-1.5 text-[clamp(1.75rem,3.6vw,2.625rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-fg'>
          {view.name}
        </h1>
        {view.firstAppearance !== null
          ? (
            <p className='mt-1.5 text-sm text-muted'>
              {t(locale, 'firstAppearance')} · <EntityChipLink chip={view.firstAppearance} />
            </p>
          )
          : null}
        <HeroChips appearances={view.appearances} locale={locale} />
      </div>
      <HeroStats rows={stats} />
    </div>
  );
}

/**
 * Ordinal navigation: previous at the left edge of the stage, next at
 * the right edge. The view model already withheld any neighbour
 * beyond the reader's cursor, so nothing here can leak a title.
 */
function SequenceNav({ sequence }: { readonly sequence: SequenceView; }): ReactElement | null {
  const locale = useLocale();
  const search = useScopeSearch();
  if (sequence.prev === null && sequence.next === null) return null;
  const shell =
    'group flex max-w-[45%] items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ring-1 ring-line transition-colors duration-150 hover:bg-surface hover:ring-line-strong';
  return (
    <nav className='flex items-center justify-between gap-3'>
      {sequence.prev !== null
        ? (
          <Link
            to='/$type/$slug'
            params={{ type: sequence.prev.chip.type, slug: sequence.prev.chip.slug }}
            search={search}
            className={shell}
          >
            <span aria-hidden className='text-faint'>←</span>
            <span className='min-w-0'>
              <span className='label-xs block'>{t(locale, 'previous')}</span>
              <span className='block truncate font-semibold tabular-nums text-fg'>
                {sequence.prev.number}
                <span className='ml-1.5 hidden font-normal text-muted sm:inline'>
                  {sequence.prev.chip.name}
                </span>
              </span>
            </span>
          </Link>
        )
        : <span />}
      {sequence.next !== null
        ? (
          <Link
            to='/$type/$slug'
            params={{ type: sequence.next.chip.type, slug: sequence.next.chip.slug }}
            search={search}
            className={`${shell} text-right`}
          >
            <span className='min-w-0'>
              <span className='label-xs block'>{t(locale, 'next')}</span>
              <span className='block truncate font-semibold tabular-nums text-fg'>
                <span className='mr-1.5 hidden font-normal text-muted sm:inline'>
                  {sequence.next.chip.name}
                </span>
                {sequence.next.number}
              </span>
            </span>
            <span aria-hidden className='text-faint'>→</span>
          </Link>
        )
        : <span />}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Bands: how a layout arranges its modules.

/** Masonry that packs small modules instead of leaving a half-empty row. */
const PACK_CLASS =
  'columns-1 gap-x-9 sm:columns-2 xl:columns-3 [&>*]:mb-9 [&>*]:break-inside-avoid';
const MAIN_PACK_CLASS = 'columns-1 gap-x-9 lg:columns-2 [&>*]:mb-9 [&>*]:break-inside-avoid';

/**
 * Render a set of slots as one block, choosing the packing from how
 * much actually rendered: several modules flow into a balanced
 * masonry, a single one takes the whole width and uses its OWN
 * columns. That is what stops a lone section from sitting in a narrow
 * left column with the right half of the screen empty.
 */
function packed(
  slots: readonly SlotKey[],
  view: EntityView,
  packClass: string,
): ReactElement | null {
  const count = renderSlots(slots, view, false).length;
  if (count === 0) return null;
  const nodes = renderSlots(slots, view, count === 1);
  return <div className={count === 1 ? '' : packClass}>{nodes}</div>;
}

function Band(
  { band, view }: { readonly band: LayoutBand; readonly view: EntityView; },
): ReactElement | null {
  if (band.kind === 'full') {
    const nodes = renderSlots(band.slots, view, true);
    return nodes.length === 0 ? null : <div className='space-y-12'>{nodes}</div>;
  }
  if (band.kind === 'pack') return packed(band.slots, view, PACK_CLASS);
  if (band.kind === 'grid') return <GridBand cells={band.cells} view={view} />;
  const main = renderSlots(band.main, view, true);
  const aside = renderSlots(band.aside, view, false);
  if (main.length === 0 && aside.length === 0) return null;
  // A band with only one side has no split to make: whatever is there
  // takes the whole width — never a column of content beside an empty
  // half.
  if (main.length === 0) return packed(band.aside, view, PACK_CLASS);
  if (aside.length === 0) return packed(band.main, view, MAIN_PACK_CLASS);
  const asideFirst = band.side === 'start';
  return (
    <div
      className={`grid items-start gap-x-10 gap-y-12 ${
        asideFirst
          ? 'lg:grid-cols-[19rem_minmax(0,1fr)]'
          : 'lg:grid-cols-[minmax(0,1fr)_19rem]'
      }`}
    >
      <div className={`min-w-0 space-y-12 ${asideFirst ? 'lg:order-2' : ''}`}>{main}</div>
      <div className={`min-w-0 space-y-10 ${asideFirst ? 'lg:order-1' : ''}`}>{aside}</div>
    </div>
  );
}

/**
 * A `grid` band: the twelve-column plate of `design/v2`, panels
 * declaring their own span.
 *
 * Empty cells are dropped BEFORE the widths are applied, and the
 * remaining spans are then stretched to fill the row rather than
 * leaving a gap where the missing panel was — a sparse entity reads
 * as a shorter page of wider cards, never as a page with holes.
 * Below `lg` everything is one column: twelve columns of 100px are
 * not a layout.
 */
function GridBand(
  { cells, view }: { readonly cells: readonly GridCell[]; readonly view: EntityView; },
): ReactElement | null {
  const filled = cells
    .map((cell) => ({ cell, node: renderSlot(cell.slot, view, cell.span >= 6) }))
    .filter((entry): entry is { cell: GridCell; node: ReactElement; } => entry.node !== null);
  if (filled.length === 0) return null;
  const total = filled.reduce((sum, entry) => sum + entry.cell.span, 0);
  return (
    <div className='grid grid-cols-1 items-start gap-3 lg:grid-cols-12'>
      {filled.map(({ cell, node }) => {
        // One row's worth or less: stretch the SURVIVING spans back up
        // to twelve, so a dropped panel widens its neighbours instead
        // of leaving a hole. More than one row: keep what was authored
        // and let the grid wrap.
        const span = total > 0 && total <= 12
          ? Math.min(12, Math.max(2, Math.round((cell.span / total) * 12)))
          : cell.span;
        return (
          <div key={cell.slot} className={`panel min-w-0 ${SPAN_CLASS[span] ?? 'lg:col-span-12'}`}>
            {node}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Column spans as literal class names. Tailwind scans source text, so
 * a computed `lg:col-span-${n}` would never be generated — the
 * lookup is what makes the spans real.
 */
const SPAN_CLASS: Readonly<Record<number, string>> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12',
};

function renderSlots(
  slots: readonly SlotKey[],
  view: EntityView,
  wide: boolean,
): readonly ReactElement[] {
  const nodes: ReactElement[] = [];
  for (const slot of slots) {
    const node = renderSlot(slot, view, wide);
    if (node !== null) nodes.push(<div key={slot} className='panel'>{node}</div>);
  }
  return nodes;
}

/**
 * One module. Returns null when the entity has nothing for it, which
 * is what lets a layout name every slot without producing holes.
 * `wide` says the module got a full column and may use several of its
 * own.
 */
function renderSlot(slot: SlotKey, view: EntityView, wide: boolean): ReactNode {
  // One source of truth for "has this module anything to show"
  // (`lib/entity-sections.ts`) — the same predicate decides whether a
  // sub-page is offered, so a link can never promise a blank page.
  // The narrowing checks below are TypeScript's, not a second opinion.
  if (!slotHasContent(slot, view)) return null;
  switch (slot) {
    case 'sheet':
      return view.properties.length === 0 && view.infoboxRelations.length === 0
        ? null
        : <DataSheet view={view} wide={wide} />;
    case 'narrative':
      return view.narrative === null ? null : <NarrativeSection markdown={view.narrative} />;
    case 'affiliations':
      return view.template.kind === 'character' && view.template.crews.length > 0
        ? <CrewSections crews={view.template.crews} />
        : null;
    case 'members':
      if (view.template.kind === 'crew' && view.template.members.length > 0) {
        return <MemberGrid titleKey='members' members={view.template.members} />;
      }
      if (view.template.kind === 'devil-fruit' && view.template.users.length > 0) {
        return <MemberGrid titleKey='currentUsers' members={view.template.users} />;
      }
      return null;
    case 'former':
      if (view.template.kind === 'crew' && view.template.former.length > 0) {
        return <MemberGrid titleKey='formerMembers' members={view.template.former} former />;
      }
      if (view.template.kind === 'devil-fruit' && view.template.former.length > 0) {
        return <MemberGrid titleKey='formerUsers' members={view.template.former} former />;
      }
      return null;
    case 'contents':
      return view.template.kind === 'container' && view.template.groups.length > 0
        ? <ContentsSections groups={view.template.groups} wide={wide} />
        : null;
    case 'position':
      return view.template.kind === 'source' ? <PositionSections template={view.template} /> : null;
    case 'adaptations':
      return view.template.kind === 'source' && view.template.adaptations.length > 0
        ? <AdaptationsSection items={view.template.adaptations} />
        : null;
    case 'cast':
      return view.cast.length === 0 ? null : <CastSection groups={view.cast} />;
    case 'availability':
      return view.availability.length === 0
        ? null
        : <AvailabilitySection items={view.availability} />;
    case 'gallery':
      return view.gallery.length === 0
        ? null
        : <GallerySection images={view.gallery} slug={view.slug} type={view.type} />;
    case 'appearances':
      return view.appearances.length === 0
        ? null
        : <AppearancesSection groups={view.appearances} />;
    case 'connections':
      return view.relations.length === 0 ? null : <Connections view={view} wide={wide} />;
  }
}

// ---------------------------------------------------------------------------
// Shared building blocks

/** Section head: display title + count, over a hairline. */
function SectionHead(
  { children, count }: { readonly children: string; readonly count?: number; },
): ReactElement {
  return (
    // The plates title a panel with the SAME 9px annotation label they
    // use everywhere else — `FICHE`, `PORTEURS SUCCESSIFS`,
    // `CE QUI DEVIENT VRAI DANS CE CHAPITRE`. A 15px display heading
    // inside a 14px-padded card made the title compete with the data
    // it introduces.
    <h2 className='label-xs mb-3 flex items-baseline gap-2 border-b border-line pb-2'>
      {children}
      {count !== undefined
        ? <span className='tabular-nums text-faint/70'>{count}</span>
        : null}
    </h2>
  );
}

function NarrativeSection({ markdown }: { readonly markdown: string; }): ReactElement {
  const locale = useLocale();
  return (
    <section>
      <SectionHead>{t(locale, 'about')}</SectionHead>
      <div className='max-w-[64ch]'>
        <Markdown markdown={markdown} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The data sheet — EVERY property, each with its own history inline.

function DataSheet(
  { view, wide }: { readonly view: EntityView; readonly wide: boolean; },
): ReactElement {
  const locale = useLocale();
  return (
    <section>
      <SectionHead count={view.properties.length + view.infoboxRelations.length}>
        {t(locale, 'dataSheet')}
      </SectionHead>
      <dl
        className={`m-0 ${
          wide ? 'columns-1 gap-x-9 md:columns-2 xl:columns-3 [&>div]:break-inside-avoid' : ''
        }`}
      >
        {view.infoboxRelations.map((row) => <SheetRelationRow key={row.key} row={row} />)}
        {view.properties.map((property) => <SheetRow key={property.id} property={property} />)}
      </dl>
    </section>
  );
}

/**
 * One property: its label, its current value, and — when the value
 * changed over the story — the earlier states listed under it. The
 * history lives HERE, next to the property it belongs to.
 */
function SheetRow({ property }: { readonly property: PropertyView; }): ReactElement {
  const entries = property.entries;
  const latest = entries[entries.length - 1];
  // Du plus recent au plus ancien : la valeur vraie a la position du
  // lecteur est la reponse, l'historique l'explique. Dans l'autre sens
  // il fallait lire jusqu'en bas pour savoir ou on en est.
  const older = entries.slice(0, -1).reverse();
  return (
    <div className='border-t border-line py-2.5'>
      <dt className='label-xs'>{property.label}</dt>
      <dd className='m-0 mt-1 text-[13.5px] text-fg'>
        {older.length === 0
          ? (latest === undefined ? null : <PropertyEntry entry={latest} />)
          : (
            <ol className='timeline mt-1.5'>
              {latest === undefined ? null : (
                <li>
                  <PropertyEntry entry={latest} />
                </li>
              )}
              {older.map((entry) => (
                // Une valeur historisee EST son `since` : deux entrees
                // de la meme propriete ne peuvent pas commencer au
                // meme endroit avec la meme valeur.
                <li
                  key={`${entry.since?.id ?? ''}:${entry.display}`}
                  className='text-[12.5px] text-muted'
                >
                  <PropertyEntry entry={entry} past />
                </li>
              ))}
            </ol>
          )}
      </dd>
    </div>
  );
}

function SheetRelationRow({ row }: { readonly row: InfoboxRelationRowView; }): ReactElement {
  return (
    <div className='border-t border-line py-2.5'>
      <dt className='label-xs'>{row.label}</dt>
      <dd className='m-0 mt-1 space-y-0.5 text-[13.5px] font-semibold'>
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
// Connections — image-led link modules, packed, folded beyond ROW_LIMIT.

function Connections(
  { view, wide }: { readonly view: EntityView; readonly wide: boolean; },
): ReactElement {
  const groups = view.relations.toSorted((a, b) =>
    relationRank(a.key) - relationRank(b.key)
    || Number(a.inverse) - Number(b.inverse)
    || b.items.length - a.items.length
    || a.label.localeCompare(b.label)
  );
  // One group has no masonry to make: it spans, and ITS rows column
  // instead — the section fills the band either way.
  const masonry = wide && groups.length > 1;
  return (
    <div className={masonry ? 'columns-1 gap-x-9 md:columns-2 [&>section]:break-inside-avoid' : ''}>
      {groups.map((group) => (
        <section key={group.key} className={masonry ? 'mb-9' : 'mb-8 last:mb-0'}>
          <ConnectionGroup group={group} columns={wide && groups.length === 1} />
        </section>
      ))}
    </div>
  );
}

function ConnectionGroup(
  { group, columns }: { readonly group: RelationGroupView; readonly columns: boolean; },
): ReactElement {
  return (
    <>
      <SectionHead count={group.items.length}>{group.label}</SectionHead>
      <ShowMoreList
        limit={columns ? ROW_LIMIT * 3 : ROW_LIMIT}
        listClassName={`grid gap-x-8 ${columns ? rowColumns(group.items.length) : 'grid-cols-1'}`}
        items={group.items.map((item) => (
          // La cle est l'ARETE, pas la cible : la meme entite peut
          // revenir dans un groupe avec un autre intervalle — Nami
          // quitte l'equipage puis y revient.
          <ConnectionRow
            key={`${item.target.id}:${item.since?.id ?? ''}:${item.until?.id ?? ''}`}
            item={item}
          />
        ))}
      />
    </>
  );
}

/**
 * One connection module: thumb + name + precise sub-label (identity
 * line or type, qualifiers, period). The whole row is the link.
 */
function ConnectionRow({ item }: { readonly item: RelationItemView; }): ReactElement {
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
          type={item.target.type}
          slug={item.target.slug}
          name={item.target.name}
          ratio='square'
          className='size-10 rounded-[5px] ring-1 ring-line transition-shadow duration-150 group-hover:ring-tint/70'
        />
        <span className='min-w-0 flex-1'>
          <span
            title={item.target.name}
            className='block truncate text-[13.5px] font-semibold text-fg transition-colors duration-150 group-hover:text-link-hover'
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
): ReactElement {
  const locale = useLocale();
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
}): ReactElement {
  const locale = useLocale();
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
): ReactElement {
  const locale = useLocale();
  const role = [member.role, member.rank].filter((part) => part !== null).join(' · ');
  // `design/v2` Equipage.dc.html puts the ROLE on the portrait as a
  // badge and leaves the membership period its own line under the
  // name. One slot, one rule: the badge shows the STATUS when there
  // is one — « former » outranks « Captain », a reader needs to know
  // they left before they need to know what they did — and otherwise
  // the role. Whatever the badge does not take stays in the meta line,
  // so nothing is ever dropped.
  const status = former ? t(locale, 'formerTag') : null;
  const metaParts = [
    status !== null ? role : '',
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
      tag={status ?? (role === '' ? null : role)}
      stat={member.stat}
      dimmed={former}
    />
  );
}

// ---------------------------------------------------------------------------
// Containers (arc, saga, volume…) and a source's place inside one.

function ContentsSections(
  { groups, wide }: {
    readonly groups: readonly ContainerGroupView[];
    readonly wide: boolean;
  },
): ReactElement {
  return (
    <div className={wide && groups.length > 1 ? 'grid gap-9 xl:grid-cols-2' : 'space-y-9'}>
      {groups.map((group) => (
        <section key={`${group.relationKey}:${group.type}`}>
          <SectionHead count={group.items.length}>{group.typeLabel}</SectionHead>
          <ContentsList items={group.items} columns={wide && groups.length === 1} />
        </section>
      ))}
    </div>
  );
}

/** A long run of instalments is a numbered ledger; a short one is a
 *  list of titled entries, columned so it fills its band. */
const LEDGER_THRESHOLD = 20;

/**
 * Where the reader sits in an ordered list, for `ShowMoreList`'s
 * collapsed window. `undefined` when nothing is marked current — a
 * container page listing its own contents has no "you are here".
 */
function anchorOf(items: readonly SourceItemView[]): { anchorIndex: number; } | undefined {
  const index = items.findIndex((item) => item.current);
  return index === -1 ? undefined : { anchorIndex: index };
}

function ContentsList(
  { items, columns }: {
    readonly items: readonly SourceItemView[];
    readonly columns: boolean;
  },
): ReactElement {
  const search = useScopeSearch();
  if (items.length > LEDGER_THRESHOLD) return <NumberGrid items={items} />;
  return (
    <ShowMoreList
      limit={NUMBER_LIMIT}
      {...anchorOf(items)}
      listClassName={`grid gap-x-8 ${columns ? rowColumns(items.length) : 'grid-cols-1'}`}
      items={items.map((item) => (
        <li key={item.chip.id} className='border-b border-line'>
          <HoverPreview type={item.chip.type} slug={item.chip.slug}>
            <Link
              to='/$type/$slug'
              params={{ type: item.chip.type, slug: item.chip.slug }}
              search={search}
              aria-current={item.current ? 'page' : undefined}
              className='group flex items-baseline gap-3 py-2.5'
            >
              <span
                className={`display w-12 shrink-0 text-[15px] font-extrabold tabular-nums ${
                  item.current ? 'text-gold' : 'text-muted'
                }`}
              >
                {item.number ?? '·'}
              </span>
              <span className='min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg transition-colors duration-150 group-hover:text-link-hover'>
                {item.chip.name}
              </span>
            </Link>
          </HoverPreview>
        </li>
      ))}
    />
  );
}

/**
 * The ribbons a source sits in. `design/v2`'s Chapitre.dc.html shows
 * TWO — « PART OF ARC / WANO COUNTRY » and « POSITION DANS LE VOLUME
 * 103 » — because a chapter belongs to two orderings at once and a
 * reader thinks in both. Each renders only when the corpus knows it.
 */
function PositionSections(
  { template }: { readonly template: SourceTemplateView; },
): ReactElement | null {
  const parts = [template.arc, template.volume].filter((part) => part !== null);
  if (parts.length === 0) return null;
  return (
    <div className='space-y-3'>
      {parts.map((part) => <PositionSection key={part.chip.slug} arc={part} />)}
    </div>
  );
}

/** The episodes a source was adapted into — the plate's ADAPTATION ANIME. */
function AdaptationsSection(
  { items }: { readonly items: readonly SourceItemView[]; },
): ReactElement {
  const locale = useLocale();
  return (
    <section>
      <SectionHead count={items.length}>{t(locale, 'adaptations')}</SectionHead>
      <ContentsList items={items} columns={false} />
    </section>
  );
}

function PositionSection(
  { arc }: {
    readonly arc: {
      readonly chip: { readonly type: string; readonly slug: string; readonly name: string; };
      readonly label: string;
      readonly items: readonly SourceItemView[];
    };
  },
): ReactElement {
  return (
    <section>
      <div className='mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-line pb-2'>
        <span className='label-xs'>{arc.label}</span>
        <span className='display text-[15px] font-bold uppercase tracking-[0.04em]'>
          <Link
            to='/$type/$slug'
            params={{ type: arc.chip.type, slug: arc.chip.slug }}
            className='text-link transition-colors duration-150 hover:text-link-hover'
          >
            {arc.chip.name}
          </Link>
        </span>
      </div>
      {arc.items.length > 0
        ? (
          <ShowMoreList
            limit={NUMBER_LIMIT}
            {...anchorOf(arc.items)}
            listClassName='flex flex-wrap gap-1.5'
            items={arc.items.map((item) => <SourceNumberCell key={item.chip.id} item={item} />)}
          />
        )
        : null}
    </section>
  );
}

function SourceNumberCell({ item }: { readonly item: SourceItemView; }): ReactElement {
  const search = useScopeSearch();
  const label = item.number === null ? item.chip.name : String(item.number);
  if (item.current) {
    return (
      <li
        aria-current='page'
        className='grid min-w-10 place-items-center rounded-md bg-gold px-2 py-1.5 text-xs font-semibold tabular-nums text-canvas'
      >
        {label}
      </li>
    );
  }
  return (
    <li>
      <HoverPreview type={item.chip.type} slug={item.chip.slug}>
        <Link
          to='/$type/$slug'
          params={{ type: item.chip.type, slug: item.chip.slug }}
          search={search}
          title={item.chip.name}
          className='grid min-w-10 place-items-center rounded-md px-2 py-1.5 text-xs font-medium tabular-nums text-muted ring-1 ring-line transition-colors duration-150 hover:bg-surface hover:text-fg hover:ring-line-strong'
        >
          {label}
        </Link>
      </HoverPreview>
    </li>
  );
}

/** Ordered instalments as a dense plate grid — number over title. */
function NumberGrid({ items }: { readonly items: readonly SourceItemView[]; }): ReactElement {
  const search = useScopeSearch();
  return (
    <ShowMoreList
      limit={NUMBER_LIMIT}
      {...anchorOf(items)}
      listClassName='grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2'
      items={items.map((item) => (
        <li key={item.chip.id}>
          <HoverPreview type={item.chip.type} slug={item.chip.slug}>
            <Link
              to='/$type/$slug'
              params={{ type: item.chip.type, slug: item.chip.slug }}
              search={search}
              title={item.chip.name}
              className={`group block rounded-md p-2 ring-1 transition-[background-color,box-shadow] duration-150 hover:bg-surface ${
                item.current ? 'bg-surface ring-gold' : 'ring-line hover:ring-line-strong'
              }`}
            >
              <span className='display block text-base font-bold leading-tight tabular-nums text-fg transition-colors duration-150 group-hover:text-link-hover'>
                {item.number ?? '·'}
              </span>
              <span className='block truncate text-[10.5px] text-faint'>
                {item.chip.name}
              </span>
            </Link>
          </HoverPreview>
        </li>
      ))}
    />
  );
}

// ---------------------------------------------------------------------------
// Cast, availability, gallery, appearances

function CastSection({ groups }: { readonly groups: readonly CastGroupView[]; }): ReactElement {
  const locale = useLocale();
  return (
    <section>
      <SectionHead count={groups.reduce((sum, group) => sum + group.items.length, 0)}>
        {t(locale, 'cast')}
      </SectionHead>
      <div className='space-y-5'>
        {groups.map((group) => (
          <div key={group.type}>
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
        ))}
      </div>
    </section>
  );
}

function AvailabilitySection(
  { items }: { readonly items: readonly AvailabilityItemView[]; },
): ReactElement {
  const locale = useLocale();
  return (
    <section>
      <SectionHead>{t(locale, 'availability')}</SectionHead>
      <ul className='flex flex-wrap gap-2'>
        {items.map((item) => <AvailabilityItem key={item.platform.id} item={item} />)}
      </ul>
    </section>
  );
}

function AvailabilityItem({ item }: { readonly item: AvailabilityItemView; }): ReactElement {
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
        className='block rounded-md px-3 py-1.5 text-[13px] font-medium text-link ring-1 ring-line transition-colors duration-150 hover:bg-surface hover:text-link-hover hover:ring-line-strong'
      >
        {item.platform.name} ↗
      </a>
    </li>
  );
}

/**
 * Every other visible depiction of the entity — episode stills, extra
 * covers, plates. Renders only when such image entities are attached;
 * nothing is fabricated when they are not.
 */
function GallerySection(
  { images, type, slug }: {
    readonly images: readonly ImageView[];
    readonly type: string;
    readonly slug: string;
  },
): ReactElement {
  const locale = useLocale();
  return (
    <section>
      <SectionHead count={images.length}>{t(locale, 'gallery')}</SectionHead>
      <ul className='grid grid-cols-2 gap-2.5 min-[520px]:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]'>
        {images.map((image, index) => (
          <li key={image.url}>
            <EntityImage
              image={image}
              type={type}
              slug={`${slug}-still-${index}`}
              name={image.alt}
              ratio='wide'
              fit='native'
              className='w-full rounded-lg ring-1 ring-line'
            />
            {image.attribution !== null
              ? <p className='mt-1 truncate text-[10.5px] text-faint'>{image.attribution}</p>
              : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "Où apparaît-il" — how many of an ordered source type mention this
 * entity, out of how many the reader can currently see, plus the
 * browsable list. Renders only once such appearance edges exist in
 * the corpus.
 */
function AppearancesSection(
  { groups }: { readonly groups: readonly AppearanceGroupView[]; },
): ReactElement {
  const locale = useLocale();
  return (
    <section>
      <SectionHead>{t(locale, 'appearances')}</SectionHead>
      <SourceTabs
        groups={groups.map((group) => ({
          key: group.key,
          label: group.typeLabel,
          count: group.count,
          content: (
            <>
              <p className='text-xs text-faint'>
                <span className='tabular-nums'>{group.count}</span> {t(locale, 'outOf')}{' '}
                <span className='tabular-nums'>{group.total}</span> {group.typeLabel.toLowerCase()}
              </p>
              <div className='mt-2.5'>
                <ShowMoreList
                  limit={APPEARANCE_LIMIT}
                  listClassName='flex flex-col'
                  items={group.items.map((item) => <SourceRow key={item.chip.id} item={item} />)}
                />
              </div>
            </>
          ),
        }))}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared value rendering

function QualifierList(
  { qualifiers }: { readonly qualifiers: readonly LabelledValue[]; },
): ReactElement | null {
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
): ReactElement | null {
  if (epistemic === null) return null;
  return (
    <span className='rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted'>
      {epistemic.label}
    </span>
  );
}

/**
 * One value of one property. `past` marks a superseded state inside a
 * property's own timeline: same information, quieter voice.
 */
function PropertyEntry(
  { entry, past = false }: { readonly entry: PropertyEntryView; readonly past?: boolean; },
): ReactElement {
  const locale = useLocale();
  const details: ReactNode[] = [];
  if (entry.since !== null) {
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
  if (entry.event !== null) {
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
        : (
          <span
            className={`tabular-nums ${past ? 'text-muted' : 'font-semibold text-fg'}`}
          >
            {entry.display}
          </span>
        )}
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
      {details.length > 0 || entry.qualifiers.length > 0
        ? (
          <span className='inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[11.5px] text-faint'>
            {details}
            <QualifierList qualifiers={entry.qualifiers} />
          </span>
        )
        : null}
    </div>
  );
}
