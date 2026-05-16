/**
 * Provides a single shared `EntityEditDrawer` to the whole app and a
 * `useEntityDrawer()` hook for any component (entity-ref pickers,
 * relation cards, etc.) to request "edit this linked entity".
 *
 * Lives in the root layout. The hook returns `null` when no provider
 * is mounted, so leaf components can render a fallback (e.g. just a
 * link to the full page) when the drawer isn't available.
 */
import { createContext, type JSX, type ReactNode, useCallback, useContext, useState } from 'react';
import { EntityEditDrawer } from './EntityEditDrawer';

type DrawerTarget = { readonly type: string; readonly slug: string; };

type DrawerApi = {
  openEntity: (type: string, slug: string) => void;
};

const DrawerContext = createContext<DrawerApi | null>(null);

export function EntityDrawerProvider(
  { children }: { children: ReactNode; },
): JSX.Element {
  const [target, setTarget] = useState<DrawerTarget | null>(null);

  const openEntity = useCallback((type: string, slug: string) => {
    if (type === '' || slug === '') return;
    setTarget({ type, slug });
  }, []);

  return (
    <DrawerContext.Provider value={{ openEntity }}>
      {children}
      {target !== null
        ? (
          <EntityEditDrawer
            open
            onOpenChange={(o) => {
              if (!o) setTarget(null);
            }}
            type={target.type}
            slug={target.slug}
          />
        )
        : null}
    </DrawerContext.Provider>
  );
}

export function useEntityDrawer(): DrawerApi | null {
  return useContext(DrawerContext);
}
