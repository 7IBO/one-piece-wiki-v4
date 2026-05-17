/**
 * BottomNav — fixed mobile tab bar below the `lg` breakpoint
 * (matches the breakpoint where the sidebar disappears). Gives
 * contributors thumb-reach access to the four most common actions
 * without scrolling back to the top.
 *
 * Slots:
 *   1. Home          → `/`
 *   2. Browse        → opens `<AppSidebar>` in a `<MobileSheet>` so
 *                      contributors can switch entity type without
 *                      digging into the header hamburger.
 *   3. + New         → opens a type-picker sheet that links to
 *                      `/types/$type/new` for the selected type.
 *   4. Account / Sign in → opens a sheet with current identity +
 *                      sign-out, or a "Sign in" link if anonymous.
 *
 * Hidden at `lg:` because the sidebar covers the same navigation
 * surface on desktop. Respects `env(safe-area-inset-bottom)` so the
 * bar floats above the iOS home indicator.
 *
 * The bar is rendered ONCE in `__root.tsx` (alongside the existing
 * header chrome). Each slot is ≥ 44px tall to satisfy the
 * `@media (pointer: coarse)` touch-target rule in `styles.css`.
 */
import { Button } from '@/components/ui/button';
import { MobileSheet, MobileSheetContent, MobileSheetTrigger } from '@/components/ui/mobile-sheet';
import { Link, useLocation } from '@tanstack/react-router';
import { Home, LogIn, LogOut, Menu, Plus, User2 } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { api, type SchemaCatalogue } from './api';
import { AppSidebar } from './AppSidebar';
import { auth, useCurrentUser } from './auth';
import { useLocale } from './form/locale';

export function BottomNav(): JSX.Element | null {
  const location = useLocation();
  const { user, loaded } = useCurrentUser();
  const locale = useLocale();
  const [browseOpen, setBrowseOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  useEffect(() => {
    api.schemas().then(setSchemas).catch(() => {/* nav still usable without */});
  }, []);

  // Close every sheet on route change — same pattern as the
  // hamburger in __root.tsx. Without this, tapping a link inside a
  // sheet leaves the sheet open over the navigated-to content.
  useEffect(() => {
    setBrowseOpen(false);
    setCreateOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  const isHome = location.pathname === '/';

  // Routes where a sticky save bar is rendered (EntityForm, cast
  // manager, apparitions editor, entity creation). On those pages the
  // save bar is the primary action and the BottomNav was visually
  // competing — the centred "+" FAB popped up next to the save
  // button and made the bottom of the screen feel cluttered. Hiding
  // the nav keeps the focus on the edit flow; users still have the
  // header (hamburger + search + locale) to navigate away.
  const hasSaveBar = /^\/(types|sources)\/[^/]+\/[^/]+/.test(location.pathname)
    || /^\/types\/[^/]+\/new$/.test(location.pathname);
  if (hasSaveBar) return null;

  // Type list for the "+ New" picker. Sorted alphabetically; the
  // first-time experience prioritises "find the type" over "remember
  // the schema-defined group order".
  const types = useMemo(() => {
    if (schemas === null) return [] as readonly { id: string; label: string; }[];
    return Object.values(schemas.entityTypes)
      .map((et) => ({ id: et.id, label: et.labels[locale] ?? et.labels.en }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [schemas, locale]);

  return (
    <nav
      className='border-border bg-card fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t lg:hidden'
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
      aria-label='Primary navigation'
    >
      <Link
        to='/'
        className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
          isHome ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <Home className='size-5' aria-hidden />
        <span>Home</span>
      </Link>

      <MobileSheet open={browseOpen} onOpenChange={setBrowseOpen}>
        <MobileSheetTrigger
          render={
            <button
              type='button'
              className='text-muted-foreground flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]'
            >
              <Menu className='size-5' aria-hidden />
              <span>Browse</span>
            </button>
          }
        />
        <MobileSheetContent title='Browse'>
          <AppSidebar />
        </MobileSheetContent>
      </MobileSheet>

      <MobileSheet open={createOpen} onOpenChange={setCreateOpen}>
        <MobileSheetTrigger
          render={
            <button
              type='button'
              className='text-foreground flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]'
            >
              {
                /* Filled background on the "+" so it reads as the
                 primary contribution affordance. Mobile contributors
                 watching an episode want this to feel like the action
                 button it is. */
              }
              <span className='bg-primary text-primary-foreground -mt-3 inline-flex size-9 items-center justify-center rounded-full shadow-md'>
                <Plus className='size-5' aria-hidden />
              </span>
              <span>New</span>
            </button>
          }
        />
        <MobileSheetContent title='Create a new entity' description='Pick the type to create.'>
          <ul className='divide-border divide-y'>
            {types.length === 0
              ? (
                <li className='text-muted-foreground px-4 py-3 text-xs'>
                  Loading types…
                </li>
              )
              : types.map((t) => (
                <li key={t.id}>
                  <Link
                    to='/types/$type/new'
                    params={{ type: t.id }}
                    className='block px-4 py-3 text-sm hover:bg-accent/40'
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
          </ul>
        </MobileSheetContent>
      </MobileSheet>

      <MobileSheet open={accountOpen} onOpenChange={setAccountOpen}>
        <MobileSheetTrigger
          render={
            <button
              type='button'
              className='text-muted-foreground flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]'
            >
              {user !== null
                ? <User2 className='size-5' aria-hidden />
                : <LogIn className='size-5' aria-hidden />}
              <span>{user !== null ? 'Account' : 'Sign in'}</span>
            </button>
          }
        />
        <MobileSheetContent title='Account'>
          <div className='space-y-3 px-4 py-3 text-sm'>
            {!loaded
              ? <p className='text-muted-foreground'>Loading…</p>
              : user === null
              ? (
                <Link
                  to='/login'
                  className='bg-primary text-primary-foreground inline-flex h-9 items-center rounded-md px-4 text-sm font-medium no-underline'
                >
                  Sign in
                </Link>
              )
              : (
                <>
                  <p className='font-medium'>
                    {user.kind === 'github' ? `@${user.login}` : user.nickname}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    {user.kind === 'github'
                      ? 'Signed in with GitHub.'
                      : 'Signed in anonymously — your edits are submitted under this pseudo.'}
                  </p>
                  <Button
                    variant='outline'
                    size='sm'
                    className='w-full gap-1.5'
                    onClick={async () => {
                      await auth.signOut();
                      globalThis.location.assign('/login');
                    }}
                  >
                    <LogOut className='size-3.5' />
                    Sign out
                  </Button>
                </>
              )}
          </div>
        </MobileSheetContent>
      </MobileSheet>
    </nav>
  );
}
