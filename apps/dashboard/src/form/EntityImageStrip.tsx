/**
 * Read-only strip of the images an entity is depicted by, shown on the
 * entity edit page above the form. Each thumbnail links to the image
 * entity so the maintainer can jump in and edit its metadata.
 *
 * Everything here is schema-driven (ADR-070): the depiction relation and
 * the image-URL property are discovered from the catalogue, never named
 * literally. See `@onepiece-wiki/schemas` → images.ts.
 *
 * This is the display foundation for the wider images work (link an
 * existing image / upload a new one from here, inline-edit without
 * leaving the page) — those affordances land in later slices.
 */
import { ImageThumb } from '@/components/ImageThumb';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type Depiction,
  depictionsOf,
  imageEntityTypes,
  imageUrlOf,
  type PropertyTypeSchema,
  type RelationTypeSchema,
  resolveDisplayName,
} from '@onepiece-wiki/schemas';
import { Link } from '@tanstack/react-router';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { api, type TableEntity } from '../api';
import { useEntityDrawer } from './EntityDrawerProvider';
import { type Locale, useLocale, useT } from './locale';

export type EntityImageStripProps = {
  readonly data: Record<string, unknown>;
  readonly propertyTypes: Record<string, PropertyTypeSchema>;
  readonly relationTypes: Record<string, RelationTypeSchema>;
};

/** `primary_portrait` → `Primary portrait`. A vocab-resolved, localized
 *  label is a follow-up; the depiction role is secondary chrome here. */
function humanizeRole(role: string): string {
  const spaced = role.replace(/[_-]+/g, ' ').trim();
  return spaced.length === 0 ? role : spaced[0]!.toUpperCase() + spaced.slice(1);
}

export function EntityImageStrip(
  { data, propertyTypes, relationTypes }: EntityImageStripProps,
): JSX.Element | null {
  const t = useT();
  const locale = useLocale();

  const depictions = useMemo(
    () => depictionsOf(data, relationTypes, propertyTypes),
    [data, relationTypes, propertyTypes],
  );
  const imageTypes = useMemo(() => imageEntityTypes(propertyTypes), [propertyTypes]);

  // id → image entity, fetched in bulk per image type (one call each).
  // `null` while loading; a (possibly partial) map once resolved.
  const [images, setImages] = useState<Map<string, TableEntity> | null>(null);

  const hasDepictions = depictions.length > 0;

  useEffect(() => {
    if (!hasDepictions) return;
    let cancelled = false;
    Promise.all(imageTypes.map((type) => api.tableEntities(type)))
      .then((responses) => {
        if (cancelled) return;
        const map = new Map<string, TableEntity>();
        for (const res of responses) {
          for (const entity of res.entities) map.set(entity.id, entity);
        }
        setImages(map);
      })
      .catch(() => {
        // Non-fatal: render the depictions with broken-image fallbacks
        // rather than failing the whole page.
        if (!cancelled) setImages(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [hasDepictions, imageTypes]);

  if (!hasDepictions) return null;

  return (
    <section className='space-y-2'>
      <h2 className='text-muted-foreground text-[11px] font-medium uppercase tracking-wide'>
        {t('imagesHeading')} <span className='text-muted-foreground/60'>({depictions.length})</span>
      </h2>
      <div className='flex gap-3 overflow-x-auto pb-1'>
        {depictions.map((depiction, i) => (
          <DepictionCard
            key={`${depiction.imageId}:${i}`}
            depiction={depiction}
            image={images?.get(depiction.imageId)}
            loading={images === null}
            propertyTypes={propertyTypes}
            locale={locale}
          />
        ))}
      </div>
    </section>
  );
}

function DepictionCard(
  { depiction, image, loading, propertyTypes, locale }: {
    readonly depiction: Depiction;
    readonly image: TableEntity | undefined;
    readonly loading: boolean;
    readonly propertyTypes: Record<string, PropertyTypeSchema>;
    readonly locale: Locale;
  },
): JSX.Element {
  // Hook must run unconditionally — before the loading early-return.
  const drawer = useEntityDrawer();

  if (loading) {
    return <Skeleton className='size-20 shrink-0 rounded' />;
  }

  // IDs are `type:slug` (a documented invariant). Prefer the loaded
  // entity's own fields; fall back to splitting the id if the target
  // wasn't found (dangling relation).
  const [idType, idSlug] = depiction.imageId.split(':');
  const type = image?.type ?? idType ?? 'image';
  const slug = image?.slug ?? idSlug ?? depiction.imageId;

  const url = image !== undefined ? imageUrlOf(image.data, propertyTypes) : null;
  const name = image !== undefined
    ? resolveDisplayName(image.data, image.translations, locale)
    : null;
  const roleValue = depiction.qualifiers['role'];
  const role = typeof roleValue === 'string' && roleValue.length > 0
    ? humanizeRole(roleValue)
    : null;

  const label = name ?? depiction.imageId;
  const cardClass = 'group flex w-20 shrink-0 flex-col gap-1 text-left';
  const content = (
    <>
      {url !== null
        ? (
          <ImageThumb
            src={url}
            alt={name ?? ''}
            size={80}
            className='w-full transition group-hover:ring-2 group-hover:ring-ring'
          />
        )
        : (
          <div className='bg-muted text-muted-foreground/60 flex size-20 items-center justify-center rounded text-[9px]'>
            {slug}
          </div>
        )}
      {role !== null
        ? <Badge variant='secondary' className='max-w-full justify-start'>{role}</Badge>
        : null}
      <span className='text-muted-foreground max-w-full truncate text-[10px]'>
        {name ?? slug}
      </span>
    </>
  );

  // Prefer inline editing in the shared drawer (no navigation away);
  // fall back to a full-page link when no drawer provider is mounted.
  if (drawer !== null) {
    return (
      <button
        type='button'
        onClick={() => drawer.openEntity(type, slug)}
        className={cardClass}
        title={label}
      >
        {content}
      </button>
    );
  }
  return (
    <Link to='/types/$type/$slug' params={{ type, slug }} className={cardClass} title={label}>
      {content}
    </Link>
  );
}
