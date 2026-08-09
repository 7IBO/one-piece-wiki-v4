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
 * Chrome register (v6 "La Gazette", WEB_APP.md § Identity): a printed
 * masthead — ear row (tagline / locale), nameplate row (serif
 * wordmark + progress stamp) closed by a double rule, then the Log
 * ruler. Non-sticky: a printed object does not chase the reader.
 */
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useMatches,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';
import { type JSX, type ReactNode } from 'react';
import { type LogAnchorView, type ProgressCursor } from '../api';
import { BANNER_COOKIE, FirstRunBanner } from '../components/FirstRunBanner';
import { LocaleSwitcher } from '../components/LocaleSwitcher';
import { LogRail } from '../components/LogRail';
import { ProgressControl } from '../components/ProgressControl';
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
};

const readServerChrome = createServerFn({ method: 'GET' }).handler((): Chrome => {
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
  };
});

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
  };
}

export const Route = createRootRoute({
  beforeLoad: async () => {
    const chrome = await resolveChrome();
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

function RootDocument({ children }: { readonly children: ReactNode; }): JSX.Element {
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

/**
 * Deepest matched route's contribution to the shell: the Log ruler
 * anchors of an entity page. Duck-typed guard — loader data shapes
 * are owned by the leaf routes.
 */
function useRouteAnchors(): readonly LogAnchorView[] {
  const matches = useMatches();
  let anchors: readonly LogAnchorView[] = [];
  for (const match of matches) {
    const data: unknown = match.loaderData;
    if (data === null || typeof data !== 'object') continue;
    const record = data as Record<string, unknown>;
    if (record['kind'] === 'entity' && Array.isArray(record['logAnchors'])) {
      anchors = record['logAnchors'] as readonly LogAnchorView[];
    }
  }
  return anchors;
}

function RootLayout(): JSX.Element {
  const locale = useLocale();
  const chrome = Route.useLoaderData()?.chrome;
  const progress: ProgressCursor = chrome?.progress ?? { manga: null, anime: null };
  const showBanner = chrome !== undefined && chrome.progressUnset && !chrome.bannerDismissed;
  const anchors = useRouteAnchors();
  const railKey = `${progress.manga ?? ''}:${progress.anime ?? ''}`;
  return (
    <div className='flex min-h-dvh flex-col'>
      <header className='w-full'>
        {/* Ear row — tagline left, locale right, hairline underneath. */}
        <div className='mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 border-b border-line px-4 py-1.5 sm:px-6'>
          <span className='overline-label hidden sm:block'>{t(locale, 'tagline')}</span>
          <span className='overline-label sm:hidden'>{t(locale, 'siteName')}</span>
          <LocaleSwitcher />
        </div>
        {/* Nameplate row — serif wordmark, progress stamp on the right. */}
        <div className='mx-auto flex w-full max-w-[1200px] flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 pb-2.5 pt-3 sm:px-6'>
          <Link
            to='/'
            className='font-display text-[clamp(1.45rem,3.2vw,1.9rem)] font-semibold leading-none tracking-[0.015em] text-fg transition-colors duration-150 hover:text-accent'
          >
            {t(locale, 'siteName')}
          </Link>
          <ProgressControl key={railKey} progress={progress} />
        </div>
        <div className='rule-double mx-auto w-full max-w-[1200px] px-4 sm:px-6' />
        <LogRail key={`rail:${railKey}`} progress={progress} anchors={anchors} />
        {showBanner ? <FirstRunBanner /> : null}
      </header>
      <main className='mx-auto w-full max-w-[1200px] flex-1 px-4 pb-12 pt-6 sm:px-6 sm:pt-7'>
        <Outlet />
      </main>
      <footer className='mt-4'>
        <div className='rule-double mx-auto w-full max-w-[1200px] px-4 sm:px-6' />
        <div className='mx-auto flex w-full max-w-[1200px] flex-wrap items-baseline gap-x-6 gap-y-1.5 px-4 py-4 sm:px-6'>
          <a
            href={GITHUB_URL}
            target='_blank'
            rel='noreferrer'
            className='overline-label text-muted underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-accent'
          >
            GitHub — {t(locale, 'footerContribute')}
          </a>
          <a
            href={SUPPORT_URL}
            target='_blank'
            rel='noreferrer'
            className='overline-label text-muted underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-accent'
          >
            {t(locale, 'footerSupport')}
          </a>
          <span className='min-w-56 flex-1 font-serif text-[13px] italic text-faint sm:text-right'>
            {t(locale, 'footerNote')}
          </span>
        </div>
      </footer>
    </div>
  );
}

function NotFound(): JSX.Element {
  const locale = useLocale();
  return (
    <div className='mx-auto max-w-md py-24 text-center'>
      <p className='overline-label'>404</p>
      <p className='mt-3 font-display text-4xl font-semibold tracking-[0.01em] text-fg'>
        {t(locale, 'notFoundTitle')}
      </p>
      <p className='mt-4 font-serif text-[15px] italic text-muted'>{t(locale, 'notFoundBody')}</p>
      <Link
        to='/'
        className='overline-label mt-10 inline-block border border-accent px-4 py-2 text-accent transition-colors duration-150 hover:bg-accent hover:text-canvas'
      >
        {t(locale, 'backHome')}
      </Link>
    </div>
  );
}
