/**
 * « Ce que tu viens de croiser » — the six works just behind the
 * cursor. Every one sits at or before it by construction, so titles
 * and artwork show in full: the one band on the page where nothing has
 * to be withheld, which is why the plate leads the column with it.
 */
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import type { CrossedView } from '../../api';
import { t } from '../../lib/chrome';
import { useLocale } from '../../routes/__root';
import { EntityImage } from '../EntityImage';
import { SectionTitle } from './SectionTitle';

export function Crossed(
  { items, span }: {
    readonly items: readonly CrossedView[];
    readonly span: { readonly from: number; readonly to: number; } | null;
  },
): ReactElement | null {
  const locale = useLocale();
  if (items.length === 0) return null;
  return (
    <section className='lg:col-span-8'>
      <div className='flex items-baseline justify-between gap-4'>
        <SectionTitle>{t(locale, 'homeCrossed')}</SectionTitle>
        {span !== null && (
          <span className='text-[11.5px] tabular-nums text-muted'>
            {items[0]?.typeLabel.toLowerCase()} {span.from}–{span.to}
          </span>
        )}
      </div>
      <ul className='mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6'>
        {items.map((item) => (
          <li key={`${item.sourceType}/${item.slug}`}>
            <Link
              to='/$type/$slug'
              params={{ type: item.sourceType, slug: item.slug }}
              className='group block no-underline'
            >
              <span className='block overflow-hidden rounded-[5px]'>
                <EntityImage
                  image={item.image}
                  type={item.sourceType}
                  slug={item.slug}
                  name={item.title ?? String(item.number)}
                  ratio='portrait'
                  className='w-full transition-transform duration-500 ease-out group-hover:scale-[1.05]'
                />
              </span>
              <span className='mt-1.5 block truncate text-[12.5px] font-semibold text-fg'>
                {item.title ?? `${item.typeLabel} ${item.number}`}
              </span>
              <span className='block truncate text-[10.5px] text-muted'>
                {item.typeLabel} {item.number}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
