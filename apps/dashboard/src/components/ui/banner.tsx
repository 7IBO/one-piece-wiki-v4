import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactElement } from 'react';

import { cn } from '@/lib/utils';

/**
 * Inline callout/banner shared across the dashboard (PR-opened notices,
 * draft warnings, inline errors). Replaces the ad-hoc
 * `border-…/40 bg-…/5 rounded-[3px] border px-3 py-2 text-xs` blocks
 * that were copy-pasted across routes.
 *
 * Layout defaults to a wrapping flex row (icon/dot + text + optional
 * trailing action); override via `className` (tailwind-merge wins) for
 * `justify-between`, `mb-4`, tighter padding, etc.
 */
const bannerVariants = cva(
  'flex flex-wrap items-center gap-2 rounded-[3px] border px-3 py-2 text-xs',
  {
    variants: {
      variant: {
        info: 'border-primary/40 bg-primary/5 text-foreground',
        warning: 'border-amber-500/40 bg-amber-500/5 text-foreground',
        error: 'border-destructive/40 bg-destructive/5 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  },
);

type BannerProps = ComponentProps<'div'> & VariantProps<typeof bannerVariants>;

function Banner({ variant = 'info', className, role, ...props }: BannerProps): ReactElement {
  return (
    <div
      data-slot='banner'
      // Errors are assertive; informational/warning notices are polite.
      role={role ?? (variant === 'error' ? 'alert' : 'status')}
      className={cn(bannerVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Banner, bannerVariants };
