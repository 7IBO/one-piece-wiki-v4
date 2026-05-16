/**
 * Right-side sidebar that shows expanded details for the actively-
 * selected property:
 *  - All qualifiers (base + declared) for the current entry, always
 *    expanded — what was previously hidden behind "More options".
 *  - Older entries (history) for historical properties, each fully
 *    editable.
 *  - "Add entry" affordance for historical properties.
 *
 * The sticky right column saves vertical space in the centre form
 * (each row stays compact: value + since + trash) while keeping the
 * deep-edit affordances one click away.
 */
import { Button } from '@/components/ui/button';
import type { PropertyTypeSchema, VocabularySchema } from '@onepiece-wiki/schemas';
import { Plus, Trash2 } from 'lucide-react';
import { type JSX, useMemo } from 'react';
import type { Translations } from '../api';
import type { ValueInputContext, ValueType } from './inputs';
import { type QualifierDef, resolveQualifiers } from './qualifiers';

type PropertyEntry = Record<string, unknown>;

export type PropertyDetailsProps = {
  propertyId: string;
  propertyLabel: string;
  propertyType: PropertyTypeSchema;
  valueType: ValueType;
  valueField: 'value' | 'value_key';
  entries: readonly PropertyEntry[];
  translations: Translations;
  valueCtx: ValueInputContext;
  vocabularies: Record<string, VocabularySchema>;
  /** Renders the qualifier inputs — supplied by EntityForm so we share the
   *  same QualifierField component without circular imports. */
  renderQualifier: (args: {
    qualifier: QualifierDef;
    value: unknown;
    onChange: (next: unknown) => void;
  }) => JSX.Element;
  /** Renders the entry's value editor (translations + value input). */
  renderValue: (args: {
    entry: PropertyEntry;
    onUpdate: (next: PropertyEntry) => void;
  }) => JSX.Element;
  onUpdateEntry: (idx: number, next: PropertyEntry) => void;
  onRemoveEntry: (idx: number) => void;
  onAddEntry: () => void;
};

export function PropertyDetails(p: PropertyDetailsProps): JSX.Element {
  const isHistorical = p.propertyType.historical;
  const last = p.entries.length - 1;
  const currentIdx = isHistorical && p.entries.length > 0 ? last : 0;
  const olderIndices = isHistorical
    ? p.entries.map((_, i) => i).filter((i) => i !== currentIdx).reverse()
    : [];

  const { primary, secondary } = useMemo(
    () =>
      resolveQualifiers(
        p.propertyType.default_qualifiers,
        p.propertyType.allowed_qualifiers,
        ['since'],
      ),
    [p.propertyType],
  );
  // In the side panel we surface every qualifier (primary + secondary)
  // because there's no longer a "More options" toggle in the centre.
  const allQualifiers = [...primary, ...secondary];

  const currentEntry = p.entries[currentIdx];

  return (
    <div className='space-y-5 text-sm'>
      <header className='border-border border-b pb-2'>
        <p className='text-muted-foreground text-[11px] uppercase tracking-wide'>
          Active property
        </p>
        <p className='text-base font-medium'>{p.propertyLabel}</p>
      </header>

      {currentEntry !== undefined && allQualifiers.length > 0
        ? (
          <section className='space-y-2'>
            <h3 className='text-muted-foreground text-[11px] font-medium uppercase tracking-wide'>
              Qualifiers
            </h3>
            <div className='space-y-2'>
              {allQualifiers.map((q) =>
                p.renderQualifier({
                  qualifier: q,
                  value: currentEntry[q.id],
                  onChange: (v) => {
                    const next: PropertyEntry = { ...currentEntry };
                    if (
                      v === undefined
                      || v === null
                      || (typeof v === 'string' && v === '')
                    ) {
                      delete next[q.id];
                    } else {
                      next[q.id] = v;
                    }
                    p.onUpdateEntry(currentIdx, next);
                  },
                })
              )}
            </div>
          </section>
        )
        : null}

      {isHistorical
        ? (
          <section className='space-y-2'>
            <div className='flex items-center justify-between'>
              <h3 className='text-muted-foreground text-[11px] font-medium uppercase tracking-wide'>
                History ({olderIndices.length})
              </h3>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-7 px-2 text-xs'
                onClick={p.onAddEntry}
              >
                <Plus className='size-3.5' />
                Add entry
              </Button>
            </div>
            {olderIndices.length === 0
              ? (
                <p className='text-muted-foreground text-xs italic'>
                  No earlier entries.
                </p>
              )
              : (
                <ol className='space-y-2'>
                  {olderIndices.map((idx) => (
                    <li
                      key={idx}
                      className='border-border/60 bg-muted/20 space-y-2 rounded-md border border-dashed p-2'
                    >
                      {p.renderValue({
                        entry: p.entries[idx]!,
                        onUpdate: (next) => p.onUpdateEntry(idx, next),
                      })}
                      <div className='flex items-end gap-2'>
                        <div className='flex-1'>
                          {p.renderQualifier({
                            qualifier: {
                              id: 'since',
                              label: 'Since',
                              valueType: 'source_ref',
                              required: true,
                            },
                            value: p.entries[idx]?.['since'],
                            onChange: (v) => {
                              const next = { ...p.entries[idx]! };
                              if (
                                v === undefined
                                || v === null
                                || (typeof v === 'string' && v === '')
                              ) {
                                delete next['since'];
                              } else {
                                next['since'] = v;
                              }
                              p.onUpdateEntry(idx, next);
                            },
                          })}
                        </div>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='size-8'
                          onClick={() => p.onRemoveEntry(idx)}
                          aria-label='Remove entry'
                        >
                          <Trash2 className='size-4' />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
          </section>
        )
        : null}
    </div>
  );
}
