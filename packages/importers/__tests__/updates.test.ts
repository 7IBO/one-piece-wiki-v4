/**
 * Update-queue detection (ADR-092) over the ADR-081 sync registry:
 * batched revision queries, redirect + missing handling, and the
 * update-queue statuses — all on fixture-backed fetch stubs.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { FandomClient } from '../src/fandom/client.ts';
import type { FandomRegistry } from '../src/fandom/registry.ts';
import { detectUpdates, parseUpdatesArgs, renderUpdatesSummary } from '../src/fandom/updates.ts';

async function fixtureRaw(name: string): Promise<string> {
  return await Bun.file(join(import.meta.dir, 'fixtures', `${name}.json`)).text();
}

const registry: FandomRegistry = {
  pages: [
    // Never imported (no lastRevId) → always queued as changed.
    { entityId: 'anime-episode:1071', page: 'Episode 1071', pageId: 341823, redirects: [] },
    // Deleted on Fandom's side.
    { entityId: 'character:gone', page: 'Gone Page', pageId: 5, redirects: [], lastRevId: 10 },
    {
      entityId: 'character:luffy',
      page: 'Monkey D. Luffy',
      pageId: 1444,
      redirects: ['Straw Hat Luffy'],
      lastRevId: 100,
      lastImportedAt: '2026-06-14T22:00:00Z',
    },
    // Renamed on Fandom's side ("Kozuki Toki" now redirects to "Toki").
    { entityId: 'character:toki', page: 'Kozuki Toki', pageId: 900, redirects: [], lastRevId: 500 },
    {
      entityId: 'manga-chapter:1044',
      page: 'Chapter 1044',
      pageId: 333114,
      redirects: [],
      lastRevId: 200,
    },
  ],
};

function fixtureClient(raw: string): FandomClient {
  return new FandomClient({
    minDelayMs: 0,
    fetchImpl: (() => Promise.resolve(new Response(raw, { status: 200 }))) as typeof fetch,
  });
}

describe('client.queryRevisions', () => {
  it('parses pages, redirects and missing titles from one batch', async () => {
    const client = fixtureClient(await fixtureRaw('revisions-batch'));
    const result = await client.queryRevisions(['Monkey D. Luffy', 'Kozuki Toki', 'Gone Page']);
    expect(result.pages.get('Monkey D. Luffy')).toEqual({
      pageId: 1444,
      revId: 150,
      timestamp: '2026-08-01T10:00:00Z',
    });
    expect(result.redirects.get('Kozuki Toki')).toBe('Toki');
    expect(result.missing.has('Gone Page')).toBe(true);
  });

  it('refuses more than 50 titles per batch', async () => {
    const client = fixtureClient('{}');
    const titles = Array.from({ length: 51 }, (_, i) => `Page ${i}`);
    await expect(client.queryRevisions(titles)).rejects.toThrow('at most 50');
  });
});

describe('detectUpdates', () => {
  it('classifies every registry page: unchanged/changed/redirected/missing', async () => {
    const client = fixtureClient(await fixtureRaw('revisions-batch'));
    const queue = await detectUpdates(client, registry);

    const byId = new Map(queue.entries.map((e) => [e.entityId, e]));
    expect(byId.get('manga-chapter:1044')).toMatchObject({
      pageTitle: 'Chapter 1044',
      lastImportedRev: 200,
      currentRev: 200,
      status: 'unchanged',
    });
    expect(byId.get('character:luffy')).toMatchObject({
      lastImportedRev: 100,
      lastImportedAt: '2026-06-14T22:00:00Z',
      currentRev: 150,
      currentAt: '2026-08-01T10:00:00Z',
      status: 'changed',
    });
    // Never imported → changed, whatever the live revision is.
    expect(byId.get('anime-episode:1071')).toMatchObject({
      lastImportedRev: null,
      currentRev: 77,
      status: 'changed',
    });
    expect(byId.get('character:toki')).toMatchObject({
      status: 'redirected',
      redirectTarget: 'Toki',
      currentRev: 512, // the TARGET page's live revision
    });
    expect(byId.get('character:gone')).toMatchObject({
      status: 'missing',
      currentRev: null,
    });
    expect(queue.counts).toEqual({ unchanged: 1, changed: 2, redirected: 1, missing: 1 });
  });

  it('batches 50 titles per revisions call', async () => {
    let calls = 0;
    const client = new FandomClient({
      minDelayMs: 0,
      fetchImpl: ((url: string | URL | Request) => {
        calls += 1;
        const titles = (new URL(String(url)).searchParams.get('titles') ?? '').split('|');
        expect(titles.length).toBeLessThanOrEqual(50);
        const pages = titles.map((title, i) => ({
          pageid: i + 1,
          ns: 0,
          title,
          revisions: [{ revid: 1, timestamp: '2026-08-08T00:00:00Z' }],
        }));
        return Promise.resolve(
          new Response(JSON.stringify({ query: { pages } }), { status: 200 }),
        );
      }) as typeof fetch,
    });
    const big: FandomRegistry = {
      pages: Array.from({ length: 120 }, (_, i) => ({
        entityId: `manga-chapter:${i + 1}`,
        page: `Chapter ${i + 1}`,
        pageId: i + 1,
        redirects: [],
        lastRevId: 1,
      })),
    };
    const queue = await detectUpdates(client, big);
    expect(calls).toBe(3); // ceil(120 / 50)
    expect(queue.entries).toHaveLength(120);
    expect(queue.counts.unchanged).toBe(120);
  });

  it('fails FAST with "Fandom unreachable" when there is no egress', async () => {
    const client = new FandomClient({
      minDelayMs: 0,
      fetchImpl: (() =>
        Promise.reject(new TypeError('Unable to connect'))) as unknown as typeof fetch,
    });
    await expect(detectUpdates(client, registry)).rejects.toThrow(/Fandom unreachable/);
  });

  it('treats a proxy-denial 403 response as unreachable too', async () => {
    // The cloud sandbox proxy answers CONNECT denials with a plain
    // HTTP 403 — verified live 2026-08-08 — not a fetch rejection.
    const client = new FandomClient({
      minDelayMs: 0,
      fetchImpl: (() => Promise.resolve(new Response('denied', { status: 403 }))) as typeof fetch,
    });
    await expect(detectUpdates(client, registry)).rejects.toThrow(/Fandom unreachable/);
  });
});

describe('renderUpdatesSummary', () => {
  it('prints counts and every non-unchanged entry', async () => {
    const client = fixtureClient(await fixtureRaw('revisions-batch'));
    const summary = renderUpdatesSummary(await detectUpdates(client, registry));
    expect(summary).toContain('5 tracked page(s): 1 unchanged, 2 changed, 1 redirected, 1 missing');
    expect(summary).toContain('CHANGED');
    expect(summary).toContain('character:luffy');
    expect(summary).toContain('rev 100 → 150');
    expect(summary).toContain('REDIRECTED');
    expect(summary).toContain('→ "Toki"');
    expect(summary).toContain('MISSING');
    expect(summary).not.toContain('manga-chapter:1044'); // unchanged entries stay quiet
  });
});

describe('parseUpdatesArgs', () => {
  it('applies defaults and parses --out', () => {
    expect(parseUpdatesArgs([])).toEqual({ out: null });
    expect(parseUpdatesArgs(['--out', '/tmp/reports'])).toEqual({ out: '/tmp/reports' });
  });

  it('rejects malformed values and unknown flags', () => {
    expect(() => parseUpdatesArgs(['--out'])).toThrow('expects a value');
    expect(() => parseUpdatesArgs(['--nope'])).toThrow('unknown flag');
  });
});
