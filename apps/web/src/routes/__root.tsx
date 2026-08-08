/// <reference types="vite/client" />
/**
 * Document shell of the public reader app. Locale is cookie-driven
 * (`web_locale`, set by the header switcher) and resolved in
 * `beforeLoad` so EVERY route loader receives it through router
 * context and the first paint is already in the right language —
 * same first-paint recipe as the dashboard's `__root.tsx`, distinct
 * chrome (this is the public site, not the editing tool).
 */
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';
import { type JSX, type ReactNode } from 'react';
import { LocaleSwitcher } from '../components/LocaleSwitcher';
import { type Locale, t } from '../lib/chrome';
import appCss from '../styles.css?url';

export const LOCALE_COOKIE = 'web_locale';

const readServerLocale = createServerFn({ method: 'GET' }).handler((): Locale => {
  const cookie = getCookie(LOCALE_COOKIE);
  if (cookie === 'en' || cookie === 'fr') return cookie;
  const acceptLanguage = (getRequestHeader('accept-language') ?? '').toLowerCase();
  return acceptLanguage.startsWith('fr') || acceptLanguage.includes(',fr') ? 'fr' : 'en';
});

async function resolveLocale(): Promise<Locale> {
  if (import.meta.env.SSR) return await readServerLocale();
  const fromCookie = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=(en|fr)(?:;|$)`)
    .exec(document.cookie)?.[1];
  if (fromCookie === 'en' || fromCookie === 'fr') return fromCookie;
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const Route = createRootRoute({
  beforeLoad: async () => ({ locale: await resolveLocale() }),
  loader: ({ context }) => ({ locale: context.locale }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Grand Line Archives' },
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
  return Route.useLoaderData()?.locale ?? 'en';
}

function RootDocument({ children }: { readonly children: ReactNode; }): JSX.Element {
  const locale = Route.useLoaderData()?.locale ?? 'en';
  return (
    <html lang={locale} className='dark'>
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
  return (
    <div className='flex min-h-dvh flex-col'>
      <header className='sticky top-0 z-10 border-b border-line/70 bg-canvas/85 backdrop-blur'>
        <div className='mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6'>
          <Link to='/' className='group flex items-baseline gap-2'>
            <span className='font-display text-lg font-semibold tracking-tight text-fg transition-colors group-hover:text-gold'>
              {t(locale, 'siteName')}
            </span>
            <span
              aria-hidden
              className='hidden size-1.5 translate-y-[-2px] rounded-full bg-gold sm:block'
            />
          </Link>
          <LocaleSwitcher />
        </div>
      </header>
      <main className='mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6'>
        <Outlet />
      </main>
      <footer className='border-t border-line/70'>
        <div className='mx-auto w-full max-w-5xl px-4 py-6 text-xs text-faint sm:px-6'>
          {t(locale, 'footerNote')}
        </div>
      </footer>
    </div>
  );
}

function NotFound(): JSX.Element {
  const locale = useLocale();
  return (
    <div className='py-24 text-center'>
      <p className='font-display text-3xl font-semibold text-fg'>{t(locale, 'notFoundTitle')}</p>
      <p className='mt-3 text-muted'>{t(locale, 'notFoundBody')}</p>
      <Link
        to='/'
        className='mt-8 inline-block rounded-full border border-gold/40 px-5 py-2 text-sm text-gold transition-colors hover:bg-veil'
      >
        {t(locale, 'backHome')}
      </Link>
    </div>
  );
}
