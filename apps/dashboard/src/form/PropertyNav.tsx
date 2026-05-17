/**
 * Sticky left-side navigation listing every property of the entity
 * type, grouped by the form's section taxonomy (Identity, Numbers,
 * Dates, …). For every group + an overall summary it shows a
 * compact progress bar and a required-missing badge, so a maintainer
 * sees at a glance how far they've gone and where the gaps are.
 *
 * Click an entry to scroll the form to it. Click an optional-empty
 * entry to "reveal" it — the form seeds a blank row and scrolls to
 * the newly-mounted node.
 *
 * State-only component: owns no entity state, just mirrors what
 * `EntityForm` computes.
 */
import { Check, Circle, Dot } from 'lucide-react';
import { type JSX, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from 'react';
import { useT } from './locale';

export function propertyAnchorId(propertyId: string): string {
  return `prop-${propertyId}`;
}

export type NavEntry = {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
  readonly filled: boolean;
  /** Section taxonomy id from the form's FORM_SECTIONS. */
  readonly sectionId: string;
  /** i18n key for the section label, resolved here against `useT`. */
  readonly sectionLabelKey:
    | 'sectionIdentity'
    | 'sectionNumbers'
    | 'sectionDates'
    | 'sectionCategorical'
    | 'sectionBoolean'
    | 'sectionReferences'
    | 'sectionOther';
};

type PropertyNavProps = {
  entries: readonly NavEntry[];
  /** Called when the user clicks a hidden (empty + optional) property. */
  onReveal: (propertyId: string) => void;
  /** Optional: called after every click (filled, required, or hidden).
   *  Used by the mobile bottom-sheet wrapper to close itself once the
   *  user has picked a section. Desktop usage leaves it undefined. */
  onPick?: (propertyId: string) => void;
};

type Group = {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavEntry[];
  readonly filled: number;
  readonly required: number;
  readonly requiredMissing: number;
};

export function PropertyNav(p: PropertyNavProps): JSX.Element {
  const t = useT();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Track which property is in view via IntersectionObserver —
  // highlights the matching nav row as the user scrolls.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length === 0) return;
        const id = visible[0]!.target.id.replace(/^prop-/, '');
        setActiveId(id);
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const e of p.entries) {
      const el = document.getElementById(propertyAnchorId(e.id));
      if (el !== null) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [p.entries]);

  function handleClick(entry: NavEntry, ev: ReactMouseEvent): void {
    ev.preventDefault();
    if (!entry.filled && !entry.required) {
      p.onReveal(entry.id);
    }
    requestAnimationFrame(() => {
      const el = document.getElementById(propertyAnchorId(entry.id));
      if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    p.onPick?.(entry.id);
  }

  // Group entries by sectionId, preserving the order they first
  // appear so the nav matches the form's render order.
  const groups: readonly Group[] = useMemo(() => {
    const byId = new Map<string, NavEntry[]>();
    const labels = new Map<string, NavEntry['sectionLabelKey']>();
    for (const e of p.entries) {
      const arr = byId.get(e.sectionId) ?? [];
      arr.push(e);
      byId.set(e.sectionId, arr);
      labels.set(e.sectionId, e.sectionLabelKey);
    }
    return [...byId.entries()].map(([sectionId, items]) => {
      const filled = items.filter((e) => e.filled).length;
      const required = items.filter((e) => e.required).length;
      const requiredMissing = items.filter((e) => e.required && !e.filled).length;
      const labelKey = labels.get(sectionId)!;
      return {
        id: sectionId,
        label: t(labelKey),
        items,
        filled,
        required,
        requiredMissing,
      };
    });
  }, [p.entries, t]);

  const totalFilled = p.entries.filter((e) => e.filled).length;
  const totalRequiredMissing = p.entries.filter((e) => e.required && !e.filled).length;
  const totalProgress = p.entries.length === 0 ? 0 : totalFilled / p.entries.length;

  return (
    <nav className='flex max-h-[calc(100vh-8rem)] flex-col text-sm'>
      <div className='border-border mb-3 border-b pb-3'>
        <p className='text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase tracking-wider'>
          {t('propertiesHeader')}
        </p>
        <ProgressBar
          value={totalProgress}
          filled={totalFilled}
          total={p.entries.length}
          requiredMissing={totalRequiredMissing}
          filledLabel={t('filledProgress')}
          missingLabel={t('requiredMissing')}
        />
      </div>
      <div className='flex-1 overflow-y-auto pr-1'>
        <ul className='space-y-3'>
          {groups.map((g) => (
            <li key={g.id} className='space-y-1'>
              <div className='px-2'>
                <div className='flex items-baseline justify-between gap-2'>
                  <span className='text-muted-foreground text-[10px] font-semibold uppercase tracking-wider'>
                    {g.label}
                  </span>
                  <span className='text-muted-foreground tabular-nums text-[10px]'>
                    {g.filled}/{g.items.length}
                  </span>
                </div>
                <div className='bg-muted/40 mt-1 h-0.5 w-full overflow-hidden rounded-full'>
                  <div
                    className={g.requiredMissing > 0
                      ? 'bg-amber-500 h-full transition-all'
                      : 'bg-emerald-500/60 h-full transition-all'}
                    style={{ width: `${(g.filled / Math.max(g.items.length, 1)) * 100}%` }}
                  />
                </div>
              </div>
              <ul className='space-y-0.5'>
                {g.items.map((entry) => {
                  const isActive = activeId === entry.id;
                  return (
                    <li key={entry.id}>
                      <a
                        href={`#${propertyAnchorId(entry.id)}`}
                        onClick={(ev) => handleClick(entry, ev)}
                        className={`flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
                        }`}
                      >
                        <StatusIcon entry={entry} />
                        <span className='flex-1 truncate'>{entry.label}</span>
                        {entry.required && !entry.filled
                          ? (
                            <span
                              className='text-destructive font-bold'
                              title={t('required')}
                              aria-label={t('required')}
                            >
                              *
                            </span>
                          )
                          : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function ProgressBar(p: {
  value: number;
  filled: number;
  total: number;
  requiredMissing: number;
  filledLabel: string;
  missingLabel: string;
}): JSX.Element {
  const pct = Math.round(p.value * 100);
  return (
    <div>
      <div className='mb-1 flex items-baseline justify-between gap-2 text-[11px]'>
        <span className='tabular-nums font-medium'>
          {p.filled}/{p.total}{' '}
          <span className='text-muted-foreground font-normal'>{p.filledLabel}</span>
        </span>
        {p.requiredMissing > 0
          ? (
            <span className='text-amber-500 tabular-nums text-[10px]'>
              ● {p.requiredMissing} {p.missingLabel}
            </span>
          )
          : null}
      </div>
      <div className='bg-muted/50 h-1.5 w-full overflow-hidden rounded-full'>
        <div
          className={p.requiredMissing > 0
            ? 'bg-amber-500 h-full transition-all'
            : 'bg-emerald-500 h-full transition-all'}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusIcon({ entry }: { entry: NavEntry; }): JSX.Element {
  if (entry.filled) {
    return <Check className='text-emerald-500 size-3 shrink-0' />;
  }
  if (entry.required) {
    return <Dot className='text-amber-500 size-4 shrink-0' />;
  }
  return <Circle className='text-muted-foreground/40 size-2.5 shrink-0' />;
}
