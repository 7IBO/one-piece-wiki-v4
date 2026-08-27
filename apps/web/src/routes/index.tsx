/**
 * Home — the entry to the universe, in TWO states.
 *
 * ## Without a declared progression: protect first, invite second
 *
 * A reader who has told this wiki nothing is PROTECTED, not exposed.
 * That is not how the gate behaves by default: `isSourceVisible`
 * answers true for an axis with no cursor, which is right for "this
 * value carries no `since`" and wrong for a landing page, where it
 * would hand out every chapter title to someone who never said where
 * they are.
 *
 * So the unset state states only what a bookshop shelf states — the
 * newest chapter and episode EXIST, and their numbers — withholds
 * every title, offers the wiki by type, and asks for the progression.
 * The ask is the point of the page in that state.
 *
 * ## With one: lead with the reader
 *
 * Where they are, how far the axis runs, and the way back in. Release
 * titles appear up to their position and stop there.
 *
 * ## The counting rule, which is subtler than it looks
 *
 * "5 members hidden by your progression" is itself a spoiler: it
 * reveals that five more members exist. Never count what is withheld.
 * But "chapter 1044 of 1145" is not a spoiler — the existence and
 * numbering of published chapters is public, and the denominator is
 * the corpus, not a tally of secrets. The distinction is between
 * counting WORKS (public) and counting FACTS ABOUT THEM (not).
 *
 * Nothing here hardcodes an axis: `reading.axes` comes from
 * `CURSOR_AXES`, so a third one appears the day it is declared.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { type CSSProperties, type ReactElement } from 'react';
import { type AxisView, fetchHome, type ReleaseView, type TypeGroup } from '../api';
import { EntityArt } from '../components/EntityArt';
import { ProgressControl } from '../components/ProgressControl';
import { t } from '../lib/chrome';
import { entityTint } from '../lib/entity-tint';
import { useLocale } from './__root';

export const Route = createFileRoute('/')({
  loader: ({ context }) => fetchHome({ data: { locale: context.locale } }),
  component: HomePage,
});

function HomePage(): ReactElement {
  const view = Route.useLoaderData();
  const reading = view.reading;
  return (
    <div className='page-column pt-8 sm:pt-10'>
      {reading === null
        ? <UnsetHero cursor={view.cursor} />
        : <ReadingHero axes={reading.axes} primary={reading.primary} cursor={view.cursor} />}
      {view.releases.length > 0 && <Releases items={view.releases} />}
      <ExploreWall groups={view.groups} total={view.totalEntities} />
      <Community />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero — the two states

/**
 * No progression declared. The page's job here is the ASK, so it leads
 * with the promise rather than with a wall of types.
 */
function UnsetHero(
  { cursor }: { readonly cursor: { manga: number | null; anime: number | null; }; },
): ReactElement {
  const locale = useLocale();
  return (
    <header className='panel mb-8 p-6 sm:p-8'>
      <p className='label-xs text-gold'>{t(locale, 'tagline')}</p>
      <h1 className='display mt-2 max-w-[18ch] text-[clamp(1.9rem,5.2vw,3.2rem)] font-extrabold uppercase leading-[0.98] text-fg'>
        {t(locale, 'homeNoProgressTitle')}
      </h1>
      <p className='mt-4 max-w-[62ch] text-[15px] leading-relaxed text-muted'>
        {t(locale, 'homeNoProgressBody')}
      </p>
      <div className='mt-5'>
        <ProgressControl progress={cursor} />
      </div>
    </header>
  );
}

/** A progression is set: lead with the reader's own position. */
function ReadingHero(
  { axes, primary, cursor }: {
    readonly axes: readonly AxisView[];
    readonly primary: AxisView | null;
    readonly cursor: { manga: number | null; anime: number | null; };
  },
): ReactElement {
  const locale = useLocale();
  return (
    <header className='panel mb-8 p-6 sm:p-8'>
      <p className='label-xs text-gold'>
        {axes.map((a) => `${a.label} ${a.at}`).join(' · ')}
      </p>
      <h1 className='display mt-2 max-w-[18ch] text-[clamp(1.9rem,5.2vw,3.2rem)] font-extrabold uppercase leading-[0.98] text-fg'>
        {t(locale, 'homeResumeTitle')}
      </h1>
      <p className='mt-4 max-w-[62ch] text-[15px] leading-relaxed text-muted'>
        {t(locale, 'homeResumeBody')}
      </p>
      <div className='mt-5 flex flex-wrap items-center gap-3'>
        {primary?.next !== null && primary?.next !== undefined && (
          <Link
            to='/$type/$slug'
            params={{ type: primary.sourceType, slug: primary.next.slug }}
            className='rounded-md bg-gold px-3.5 py-2 text-[13px] font-semibold text-canvas transition-opacity duration-150 hover:opacity-90'
          >
            {t(locale, 'homeContinue')} — {primary.label} {primary.next.number}
          </Link>
        )}
        <ProgressControl progress={cursor} />
      </div>
      <dl className='mt-6 grid gap-3 sm:grid-cols-2'>
        {axes.map((axis) => <AxisBar key={axis.sourceType} axis={axis} />)}
      </dl>
    </header>
  );
}

/**
 * One axis as a bar. The denominator counts WORKS THAT EXIST, which is
 * public knowledge — never a count of facts withheld from this reader.
 */
function AxisBar({ axis }: { readonly axis: AxisView; }): ReactElement {
  const pct = axis.total === 0 ? 0 : Math.min(100, Math.round((axis.at / axis.total) * 100));
  return (
    <div className='rounded-md border border-line px-3.5 py-3'>
      <div className='flex items-baseline justify-between gap-3'>
        <dt className='label-xs text-muted'>{axis.label}</dt>
        <dd className='m-0 text-[13.5px] font-semibold tabular-nums text-fg'>
          <span className='text-gold'>{axis.at}</span>
          <span className='text-muted'>{' / '}{axis.total}</span>
        </dd>
      </div>
      <div className='mt-2 h-1 overflow-hidden rounded-full bg-surface'>
        <div className='h-full rounded-full bg-gold' style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Releases

/**
 * The newest works. Ordered by ordinal, which for a serialised work IS
 * release order — and unlike the date it is always known (only 10 of
 * 406 chapters and none of the episodes carry `released_at`).
 */
function Releases({ items }: { readonly items: readonly ReleaseView[]; }): ReactElement {
  const locale = useLocale();
  return (
    <section className='panel mb-8 p-5 sm:p-6'>
      <h2 className='label-xs text-muted'>{t(locale, 'homeReleases')}</h2>
      <ul className='mt-3 space-y-0.5'>
        {items.map((item) => (
          <li key={`${item.sourceType}/${item.slug}`}>
            <Link
              to='/$type/$slug'
              params={{ type: item.sourceType, slug: item.slug }}
              className='flex items-baseline gap-3 rounded-md px-2 py-2 no-underline transition-colors duration-150 hover:bg-surface'
            >
              <span className='shrink-0 text-[13.5px] font-semibold tabular-nums text-gold'>
                {item.typeLabel} {item.number}
              </span>
              {item.releasedAt !== null && (
                <span className='shrink-0 text-[12.5px] tabular-nums text-muted'>
                  · {item.releasedAt}
                </span>
              )}
              <span
                className={`truncate text-[13.5px] ${
                  item.title === null ? 'italic text-muted/70' : 'text-fg'
                }`}
              >
                {item.title ?? t(locale, 'homeTitleHidden')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className='mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted'>
        {t(locale, 'homeReleasesNote')}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Explore — the wall that used to be the whole page

/**
 * Every entity type as an art plate carrying its own generated
 * composition (the type id seeds both the grammar and the colour
 * chord), the schema group as its overline, and its population.
 *
 * ONE dense wall rather than a section per group: the groups come from
 * the schema (`ui_hint.group`) and most hold a single type, so a grid
 * per group would leave three quarters of every row empty. Nothing
 * here knows a type id.
 */
function ExploreWall(
  { groups, total }: { readonly groups: readonly TypeGroup[]; readonly total: number; },
): ReactElement {
  const locale = useLocale();
  const plates = groups.flatMap((group) => group.types.map((type) => ({ group: group.id, type })));
  return (
    <section className='mb-8'>
      <div className='mb-4 flex items-baseline justify-between gap-4'>
        <h2 className='display text-[clamp(1.2rem,2.6vw,1.6rem)] font-extrabold uppercase leading-none text-fg'>
          {t(locale, 'homeExplore')}
        </h2>
        <p className='text-[12.5px] text-muted'>
          <span className='font-semibold tabular-nums text-gold'>{total}</span>{' '}
          {t(locale, 'entitiesIndexed')}
        </p>
      </div>
      <ul className='grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
        {plates.map(({ group, type }) => <TypePlate key={type.id} group={group} type={type} />)}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Community

/**
 * A reserved place, not invented content. Forum and news exist in the
 * maquettes and in nothing else — no entity type, no schema, no ADR —
 * so this block says what it will be and shows no fabricated threads.
 * Inventing them here would be the one thing this project cannot
 * afford: data on screen that no source backs.
 */
function Community(): ReactElement {
  const locale = useLocale();
  return (
    <section className='panel mb-10 p-5 sm:p-6'>
      <div className='flex items-baseline justify-between gap-4'>
        <h2 className='label-xs text-muted'>{t(locale, 'homeCommunity')}</h2>
        <span className='rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted'>
          {t(locale, 'homeSoon')}
        </span>
      </div>
      <p className='mt-3 max-w-[62ch] text-[12.5px] leading-relaxed text-muted'>
        {t(locale, 'homeCommunityNote')}
      </p>
    </section>
  );
}

function TypePlate(
  { group, type }: {
    readonly group: string;
    readonly type: TypeGroup['types'][number];
  },
): ReactElement {
  // The type's OWN id seeds its plate, so every plate on the page is a
  // different colour and a different visual family.
  const seed = `${type.id}:index`;
  const tint = entityTint(seed);
  return (
    <li style={tint.vars as CSSProperties}>
      <Link
        to='/$type'
        params={{ type: type.id }}
        className='motion-lift group relative block aspect-4/3 overflow-hidden rounded-lg ring-1 ring-line-strong transition-shadow hover:ring-2 hover:ring-[color:var(--tint-accent)]'
      >
        <EntityArt
          entityId={seed}
          entityType={type.id}
          ratio='wide'
          initial={type.label.slice(0, 1).toUpperCase()}
          className='absolute inset-0 size-full transition-transform duration-500 ease-out group-hover:scale-[1.07]'
        />
        <span
          aria-hidden
          className='absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-canvas via-canvas/70 to-transparent'
        />
        <span className='absolute inset-x-0 bottom-0 block p-3'>
          <span className='label-xs block truncate text-fg/55'>{group.replace(/-/g, ' ')}</span>
          <span className='flex items-end justify-between gap-2'>
            <span className='display min-w-0 truncate text-[15px] font-extrabold uppercase leading-tight text-fg transition-colors duration-150 group-hover:text-[color:var(--tint-accent)]'>
              {type.label}
            </span>
            <span className='display shrink-0 text-[13px] font-extrabold tabular-nums text-gold'>
              {type.count}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
