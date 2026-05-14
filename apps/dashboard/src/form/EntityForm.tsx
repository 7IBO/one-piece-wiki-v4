/**
 * Schema-driven entity form with inline translation editor.
 *
 * Walks the entity-type's `properties` list, looks up each
 * property-type from the catalogue, and renders a row per property
 * using the value-input registry. Historical properties get an array
 * editor (one entry per historisable value).
 *
 * Localizable properties (i18n_key value type) get an additional
 * translation panel showing EN + FR side-by-side. Saving the form
 * persists both the entity JSON and the translation files in a
 * single PR.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Fragment, type JSX, useEffect, useMemo, useState } from 'react';
import type { SourceRef, Translations } from '../api.ts';
import { ValueInput, type ValueInputContext, type ValueType } from './inputs.tsx';
import { useDraftAutosave, useStoredDraft } from './use-draft.ts';

type PropertyEntry = Record<string, unknown>;
type PropertyValue = PropertyEntry | PropertyEntry[];
type EntityData = Record<string, unknown> & {
  properties?: Record<string, PropertyValue>;
};

export type EntityFormProps = {
  entityId: string;
  entityType: EntityTypeSchema;
  propertyTypes: Record<string, PropertyTypeSchema>;
  vocabularies: Record<string, VocabularySchema>;
  sources: readonly SourceRef[];
  i18nKeys: readonly string[];
  initialData: EntityData;
  initialTranslations: Translations;
  onSave: (next: EntityData, translations: Translations) => Promise<void>;
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
  const [translations, setTranslations] = useState<Translations>(props.initialTranslations);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { draft, clear: clearStoredDraft } = useStoredDraft(props.entityId);

  const initialDataString = useMemo(() => JSON.stringify(props.initialData), [props.initialData]);
  const initialTranslationsString = useMemo(
    () => JSON.stringify(props.initialTranslations),
    [props.initialTranslations],
  );
  const dirty = JSON.stringify(data) !== initialDataString
    || JSON.stringify(translations) !== initialTranslationsString;

  // Did the on-disk draft (if any) contain something genuinely
  // different from the freshly-loaded initialData? If yes, surface
  // the restore banner. Stale drafts (saved when the entity was at
  // the same content as now) are silently dropped.
  const draftIsRecoverable = draft !== null
    && (JSON.stringify(draft.data) !== initialDataString
      || JSON.stringify(draft.translations) !== initialTranslationsString);

  useDraftAutosave(props.entityId, data, translations, dirty);

  // Cmd/Ctrl+S to save when dirty.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void handleSave();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, data, translations]);

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

  function updateTranslation(locale: 'en' | 'fr', key: string, value: string): void {
    setTranslations((prev) => {
      const next = { ...prev[locale] };
      if (value === '') delete next[key];
      else next[key] = value;
      return { ...prev, [locale]: next };
    });
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await props.onSave(data, translations);
      clearStoredDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function restoreDraft(): void {
    if (draft === null) return;
    setData(draft.data as EntityData);
    setTranslations(draft.translations);
  }

  function discardDraft(): void {
    clearStoredDraft();
  }

  const sinceCtx: ValueInputContext = {
    enumValues: [],
    sources: props.sources,
    i18nKeys: props.i18nKeys,
  };

  return (
    <div className='space-y-4 pb-20'>
      {draftIsRecoverable
        ? (
          <Card className='border-amber-500/40 bg-amber-500/5'>
            <CardContent className='flex flex-wrap items-center justify-between gap-3 py-3'>
              <div className='text-sm'>
                <span className='font-medium'>Unsaved draft from a previous session.</span>
                <span className='text-muted-foreground ml-2 text-xs'>
                  Saved {draft !== null ? new Date(draft.savedAt).toLocaleString() : ''}
                </span>
              </div>
              <div className='flex gap-2'>
                <Button type='button' variant='outline' size='sm' onClick={discardDraft}>
                  Discard
                </Button>
                <Button type='button' size='sm' onClick={restoreDraft}>
                  Restore
                </Button>
              </div>
            </CardContent>
          </Card>
        )
        : null}

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
                {propertyType.localizable
                  ? <Badge variant='outline' className='font-normal'>localizable</Badge>
                  : null}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {propertyEntries.length === 0
                ? <p className='text-muted-foreground text-sm italic'>No entries.</p>
                : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{propertyType.localizable ? 'i18n key' : 'value'}</TableHead>
                        {propertyType.historical
                          ? <TableHead className='w-72'>since</TableHead>
                          : null}
                        {propertyType.historical ? <TableHead className='w-12' /> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {propertyEntries.map((entry, idx) => {
                        const i18nKey = typeof entry[valueField] === 'string'
                          ? entry[valueField] as string
                          : '';
                        return (
                          <Fragment key={idx}>
                            <TableRow>
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
                                        updateEntry(decl.id, true, idx, {
                                          ...entry,
                                          since: next,
                                        });
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
                            {propertyType.localizable && i18nKey.length > 0
                              ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={propertyType.historical ? 3 : 1}
                                    className='bg-muted/40'
                                  >
                                    <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                                      <div className='space-y-1'>
                                        <Label className='text-muted-foreground text-xs'>
                                          EN
                                        </Label>
                                        <Input
                                          type='text'
                                          value={translations.en[i18nKey] ?? ''}
                                          onChange={(e) =>
                                            updateTranslation('en', i18nKey, e.target.value)}
                                          placeholder='English value'
                                        />
                                      </div>
                                      <div className='space-y-1'>
                                        <Label className='text-muted-foreground text-xs'>
                                          FR
                                        </Label>
                                        <Input
                                          type='text'
                                          value={translations.fr[i18nKey] ?? ''}
                                          onChange={(e) =>
                                            updateTranslation('fr', i18nKey, e.target.value)}
                                          placeholder='French value'
                                        />
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                              : null}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              {(propertyType.historical || propertyEntries.length === 0)
                ? (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
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

      <div className='border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur'>
        <div className='mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3'>
          <div className='text-muted-foreground text-xs'>
            {dirty
              ? <span className='text-amber-500'>● Unsaved changes · ⌘S to save</span>
              : <span>No changes</span>}
            {error !== null
              ? <span className='text-destructive ml-3'>{error}</span>
              : null}
          </div>
          <Button type='button' disabled={saving || !dirty} onClick={handleSave}>
            {saving ? 'Opening PR…' : 'Open PR'}
          </Button>
        </div>
      </div>
    </div>
  );
}
