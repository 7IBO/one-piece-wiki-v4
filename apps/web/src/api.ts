/**
 * Server functions — the ONLY data entry points of the public app.
 * During SSR they run in-process; on client navigation they become
 * GET requests handled by TanStack Start. The heavy lifting (SQLite
 * reads, label resolution, spoiler gating) lives in `../server/*`;
 * the server-fn compiler strips those imports from the browser bundle
 * (same mechanism the dashboard's `__root.tsx` relies on).
 *
 * The spoiler cursor is read HERE, from the `web_progress` cookie, on
 * every call — both SSR and client-navigation requests carry cookies,
 * so the rendered output is already filtered server-side and no
 * spoiler ever flashes on the client.
 */
import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import { parseProgressCookie, type ProgressCursor } from '../server/progress';
import { buildSearchView } from '../server/search';
import { buildEntityView, buildHomeView, buildTypeListView } from '../server/views';
import type { Locale } from './lib/chrome';
import { SCOPE_PATTERN } from './lib/scope';

export type { SearchResultView, SearchView } from '../server/search';
export type {
  AppearanceGroupView,
  AvailabilityItemView,
  CastGroupView,
  ContainerGroupView,
  CrewSectionView,
  EntityChip,
  EntityListItem,
  EntityPageView,
  EntityView,
  FacetOptionView,
  FacetView,
  GatedEntityView,
  ImageView,
  InfoboxRelationRowView,
  InfoboxRowView,
  LabelledValue,
  MemberRowView,
  MemberThumbView,
  PropertyEntryView,
  PropertyView,
  RelationGroupView,
  RelationItemView,
  SequenceNeighbourView,
  SequenceView,
  SourceItemView,
  SourceTemplateView,
  TemplateView,
  TypeGroup,
  TypeListView,
  TypeSummary,
} from '../server/views';
export type { ProgressCursor };

export const PROGRESS_COOKIE = 'web_progress';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Longest query the server will look at. The index is prefix- and
 * trigram-based, so a very long string costs real work for no useful
 * answer; truncating is friendlier than rejecting.
 */
const MAX_QUERY_LENGTH = 120;

function asLocale(value: unknown): Locale {
  return value === 'fr' ? 'fr' : 'en';
}

function asSlug(value: unknown): string {
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    throw new Error('Invalid slug parameter.');
  }
  return value;
}

function asScope(value: unknown): string | null {
  return typeof value === 'string' && SCOPE_PATTERN.test(value) ? value : null;
}

function readProgress(): ProgressCursor {
  return parseProgressCookie(getCookie(PROGRESS_COOKIE));
}

export const fetchHome = createServerFn({ method: 'GET' })
  .inputValidator((input: { locale: Locale; }) => ({ locale: asLocale(input.locale) }))
  .handler(({ data }) => buildHomeView(data.locale));

export const fetchTypeList = createServerFn({ method: 'GET' })
  .inputValidator((input: { locale: Locale; type: string; }) => ({
    locale: asLocale(input.locale),
    type: asSlug(input.type),
  }))
  // The cursor matters here too: listing cards now carry epithets /
  // status tags, which are spoiler-gated like everything else.
  .handler(({ data }) => buildTypeListView(data.type, data.locale, readProgress()));

export const fetchSearch = createServerFn({ method: 'GET' })
  .inputValidator((input: { locale: Locale; q: string; }) => ({
    locale: asLocale(input.locale),
    // Free text by design: it is never interpolated into SQL (the FTS5
    // expression is built from quoted, normalized terms — see
    // `server/search-sql.ts`), only bound as a parameter.
    q: typeof input.q === 'string' ? input.q.slice(0, MAX_QUERY_LENGTH) : '',
  }))
  // The cursor is the whole point: a reader must never match a string
  // that only exists beyond their progression.
  .handler(({ data }) => buildSearchView(data.q, data.locale, readProgress()));

export const fetchEntity = createServerFn({ method: 'GET' })
  .inputValidator((input: { locale: Locale; type: string; slug: string; scope?: string; }) => ({
    locale: asLocale(input.locale),
    type: asSlug(input.type),
    slug: asSlug(input.slug),
    scope: asScope(input.scope),
  }))
  .handler(({ data }) =>
    buildEntityView(data.type, data.slug, data.locale, readProgress(), data.scope)
  );
