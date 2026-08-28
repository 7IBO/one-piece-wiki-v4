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
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { fetchHome } from '../api';
import { Community, Contribute } from '../components/home/Bottom';
import { Crossed } from '../components/home/Crossed';
import { Explore } from '../components/home/Explore';
import { Hero } from '../components/home/Hero';
import { Releases } from '../components/home/Releases';

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
        <Releases items={view.releases} alone={view.crossed.length === 0} />
        <Explore groups={view.groups} />
        <Community />
        <Contribute total={view.totalEntities} groups={view.groups} />
      </div>
    </>
  );
}
