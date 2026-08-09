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
 * Chrome register (v7 "Vignette", WEB_APP.md § Identity): a slim
 * sticky top bar (display wordmark, progress control, locale) over
 * the Log scrubber — the reader's manga-axis progression drawn as a
 * modern gold progress track with this page's knowledge anchors.
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
 * Deepest matched route's contribution to the shell: the Log scrubber
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
      <header className='sticky top-0 z-20 border-b border-line bg-canvas'>
        <div className='mx-auto flex h-13 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6'>
          <Link
            to='/'
            className='display whitespace-nowrap text-[17px] font-extrabold tracking-tight text-fg transition-colors duration-150 hover:text-gold'
          >
            One Piece <span className='text-gold'>Wiki</span>
          </Link>
          <div className='flex items-center gap-2.5'>
            <ProgressControl key={railKey} progress={progress} />
            <LocaleSwitcher />
          </div>
        </div>
        <LogRail key={`rail:${railKey}`} progress={progress} anchors={anchors} />
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
      <footer className='border-t border-line'>
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

function NotFound(): JSX.Element {
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
        className='mt-8 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas transition-colors duration-150 hover:bg-accent-hover'
      >
        {t(locale, 'backHome')}
      </Link>
    </div>
  );
}
