import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';
import { useLocale } from '../form/locale';

/**
 * Shared load-failure notice (W-F, ADR-032). Replaces the ad-hoc
 * `<p className='text-destructive'>Failed: …</p>` copies; renders the
 * shared error Banner (assertive `role='alert'`) with human copy, the
 * technical message tucked into a muted `<details>`, and — when the
 * caller has a `reload` available — a Retry action so the page is
 * never a dead end.
 */
const STRINGS = {
  title: {
    en: 'Something went wrong loading this page.',
    fr: 'Une erreur est survenue lors du chargement de cette page.',
  },
  retry: { en: 'Retry', fr: 'Réessayer' },
  details: { en: 'Technical details', fr: 'Détails techniques' },
} as const;

export function LoadFailed(
  { message, onRetry }: {
    readonly message: string;
    /** Re-run the failed fetch (usually `reload` from useApiResource). */
    readonly onRetry?: () => void;
  },
): ReactElement {
  const locale = useLocale();
  return (
    <Banner variant='error'>
      <span>{STRINGS.title[locale]}</span>
      {onRetry !== undefined
        ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='ml-auto gap-1.5'
            onClick={onRetry}
          >
            <RefreshCw className='size-3.5' />
            {STRINGS.retry[locale]}
          </Button>
        )
        : null}
      <details className='text-muted-foreground basis-full'>
        <summary className='cursor-pointer select-none'>{STRINGS.details[locale]}</summary>
        <p className='mt-1 break-all font-mono'>{message}</p>
      </details>
    </Banner>
  );
}
