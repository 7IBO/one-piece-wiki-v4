/// <reference types="vite/client" />
/**
 * Document shell of the public wiki app. Locale and spoiler cursor
 * are cookie-driven (`web_locale` set by the header switcher,
 * `web_progress` set by the progress control) and resolved in
 * `beforeLoad` so EVERY route loader receives them through router
 * context and the first paint is already localized AND filtered —
 * same first-paint recipe as the dashboard's `__root.tsx`, distinct
 * chrome (this is the public site, not the editing tool).
 *
 * Chrome register (v8.1, WEB_APP.md § Identity): ONE slim sticky top
 * bar — wordmark, the search field (ADR-108), the compact progression
 * control, the locale switcher. Nothing else. The graduated progression rail that used to
 * span the header was removed in v8.1: a permanent full-width chart
 * of the whole manga above every page was chrome shouting over
 * content. The reader's position is still always on screen and one
 * click away from being changed — it is the label of the control.
 */
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';
import { type ReactElement, type ReactNode } from 'react';
import { type ProgressCursor } from '../api';
import { BANNER_COOKIE, FirstRunBanner } from '../components/FirstRunBanner';
import { LocaleSwitcher } from '../components/LocaleSwitcher';
import { ProgressControl } from '../components/ProgressControl';
import { SearchBox } from '../components/SearchBox';
import { type Locale, t } from '../lib/chrome';
// Plain (non bun:sqlite) server module — safe for a mixed import; the
// server-fn compiler strips it from the browser bundle.
import { parseProgressCookie } from '../../server/progress';
import appCss from '../styles.css?url';

export const LOCALE_COOKIE = 'web_locale';
const PROGRESS_COOKIE = 'web_progress';

const GITHUB_URL = 'https://github.com/7IBO/one-piece-wiki-v4';
const SUPPORT_URL = 'https://buymeacoffee.com/7ibo';

type Chrome = {
  readonly locale: Locale;
  readonly progress: ProgressCursor;
  /** No progress cookie at all — candidates for the first-run banner. */
  readonly progressUnset: boolean;
  readonly bannerDismissed: boolean;
  /**
   * The highest ordinal the CORPUS holds per axis — the denominator of
   * the header gauge (`design/v2`: a 90px rail filled to the reader's
   * position). Read from the data, never hardcoded: the bar says how
   * far you are through what this wiki HAS, which is the only fraction
   * it can honestly draw.
   */
  readonly extent: ProgressCursor;
};

/**
 * The corpus extent, read inside the handler through a DYNAMIC import
 * so `bun:sqlite` never enters the browser graph — the same care the
 * plain-module note above takes, made explicit rather than assumed.
 */
async function readCorpusExtent(): Promise<ProgressCursor> {
  const { maxOrdinal } = await import('../../server/db');
  return { manga: maxOrdinal('manga-chapter'), anime: maxOrdinal('anime-episode') };
}

const readServerChrome = createServerFn({ method: 'GET' }).handler(async (): Promise<Chrome> => {
  const cookie = getCookie(LOCALE_COOKIE);
  const acceptLanguage = (getRequestHeader('accept-language') ?? '').toLowerCase();
  const locale: Locale = cookie === 'en' || cookie === 'fr'
    ? cookie
    : acceptLanguage.startsWith('fr') || acceptLanguage.includes(',fr')
    ? 'fr'
    : 'en';
  const rawProgress = getCookie(PROGRESS_COOKIE);
  return {
    locale,
    progress: parseProgressCookie(rawProgress),
    progressUnset: rawProgress === undefined || rawProgress === '',
    bannerDismissed: getCookie(BANNER_COOKIE) === '1',
    extent: await readCorpusExtent(),
  };
});

/**
 * Last extent seen from the server, kept for the CLIENT branch of
 * `resolveChrome`: a client-side navigation re-runs `beforeLoad` with
 * only cookies to read, and the corpus is not in a cookie. Seeded by
 * the first (server-rendered) pass, so it is present from the first
 * client navigation onwards; before that it is the empty cursor and
 * the gauge simply renders without its bar.
 */
let lastExtent: ProgressCursor = { manga: null, anime: null };

function readClientCookie(name: string): string | undefined {
  return new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(document.cookie)?.[1];
}

async function resolveChrome(): Promise<Chrome> {
  if (import.meta.env.SSR) return await readServerChrome();
  const fromCookie = readClientCookie(LOCALE_COOKIE);
  const locale: Locale = fromCookie === 'en' || fromCookie === 'fr'
    ? fromCookie
    : navigator.language.toLowerCase().startsWith('fr')
    ? 'fr'
    : 'en';
  const rawProgress = readClientCookie(PROGRESS_COOKIE);
  return {
    locale,
    progress: parseProgressCookie(rawProgress),
    progressUnset: rawProgress === undefined || rawProgress === '',
    bannerDismissed: readClientCookie(BANNER_COOKIE) === '1',
    extent: lastExtent,
  };
}

export const Route = createRootRoute({
  beforeLoad: async () => {
    const chrome = await resolveChrome();
    lastExtent = chrome.extent;
    return { locale: chrome.locale, chrome };
  },
  loader: ({ context }) => ({ chrome: context.chrome }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'One Piece Wiki' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  component: RootLayout,
});

/** Locale for chrome strings in any component below the root. */
export function useLocale(): Locale {
  return Route.useLoaderData()?.chrome.locale ?? 'en';
}

function RootDocument({ children }: { readonly children: ReactNode; }): ReactElement {
  const locale = Route.useLoaderData()?.chrome.locale ?? 'en';
  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout(): ReactElement {
  const locale = useLocale();
  const chrome = Route.useLoaderData()?.chrome;
  const progress: ProgressCursor = chrome?.progress ?? { manga: null, anime: null };
  const showBanner = chrome !== undefined && chrome.progressUnset && !chrome.bannerDismissed;
  // Remount the control when the cursor changes so its form fields
  // restart from the persisted value rather than from stale state.
  const cursorKey = `${progress.manga ?? ''}:${progress.anime ?? ''}`;
  return (
    <div className='flex min-h-dvh flex-col'>
      {
        /* The chrome sits in DEEPER water than the page (v11, ADR-111):
          `bg-abyss` under a hairline, so the bar reads as the surface
          above the content rather than as one more flat dark panel —
          the tell of the generic dark-SaaS register VISION.md § 4
          rejects. No blur, no translucency: one opaque colour. */
      }
      <header className='sticky top-0 z-20 border-b border-line bg-abyss'>
        {
          /* Still ONE bar (WEB_APP.md § Identity) — the search field
            joins the wordmark and the two controls rather than adding
            a second register. Below `sm` it wraps to its own full-width
            line, because a field squeezed between the wordmark and the
            progression label is a field nobody can type in. */
        }
        {
          /* The plate's bar: 46px, segments separated by hairlines
            rather than by whitespace, the search field taking every
            pixel between the wordmark and the two controls. Below `sm`
            the field wraps to its own line — a field squeezed between
            a wordmark and a progression label is a field nobody can
            type in. */
        }
        <div className='mx-auto flex w-full max-w-[1440px] flex-wrap items-stretch gap-y-2 py-2 sm:h-11.5 sm:flex-nowrap sm:gap-y-0 sm:py-0'>
          <Link
            to='/'
            className='display flex items-center whitespace-nowrap px-4.5 text-sm font-extrabold tracking-tight text-fg no-underline transition-colors duration-150 hover:text-gold sm:border-r sm:border-line'
          >
            One Piece<span className='text-gold'>.Wiki</span>
          </Link>
          <SearchBox progress={progress} />
          <div className='flex items-center px-3.5 sm:border-l sm:border-line'>
            <LocaleSwitcher />
          </div>
          <div className='flex items-center px-4 sm:border-l sm:border-line'>
            <ProgressControl key={cursorKey} progress={progress} extent={chrome.extent} />
          </div>
        </div>
        {showBanner ? <FirstRunBanner /> : null}
      </header>
      {
        /* Full-bleed on purpose: an entity page opens on a hero that
          spans the viewport. Pages own their own reading column
          (`.page-column`), so nothing here constrains the hero — and
          no `100vw` breakout is needed, which would overflow by the
          width of the scrollbar. */
      }
      <main className='w-full flex-1 pb-16'>
        <Outlet />
      </main>
      <footer className='border-t border-line bg-abyss'>
        <div className='mx-auto flex w-full max-w-[1200px] flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-5 text-xs sm:px-6'>
          <a
            href={GITHUB_URL}
            target='_blank'
            rel='noreferrer'
            className='font-medium text-muted transition-colors duration-150 hover:text-fg'
          >
            GitHub — {t(locale, 'footerContribute')}
          </a>
          <a
            href={SUPPORT_URL}
            target='_blank'
            rel='noreferrer'
            className='font-medium text-muted transition-colors duration-150 hover:text-fg'
          >
            {t(locale, 'footerSupport')}
          </a>
          <span className='min-w-56 flex-1 text-faint sm:text-right'>
            {t(locale, 'footerNote')}
          </span>
        </div>
      </footer>
    </div>
  );
}

function NotFound(): ReactElement {
  const locale = useLocale();
  return (
    <div className='page-column mx-auto max-w-md py-24 text-center'>
      <p className='display text-5xl font-extrabold text-gold/50'>404</p>
      <p className='display mt-3 text-3xl font-bold text-fg'>
        {t(locale, 'notFoundTitle')}
      </p>
      <p className='mt-3 text-[15px] text-muted'>{t(locale, 'notFoundBody')}</p>
      <Link
        to='/'
        className='mt-8 inline-block rounded-md bg-gold px-4 py-2 text-sm font-semibold text-canvas transition-colors duration-150 hover:bg-gold/85'
      >
        {t(locale, 'backHome')}
      </Link>
    </div>
  );
}
