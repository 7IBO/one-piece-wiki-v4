/** The plate's section heading: 18px, 800, tight. */
import { type ReactElement } from 'react';

export function SectionTitle({ children }: { readonly children: React.ReactNode; }): ReactElement {
  return (
    <h2 className='display text-[18px] font-extrabold tracking-[-0.02em] text-fg'>{children}</h2>
  );
}
