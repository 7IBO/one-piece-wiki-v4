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
import { buildEntityView, buildHomeView, buildTypeListView } from '../server/views';
import type { Locale } from './lib/chrome';
import { SCOPE_PATTERN } from './lib/scope';

export type {
  AvailabilityItemView,
  CastGroupView,
  CrewSectionView,
  EntityChip,
  EntityPageView,
  EntityView,
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
  .handler(({ data }) => buildTypeListView(data.type, data.locale));

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
