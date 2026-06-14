/**
 * "Create new entity" route — ADR-020. Wraps `EntityForm` with a
 * blank initial state and a `SlugInput` above it. The slug is the
 * mandatory entry point: the form is unavailable until a valid +
 * unique slug is picked, because EntityForm's i18n-key generator
 * (`makeI18nKey`) bakes `type.slug.*` into every translation key
 * generated for properties the user fills.
 *
 * Save flow:
 *  - Calls `api.createEntity(type, slug, data, translations)`, which
 *    hits POST /api/entities/:type and opens a PR titled
 *    `[DATA] Create <type>:<slug>`.
 *  - On success we DO NOT redirect to `/types/$type/$slug` — the new
 *    entity isn't visible to the dashboard's bundled data source
 *    until Vercel rebuilds (ADR-019). Showing a "Your entity is in
 *    PR #N" toast + a link to the PR is the honest UX; the home
 *    page's "Vos contributions" section also surfaces it.
 *
 * Mobile-first: the slug input + EntityForm both inherit the
 * `@media (pointer: coarse)` touch-target rule from `styles.css`.
 * No extra mobile work needed at this layer.
 */
import { Badge } from '@/components/ui/badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ExternalLink, GitPullRequest } from 'lucide-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type SchemaCatalogue, type SourceRef } from '../api';
import { EntityForm } from '../form/EntityForm';
import { useLocale, useT } from '../form/locale';
import { SlugInput } from '../form/SlugInput';
import { slugify } from '../lib/slugify';

export const Route = createFileRoute('/types/$type/new')({
  component: EntityCreateComponent,
});

function EntityCreateComponent(): JSX.Element {
  const { type } = Route.useParams() as { type: string; };
  const locale = useLocale();
  const t = useT();
  const navigate = useNavigate();

  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [sources, setSources] = useState<readonly SourceRef[]>([]);
  const [i18nKeys, setI18nKeys] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Two-field gate, in order: (1) display name (EN), (2) slug.
  // The slug auto-derives from the name via `slugify` until the user
  // edits the slug input directly — that flips `slugTouched` and the
  // auto-sync stops, so they can override "monkey-d-luffy" → "luffy"
  // without the next keystroke in the name field clobbering it.
  // EN is canonical because slugs MUST be English-ASCII (see
  // `packages/schemas/src/primitives.ts` SLUG regex).
  const [nameEn, setNameEn] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugValid, setSlugValid] = useState(false);
  useEffect(() => {
    if (slugTouched) return;
    setSlug(slugify(nameEn));
  }, [nameEn, slugTouched]);
  // The slug doubles as a React key on EntityForm so changing it
  // mid-flow remounts the form (and discards in-progress edits).
  // This is the lesser evil — keeping the form mounted means i18n
  // keys baked from the old slug would leak into the saved entity.
  // The two-field gate above means the user only sees the form once
  // both fields are settled, so this remount-on-slug-change rarely
  // bites in practice.
  const [creating, setCreating] = useState(false);
  const [openedPR, setOpenedPR] = useState<{ number: number; htmlUrl: string; } | null>(
    null,
  );

  useEffect(() => {
    Promise.all([api.schemas(), api.sources(), api.i18nKeys()])
      .then(([s, src, keys]) => {
        setSchemas(s);
        setSources(src);
        setI18nKeys(keys);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const entityTypeLabel = useMemo(() => {
    if (schemas === null) return type;
    const et = schemas.entityTypes[type];
    return et?.labels[locale] ?? et?.labels.en ?? type;
  }, [schemas, type, locale]);

  // The display name typed in the gate above is pre-seeded into the
  // form's first `name` entry so the user doesn't type it twice. The
  // i18n key shape (`type.slug.name.0`) mirrors `makeI18nKey` in
  // EntityForm for the first entry of a historical property. Once the
  // form is mounted, the name lives inside EntityForm's state — this
  // seeding is one-shot at mount time only (gated by `key={slug}`).
  const nameKey = `${type}.${slug}.name.0`;
  const initialData = useMemo(
    () => ({
      id: `${type}:${slug}`,
      type,
      slug,
      properties: nameEn !== '' ? { name: [{ value_key: nameKey }] } : {},
      relations: [],
    }),
    [type, slug, nameEn, nameKey],
  );
  const initialTranslations = useMemo(
    () => ({
      en: nameEn !== '' ? { [nameKey]: nameEn } : {},
      fr: {},
    }),
    [nameEn, nameKey],
  );

  if (error !== null) {
    return <p className='text-destructive'>Failed: {error}</p>;
  }
  if (schemas === null) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-32 w-full' />
      </div>
    );
  }
  const entityType = schemas.entityTypes[type];
  if (entityType === undefined) {
    return <p className='text-destructive'>No entity-type schema for {type}.</p>;
  }

  return (
    <div className='space-y-4'>
      <div className='border-border border-b pb-3'>
        <Button
          render={<Link to='/types/$type' params={{ type }} />}
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-1.5 h-6 px-1.5 text-[11px]'
        >
          <ChevronLeft className='size-3' />
          {entityTypeLabel}
        </Button>
        <div className='mt-1 flex flex-wrap items-center gap-2'>
          <h1 className='text-xl font-semibold tracking-tight'>
            {t('newEntityLabel')} {entityTypeLabel}
          </h1>
          <Badge variant='outline' className='text-amber-500 ml-auto text-[10px]'>
            {t('draftLabel')}
          </Badge>
        </div>
      </div>

      {openedPR !== null
        ? (
          <Banner variant='info'>
            <GitPullRequest className='text-primary size-4 shrink-0' />
            <span>
              {t('newPrBannerPre')} #{openedPR.number}
              {t('newPrBannerPost')}
            </span>
            <a
              href={openedPR.htmlUrl}
              target='_blank'
              rel='noreferrer'
              className='text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-[11px]'
            >
              PR #{openedPR.number}
              <ExternalLink className='size-3' />
            </a>
          </Banner>
        )
        : null}

      <div className='max-w-xl space-y-4'>
        <div className='space-y-1.5'>
          <Label htmlFor='entity-name-en'>{t('nameEnglish')}</Label>
          <Input
            id='entity-name-en'
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder={t('namePlaceholder')}
            disabled={creating || openedPR !== null}
            autoComplete='off'
            spellCheck={false}
          />
          <p className='text-muted-foreground text-xs'>
            {t('nameFromSlugHelp')}
          </p>
        </div>
        <SlugInput
          type={type}
          value={slug}
          onChange={(next) => {
            setSlug(next);
            setSlugTouched(true);
          }}
          onValidChange={setSlugValid}
          disabled={creating || openedPR !== null}
        />
      </div>

      {nameEn === '' || !slugValid
        ? (
          <div className='text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm'>
            {nameEn === '' ? t('newGateName') : t('newGateSlug')}
          </div>
        )
        : (
          <EntityForm
            // Slug-as-key: changing the slug remounts the form so we
            // never carry over i18n keys baked from a prior slug.
            key={slug}
            entityId={`${type}:${slug}`}
            entityType={entityType}
            entityTypes={schemas.entityTypes}
            propertyTypes={schemas.propertyTypes}
            relationTypes={schemas.relationTypes}
            vocabularies={schemas.vocabularies}
            sources={sources}
            i18nKeys={i18nKeys}
            initialData={initialData}
            initialTranslations={initialTranslations}
            // Show only required properties — the contributor fills
            // the bare minimum, ships a PR, then keeps editing on the
            // full edit page (which auto-loads the open PR via
            // `resumePR`, so optional fields and relations land as
            // commits on the same branch).
            requiredOnly
            onSave={async (next, translations) => {
              setCreating(true);
              try {
                const result = await api.createEntity(type, slug, next, translations);
                if (result.pr.noOp) {
                  toast.info(t('nothingToSaveYet'));
                  return;
                }
                setOpenedPR({ number: result.pr.number, htmlUrl: result.pr.htmlUrl });
                toast.success(
                  `${t('createPrOpened')} (#${result.pr.number})`,
                  {
                    description: result.pr.htmlUrl,
                    action: {
                      label: 'Open',
                      onClick: () => globalThis.open(result.pr.htmlUrl, '_blank'),
                    },
                  },
                );
                // Redirect to the full edit page so the contributor
                // can fill the optional properties + relations. The
                // page hits `getEntity`, which the server resolves
                // off the just-opened PR branch (resumePR codepath),
                // so subsequent saves append commits to the same PR
                // instead of opening a new one.
                await navigate({
                  to: '/types/$type/$slug',
                  params: { type, slug },
                });
              } finally {
                setCreating(false);
              }
            }}
          />
        )}
    </div>
  );
}
