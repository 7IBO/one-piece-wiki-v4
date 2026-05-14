/**
 * Schema-driven entity form. Walks the entity-type's `properties`
 * list, looks up each property-type from the catalogue, and renders
 * a row per property using the value-input registry. Historical
 * properties get an array editor (one entry per historisable value).
 *
 * Phase 4.2.1: pickers replace free-text where the catalogue has
 * better data — enums use the real vocabulary values, source_ref
 * uses /api/sources, i18n_key has datalist suggestions from
 * /api/i18n-keys.
 */
import type {
  EntityTypeSchema,
  PropertyTypeSchema,
  VocabularySchema,
} from '@onepiece-wiki/schemas';
import { Card } from '@onepiece-wiki/ui';
import { type JSX, useState } from 'react';
import type { SourceRef } from '../api.ts';
import { ValueInput, type ValueInputContext, type ValueType } from './inputs.tsx';

type PropertyEntry = Record<string, unknown>;
type PropertyValue = PropertyEntry | PropertyEntry[];
type EntityData = Record<string, unknown> & {
  properties?: Record<string, PropertyValue>;
};

export type EntityFormProps = {
  entityType: EntityTypeSchema;
  propertyTypes: Record<string, PropertyTypeSchema>;
  vocabularies: Record<string, VocabularySchema>;
  sources: readonly SourceRef[];
  i18nKeys: readonly string[];
  initialData: EntityData;
  onSave: (next: EntityData) => Promise<void>;
};

function getValueField(propertyType: PropertyTypeSchema): 'value' | 'value_key' {
  return propertyType.localizable ? 'value_key' : 'value';
}

function entries(value: PropertyValue | undefined): PropertyEntry[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function enumValuesFor(
  propertyType: PropertyTypeSchema,
  vocabularies: Record<string, VocabularySchema>,
): readonly { id: string; label?: string; }[] {
  const enumRef = propertyType.value_constraints?.enum_ref;
  if (enumRef === undefined) return [];
  const vocab = vocabularies[enumRef];
  if (vocab === undefined) return [];
  return Object.entries(vocab.values).map(([id, v]) => ({
    id,
    label: v.labels.en,
  }));
}

export function EntityForm(props: EntityFormProps): JSX.Element {
  const [data, setData] = useState<EntityData>(props.initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateEntry(
    propertyId: string,
    historical: boolean,
    entryIndex: number,
    next: PropertyEntry,
  ): void {
    setData((prev) => {
      const properties = { ...prev.properties };
      if (historical) {
        const list = entries(properties[propertyId]).slice();
        list[entryIndex] = next;
        properties[propertyId] = list;
      } else {
        properties[propertyId] = next;
      }
      return { ...prev, properties };
    });
  }

  function addEntry(propertyId: string, valueField: 'value' | 'value_key'): void {
    setData((prev) => {
      const properties = { ...prev.properties };
      const list = entries(properties[propertyId]).slice();
      list.push({ [valueField]: valueField === 'value' ? '' : '', since: '' });
      properties[propertyId] = list;
      return { ...prev, properties };
    });
  }

  function removeEntry(propertyId: string, entryIndex: number): void {
    setData((prev) => {
      const properties = { ...prev.properties };
      const list = entries(properties[propertyId]).slice();
      list.splice(entryIndex, 1);
      properties[propertyId] = list;
      return { ...prev, properties };
    });
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await props.onSave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const sinceCtx: ValueInputContext = {
    enumValues: [],
    sources: props.sources,
    i18nKeys: props.i18nKeys,
  };

  return (
    <div className='space-y-4'>
      {props.entityType.properties.map((decl) => {
        const propertyType = props.propertyTypes[decl.id];
        if (propertyType === undefined) {
          return (
            <Card key={decl.id} title={`${decl.id} (unknown property type)`}>
              <p className='text-text-muted text-sm'>
                No property-type schema for <code>{decl.id}</code>.
              </p>
            </Card>
          );
        }
        const valueField = getValueField(propertyType);
        const propertyEntries = entries(data.properties?.[decl.id]);
        const valueType = propertyType.value_type as ValueType;
        const valueCtx: ValueInputContext = {
          enumValues: enumValuesFor(propertyType, props.vocabularies),
          sources: props.sources,
          i18nKeys: props.i18nKeys,
        };

        return (
          <Card
            key={decl.id}
            title={
              <span>
                <code className='font-mono'>{decl.id}</code>
                <span className='text-text-muted ml-2 text-xs'>
                  {valueType}
                  {propertyType.historical ? ' · historical' : ''}
                  {decl.required ? ' · required' : ''}
                </span>
              </span>
            }
          >
            {propertyEntries.length === 0
              ? <p className='text-text-muted text-sm italic'>No entries.</p>
              : (
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='text-text-muted text-left'>
                      <th className='pb-1'>value</th>
                      {propertyType.historical ? <th className='w-64 pb-1'>since</th> : null}
                      {propertyType.historical ? <th className='w-12 pb-1'></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {propertyEntries.map((entry, idx) => (
                      <tr key={idx}>
                        <td className='py-1 pr-2'>
                          <ValueInput
                            valueType={valueType}
                            value={entry[valueField]}
                            ctx={valueCtx}
                            onChange={(next) => {
                              updateEntry(decl.id, propertyType.historical, idx, {
                                ...entry,
                                [valueField]: next,
                              });
                            }}
                          />
                        </td>
                        {propertyType.historical
                          ? (
                            <td className='py-1 pr-2'>
                              <ValueInput
                                valueType='source_ref'
                                value={entry['since']}
                                ctx={sinceCtx}
                                onChange={(next) => {
                                  updateEntry(decl.id, true, idx, { ...entry, since: next });
                                }}
                              />
                            </td>
                          )
                          : null}
                        {propertyType.historical
                          ? (
                            <td className='py-1'>
                              <button
                                type='button'
                                className='text-danger text-xs hover:underline'
                                onClick={() => removeEntry(decl.id, idx)}
                              >
                                remove
                              </button>
                            </td>
                          )
                          : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            {propertyType.historical
              ? (
                <button
                  type='button'
                  className='text-accent mt-2 text-xs hover:underline'
                  onClick={() => addEntry(decl.id, valueField)}
                >
                  + add entry
                </button>
              )
              : null}
            {!propertyType.historical && propertyEntries.length === 0
              ? (
                <button
                  type='button'
                  className='text-accent mt-2 text-xs hover:underline'
                  onClick={() => addEntry(decl.id, valueField)}
                >
                  + set value
                </button>
              )
              : null}
          </Card>
        );
      })}

      <div className='border-border flex items-center gap-3 border-t pt-4'>
        <button
          type='button'
          disabled={saving}
          onClick={handleSave}
          className='bg-accent text-accent-fg disabled:bg-text-muted rounded px-4 py-2 text-sm font-medium hover:opacity-90'
        >
          {saving ? 'Saving…' : 'Open PR with these changes'}
        </button>
        {error !== null ? <span className='text-danger text-sm'>{error}</span> : null}
      </div>
    </div>
  );
}
