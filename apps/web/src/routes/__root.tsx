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
 * Deepest matched route's contribution to the shell: the Log Rail
 * anchors of an entity page, and the current type label for the spine
 * glyph. Duck-typed guards — loader data shapes are owned by the leaf
 * routes.
 */
function useRouteShellContext(): {
  readonly anchors: readonly LogAnchorView[];
  readonly typeGlyph: string | null;
} {
  const matches = useMatches();
  let anchors: readonly LogAnchorView[] = [];
  let typeGlyph: string | null = null;
  for (const match of matches) {
    const data: unknown = match.loaderData;
    if (data === null || typeof data !== 'object') continue;
    const record = data as Record<string, unknown>;
    if (record['kind'] === 'entity' && Array.isArray(record['logAnchors'])) {
      anchors = record['logAnchors'] as readonly LogAnchorView[];
    }
    const label = record['typeLabel'] ?? record['label'];
    if (typeof label === 'string' && label !== '') {
      typeGlyph = ([...label][0] ?? '').toUpperCase();
    }
  }
  return { anchors, typeGlyph };
}

function RootLayout(): JSX.Element {
  const locale = useLocale();
  const chrome = Route.useLoaderData()?.chrome;
  const progress: ProgressCursor = chrome?.progress ?? { manga: null, anime: null };
  const showBanner = chrome !== undefined && chrome.progressUnset && !chrome.bannerDismissed;
  const { anchors, typeGlyph } = useRouteShellContext();
  const railKey = `${progress.manga ?? ''}:${progress.anime ?? ''}`;
  return (
    <div className='flex min-h-dvh flex-col min-[900px]:pl-[68px]'>
      {
        /* The spine — fixed narrow left rail, the signature frame of the
          site. Vertical wordmark (gold-accented), current-type glyph,
          locale at the bottom. Becomes a normal top bar on mobile. */
      }
      <aside className='fixed inset-y-0 left-0 z-20 hidden w-[68px] flex-col items-center justify-between border-r border-line bg-canvas py-5 min-[900px]:flex'>
        <Link
          to='/'
          className='flex rotate-180 items-center gap-1.5 font-display text-[13px] font-bold uppercase tracking-[0.22em] text-fg transition-colors duration-150 [writing-mode:vertical-rl] hover:text-gold'
        >
          <span aria-hidden className='h-5 w-px bg-gold' />
          {t(locale, 'siteName')}
        </Link>
        <span
          aria-hidden
          className='select-none font-display text-2xl font-bold leading-none text-gold/35'
        >
          {typeGlyph ?? ''}
        </span>
        <LocaleSwitcher vertical />
      </aside>

      <header className='sticky top-0 z-10 border-b border-line bg-canvas'>
        <div className='flex h-12 w-full max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-8'>
          <Link
            to='/'
            className='whitespace-nowrap font-display text-[1.05rem] font-bold tracking-[-0.02em] text-fg transition-colors duration-150 hover:text-gold min-[900px]:hidden'
          >
            {t(locale, 'siteName')}
          </Link>
          <span className='hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-faint min-[900px]:block'>
            {t(locale, 'tagline')}
          </span>
          <div className='flex items-center gap-3'>
            <ProgressControl key={railKey} progress={progress} />
            <span className='min-[900px]:hidden'>
              <LocaleSwitcher />
            </span>
          </div>
        </div>
        <LogRail key={`rail:${railKey}`} progress={progress} anchors={anchors} />
        {showBanner ? <FirstRunBanner /> : null}
      </header>
      <main className='w-full max-w-[1280px] flex-1 px-4 py-8 sm:px-8 sm:py-9'>
        <Outlet />
      </main>
      <footer className='border-t border-line'>
        <div className='flex w-full max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-faint sm:px-8'>
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
        className='mt-10 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-canvas transition-colors duration-150 hover:bg-accent-hover'
      >
        {t(locale, 'backHome')}
      </Link>
    </div>
  );
}
