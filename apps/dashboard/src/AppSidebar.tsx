/**
 * Persistent left-hand navigation, Payload-CMS style. Lists every
 * entity type discovered from the schema catalogue, grouped by
 * `ui_hint.group` so related types cluster (people, groups, places…).
 * Each entry links to /types/<id> and highlights when the current
 * route matches.
 */
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useLocation } from '@tanstack/react-router';
import { LogIn, LogOut } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { useCurrentUser, useSignOut } from './auth';
import { useLocale, useT } from './form/locale';
import { useSchemaCatalogue } from './hooks/use-schema-catalogue';
import { groupTypesByUiHint, type TypeGroup } from './lib/type-groups';

type SidebarItem = { id: string; label: string; group: string | undefined; };

export function AppSidebar(): ReactElement {
  const locale = useLocale();
  const t = useT();
  const location = useLocation();
  const { signOut, pending: signOutPending } = useSignOut();
  const { user, loaded: userLoaded } = useCurrentUser();
  const schemas = useSchemaCatalogue();

  const groups = useMemo<readonly TypeGroup<SidebarItem>[]>(() => {
    if (schemas === null) return [];
    // Grouping (order, labels, unknown-group fallthrough) is shared
    // with the home page grid via lib/type-groups so both surfaces
    // cluster types identically.
    const items: SidebarItem[] = Object.values(schemas.entityTypes).map((et) => ({
      id: et.id,
      label: et.labels[locale] ?? et.labels.en,
      group: et.ui_hint?.group,
    }));
    return groupTypesByUiHint(
      items,
      { group: (it) => it.group, label: (it) => it.label },
      locale,
    );
  }, [schemas, locale]);

  if (schemas === null) {
    return (
      <nav className='flex flex-col gap-2 p-3'>
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className='h-6 w-full' />)}
      </nav>
    );
  }

  return (
    <nav className='flex flex-col gap-4 p-3 text-sm'>
      <Link
        to='/'
        className={`block rounded-md px-2 py-1.5 text-xs uppercase tracking-wide transition-colors ${
          location.pathname === '/'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
        }`}
      >
        Overview
      </Link>
      {/* Cross-type data explorer — audits every entity in one list. */}
      <Link
        to='/explore'
        className={`-mt-2 block rounded-md px-2 py-1.5 text-xs uppercase tracking-wide transition-colors ${
          location.pathname === '/explore'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
        }`}
      >
        {t('exploreTitle')}
      </Link>
      {/* Global data history — recent commits across all entities. */}
      <Link
        to='/history'
        className={`-mt-2 block rounded-md px-2 py-1.5 text-xs uppercase tracking-wide transition-colors ${
          location.pathname === '/history'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
        }`}
      >
        {t('historyGlobalTitle')}
      </Link>
      {groups.map((g) => (
        <div key={g.groupId}>
          <p className='text-muted-foreground mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide'>
            {g.groupLabel}
          </p>
          <ul className='space-y-0.5'>
            {g.items.map((it) => {
              const active = location.pathname.startsWith(`/types/${it.id}`);
              return (
                <li key={it.id}>
                  <Link
                    to='/types/$type'
                    params={{ type: it.id }}
                    className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                    }`}
                  >
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {
        /* Mobile-only Account block: the header strips user-label +
          Sign out below sm to free width, and the BottomNav (with its
          Account tab) hides itself on save-bar routes — so the
          hamburger sheet is the only mobile path to sign out from an
          entity edit page. Hidden at lg+ where the header already
          carries both affordances. */
      }
      {userLoaded
        ? (
          <div className='border-border mt-2 border-t pt-3 lg:hidden'>
            <p className='text-muted-foreground mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide'>
              Account
            </p>
            {user === null
              ? (
                <Link
                  to='/login'
                  className='text-muted-foreground hover:bg-accent/40 hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-sm no-underline'
                >
                  <LogIn className='size-4' />
                  <span>Sign in</span>
                </Link>
              )
              : (
                <div className='px-2 pb-2'>
                  <p className='text-foreground mb-1 text-sm font-medium truncate'>
                    {user.kind === 'github' ? `@${user.login}` : user.nickname}
                  </p>
                  <p className='text-muted-foreground mb-2 text-[11px]'>
                    {user.kind === 'github' ? 'GitHub' : 'Anonymous'}
                  </p>
                  <Button
                    variant='outline'
                    size='sm'
                    className='w-full gap-1.5'
                    disabled={signOutPending}
                    onClick={signOut}
                  >
                    <LogOut className='size-3.5' />
                    Sign out
                  </Button>
                </div>
              )}
          </div>
        )
        : null}
    </nav>
  );
}
