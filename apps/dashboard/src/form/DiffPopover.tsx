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
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { type JSX, useMemo, useState } from 'react';
import type { Translations } from '../api';
import { type Locale, useT } from './locale';

type EntityData = Record<string, unknown>;

/**
 * Two flavours per diff cell:
 *  - `summary` is the truncated single-line preview shown in the row
 *  - `full`   is the pretty-printed payload revealed when the row is
 *             expanded (multi-line JSON for objects/arrays, plain
 *             string with wrapping otherwise)
 *
 * Splitting them up-front keeps render trivial: no re-formatting on
 * each toggle, no layout thrash.
 */
type DiffCell = {
  readonly summary: string;
  readonly full: string;
};

type PropertyDiff = {
  readonly id: string;
  readonly label: string;
  readonly before: DiffCell;
  readonly after: DiffCell;
};

type TranslationDiff = {
  readonly key: string;
  readonly locale: Locale;
  readonly before: DiffCell;
  readonly after: DiffCell;
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
        className='w-[min(40rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto p-0'
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

/**
 * One row of the property/translation diff. When either before or
 * after is truncated, the whole row becomes click-to-expand: the
 * compact one-line preview stays in place, and a `<pre>` of the
 * pretty-printed before/after appears beneath it. Inline expansion
 * (no portal, no absolute-positioned tooltip) sidesteps the
 * popover's scroll-container clipping that broke the earlier
 * hover-card approach.
 */
function DiffRow(
  { label, before, after }: {
    label: React.ReactNode;
    before: DiffCell;
    after: DiffCell;
  },
): JSX.Element {
  const expandable = before.full !== before.summary || after.full !== after.summary;
  const [open, setOpen] = useState(false);

  const beforeIsEmpty = before.summary === '∅';
  const afterIsEmpty = after.summary === '∅';

  return (
    <li className='py-1.5'>
      {
        /* Whole header (label row + compact before/after) is one big
          button when the row is expandable, so clicking ANYWHERE in
          the summary toggles — not just the chevron. Falls back to a
          plain div when there's nothing to expand, so non-truncated
          rows don't get a hover-cursor that lies. */
      }
      {expandable
        ? (
          <button
            type='button'
            className='hover:bg-muted/40 -mx-2 flex w-[calc(100%+1rem)] flex-col gap-0.5 rounded-[3px] px-2 py-0.5 text-left'
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <DiffRowHeader open={open} expandable label={label} />
            <DiffRowSummary
              before={before}
              after={after}
              beforeIsEmpty={beforeIsEmpty}
              afterIsEmpty={afterIsEmpty}
            />
          </button>
        )
        : (
          <div>
            <DiffRowHeader open={false} expandable={false} label={label} />
            <DiffRowSummary
              before={before}
              after={after}
              beforeIsEmpty={beforeIsEmpty}
              afterIsEmpty={afterIsEmpty}
            />
          </div>
        )}
      {expandable && open
        ? (
          <div className='mt-1.5 ml-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2'>
            <ExpandedCell
              label={'−'}
              value={before.full}
              tone='before'
              isEmpty={beforeIsEmpty}
            />
            <ExpandedCell
              label={'+'}
              value={after.full}
              tone='after'
              isEmpty={afterIsEmpty}
            />
          </div>
        )
        : null}
    </li>
  );
}

function DiffRowHeader({
  open,
  expandable,
  label,
}: {
  open: boolean;
  expandable: boolean;
  label: React.ReactNode;
}): JSX.Element {
  return (
    <div className='flex items-center gap-1'>
      {expandable
        ? (open
          ? <ChevronDown className='size-3 shrink-0 opacity-50' />
          : <ChevronRight className='size-3 shrink-0 opacity-50' />)
        : <span className='size-3 shrink-0' aria-hidden='true' />}
      <span className='text-foreground min-w-0 flex-1 truncate text-[11px] font-medium'>
        {label}
      </span>
    </div>
  );
}

function DiffRowSummary({
  before,
  after,
  beforeIsEmpty,
  afterIsEmpty,
}: {
  before: DiffCell;
  after: DiffCell;
  beforeIsEmpty: boolean;
  afterIsEmpty: boolean;
}): JSX.Element {
  return (
    <div className='ml-4 flex items-center gap-1.5 text-[11px]'>
      <span
        className={`min-w-0 max-w-[14rem] flex-1 truncate font-mono text-[10px] ${
          beforeIsEmpty ? 'text-muted-foreground italic' : 'line-through opacity-70'
        }`}
      >
        {before.summary}
      </span>
      <ArrowRight className='size-3 shrink-0 opacity-50' />
      <span
        className={`min-w-0 flex-1 truncate font-mono text-[10px] ${
          afterIsEmpty ? 'text-muted-foreground italic' : 'text-emerald-500'
        }`}
      >
        {after.summary}
      </span>
    </div>
  );
}

function ExpandedCell({
  label,
  value,
  tone,
  isEmpty,
}: {
  label: string;
  value: string;
  tone: 'before' | 'after';
  isEmpty: boolean;
}): JSX.Element {
  const toneClass = isEmpty
    ? 'text-muted-foreground italic'
    : tone === 'before'
    ? 'text-foreground/70 line-through decoration-1 decoration-foreground/40'
    : 'text-emerald-500';
  return (
    <div className='border-border bg-muted/30 rounded-[3px] border p-2'>
      <p className='text-muted-foreground mb-1 text-[9px] font-mono uppercase tracking-wider'>
        {label}
      </p>
      <pre
        className={`m-0 max-h-[16rem] overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-tight ${toneClass}`}
      >
        {value}
      </pre>
    </div>
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
    const before = formatCell(initProps[key]);
    const after = formatCell(currProps[key]);
    if (before.full !== after.full) {
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
          before: stringCell(before),
          after: stringCell(after),
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

/**
 * Build a `{summary, full}` cell for a property value. `summary` is
 * the truncated single-line preview that fits in the row; `full` is
 * the pretty-printed payload revealed on hover when it actually
 * differs from the summary.
 *
 * `∅` is used for empty/absent values so a deleted property or a
 * cleared string is visually distinct from an empty array `[]`.
 */
function formatCell(v: unknown): DiffCell {
  if (v === undefined || v === null) return { summary: '∅', full: '∅' };
  if (typeof v === 'string') {
    return stringCell(v);
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    const s = String(v);
    return { summary: s, full: s };
  }
  let compact: string;
  let pretty: string;
  try {
    compact = JSON.stringify(v);
    pretty = JSON.stringify(v, null, 2);
  } catch {
    const s = String(v);
    return { summary: s, full: s };
  }
  const summary = compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
  return { summary, full: pretty };
}

function stringCell(v: string): DiffCell {
  if (v === '') return { summary: '∅', full: '∅' };
  const summary = v.length > 120 ? `${v.slice(0, 117)}…` : v;
  return { summary, full: v };
}
