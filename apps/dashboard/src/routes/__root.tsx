/// <reference types="vite/client" />
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { createRootRoute, HeadContent, Link, Scripts, useNavigate } from '@tanstack/react-router';
import { type JSX, type ReactNode } from 'react';
import { AppSidebar } from '../AppSidebar';
import { auth, useCurrentUser } from '../auth';
import { DraftsIndicator } from '../DraftsIndicator';
import { EntityDrawerProvider } from '../form/EntityDrawerProvider';
import { LocaleProvider } from '../form/locale';
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
    links: [{ rel: 'stylesheet', href: appCss }],
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
  const navigate = useNavigate();

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
          <header className='border-border bg-card sticky top-0 z-30 flex items-center gap-6 border-b px-6 py-3'>
            <Link
              to='/'
              className='text-foreground text-sm font-semibold no-underline'
            >
              One Piece Wiki
              <span className='text-muted-foreground ml-2 text-[11px] font-normal'>
                Dashboard
              </span>
            </Link>
            <div className='ml-auto flex items-center gap-3 text-xs'>
              <DraftsIndicator />
              <LocaleSwitcher />
              {!loaded ? null : user === null
                ? (
                  <Link
                    to='/login'
                    className='bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-7 items-center rounded-[3px] px-2.5 text-xs font-medium no-underline'
                  >
                    Sign in
                  </Link>
                )
                : (
                  <>
                    <span className='text-muted-foreground'>{userLabel}</span>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={async () => {
                        await auth.signOut();
                        await navigate({ to: '/login' });
                      }}
                    >
                      Sign out
                    </Button>
                  </>
                )}
            </div>
          </header>
          <div className='grid min-h-0 grid-cols-1 lg:grid-cols-[16rem_1fr]'>
            <aside className='border-border bg-card/30 sticky top-[57px] hidden h-[calc(100vh-57px)] overflow-y-auto border-r lg:block'>
              <AppSidebar />
            </aside>
            <main className='min-w-0 px-6 py-6'>
              {
                /* `children` is the matched route's output (Start's
                  shellComponent contract — replaces the explicit
                  <Outlet /> we had pre-migration). */
              }
              {children}
            </main>
          </div>
          <Toaster richColors closeButton position='top-right' />
        </div>
      </EntityDrawerProvider>
    </LocaleProvider>
  );
}
