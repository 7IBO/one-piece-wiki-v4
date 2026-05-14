/**
 * Locale-aware label resolution. Phase 3 reads labels directly from the
 * schema catalogue (entity-type and vocabulary `labels` fields) since
 * translation files are not yet populated. Entity-specific i18n keys
 * (character.luffy.name.common, etc.) fall back to the key itself —
 * the preview makes the key visible so a missing translation is
 * obvious.
 */
import type { Locale } from '@onepiece-wiki/schemas';

export function labelFromObject(
  labels: { en?: string; fr?: string; } | null | undefined,
  locale: Locale,
): string | null {
  if (labels === null || labels === undefined) return null;
  return labels[locale] ?? labels.en ?? null;
}

export function fallbackKey(key: string | null | undefined): string {
  if (key === null || key === undefined) return '';
  const segments = key.split('.');
  const tail = segments[segments.length - 1] ?? key;
  return tail.replace(/[-_]/g, ' ');
}
