/// <reference types="vite/client" />
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { createRootRoute, HeadContent, Link, Scripts } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';
import { type ReactElement, type ReactNode } from 'react';
import { AppSidebar } from '../AppSidebar';
import { useCurrentUser, useSignOut } from '../auth';
import { BottomNav } from '../BottomNav';
import { DraftsIndicator } from '../DraftsIndicator';
import { EntityDrawerProvider } from '../form/EntityDrawerProvider';
import { LocaleProvider } from '../form/locale';
import { CommandPaletteTrigger, GlobalCommandPalette } from '../GlobalCommandPalette';
import { LocaleSwitcher } from '../LocaleSwitcher';
import appCss from '../styles.css?url';

// `?url` import: Vite emits a real `<link rel="stylesheet">` in the
// generated HTML head instead of bundling the CSS into a JS module.
// The link is then referenced in `head.links` below so it's part of
// the initial HTML response (no flash of unstyled content).

/**
 * Server side of the first-paint locale: the cookie (set by the
 * LocaleSwitcher) wins, then the request's Accept-Language for
 * cookie-less first visits. A `createServerFn` — NOT a raw
 * `import('@tanstack/react-start/server')` in the loader: Rollup
 * rewrote that dynamic import to a self-import of the SSR chunk in
 * the production build, whose exports don't include the h3 helpers
 * ("getCookie is not a function" on Vercel). The server-fn compiler
 * extracts this handler (and the server-only import above) cleanly
 * from both bundles.
 */
const readServerLocale = createServerFn({ method: 'GET' }).handler(
  (): 'en' | 'fr' => {
    const cookie = getCookie('dashboard_locale');
    if (cookie === 'en' || cookie === 'fr') return cookie;
    const acceptLanguage = (getRequestHeader('accept-language') ?? '').toLowerCase();
    return acceptLanguage.startsWith('fr') || acceptLanguage.includes(',fr') ? 'fr' : 'en';
  },
);

/**
 * Resolve the UI locale for the very first paint. During SSR the
 * server fn executes in-process against the live request; on the
 * client the same value re-derives locally from document.cookie (no
 * network hop). Server HTML and hydration agree, so the page renders
 * in the right language immediately — no EN→FR flash, no duplicate
 * locale-dependent fetches.
 */
async function resolveInitialLocale(): Promise<'en' | 'fr'> {
  if (import.meta.env.SSR) return await readServerLocale();
  const fromCookie = /(?:^|;\s*)dashboard_locale=(en|fr)(?:;|$)/.exec(document.cookie)?.[1];
  if (fromCookie === 'en' || fromCookie === 'fr') return fromCookie;
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const Route = createRootRoute({
  loader: async () => ({ locale: await resolveInitialLocale() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Dashboard — One Piece Wiki' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
});

/**
 * HTML document shell — TanStack Start calls this with the route
 * tree as `children`. We render `<html>` + `<body>` here (Start
 * requires it; rendering them inside route components is forbidden),
 * then mount the app chrome inside.
 *
 * `HeadContent` flushes the accumulated <head> (meta, links, scripts)
 * from every matched route's `head()` return. `Scripts` emits the
 * hydration bootstrap + module preloads.
 */
function RootDocument({ children }: { children: ReactNode; }): ReactElement {
  // Cookie/Accept-Language-derived locale from the root loader — the
  // shell may render before the loader resolves on the client, so
  // fall back to 'en' defensively.
  const loaderData = Route.useLoaderData() as { locale?: 'en' | 'fr'; } | undefined;
  const locale = loaderData?.locale ?? 'en';
  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <AppChrome initialLocale={locale}>{children}</AppChrome>
        <Scripts />
      </body>
    </html>
  );
}

function AppChrome(
  { children, initialLocale }: { children: ReactNode; initialLocale: 'en' | 'fr'; },
): ReactElement {
  const { user, loaded } = useCurrentUser();
  const { signOut, pending: signOutPending } = useSignOut();

  // @login for GitHub, plain Pseudo for anonymous. Wrapping inline
  // makes the difference obvious to a reviewer glancing at a
  // screenshot.
  const userLabel = user === null
    ? null
    : user.kind === 'github'
    ? `@${user.login}`
    : user.nickname;

  return (
    <LocaleProvider initial={initialLocale}>
      <EntityDrawerProvider>
        <div className='bg-background text-foreground grid min-h-screen grid-rows-[auto_1fr] antialiased'>
          {
            /* One nav system per breakpoint (W-F2 §navigation): below
              lg the BottomNav is the ONLY navigation chrome — the old
              header hamburger duplicated its Browse sheet and is gone.
              Height is the --header-h token; every sticky offset
              below derives from it. */
          }
          <header className='border-border bg-card sticky top-0 z-30 flex h-[var(--header-h)] items-center gap-3 border-b px-[var(--page-px)] sm:gap-6 sm:px-6'>
            <Link
              to='/'
              className='text-foreground text-sm font-semibold no-underline whitespace-nowrap'
            >
              One Piece Wiki
              <span className='text-muted-foreground ml-2 hidden text-[11px] font-normal sm:inline'>
                Dashboard
              </span>
            </Link>
            <div className='ml-auto flex items-center gap-1.5 text-xs sm:gap-3'>
              <CommandPaletteTrigger />
              <DraftsIndicator />
              <LocaleSwitcher />
              {!loaded ? null : user === null
                ? (
                  <Button
                    render={<Link to='/login' />}
                    size='sm'
                    className='no-underline max-lg:hidden'
                  >
                    Sign in
                  </Button>
                )
                : (
                  <>
                    {
                      /* Identity + Sign out live in the BottomNav
                        "Account" tab wherever it renders (< lg).
                        Keeping them lg-only stops the tablet band
                        (640-1024px) from showing both systems. */
                    }
                    <span className='text-muted-foreground hidden lg:inline'>{userLabel}</span>
                    <Button
                      size='sm'
                      variant='outline'
                      className='hidden lg:inline-flex'
                      disabled={signOutPending}
                      onClick={signOut}
                    >
                      Sign out
                    </Button>
                  </>
                )}
            </div>
          </header>
          <div className='grid min-h-0 grid-cols-1 lg:grid-cols-[16rem_1fr]'>
            <aside className='border-border bg-card/30 sticky top-[var(--header-h)] hidden h-[calc(100vh-var(--header-h))] overflow-y-auto border-r lg:block'>
              <AppSidebar />
            </aside>
            <main className='min-w-0 px-[var(--page-px)] py-4 pb-20 sm:px-6 sm:py-6 lg:pb-6'>
              {
                /* `children` is the matched route's output (Start's
                  shellComponent contract — replaces the explicit
                  <Outlet /> we had pre-migration).
                  `pb-20` reserves space for the mobile BottomNav so
                  fixed footers (entity save bar, cast save bar) don't
                  stack underneath it. `lg:pb-6` drops the inset on
                  desktop where the BottomNav is hidden.
                  The horizontal gutter is the --page-px token so the
                  `bleed` utility can cancel it exactly. */
              }
              {children}
            </main>
          </div>
          {
            /* Mobile-only persistent tab bar. Hidden at lg: where the
             sidebar takes over. See BottomNav.tsx for the slot list. */
          }
          <BottomNav />
          <GlobalCommandPalette />
          <Toaster closeButton />
        </div>
      </EntityDrawerProvider>
    </LocaleProvider>
  );
}
