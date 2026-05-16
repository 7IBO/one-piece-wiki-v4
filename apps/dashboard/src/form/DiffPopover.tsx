/**
 * "● N modifications non sauvegardées" trigger in the save bar that
 * pops a per-field diff list so the maintainer can verify exactly
 * what's about to land in a PR before clicking Save. Three sections:
 *
 *  - **Properties** — each touched property id, with a short before /
 *    after rendering. Arrays/objects are JSON-stringified compact.
 *  - **Translations** — touched i18n keys, per-locale (en / fr).
 *  - **Relations** — total count delta + added/removed targets per
 *    relation type so multi-target edits stay readable.
 *
 * Diff is computed on demand (only when the popover is open), so the
 * cost stays out of the hot render path for big entities.
 */
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowRight } from 'lucide-react';
import { type JSX, useMemo } from 'react';
import type { Translations } from '../api';
import { type Locale, useT } from './locale';

type EntityData = Record<string, unknown>;

type PropertyDiff = {
  readonly id: string;
  readonly label: string;
  readonly before: string;
  readonly after: string;
};

type TranslationDiff = {
  readonly key: string;
  readonly locale: Locale;
  readonly before: string;
  readonly after: string;
};

type RelationDiff = {
  readonly type: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
};

export function DiffPopover(p: {
  propertyLabels: Record<string, string>;
  initialData: EntityData;
  initialTranslations: Translations;
  data: EntityData;
  translations: Translations;
  locale: Locale;
}): JSX.Element {
  const t = useT();
  const { properties, translations, relations, total } = useMemo(
    () => computeDiff(p),
    [p.initialData, p.initialTranslations, p.data, p.translations, p.propertyLabels],
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant='ghost'
            size='sm'
            className='h-7 gap-1.5 px-2 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500'
          />
        }
      >
        <span className='inline-block size-1.5 rounded-full bg-amber-500' />
        <span className='font-mono tabular-nums text-[11px]'>{total}</span>
        <span className='text-[11px]'>{t('unsavedChanges')}</span>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        side='top'
        className='w-[28rem] max-h-[60vh] overflow-y-auto p-0'
      >
        <div className='border-b px-3 py-2'>
          <p className='text-[10px] font-semibold uppercase tracking-wider'>
            {t('unsavedChanges')} · {total}
          </p>
        </div>
        <div className='space-y-3 p-3'>
          {properties.length > 0
            ? (
              <DiffSection title={t('propertiesHeader')}>
                {properties.map((d) => (
                  <DiffRow
                    key={d.id}
                    label={d.label}
                    before={d.before}
                    after={d.after}
                  />
                ))}
              </DiffSection>
            )
            : null}
          {translations.length > 0
            ? (
              <DiffSection title={t('translations')}>
                {translations.map((d) => (
                  <DiffRow
                    key={`${d.locale}-${d.key}`}
                    label={
                      <span>
                        <span className='bg-muted text-muted-foreground mr-1.5 rounded-[3px] px-1 py-0.5 font-mono text-[9px] uppercase'>
                          {d.locale}
                        </span>
                        {d.key}
                      </span>
                    }
                    before={d.before}
                    after={d.after}
                  />
                ))}
              </DiffSection>
            )
            : null}
          {relations.length > 0
            ? (
              <DiffSection title={t('relations')}>
                {relations.map((d) => <RelationDiffRow key={d.type} diff={d} />)}
              </DiffSection>
            )
            : null}
          {total === 0
            ? (
              <p className='text-muted-foreground py-2 text-center text-xs'>
                {t('noChanges')}
              </p>
            )
            : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DiffSection(
  { title, children }: { title: string; children: React.ReactNode; },
): JSX.Element {
  return (
    <section className='space-y-1'>
      <h3 className='text-muted-foreground text-[10px] font-semibold uppercase tracking-wider'>
        {title}
      </h3>
      <ul className='divide-border/60 divide-y'>{children}</ul>
    </section>
  );
}

function DiffRow(
  { label, before, after }: {
    label: React.ReactNode;
    before: string;
    after: string;
  },
): JSX.Element {
  return (
    <li className='py-1.5'>
      <p className='text-foreground mb-0.5 truncate text-[11px] font-medium'>{label}</p>
      <div className='flex items-center gap-1.5 text-[11px]'>
        <span
          className={`min-w-0 max-w-[10rem] flex-1 truncate font-mono text-[10px] ${
            before === '∅' ? 'text-muted-foreground italic' : 'line-through opacity-70'
          }`}
          title={before}
        >
          {before}
        </span>
        <ArrowRight className='size-3 shrink-0 opacity-50' />
        <span
          className={`min-w-0 flex-1 truncate font-mono text-[10px] ${
            after === '∅' ? 'text-muted-foreground italic' : 'text-emerald-500'
          }`}
          title={after}
        >
          {after}
        </span>
      </div>
    </li>
  );
}

function RelationDiffRow({ diff }: { diff: RelationDiff; }): JSX.Element {
  return (
    <li className='py-1.5'>
      <p className='text-foreground mb-1 truncate text-[11px] font-medium font-mono'>
        {diff.type}
      </p>
      <div className='flex flex-wrap gap-1'>
        {diff.added.map((t) => (
          <span
            key={`+${t}`}
            className='bg-emerald-500/10 text-emerald-500 inline-flex items-center gap-0.5 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px]'
          >
            + {t}
          </span>
        ))}
        {diff.removed.map((t) => (
          <span
            key={`-${t}`}
            className='bg-destructive/10 text-destructive inline-flex items-center gap-0.5 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] line-through'
          >
            − {t}
          </span>
        ))}
      </div>
    </li>
  );
}

/* ──────────────────── diff computation ──────────────────── */

function computeDiff(p: {
  propertyLabels: Record<string, string>;
  initialData: EntityData;
  initialTranslations: Translations;
  data: EntityData;
  translations: Translations;
}): {
  properties: readonly PropertyDiff[];
  translations: readonly TranslationDiff[];
  relations: readonly RelationDiff[];
  total: number;
} {
  const propertyDiffs: PropertyDiff[] = [];
  const initProps = (p.initialData['properties'] as Record<string, unknown> | undefined) ?? {};
  const currProps = (p.data['properties'] as Record<string, unknown> | undefined) ?? {};
  const propKeys = new Set([...Object.keys(initProps), ...Object.keys(currProps)]);
  for (const key of propKeys) {
    const before = formatValue(initProps[key]);
    const after = formatValue(currProps[key]);
    if (before !== after) {
      propertyDiffs.push({
        id: key,
        label: p.propertyLabels[key] ?? key,
        before,
        after,
      });
    }
  }
  propertyDiffs.sort((a, b) => a.label.localeCompare(b.label));

  const translationDiffs: TranslationDiff[] = [];
  for (const locale of ['en', 'fr'] as const) {
    const init = p.initialTranslations[locale] ?? {};
    const curr = p.translations[locale] ?? {};
    const keys = new Set([...Object.keys(init), ...Object.keys(curr)]);
    for (const key of keys) {
      const before = init[key] ?? '';
      const after = curr[key] ?? '';
      if (before !== after) {
        translationDiffs.push({
          locale,
          key,
          before: before === '' ? '∅' : before,
          after: after === '' ? '∅' : after,
        });
      }
    }
  }
  translationDiffs.sort((a, b) => a.locale.localeCompare(b.locale) || a.key.localeCompare(b.key));

  const relationDiffs = diffRelations(
    p.initialData['relations'],
    p.data['relations'],
  );

  const total = propertyDiffs.length + translationDiffs.length
    + relationDiffs.reduce((n, r) => n + r.added.length + r.removed.length, 0);
  return {
    properties: propertyDiffs,
    translations: translationDiffs,
    relations: relationDiffs,
    total,
  };
}

function diffRelations(initial: unknown, current: unknown): readonly RelationDiff[] {
  const initList = Array.isArray(initial) ? (initial as { type: string; target: string; }[]) : [];
  const currList = Array.isArray(current) ? (current as { type: string; target: string; }[]) : [];
  const byType = new Map<string, { before: Set<string>; after: Set<string>; }>();
  for (const r of initList) {
    const b = byType.get(r.type) ?? { before: new Set(), after: new Set() };
    if (r.target !== '') b.before.add(r.target);
    byType.set(r.type, b);
  }
  for (const r of currList) {
    const b = byType.get(r.type) ?? { before: new Set(), after: new Set() };
    if (r.target !== '') b.after.add(r.target);
    byType.set(r.type, b);
  }
  const out: RelationDiff[] = [];
  for (const [type, { before, after }] of byType) {
    const added = [...after].filter((t) => !before.has(t));
    const removed = [...before].filter((t) => !after.has(t));
    if (added.length === 0 && removed.length === 0) continue;
    out.push({ type, added, removed });
  }
  out.sort((a, b) => a.type.localeCompare(b.type));
  return out;
}

/** Compact JSON-ish rendering for diff cells. `∅` for empty/absent. */
function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '∅';
  if (typeof v === 'string') return v === '' ? '∅' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return String(v);
  }
}
