/**
 * Value-input registry built on shadcn primitives. The registry is
 * keyed by the property type's value_type so the form generator stays
 * schema-driven (no per-property-name component).
 */
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Checkbox } from '@base-ui-components/react/checkbox';
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

export function StringInput({ value, onChange, disabled }: InputProps<string>): JSX.Element {
  return (
    <Input
      type='text'
      value={value ?? ''}
      disabled={disabled === true}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberInput({ value, onChange, disabled }: InputProps<number>): JSX.Element {
  return (
    <Input
      type='number'
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
    <Checkbox.Root
      checked={value === true}
      disabled={disabled === true}
      onCheckedChange={(next) => onChange(next === true)}
      className='border-input data-[checked]:bg-primary data-[checked]:border-primary inline-flex size-4 items-center justify-center rounded border'
    >
      <Checkbox.Indicator className='text-primary-foreground text-xs leading-none'>
        ✓
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

export function EnumInput(
  { value, onChange, enumValues, disabled }: InputProps<string> & {
    enumValues: readonly { id: string; label?: string; }[];
  },
): JSX.Element {
  return (
    <Select
      value={value ?? ''}
      onValueChange={(v) => onChange(v ?? '')}
      disabled={disabled === true}
    >
      <SelectTrigger className='w-full'>
        <SelectValue placeholder='— pick one —' />
      </SelectTrigger>
      <SelectContent>
        {enumValues.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {v.label !== undefined ? `${v.label}` : v.id}
            <span className='text-muted-foreground ml-2 font-mono text-xs'>{v.id}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function EntityRefInput(
  { value, onChange, disabled }: InputProps<string>,
): JSX.Element {
  return (
    <Input
      type='text'
      className='font-mono text-xs'
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
    <Select
      value={value ?? ''}
      onValueChange={(v) => onChange(v ?? '')}
      disabled={disabled === true}
    >
      <SelectTrigger className='w-full font-mono text-xs'>
        <SelectValue placeholder='— pick a source —' />
      </SelectTrigger>
      <SelectContent>
        {sources.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.number !== null ? `${s.type} ${s.number}` : s.slug}
            <span className='text-muted-foreground ml-2 font-mono text-xs'>{s.id}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      <Input
        type='text'
        list={listId}
        className={cn('font-mono text-xs')}
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
