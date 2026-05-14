import { Header, Page } from '@onepiece-wiki/ui';
import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent(): JSX.Element {
  return (
    <Page>
      <Header>
        <Link to='/' className='text-text-primary text-base font-semibold no-underline'>
          One Piece Wiki — Dashboard
        </Link>
        <span className='text-text-muted text-xs'>
          Phase 4.1 · local FS save · no auth
        </span>
      </Header>
      <Outlet />
    </Page>
  );
}
