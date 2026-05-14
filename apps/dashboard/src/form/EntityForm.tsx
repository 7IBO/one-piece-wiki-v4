/**
 * Schema-driven entity form. Walks the entity-type's `properties`
 * list, looks up each property-type from the catalogue, and renders
 * a row per property using the value-input registry. Historical
 * properties get an array editor (one entry per historisable value).
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  EntityTypeSchema,
  PropertyTypeSchema,
  VocabularySchema,
} from '@onepiece-wiki/schemas';
import { Trash2 } from 'lucide-react';
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
            <Card key={decl.id}>
              <CardHeader>
                <CardTitle className='font-mono text-sm'>
                  {decl.id} <Badge variant='destructive'>unknown property type</Badge>
                </CardTitle>
              </CardHeader>
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
          <Card key={decl.id}>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-sm'>
                <code className='font-mono'>{decl.id}</code>
                <Badge variant='secondary' className='font-normal'>
                  {valueType}
                </Badge>
                {propertyType.historical
                  ? <Badge variant='outline' className='font-normal'>historical</Badge>
                  : null}
                {decl.required
                  ? <Badge variant='outline' className='font-normal'>required</Badge>
                  : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {propertyEntries.length === 0
                ? <p className='text-muted-foreground text-sm italic'>No entries.</p>
                : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>value</TableHead>
                        {propertyType.historical
                          ? <TableHead className='w-72'>since</TableHead>
                          : null}
                        {propertyType.historical ? <TableHead className='w-12' /> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {propertyEntries.map((entry, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
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
                          </TableCell>
                          {propertyType.historical
                            ? (
                              <TableCell>
                                <ValueInput
                                  valueType='source_ref'
                                  value={entry['since']}
                                  ctx={sinceCtx}
                                  onChange={(next) => {
                                    updateEntry(decl.id, true, idx, { ...entry, since: next });
                                  }}
                                />
                              </TableCell>
                            )
                            : null}
                          {propertyType.historical
                            ? (
                              <TableCell>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon'
                                  onClick={() => removeEntry(decl.id, idx)}
                                >
                                  <Trash2 className='size-4' />
                                </Button>
                              </TableCell>
                            )
                            : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              {(propertyType.historical || propertyEntries.length === 0)
                ? (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='mt-3'
                    onClick={() => addEntry(decl.id, valueField)}
                  >
                    + {propertyType.historical ? 'Add entry' : 'Set value'}
                  </Button>
                )
                : null}
            </CardContent>
          </Card>
        );
      })}

      <div className='border-border flex items-center gap-3 border-t pt-4'>
        <Button type='button' disabled={saving} onClick={handleSave}>
          {saving ? 'Opening PR…' : 'Open PR with these changes'}
        </Button>
        {error !== null ? <span className='text-destructive text-sm'>{error}</span> : null}
      </div>
    </div>
  );
}
