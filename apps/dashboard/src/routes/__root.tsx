import { Header, Page } from '@onepiece-wiki/ui';
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
    <Page>
      <Header>
        <Link to='/' className='text-text-primary text-base font-semibold no-underline'>
          One Piece Wiki — Dashboard
        </Link>
        <span className='text-text-muted text-xs'>
          Phase 4.2 · GitHub PR save · admin-only
        </span>
        <div className='text-text-secondary ml-auto text-sm'>
          {!loaded
            ? null
            : user === null
            ? (
              <a href={auth.loginUrl()} className='text-accent hover:underline'>
                Sign in with GitHub
              </a>
            )
            : (
              <>
                <span className='mr-3'>@{user.login}</span>
                <button
                  type='button'
                  onClick={async () => {
                    await auth.logout();
                    setUser(null);
                  }}
                  className='text-accent text-xs hover:underline'
                >
                  sign out
                </button>
              </>
            )}
        </div>
      </Header>
      <Outlet />
    </Page>
  );
}
