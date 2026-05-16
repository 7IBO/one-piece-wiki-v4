/**
 * Draft persistence in IndexedDB (via idb-keyval). The draft is keyed
 * by entity id so navigating between entities doesn't cross-contaminate.
 *
 * IndexedDB beats localStorage here because:
 *  - Quotas are GBs not 5–10MB — needed once we attach image previews.
 *  - Async API doesn't block the main thread when the draft is large.
 *  - Survives storage-pressure eviction better than localStorage.
 *
 * The hook signature stays compatible with the previous localStorage
 * version: `useStoredDraft` reads the persisted draft on mount,
 * `useDraftAutosave` writes on every change with a 400ms debounce.
 */
import { clear as clearStore, del, get, keys as idbKeys, set } from 'idb-keyval';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Translations } from '../api';

type EntityData = Record<string, unknown>;

type StoredDraft = {
  readonly data: EntityData;
  readonly translations: Translations;
  readonly savedAt: number;
  readonly version: 1;
};

const VERSION = 1;
const KEY_PREFIX = 'dashboard.draft.v1.';

/**
 * Drafts older than this are silently dropped on read. Without a TTL,
 * a stray edit weeks ago — or a brief tab focus on a previous session
 * that triggered autosave — keeps surfacing the "Unsaved draft" banner
 * on every fresh load, confusing maintainers who don't remember
 * touching the entity. 24h is long enough to survive an overnight
 * pause, short enough that anything older is almost certainly stale.
 */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function storageKey(entityId: string): string {
  return `${KEY_PREFIX}${entityId}`;
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v['version'] === VERSION
    && typeof v['savedAt'] === 'number'
    && v['data'] !== undefined
    && v['translations'] !== undefined;
}

export async function readDraft(entityId: string): Promise<StoredDraft | null> {
  try {
    const raw = await get(storageKey(entityId));
    if (raw === undefined) return null;
    if (!isStoredDraft(raw)) return null;
    if (Date.now() - raw.savedAt > DRAFT_TTL_MS) {
      // Sweep it as we go so we don't keep tripping on it.
      void del(storageKey(entityId));
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export async function writeDraft(
  entityId: string,
  data: EntityData,
  translations: Translations,
): Promise<void> {
  try {
    const draft: StoredDraft = {
      data,
      translations,
      savedAt: Date.now(),
      version: VERSION,
    };
    await set(storageKey(entityId), draft);
    notifyDraftChange();
  } catch {
    // QuotaExceeded etc. — silently drop; the user still has the form
    // state in memory until they navigate away.
  }
}

export async function clearDraft(entityId: string): Promise<void> {
  try {
    await del(storageKey(entityId));
    notifyDraftChange();
  } catch {
    // ignore
  }
}

/** Wipe every dashboard draft. Useful for "reset all" affordances. */
export async function clearAllDrafts(): Promise<void> {
  try {
    await clearStore();
    notifyDraftChange();
  } catch {
    // ignore
  }
}

/**
 * Auto-save the form state whenever data/translations change, debounced
 * to one write per 400ms while typing. The first mount does not save
 * (we don't want to "save" the initial pristine state and then offer
 * to restore it later).
 *
 * On unmount **or entityId change** any pending debounced write is
 * flushed synchronously to IDB — without this, navigating away within
 * 400ms of a keystroke silently drops the change, which is what made
 * "I switched entities, my edits are gone" a real foot-gun. We keep
 * the latest values in a ref so the flusher reaches them even after
 * the effect's closure has moved on.
 *
 * `beforeunload` is also wired up: closing the tab tries one last
 * write. IDB is async so this is best-effort — fast on Chrome /
 * Firefox, may race on tab kill — but it's better than nothing.
 */
export function useDraftAutosave(
  entityId: string,
  data: EntityData,
  translations: Translations,
  enabled: boolean,
): void {
  const firstRun = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ entityId, data, translations });
  latest.current = { entityId, data, translations };

  // Schedule debounced writes. No cleanup here on purpose — cancelling
  // the timer on every dep change (i.e. every keystroke) is what made
  // mid-debounce navigation drop data. The "current" timer is always
  // explicitly cleared at the top of the next run.
  useEffect(() => {
    if (!enabled) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const snap = latest.current;
      void writeDraft(snap.entityId, snap.data, snap.translations);
      timer.current = null;
    }, 400);
  }, [entityId, data, translations, enabled]);

  // Flush on entity change and on unmount. Reads from `latest` so it
  // sees the actual data that was about to be written, not the stale
  // closure from when the effect was set up.
  useEffect(() => {
    function flush(): void {
      if (timer.current === null) return;
      clearTimeout(timer.current);
      timer.current = null;
      const snap = latest.current;
      void writeDraft(snap.entityId, snap.data, snap.translations);
    }
    globalThis.addEventListener?.('beforeunload', flush);
    return () => {
      globalThis.removeEventListener?.('beforeunload', flush);
      flush();
    };
  }, [entityId]);
}

/**
 * Load the draft once on mount; expose it plus a clearer. Returns
 * `{ draft: null, clear }` while the IDB read is in flight.
 */
export function useStoredDraft(entityId: string): {
  draft: StoredDraft | null;
  clear: () => void;
} {
  const [draft, setDraft] = useState<StoredDraft | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readDraft(entityId).then((d) => {
      if (!cancelled) setDraft(d);
    });
    return () => {
      cancelled = true;
    };
  }, [entityId]);
  return {
    draft,
    clear: () => {
      void clearDraft(entityId);
      setDraft(null);
    },
  };
}

/** Summary of every persisted draft. Used by the global "Unsaved
 *  drafts" indicator so the maintainer always knows how many entities
 *  carry pending edits, even from other pages. */
export type DraftSummary = {
  readonly entityId: string;
  readonly savedAt: number;
};

export async function listDrafts(): Promise<readonly DraftSummary[]> {
  try {
    const allKeys = await idbKeys();
    const draftKeys = allKeys.filter(
      (k): k is string => typeof k === 'string' && k.startsWith(KEY_PREFIX),
    );
    const results = await Promise.all(
      draftKeys.map(async (k) => {
        const raw = await get(k);
        if (!isStoredDraft(raw)) return null;
        if (Date.now() - raw.savedAt > DRAFT_TTL_MS) {
          void del(k);
          return null;
        }
        return {
          entityId: k.slice(KEY_PREFIX.length),
          savedAt: raw.savedAt,
        } satisfies DraftSummary;
      }),
    );
    return results.filter((r): r is DraftSummary => r !== null);
  } catch {
    return [];
  }
}

/**
 * Subscribe to "how many drafts exist right now" — refreshed on a
 * BroadcastChannel signal so a write/clear in one tab (or in another
 * component on this page) updates every consumer immediately.
 *
 * The channel falls back to a no-op when unsupported (very old
 * browsers); manual `refresh()` then becomes the only update path.
 */
const DRAFT_CHANNEL = 'dashboard-drafts-v1';

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(DRAFT_CHANNEL);
  } catch {
    return null;
  }
}

/** Notify every subscriber that the draft set has changed. Call after
 *  any writeDraft / clearDraft so badges refresh in real time. */
export function notifyDraftChange(): void {
  const ch = getChannel();
  ch?.postMessage({ kind: 'changed' });
  ch?.close();
}

export function useAllDrafts(): {
  drafts: readonly DraftSummary[];
  refresh: () => void;
} {
  const [drafts, setDrafts] = useState<readonly DraftSummary[]>([]);

  const refresh = useCallback(() => {
    void listDrafts().then(setDrafts);
  }, []);

  useEffect(() => {
    refresh();
    const ch = getChannel();
    if (ch === null) return;
    function onMsg(): void {
      refresh();
    }
    ch.addEventListener('message', onMsg);
    return () => {
      ch.removeEventListener('message', onMsg);
      ch.close();
    };
  }, [refresh]);

  return { drafts, refresh };
}
