/**
 * Draft persistence in localStorage. The draft is keyed by entity id
 * so navigating between entities doesn't cross-contaminate. The shape
 * is intentionally small: { data, translations, savedAt }. Phase 4.3
 * upgrades this to IndexedDB so we can also persist large attachments
 * (image previews, etc.) — the hook signature stays the same.
 */
import { useEffect, useRef, useState } from 'react';
import type { Translations } from '../api.ts';

type EntityData = Record<string, unknown>;

type StoredDraft = {
  readonly data: EntityData;
  readonly translations: Translations;
  readonly savedAt: number;
  readonly version: 1;
};

const VERSION = 1;
const KEY_PREFIX = 'dashboard.draft.v1.';

function storageKey(entityId: string): string {
  return `${KEY_PREFIX}${entityId}`;
}

export function readDraft(entityId: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(entityId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (parsed.version !== VERSION) return null;
    if (typeof parsed.savedAt !== 'number') return null;
    if (parsed.data === undefined || parsed.translations === undefined) return null;
    return parsed as StoredDraft;
  } catch {
    return null;
  }
}

export function writeDraft(
  entityId: string,
  data: EntityData,
  translations: Translations,
): void {
  try {
    const draft: StoredDraft = {
      data,
      translations,
      savedAt: Date.now(),
      version: VERSION,
    };
    localStorage.setItem(storageKey(entityId), JSON.stringify(draft));
  } catch {
    // QuotaExceeded etc. — silently drop; the user still has the form
    // state in memory until they navigate away.
  }
}

export function clearDraft(entityId: string): void {
  try {
    localStorage.removeItem(storageKey(entityId));
  } catch {
    // ignore
  }
}

/**
 * Auto-save the form state to localStorage whenever data/translations
 * change, debounced to one write per 400ms while typing. The first
 * mount does not save (we don't want to "save" the initial pristine
 * state and then offer to restore it later).
 */
export function useDraftAutosave(
  entityId: string,
  data: EntityData,
  translations: Translations,
  enabled: boolean,
): void {
  const firstRun = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      writeDraft(entityId, data, translations);
    }, 400);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [entityId, data, translations, enabled]);
}

/**
 * Read the draft once on mount; expose it plus a clearer.
 */
export function useStoredDraft(entityId: string): {
  draft: StoredDraft | null;
  clear: () => void;
} {
  const [draft, setDraft] = useState<StoredDraft | null>(() => readDraft(entityId));
  useEffect(() => {
    setDraft(readDraft(entityId));
  }, [entityId]);
  return {
    draft,
    clear: () => {
      clearDraft(entityId);
      setDraft(null);
    },
  };
}
