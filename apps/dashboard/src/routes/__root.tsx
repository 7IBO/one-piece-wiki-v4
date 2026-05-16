import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { createRootRoute, Link, Outlet, useNavigate } from '@tanstack/react-router';
import { type JSX } from 'react';
import { AppSidebar } from '../AppSidebar';
import { auth, useCurrentUser } from '../auth';
import { DraftsIndicator } from '../DraftsIndicator';
import { EntityDrawerProvider } from '../form/EntityDrawerProvider';
import { LocaleProvider } from '../form/locale';
import { LocaleSwitcher } from '../LocaleSwitcher';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent(): JSX.Element {
  const { user, loaded } = useCurrentUser();
  const navigate = useNavigate();

  // Surfaced label: @login for GitHub, plain Pseudo for anonymous.
  // Wrapping inline below makes the difference visible to a reviewer
  // glancing at a screenshot.
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
                        // Force a full re-render so useCurrentUser
                        // re-fetches and the header collapses back
                        // to the "Sign in" link cleanly.
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
              <Outlet />
            </main>
          </div>
          <Toaster richColors closeButton position='top-right' />
        </div>
      </EntityDrawerProvider>
    </LocaleProvider>
  );
}
