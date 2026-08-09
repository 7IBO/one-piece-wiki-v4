/// <reference types="vite/client" />
/**
 * Document shell of the public wiki app. Locale and spoiler cursor
 * are cookie-driven (`web_locale` set by the header switcher,
 * `web_progress` set by the progress control) and resolved in
 * `beforeLoad` so EVERY route loader receives them through router
 * context and the first paint is already localized AND filtered —
 * same first-paint recipe as the dashboard's `__root.tsx`, distinct
 * chrome (this is the public site, not the editing tool).
 */
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';
import { type JSX, type ReactNode } from 'react';
import { type ProgressCursor } from '../api';
import { BANNER_COOKIE, FirstRunBanner } from '../components/FirstRunBanner';
import { LocaleSwitcher } from '../components/LocaleSwitcher';
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

function RootLayout(): JSX.Element {
  const locale = useLocale();
  const chrome = Route.useLoaderData()?.chrome;
  const progress: ProgressCursor = chrome?.progress ?? { manga: null, anime: null };
  const showBanner = chrome !== undefined && chrome.progressUnset && !chrome.bannerDismissed;
  return (
    <div className='flex min-h-dvh flex-col'>
      <header className='sticky top-0 z-10 border-b border-line bg-canvas'>
        <div className='mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-3 px-4 sm:px-6'>
          <Link
            to='/'
            className='whitespace-nowrap font-display text-[1.05rem] font-bold tracking-[-0.02em] text-fg transition-colors duration-150 hover:text-accent'
          >
            {t(locale, 'siteName')}
          </Link>
          <div className='flex items-center gap-4'>
            <ProgressControl
              key={`${progress.manga ?? ''}:${progress.anime ?? ''}`}
              progress={progress}
            />
            <LocaleSwitcher />
          </div>
        </div>
        {showBanner ? <FirstRunBanner /> : null}
      </header>
      <main className='mx-auto w-full max-w-[1100px] flex-1 px-4 py-10 sm:px-6 sm:py-12'>
        <Outlet />
      </main>
      <footer className='border-t border-line'>
        <div className='mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-faint sm:px-6'>
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
          <span className='min-w-56 flex-1 sm:text-right'>{t(locale, 'footerNote')}</span>
        </div>
      </footer>
    </div>
  );
}

function NotFound(): JSX.Element {
  const locale = useLocale();
  return (
    <div className='py-28 text-center'>
      <p className='font-display text-4xl font-bold tracking-[-0.02em] text-fg'>
        {t(locale, 'notFoundTitle')}
      </p>
      <p className='mx-auto mt-4 max-w-md text-muted'>{t(locale, 'notFoundBody')}</p>
      <Link
        to='/'
        className='mt-10 inline-block rounded-md bg-fg px-5 py-2.5 text-sm font-semibold text-canvas transition-opacity duration-150 hover:opacity-85'
      >
        {t(locale, 'backHome')}
      </Link>
    </div>
  );
}
