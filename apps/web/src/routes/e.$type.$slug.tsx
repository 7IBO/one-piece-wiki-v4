/**
 * `/e/<type>/<slug>` — the reading page for one entity: localized
 * name, resolved properties (schema labels + vocabulary labels +
 * epistemic axis), relations in BOTH directions (materialized inverse
 * rows, per-direction labels from the artifact — ADR-086), and the
 * narrative markdown when present.
 */
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { Fragment, type JSX } from 'react';
import {
  fetchEntity,
  type LabelledValue,
  type PropertyEntryView,
  type PropertyView,
  type RelationGroupView,
} from '../api';
import { EntityChipLink } from '../components/EntityChip';
import { t } from '../lib/chrome';
import { Markdown } from '../lib/markdown';
import { useLocale } from './__root';

export const Route = createFileRoute('/e/$type/$slug')({
  loader: async ({ context, params }) => {
    const view = await fetchEntity({
      data: { locale: context.locale, type: params.type, slug: params.slug },
    });
    if (view === null) throw notFound();
    return view;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? 'Entry'} — Grand Line Archives` }],
  }),
  component: EntityPage,
});

function EntityPage(): JSX.Element {
  const view = Route.useLoaderData();
  const locale = useLocale();
  const outgoing = view.relations.filter((group) => !group.inverse);
  const incoming = view.relations.filter((group) => group.inverse);
  return (
    <article className='mx-auto max-w-3xl'>
      <header className='mb-10'>
        <Link
          to='/t/$type'
          params={{ type: view.type }}
          className='font-mono text-[0.7rem] uppercase tracking-[0.2em] text-faint transition-colors hover:text-gold'
        >
          {view.typeLabel}
        </Link>
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

      {view.narrative !== null
        ? (
          <section className='mb-10'>
            <SectionTitle>{t(locale, 'about')}</SectionTitle>
            <Markdown markdown={view.narrative} />
          </section>
        )
        : null}

      {view.properties.length > 0
        ? (
          <section className='mb-10'>
            <SectionTitle>{t(locale, 'properties')}</SectionTitle>
            <dl className='overflow-hidden rounded-xl border border-line bg-panel'>
              {view.properties.map((property) => (
                <PropertyBlock key={property.id} property={property} />
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
    </article>
  );
}

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

function PropertyEntry({ entry }: { readonly entry: PropertyEntryView; }): JSX.Element {
  const locale = useLocale();
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
      <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-xs text-faint'>
        {entry.since !== null
          ? (
            <span>
              {t(locale, 'since')} <EntityChipLink chip={entry.since} />
            </span>
          )
          : null}
        {entry.until !== null
          ? (
            <span>
              {t(locale, 'until')} <EntityChipLink chip={entry.until} />
            </span>
          )
          : null}
        {entry.event !== null
          ? (
            <span>
              {t(locale, 'during')} <EntityChipLink chip={entry.event} />
            </span>
          )
          : null}
        {entry.actualDisplay !== null
          ? (
            <span className='text-gold/90'>
              {t(locale, 'actually')} : {entry.actualDisplay}
            </span>
          )
          : null}
        <QualifierList qualifiers={entry.qualifiers} />
      </div>
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
            <QualifierList qualifiers={item.qualifiers} />
          </li>
        ))}
      </ul>
    </div>
  );
}
