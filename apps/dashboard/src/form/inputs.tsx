/**
 * Value-input registry. Each input renders a single property value
 * (the non-historical case) or a single historical entry's value
 * (inside the array editor). The registry is keyed by the property
 * type's value_type, matching the schema-driven form generator's
 * contract — no per-property-name component.
 */
import { cn } from '@onepiece-wiki/ui';
import type { JSX } from 'react';

type InputProps<T> = {
  value: T | undefined;
  onChange: (next: T) => void;
  disabled?: boolean | undefined;
  enumValues?: readonly string[] | undefined;
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
  { value, onChange, enumValues, disabled }: InputProps<string>,
): JSX.Element {
  return (
    <select
      className={cn(baseInput)}
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value=''></option>
      {(enumValues ?? []).map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

export function EntityRefInput(
  { value, onChange, disabled }: InputProps<string>,
): JSX.Element {
  // Phase 4.1: simple text input with a hint at the expected format.
  // Phase 4.3 replaces this with an autocomplete over SDK-discovered
  // entities filtered by relation_type's valid_to_types.
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

export function I18nKeyInput(
  { value, onChange, disabled }: InputProps<string>,
): JSX.Element {
  return (
    <input
      type='text'
      className={cn(baseInput, 'font-mono text-xs')}
      placeholder='entity.slug.property.variant'
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => onChange(e.target.value)}
    />
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

export function ValueInput(
  { valueType, value, onChange, disabled, enumValues }: {
    valueType: ValueType;
    value: unknown;
    onChange: (next: unknown) => void;
    disabled?: boolean | undefined;
    enumValues?: readonly string[] | undefined;
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
          enumValues={enumValues ?? []}
        />
      );
    case 'entity_ref':
    case 'source_ref':
      return (
        <EntityRefInput
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'i18n_key':
      return (
        <I18nKeyInput value={value as string | undefined} onChange={onChange} disabled={disabled} />
      );
  }
}
