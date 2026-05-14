import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { type JSX, useEffect, useState } from 'react';
import { auth, type CurrentUser } from '../auth.ts';

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
    <div className='min-h-screen bg-background text-foreground antialiased'>
      <header className='border-border bg-card flex items-center gap-6 border-b px-6 py-3'>
        <Link
          to='/'
          className='text-foreground text-base font-semibold no-underline'
        >
          One Piece Wiki
          <span className='text-muted-foreground ml-2 text-xs font-normal'>
            Dashboard · Phase 4.2
          </span>
        </Link>
        <div className='ml-auto flex items-center gap-3 text-sm'>
          {!loaded ? null : user === null
            ? (
              <a
                href={auth.loginUrl()}
                className='bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium'
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
      <main className='mx-auto w-full max-w-5xl px-6 py-6'>
        <Outlet />
      </main>
      <Toaster richColors closeButton position='top-right' />
    </div>
  );
}
