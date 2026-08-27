/**
 * Home — `design/v2/Accueil.dc.html`, reproduced.
 *
 * The earlier version of this file was NOT that plate. It respected
 * the spoiler rules and invented its own layout: a bordered panel
 * inside the 1200px reading column, all-caps display headings, two
 * full-width axis bars, a five-column plate wall. The plate is a
 * FULL-BLEED 380px hero over a layered colour field, a 320px reading
 * card floating at its right, then a 12-column grid — 8/4 for
 * « ce que tu viens de croiser » beside the releases, 12 for the
 * explore row, 5/7 for the community and the contribution panel.
 * Every measure below comes from the plate.
 *
 * ## Two states
 *
 * A reader who has declared nothing is PROTECTED, not exposed:
 * `isSourceVisible` answers true for an axis with no cursor, which is
 * right for "this value carries no `since`" and wrong for a landing
 * page. The unset hero keeps the plate's geometry exactly and swaps
 * its content for the ask; the release rows keep their dates and
 * withhold every title.
 *
 * ## The counting rule
 *
 * "5 members hidden by your progression" is itself a spoiler. Never
 * count what is withheld. But "chapter 1044 of 1145" is not — the
 * existence and numbering of published works is public. Counting
 * WORKS is safe; counting FACTS ABOUT THEM is not.
 *
 * ## Where this plate is not followed, and why
 *
 * The community panel's three forum rows are absent. Forum and quiz
 * exist in the plate and in nothing else — no entity type, no schema,
 * no ADR — and putting invented thread titles on screen is the one
 * thing this project cannot afford. The block keeps its column span,
 * its panel, its "Bientôt" chip and its footnote; only fabricated
 * rows are missing.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { type CSSProperties, type ReactElement } from 'react';
import {
  type AxisView,
  type CrossedView,
  fetchHome,
  type ProgressCursor,
  type ReleaseView,
  type TypeGroup,
} from '../api';
import { EntityImage } from '../components/EntityImage';
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
    <>
      <Hero
        axes={reading?.axes ?? []}
        primary={reading?.primary ?? null}
        cursor={view.cursor}
      />
      {/* The plate's body: 12 columns, 12px gutters, 26/40/44 padding. */}
      <div className='mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-3 px-5 pb-11 pt-6.5 lg:grid-cols-12 lg:px-10'>
        <Crossed items={view.crossed} span={view.crossedSpan} />
        <Releases items={view.releases} />
        <Explore groups={view.groups} />
        <Community />
        <Contribute total={view.totalEntities} groups={view.groups} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Hero — full bleed, 380px, a layered colour field under a scrim

/**
 * The plate's background is four stacked layers, not one gradient:
 * a warm diagonal at 30%, a teal disc bleeding off the top-left, a
 * soft gold rectangle right of centre, then a vertical scrim that
 * lands the whole thing on the canvas colour. Reproduced exactly —
 * this field is what makes the page read as a cover rather than as a
 * dark admin panel, and it was the single biggest thing the earlier
 * version dropped.
 */
function HeroField(): ReactElement {
  return (
    <div aria-hidden className='absolute inset-0 overflow-hidden'>
      <div
        className='absolute inset-0 opacity-30'
        style={{
          background:
            'linear-gradient(100deg, #101a2e 0%, #1d3a5c 34%, #3f6f8f 62%, #c98a4a 88%, #e8b45c 100%)',
        }}
      />
      <div
        className='absolute left-30 -top-15 size-115 rounded-full opacity-28'
        style={{ background: '#2f6b7a' }}
      />
      <div
        className='absolute right-55 top-10 h-75 w-65 opacity-13'
        style={{ background: '#e8b45c' }}
      />
      <div
        className='absolute inset-0'
        style={{
          background:
            'linear-gradient(180deg, rgba(10,11,14,0.5) 0%, rgba(10,11,14,0.18) 40%, #0a0b0e 100%)',
        }}
      />
    </div>
  );
}

function Hero(
  { axes, primary, cursor }: {
    readonly axes: readonly AxisView[];
    readonly primary: AxisView | null;
    readonly cursor: ProgressCursor;
  },
): ReactElement {
  const locale = useLocale();
  const reading = axes.length > 0;
  return (
    <section className='relative overflow-hidden border-b border-line lg:h-95'>
      <HeroField />
      <div className='relative mx-auto flex h-full w-full max-w-[1440px] flex-col items-start justify-end gap-10 px-5 pb-14 pt-10 lg:flex-row lg:items-end lg:justify-between lg:px-10'>
        <div className='max-w-160'>
          <p className='label-xs text-muted'>
            {reading && primary !== null
              ? `${t(locale, 'homeAt')} ${primary.label} ${primary.at}`
              : t(locale, 'tagline')}
          </p>
          <h1 className='display mt-2.5 text-[clamp(1.9rem,3.6vw,2.875rem)] font-black leading-[1.04] tracking-[-0.035em] text-fg'>
            {t(locale, reading ? 'homeResumeTitle' : 'homeNoProgressTitle')}
          </h1>
          <p className='mt-3 max-w-160 text-[15px] leading-relaxed text-[color:var(--color-muted)]'>
            {t(locale, reading ? 'homeResumeBody' : 'homeNoProgressBody')}
          </p>
          <div className='mt-5 flex flex-wrap items-center gap-2.5'>
            {primary?.next !== null && primary?.next !== undefined && (
              <Link
                to='/$type/$slug'
                params={{ type: primary.sourceType, slug: primary.next.slug }}
                className='rounded-md bg-gold px-5 py-2.5 text-[13.5px] font-semibold text-canvas no-underline transition-opacity duration-150 hover:opacity-90'
              >
                {t(locale, 'homeContinue')} {primary.label.toLowerCase()} {primary.next.number}
              </Link>
            )}
            <ProgressControl progress={cursor} variant='button' />
          </div>
        </div>
        {reading && <ReadingCard axes={axes} primary={primary} />}
      </div>
    </section>
  );
}

/** « Ta lecture » — 320px, one row per axis, one bar for the primary. */
function ReadingCard(
  { axes, primary }: { readonly axes: readonly AxisView[]; readonly primary: AxisView | null; },
): ReactElement {
  const locale = useLocale();
  const pct = primary === null || primary.total === 0
    ? 0
    : Math.min(100, Math.round((primary.at / Math.max(primary.total, primary.at)) * 100));
  return (
    <div className='w-full shrink-0 rounded-md border border-line bg-surface/85 px-4 py-3.5 backdrop-blur-sm lg:w-80'>
      <p className='label-xs text-muted'>{t(locale, 'homeReading')}</p>
      <dl className='mt-2.5'>
        {axes.map((axis, i) => (
          <div
            key={axis.sourceType}
            className={`flex items-baseline justify-between gap-3 py-2 text-[13px] ${
              i === axes.length - 1 ? '' : 'border-b border-[color:#191c23]'
            }`}
          >
            <dt className='text-[color:var(--color-muted)]'>{axis.label}</dt>
            <dd className='m-0 tabular-nums text-fg'>
              {axis.at}
              {
                /* The denominator is the CORPUS, and the corpus can lag
                behind a reader who has read further than we have
                imported. `1044 / 602` is nonsense on screen, so the
                floor is the reader's own position. */
              }
              <span className='text-muted'>{' / '}{Math.max(axis.total, axis.at)}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className='mt-3 h-1 overflow-hidden rounded-sm bg-line'>
        <div className='h-full rounded-sm bg-gold' style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// « Ce que tu viens de croiser » — span 8, six 3:4 tiles

function SectionTitle({ children }: { readonly children: React.ReactNode; }): ReactElement {
  return (
    <h2 className='display text-[18px] font-extrabold tracking-[-0.02em] text-fg'>{children}</h2>
  );
}

function Crossed(
  { items, span }: {
    readonly items: readonly CrossedView[];
    readonly span: { readonly from: number; readonly to: number; } | null;
  },
): ReactElement | null {
  const locale = useLocale();
  if (items.length === 0) return null;
  return (
    <section className='lg:col-span-8'>
      <div className='flex items-baseline justify-between gap-4'>
        <SectionTitle>{t(locale, 'homeCrossed')}</SectionTitle>
        {span !== null && (
          <span className='text-[11.5px] tabular-nums text-muted'>
            {items[0]?.typeLabel.toLowerCase()} {span.from}–{span.to}
          </span>
        )}
      </div>
      <ul className='mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6'>
        {items.map((item) => (
          <li key={`${item.sourceType}/${item.slug}`}>
            <Link
              to='/$type/$slug'
              params={{ type: item.sourceType, slug: item.slug }}
              className='group block no-underline'
            >
              <span className='block overflow-hidden rounded-[5px]'>
                <EntityImage
                  image={item.image}
                  type={item.sourceType}
                  slug={item.slug}
                  name={item.title ?? String(item.number)}
                  ratio='portrait'
                  className='w-full transition-transform duration-500 ease-out group-hover:scale-[1.05]'
                />
              </span>
              <span className='mt-1.5 block truncate text-[12.5px] font-semibold text-fg'>
                {item.title ?? `${item.typeLabel} ${item.number}`}
              </span>
              <span className='block truncate text-[10.5px] text-muted'>
                {item.typeLabel} {item.number}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// « Dernières sorties » — span 4, a panel of rows with a title switch

function Releases({ items }: { readonly items: readonly ReleaseView[]; }): ReactElement | null {
  const locale = useLocale();
  if (items.length === 0) return null;
  return (
    <section className='lg:col-span-4'>
      <div className='flex items-baseline justify-between gap-4'>
        <SectionTitle>{t(locale, 'homeReleases')}</SectionTitle>
      </div>
      <div className='mt-3.5 rounded-md border border-line bg-surface px-4 py-3.5'>
        {items.map((item, i) => (
          <div
            key={`${item.sourceType}/${item.slug}`}
            // A narrow column cannot hold « Manga chapter 1044 ·
            // March 7, 2022 » AND its title on one line, and clipping
            // the title is the worst of the three outcomes: the number
            // is already on the left. So the row WRAPS and the title
            // takes the second line rather than losing its end.
            className={`flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-[13px] ${
              i === items.length - 1 ? '' : 'border-b border-[color:#191c23]'
            }`}
          >
            <Link
              to='/$type/$slug'
              params={{ type: item.sourceType, slug: item.slug }}
              className='min-w-0 truncate no-underline'
            >
              <span className='font-semibold tabular-nums text-fg'>
                {item.typeLabel} {item.number}
              </span>
              {item.releasedAt !== null && (
                <span className='text-[color:var(--color-muted)]'>{' · '}{item.releasedAt}</span>
              )}
            </Link>
            {item.title === null
              ? (
                <span className='shrink-0 rounded-[3px] border border-line-strong px-2.5 py-1 text-[11px] text-[color:var(--color-muted)]'>
                  {t(locale, 'homeTitleHidden')}
                </span>
              )
              : <span className='min-w-0 shrink text-fg sm:text-right'>{item.title}</span>}
          </div>
        ))}
        <p className='mt-3 border-t border-[color:#191c23] pt-2.75 text-[11.5px] leading-relaxed text-muted'>
          {t(locale, 'homeReleasesNote')}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// « Explorer l'univers » — span 12, one row of 4:3 tiles, count BELOW

function Explore({ groups }: { readonly groups: readonly TypeGroup[]; }): ReactElement {
  const locale = useLocale();
  const types = groups.flatMap((g) => g.types);
  return (
    <section className='mt-3.5 lg:col-span-12'>
      <SectionTitle>{t(locale, 'homeExplore')}</SectionTitle>
      <ul className='mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8'>
        {types.map((type) => <TypeTile key={type.id} type={type} />)}
      </ul>
    </section>
  );
}

/**
 * The label sits INSIDE the tile, bottom-left; the count sits BELOW
 * it, outside, in muted tabular figures. The earlier version put both
 * inside under a gradient scrim, which is a different object.
 */
function TypeTile({ type }: { readonly type: TypeGroup['types'][number]; }): ReactElement {
  const seed = `${type.id}:index`;
  const tint = entityTint(seed);
  return (
    <li style={tint.vars as CSSProperties}>
      <Link
        to='/$type'
        params={{ type: type.id }}
        className='group block no-underline'
      >
        <span className='motion-lift relative block overflow-hidden rounded-md ring-1 ring-line transition-shadow hover:ring-[color:var(--tint-accent)]'>
          <EntityImage
            image={null}
            type={type.id}
            slug='index'
            name={type.label}
            ratio='wide'
            className='w-full transition-transform duration-500 ease-out group-hover:scale-[1.06]'
          />
          <span
            aria-hidden
            className='absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent'
          />
          <span className='absolute bottom-2.5 left-2.75 right-2.5 line-clamp-2 text-[13.5px] font-bold leading-tight text-white'>
            {type.label}
          </span>
        </span>
        <span className='mt-1.25 block text-[11px] tabular-nums text-muted'>{type.count}</span>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Bottom row — community (span 5) beside the contribution panel (span 7)

function Community(): ReactElement {
  const locale = useLocale();
  return (
    <section className='mt-3.5 lg:col-span-5'>
      <div className='flex items-baseline justify-between gap-4'>
        <SectionTitle>{t(locale, 'homeCommunity')}</SectionTitle>
        <span className='rounded-[3px] border border-line-strong px-2.5 py-1 text-[11px] text-[color:var(--color-muted)]'>
          {t(locale, 'homeSoon')}
        </span>
      </div>
      <div className='mt-3.5 rounded-md border border-line bg-surface px-4 py-3.5'>
        {
          /* The plate lists three forum threads here. They do not exist
          — no entity type, no schema, no ADR — and rendering invented
          titles is the one thing this project cannot afford. The block
          keeps its geometry; the fabricated rows are what is missing. */
        }
        <p className='text-[11.5px] leading-relaxed text-muted'>
          {t(locale, 'homeCommunityNote')}
        </p>
      </div>
    </section>
  );
}

function Contribute(
  { total, groups }: { readonly total: number; readonly groups: readonly TypeGroup[]; },
): ReactElement {
  const locale = useLocale();
  // Real counts only. The plate showed « Sources citées 9 411 » and
  // « À compléter 318 »; neither is computed anywhere yet, so the two
  // largest populations take those rows rather than a made-up figure.
  const biggest = groups
    .flatMap((g) => g.types)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);
  return (
    <section className='mt-3.5 lg:col-span-7'>
      <SectionTitle>{t(locale, 'homeContribute')}</SectionTitle>
      <div className='mt-3.5 rounded-md border border-line bg-surface px-4 py-3.5'>
        <div className='flex flex-col gap-6.5 lg:flex-row'>
          <div className='min-w-0 flex-1'>
            <p className='text-[13.5px] leading-[1.7] text-[color:var(--color-muted)]'>
              {t(locale, 'homeContributeBody')}
            </p>
            <div className='mt-3.75 flex flex-wrap gap-2.25'>
              <a
                href='https://github.com/7IBO/one-piece-wiki-v4'
                className='rounded-[5px] bg-gold px-4.25 py-2.25 text-[13px] font-semibold text-canvas no-underline transition-opacity duration-150 hover:opacity-90'
              >
                {t(locale, 'contributeEdit')}
              </a>
              <Link
                to='/search'
                search={{ q: '' }}
                className='rounded-[5px] border border-line-strong px-4.25 py-2.25 text-[13px] font-semibold text-fg no-underline transition-colors duration-150 hover:border-gold/45'
              >
                {t(locale, 'searchLabel')}
              </Link>
            </div>
          </div>
          <dl className='w-full shrink-0 lg:w-47.5'>
            <Stat label={t(locale, 'entitiesIndexed')} value={total} last={biggest.length === 0} />
            {biggest.map((type, i) => (
              <Stat
                key={type.id}
                label={type.label}
                value={type.count}
                last={i === biggest.length - 1}
              />
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function Stat(
  { label, value, last }: {
    readonly label: string;
    readonly value: number;
    readonly last: boolean;
  },
): ReactElement {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2 text-[13px] ${
        last ? '' : 'border-b border-[color:#191c23]'
      }`}
    >
      <dt className='truncate text-[color:var(--color-muted)]'>{label}</dt>
      <dd className='m-0 tabular-nums text-fg'>{value}</dd>
    </div>
  );
}
