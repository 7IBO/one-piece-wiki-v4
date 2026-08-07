import { Banner } from '@/components/ui/banner';
import type { ReactElement } from 'react';

/**
 * Shared load-failure notice (W-F, ADR-032). Replaces the ad-hoc
 * `<p className='text-destructive'>Failed: …</p>` copies; renders the
 * shared error Banner (assertive `role='alert'`).
 */
export function LoadFailed({ message }: { readonly message: string; }): ReactElement {
  return <Banner variant='error'>Failed: {message}</Banner>;
}
