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
  // A STACK of targets, not a single one. Opening a linked entity from
  // inside an already-open drawer pushes a new level on top, so editing
  // A → B → C never discards the level beneath: every drawer stays
  // mounted (preserving its in-progress form state) and closing the top
  // pops back to the previous one intact. The old single-target version
  // silently clobbered the parent edit on the A → B → C path.
  const [stack, setStack] = useState<readonly DrawerTarget[]>([]);

  const openEntity = useCallback((type: string, slug: string) => {
    if (type === '' || slug === '') return;
    setStack((prev) => {
      const top = prev[prev.length - 1];
      // Re-opening the entity already on top is a no-op (e.g. a double
      // click on the same pencil).
      if (top !== undefined && top.type === type && top.slug === slug) return prev;
      return [...prev, { type, slug }];
    });
  }, []);

  const closeFrom = useCallback((index: number) => {
    setStack((prev) => prev.slice(0, index));
  }, []);

  return (
    <DrawerContext.Provider value={{ openEntity }}>
      {children}
      {stack.map((target, i) => (
        <EntityEditDrawer
          key={`${i}:${target.type}:${target.slug}`}
          open
          depth={i}
          isTop={i === stack.length - 1}
          onOpenChange={(o) => {
            if (!o) closeFrom(i);
          }}
          type={target.type}
          slug={target.slug}
        />
      ))}
    </DrawerContext.Provider>
  );
}

export function useEntityDrawer(): DrawerApi | null {
  return useContext(DrawerContext);
}
