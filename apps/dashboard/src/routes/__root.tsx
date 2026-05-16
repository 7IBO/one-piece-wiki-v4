import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { type JSX, useEffect, useState } from 'react';
import { AppSidebar } from '../AppSidebar';
import { auth, type CurrentUser } from '../auth';
import { DraftsIndicator } from '../DraftsIndicator';
import { EntityDrawerProvider } from '../form/EntityDrawerProvider';
import { LocaleProvider } from '../form/locale';
import { LocaleSwitcher } from '../LocaleSwitcher';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent(): JSX.Element {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    auth.me().then((u) => {
      setUser(u);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

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
                  <a
                    href={auth.loginUrl()}
                    className='bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-7 items-center rounded-[3px] px-2.5 text-xs font-medium'
                  >
                    Sign in with GitHub
                  </a>
                )
                : (
                  <>
                    <span className='text-muted-foreground'>@{user.login}</span>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={async () => {
                        await auth.logout();
                        setUser(null);
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
