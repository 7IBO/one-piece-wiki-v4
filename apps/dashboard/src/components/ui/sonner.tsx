import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Tracks whether the viewport is "mobile-shaped" so we can swap
 * toast positioning. Bottom-right on desktop (Linear-style); on
 * mobile we shift to bottom-center and offset above the BottomNav
 * (~60px + safe-area) to avoid covering the primary tab bar.
 */
function useIsMobileViewport(breakpointPx = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = globalThis.matchMedia?.(`(max-width: ${breakpointPx - 1}px)`);
    if (mql === undefined) return;
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent): void => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpointPx]);
  return isMobile;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();
  const isMobile = useIsMobileViewport();

  // Linear-style: neutral popover surface for every toast variant.
  // `richColors` is intentionally off so success/info/warning all look
  // identical to a default notification — only `error` keeps a
  // semantic accent (red border + red icon), surfaced via the
  // `toastOptions.classNames.error` hook below.
  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className='toaster group'
      icons={{
        success: <CircleCheckIcon className='size-4' />,
        info: <InfoIcon className='size-4' />,
        warning: <TriangleAlertIcon className='size-4' />,
        error: <OctagonXIcon className='size-4' />,
        loading: <Loader2Icon className='size-4 animate-spin' />,
      }}
      style={{
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--border-radius': 'var(--radius)',
      } as React.CSSProperties}
      mobileOffset={{ bottom: '5rem' }}
      {...props}
      position={isMobile ? 'bottom-center' : (props.position ?? 'bottom-right')}
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
          // Only error gets a semantic accent — neutral everywhere else.
          error:
            '!border-destructive/40 [&_[data-icon]]:!text-destructive [&_[data-content]_[data-title]]:!text-destructive',
        },
        ...props.toastOptions,
      }}
    />
  );
};

export { Toaster };
