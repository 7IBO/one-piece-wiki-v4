/**
 * `/<type>/<slug>/<section>` — one SUB-PAGE of an entity (ADR-110).
 *
 * The maintainer asked for tabs to stop pages growing without bound;
 * the answer is sub-pages at real URLs, because « Visiteur Google » is
 * a named audience (VISION.md § 3) and a tab is not a destination —
 * it cannot be indexed, linked, shared, or opened in a new tab. The
 * reasoning, and the options weighed against it, are in ADR-110.
 *
 * There is almost nothing here on purpose. The page is the SAME
 * article component as the overview (`$type_.$slug.tsx`), rendered
 * with the section's slots instead of the overview's: the per-type
 * layout registry (ADR-106) is authored once and sliced, never forked.
 * All spoiler and scope logic still ran server-side; a section is a
 * presentation split and touches no view model.
 *
 * Degradation, in three steps:
 * - a type that authors no sections has no sub-page URLs at all, and
 *   its single page holds every module, exactly as before;
 * - a section id the type does not declare is a genuine 404 (the URL
 *   names nothing);
 * - a declared section whose modules are empty for THIS entity still
 *   resolves — it is part of the page, not a claim about what exists —
 *   and says so instead of pretending.
 *
 * File name: the two trailing underscores un-nest this route from both
 * `/$type` and `/$type/$slug` (TanStack convention); the resolved path
 * is `/$type/$slug/$section`.
 */
import { createFileRoute, notFound } from '@tanstack/react-router';
import type { JSX } from 'react';
import { fetchEntity } from '../api';
import { ScopeContext } from '../components/EntityChip';
import { t } from '../lib/chrome';
import { sectionById } from '../lib/entity-sections';
import { validateScopeSearch } from '../lib/scope';
import { EntityArticle, GatedScreen } from './$type_.$slug';

export const Route = createFileRoute('/$type_/$slug_/$section')({
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
    // The section is validated against the entity's REAL type, which
    // only the view model knows (the URL segment could be an alias).
    const section = view.kind === 'gated' ? null : sectionById(view.type, params.section);
    if (view.kind !== 'gated' && section === null) throw notFound();
    return {
      view,
      sectionId: section?.id ?? null,
      // Resolved here rather than in `head`, which has no locale: a
      // sub-page that shares its `<title>` with the overview is a
      // duplicate in an index, and being indexable is why sub-pages
      // won over tabs in the first place (ADR-110).
      sectionLabel: section === null ? null : t(context.locale, section.labelKey),
    };
  },
  head: ({ loaderData }) => ({
    meta: [{
      title: [
        loaderData?.view.name ?? 'Entry',
        loaderData?.sectionLabel,
        'One Piece Wiki',
      ].filter((part) => part !== null && part !== undefined).join(' — '),
    }],
  }),
  component: EntitySectionPage,
});

function EntitySectionPage(): JSX.Element {
  const { view, sectionId } = Route.useLoaderData();
  // A gated entity withholds everything, sub-page or not: the reader
  // gets the same "not yet in your progression" screen as on the
  // overview, never a section of a page they cannot see.
  if (view.kind === 'gated') return <GatedScreen view={view} />;
  return (
    <ScopeContext.Provider value={view.propagateScope}>
      <EntityArticle
        view={view}
        section={sectionId === null ? null : sectionById(view.type, sectionId)}
      />
    </ScopeContext.Provider>
  );
}
