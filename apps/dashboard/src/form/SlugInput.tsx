/**
 * SlugInput — the slug field for the "create new entity" route
 * (ADR-020). The field has two validations the regular `StringInput`
 * doesn't carry:
 *
 *   1. **Format**: kebab-case or snake_case English (a-z, 0-9,
 *      `-` or `_` between alphanumeric runs). Mirrors the regex in
 *      `packages/schemas/src/primitives.ts` (`SLUG`).
 *   2. **Uniqueness**: not already taken by another entity of the
 *      same type. Uses `api.listEntities(type)` which is cached
 *      module-wide so checking is essentially free after the first
 *      page load.
 *
 * The server re-checks both — this component is a UX nicety, not a
 * gate. We surface errors inline so the contributor isn't asked to
 * submit just to find out their slug is taken.
 *
 * Validity is reported back via `onValidChange(true|false)` so the
 * parent can enable/disable Save without duplicating the logic.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SLUG_PATTERN } from '@onepiece-wiki/schemas';
import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react';
import { type JSX, useEffect, useState } from 'react';
import { api } from '../api';
import { useT } from './locale';

export type SlugInputProps = {
  /** Entity type the new slug will belong to. Drives the uniqueness
   *  check against `api.listEntities(type)`. */
  readonly type: string;
  /** Current value (controlled). */
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** Called whenever validity flips so the parent can drive a
   *  "Save" button's disabled state without re-implementing the
   *  rules. Validity = non-empty + matches `SLUG_REGEX` + not
   *  already taken. */
  readonly onValidChange?: (valid: boolean) => void;
  /** Disable the input (e.g. while the create-PR call is in flight). */
  readonly disabled?: boolean;
};

type ValidityState =
  | { kind: 'empty'; }
  | { kind: 'invalid_format'; }
  | { kind: 'checking'; }
  | { kind: 'taken'; }
  | { kind: 'lookup_failed'; message: string; }
  | { kind: 'available'; };

export function SlugInput(
  { type, value, onChange, onValidChange, disabled }: SlugInputProps,
): JSX.Element {
  const t = useT();
  const [state, setState] = useState<ValidityState>(
    value === '' ? { kind: 'empty' } : { kind: 'checking' },
  );

  // Validate on every change. The format check is sync; the
  // uniqueness check awaits the cached listEntities call (zero-RTT
  // after the first list-page visit). We don't debounce — both
  // operations are cheap and the user expects instant feedback.
  useEffect(() => {
    let cancelled = false;
    if (value === '') {
      setState({ kind: 'empty' });
      onValidChange?.(false);
      return;
    }
    if (!SLUG_PATTERN.test(value)) {
      setState({ kind: 'invalid_format' });
      onValidChange?.(false);
      return;
    }
    setState({ kind: 'checking' });
    void (async () => {
      try {
        const existing = await api.listEntities(type);
        if (cancelled) return;
        const taken = existing.some((e) => e.slug === value);
        if (taken) {
          setState({ kind: 'taken' });
          onValidChange?.(false);
        } else {
          setState({ kind: 'available' });
          onValidChange?.(true);
        }
      } catch (err) {
        if (cancelled) return;
        // Network blip: don't block the contributor — let them submit
        // and the server-side uniqueness check is the source of
        // truth. Surface the failure so they know to retry.
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'lookup_failed', message });
        onValidChange?.(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, value, onValidChange]);

  const helperText = (() => {
    switch (state.kind) {
      case 'empty':
        return t('slugRequired');
      case 'invalid_format':
        return t('slugInvalidFormat');
      case 'checking':
        return t('slugChecking');
      case 'taken':
        return t('slugTaken');
      case 'lookup_failed':
        return t('slugLookupFailed');
      case 'available':
        return `${t('slugWillSaveAs')} \`${type}:${value}\``;
    }
  })();

  const isError = state.kind === 'invalid_format' || state.kind === 'taken';
  const isOk = state.kind === 'available';

  return (
    <div className='space-y-1.5'>
      <Label htmlFor='slug-input'>{t('slugLabel')}</Label>
      <div className='relative'>
        <Input
          id='slug-input'
          value={value}
          // Lowercase on the way in — the server enforces lowercase
          // anyway, lifting the case here avoids the contributor
          // typing "Luffy" and seeing a confusing "invalid format"
          // error a second later.
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          placeholder={t('slugPlaceholder')}
          disabled={disabled === true}
          autoComplete='off'
          spellCheck={false}
          className={isError
            ? 'border-destructive focus-visible:ring-destructive/40 pr-8'
            : isOk
            ? 'border-emerald-500/60 pr-8'
            : 'pr-8'}
          aria-invalid={isError ? true : undefined}
        />
        {isError
          ? (
            <CircleAlertIcon
              aria-hidden
              className='text-destructive absolute right-2 top-1/2 size-4 -translate-y-1/2'
            />
          )
          : isOk
          ? (
            <CircleCheckIcon
              aria-hidden
              className='text-emerald-500 absolute right-2 top-1/2 size-4 -translate-y-1/2'
            />
          )
          : null}
      </div>
      <p
        className={isError
          ? 'text-destructive text-xs'
          : 'text-muted-foreground text-xs'}
      >
        {helperText}
      </p>
    </div>
  );
}
