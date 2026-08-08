/// <reference types="vite/client" />
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { createRootRoute, HeadContent, Link, Scripts } from '@tanstack/react-router';
import { type JSX, type ReactNode } from 'react';
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

export const Route = createRootRoute({
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
function RootDocument({ children }: { children: ReactNode; }): JSX.Element {
  return (
    <html lang='en'>
      <head>
        <HeadContent />
      </head>
      <body>
        <AppChrome>{children}</AppChrome>
        <Scripts />
      </body>
    </html>
  );
}

function AppChrome({ children }: { children: ReactNode; }): JSX.Element {
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
    <LocaleProvider>
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
