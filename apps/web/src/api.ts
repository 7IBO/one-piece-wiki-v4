/**
 * Server functions — the ONLY data entry points of the public app.
 * During SSR they run in-process; on client navigation they become
 * GET requests handled by TanStack Start. The heavy lifting (SQLite
 * reads, label resolution) lives in `../server/*`; the server-fn
 * compiler strips those imports from the browser bundle (same
 * mechanism the dashboard's `__root.tsx` relies on).
 */
import { createServerFn } from '@tanstack/react-start';
import { buildEntityView, buildHomeView, buildTypeListView } from '../server/views';
import type { Locale } from './lib/chrome';

export type {
  EntityChip,
  EntityView,
  HomeView,
  LabelledValue,
  PropertyEntryView,
  PropertyView,
  RelationGroupView,
  RelationItemView,
  TypeGroup,
  TypeListView,
  TypeSummary,
} from '../server/views';

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
  .inputValidator((input: { locale: Locale; type: string; slug: string; }) => ({
    locale: asLocale(input.locale),
    type: asSlug(input.type),
    slug: asSlug(input.slug),
  }))
  .handler(({ data }) => buildEntityView(data.type, data.slug, data.locale));
