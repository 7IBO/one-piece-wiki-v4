/**
 * Value-input registry. Each input renders a single property value
 * (the non-historical case) or a single historical entry's value
 * (inside the array editor). The registry is keyed by the property
 * type's value_type, matching the schema-driven form generator's
 * contract — no per-property-name component.
 *
 * Phase 4.2.1 wired the inputs to real catalogue data:
 *   - EnumInput receives the vocabulary's values via enumValues.
 *   - SourceRefInput is a dedicated picker over /api/sources, ordered
 *     by chapter number when applicable.
 *   - I18nKeyInput is a datalist-backed combobox over every i18n key
 *     already in use (collected from /api/i18n-keys).
 */
import { cn } from '@onepiece-wiki/ui';
import type { JSX } from 'react';
import { useId } from 'react';
import type { SourceRef } from '../api.ts';

type CommonProps = {
  disabled?: boolean | undefined;
};

type InputProps<T> = CommonProps & {
  value: T | undefined;
  onChange: (next: T) => void;
};

const baseInput =
  'w-full rounded border border-border bg-surface-primary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-50';

export function StringInput({ value, onChange, disabled }: InputProps<string>): JSX.Element {
  return (
    <input
      type='text'
      className={cn(baseInput)}
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberInput({ value, onChange, disabled }: InputProps<number>): JSX.Element {
  return (
    <input
      type='number'
      className={cn(baseInput)}
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => {
        const next = e.target.value === '' ? 0 : Number(e.target.value);
        onChange(Number.isFinite(next) ? next : 0);
      }}
    />
  );
}

export function BooleanInput({ value, onChange, disabled }: InputProps<boolean>): JSX.Element {
  return (
    <input
      type='checkbox'
      className='size-4 rounded border-border accent-accent'
      checked={value === true}
      disabled={disabled === true}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export function EnumInput(
  { value, onChange, enumValues, disabled }: InputProps<string> & {
    enumValues: readonly { id: string; label?: string; }[];
  },
): JSX.Element {
  return (
    <select
      className={cn(baseInput)}
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value=''>— pick one —</option>
      {enumValues.map((v) => (
        <option key={v.id} value={v.id}>
          {v.label !== undefined ? `${v.label} (${v.id})` : v.id}
        </option>
      ))}
    </select>
  );
}

export function EntityRefInput(
  { value, onChange, disabled }: InputProps<string>,
): JSX.Element {
  // Phase 4.2.1: free text with a hint. Phase 4.3 layers a real
  // typeahead over /api/entities/<type> filtered by the relation's
  // valid_to_types.
  return (
    <input
      type='text'
      className={cn(baseInput, 'font-mono text-xs')}
      placeholder='type:slug'
      pattern='[a-z0-9-]+:[a-z0-9-]+'
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SourceRefInput(
  { value, onChange, sources, disabled }: InputProps<string> & {
    sources: readonly SourceRef[];
  },
): JSX.Element {
  return (
    <select
      className={cn(baseInput, 'font-mono text-xs')}
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value=''>— pick a source —</option>
      {sources.map((s) => (
        <option key={s.id} value={s.id}>
          {s.number !== null ? `${s.type} ${s.number} (${s.id})` : s.id}
        </option>
      ))}
    </select>
  );
}

export function I18nKeyInput(
  { value, onChange, suggestions, disabled }: InputProps<string> & {
    suggestions: readonly string[];
  },
): JSX.Element {
  const listId = useId();
  return (
    <>
      <input
        type='text'
        list={listId}
        className={cn(baseInput, 'font-mono text-xs')}
        placeholder='entity.slug.property.variant'
        value={value ?? ''}
        disabled={disabled === true}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </>
  );
}

export type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'multi_enum'
  | 'date'
  | 'entity_ref'
  | 'source_ref'
  | 'i18n_key'
  | 'markdown';

export type ValueInputContext = {
  readonly enumValues: readonly { id: string; label?: string; }[];
  readonly sources: readonly SourceRef[];
  readonly i18nKeys: readonly string[];
};

export function ValueInput(
  { valueType, value, onChange, disabled, ctx }: {
    valueType: ValueType;
    value: unknown;
    onChange: (next: unknown) => void;
    disabled?: boolean | undefined;
    ctx: ValueInputContext;
  },
): JSX.Element {
  switch (valueType) {
    case 'string':
    case 'markdown':
    case 'date':
      return (
        <StringInput value={value as string | undefined} onChange={onChange} disabled={disabled} />
      );
    case 'number':
      return (
        <NumberInput value={value as number | undefined} onChange={onChange} disabled={disabled} />
      );
    case 'boolean':
      return (
        <BooleanInput
          value={value as boolean | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'enum':
    case 'multi_enum':
      return (
        <EnumInput
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
          enumValues={ctx.enumValues}
        />
      );
    case 'entity_ref':
      return (
        <EntityRefInput
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'source_ref':
      return (
        <SourceRefInput
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
          sources={ctx.sources}
        />
      );
    case 'i18n_key':
      return (
        <I18nKeyInput
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
          suggestions={ctx.i18nKeys}
        />
      );
  }
}
