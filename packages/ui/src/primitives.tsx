/**
 * Thin layout primitives used by apps/dashboard. The dashboard composes
 * pages out of these to avoid scattering Tailwind class strings across
 * route components.
 */
import type { JSX, ReactNode } from 'react';
import { cn } from './cn.ts';

export function Page(
  { children, className }: { children: ReactNode; className?: string; },
): JSX.Element {
  return (
    <div
      className={cn(
        'min-h-screen bg-surface-primary text-text-primary font-sans antialiased',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Header(
  { children, className }: { children: ReactNode; className?: string; },
): JSX.Element {
  return (
    <header
      className={cn(
        'flex items-baseline gap-6 border-b border-border bg-surface-secondary px-6 py-4',
        className,
      )}
    >
      {children}
    </header>
  );
}

export function Content(
  { children, className }: { children: ReactNode; className?: string; },
): JSX.Element {
  return <main className={cn('mx-auto w-full max-w-4xl px-6 py-6', className)}>{children}</main>;
}

export function Card(
  { title, children, className }: { title?: ReactNode; children: ReactNode; className?: string; },
): JSX.Element {
  return (
    <section
      className={cn(
        'rounded-md border border-border bg-surface-secondary px-5 py-4',
        className,
      )}
    >
      {title !== undefined
        ? <h2 className='mb-2 text-base font-semibold text-text-secondary'>{title}</h2>
        : null}
      {children}
    </section>
  );
}

export function Badge(
  { children, kind = 'neutral' }: {
    children: ReactNode;
    kind?: 'neutral' | 'warn' | 'inferred';
  },
): JSX.Element {
  const palette = kind === 'warn'
    ? 'bg-warn/15 text-warn'
    : kind === 'inferred'
    ? 'bg-text-muted/15 text-text-muted'
    : 'bg-accent/15 text-accent';
  return (
    <span
      className={cn('inline-block rounded px-1.5 py-0.5 text-xs', palette)}
    >
      {children}
    </span>
  );
}
