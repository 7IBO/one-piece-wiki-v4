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
 * toast positioning. Top-right is fine on desktop; on a 360px phone
 * it stacks the toast under the header AND covers the right side of
 * the form (notch + thumb reach). `top-center` keeps the toast in
 * the user's visual focus and out of the way of action buttons.
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

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position={isMobile ? 'top-center' : (props.position ?? 'top-right')}
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
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
