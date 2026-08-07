/**
 * Fandom sync registry (ADR-081): redirect resolution, entity-link
 * detection in content, and update (stale-revision) detection.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { FandomClient } from '../src/fandom/client.ts';
import {
  buildTitleIndex,
  detectEntityLinks,
  type FandomRegistry,
  normalizeTitle,
  resolveTitle,
  staleEntries,
  upsertPage,
} from '../src/fandom/registry.ts';
import { parseRedirect } from '../src/fandom/wikitext.ts';

const registry: FandomRegistry = {
  pages: [
    {
      entityId: 'character:luffy',
      page: 'Monkey D. Luffy',
      pageId: 1444,
      redirects: ['Straw Hat Luffy', 'Luffy'],
      lastRevId: 100,
    },
    {
      entityId: 'manga-chapter:1044',
      page: 'Chapter 1044',
      pageId: 333114,
      redirects: [],
      lastRevId: 200,
    },
  ],
};

describe('title normalization + redirect resolution', () => {
  it('normalizes underscores, sections and first-letter case', () => {
    expect(normalizeTitle('monkey_D._Luffy#History')).toBe('Monkey D. Luffy');
  });

  it('resolves canonical titles and redirect aliases to the same entity', () => {
    const index = buildTitleIndex(registry);
    expect(resolveTitle(index, 'Monkey D. Luffy')?.entityId).toBe('character:luffy');
    expect(resolveTitle(index, 'Straw_Hat_Luffy')?.entityId).toBe('character:luffy');
    expect(resolveTitle(index, 'luffy')?.entityId).toBe('character:luffy');
    expect(resolveTitle(index, 'Roronoa Zoro')).toBeNull();
  });

  it('parses a REAL #REDIRECT page (fixture)', async () => {
    const raw = await Bun.file(
      join(import.meta.dir, 'fixtures', 'redirect-personality.json'),
    ).json() as { parse: { wikitext: string; }; };
    expect(parseRedirect(raw.parse.wikitext)).toBe('Monkey D. Luffy/Personality');
    expect(parseRedirect('regular {{Char Box}} page')).toBeNull();
  });
});

describe('detectEntityLinks', () => {
  it('maps wikilinks (incl. via redirects) to entity ids and reports unknowns', () => {
    const wikitext =
      'As [[Straw Hat Luffy|Luffy]] fought, [[Chapter 1044]] shows [[Roronoa Zoro]] resting. '
      + 'See [[Monkey D. Luffy#History]] and [[fr:Monkey D. Luffy]] and [[Category:Humans]].';
    const { linked, unknown } = detectEntityLinks(wikitext, registry);
    expect(linked.map((l) => l.entityId).sort()).toEqual([
      'character:luffy',
      'manga-chapter:1044',
    ]);
    expect(unknown).toEqual(['Roronoa Zoro']);
  });
});

describe('update detection', () => {
  it('staleEntries flags pages whose live revid moved past lastRevId', () => {
    const live = new Map([
      ['Monkey D. Luffy', 150], // moved: 100 → 150
      ['Chapter 1044', 200], // unchanged
    ]);
    expect(staleEntries(registry, live).map((p) => p.entityId)).toEqual([
      'character:luffy',
    ]);
  });

  it('upsertPage replaces by entityId and keeps the ledger sorted', () => {
    const next = upsertPage(registry, {
      entityId: 'character:luffy',
      page: 'Monkey D. Luffy',
      pageId: 1444,
      redirects: ['Straw Hat Luffy', 'Luffy', 'Lucy'],
      lastRevId: 150,
      lastImportedAt: '2026-06-14T22:00:00Z',
    });
    expect(next.pages).toHaveLength(2);
    expect(next.pages[0]?.entityId).toBe('character:luffy');
    expect(next.pages[0]?.lastRevId).toBe(150);
  });

  it('client.queryInfo parses info+redirects; recentChangesSince parses the feed', async () => {
    const infoRaw = JSON.stringify({
      query: {
        pages: [{
          title: 'Monkey D. Luffy',
          pageid: 1444,
          lastrevid: 150,
          redirects: [{ title: 'Straw Hat Luffy' }, { title: 'Luffy' }],
        }, { title: 'Gone Page', missing: true }],
      },
    });
    const rcRaw = JSON.stringify({
      query: {
        recentchanges: [
          { title: 'Chapter 1044', revid: 999, timestamp: '2026-06-14T10:00:00Z' },
        ],
      },
    });
    let calls = 0;
    const client = new FandomClient({
      minDelayMs: 0,
      fetchImpl: ((url: string | URL | Request) => {
        calls += 1;
        const s = String(url);
        return Promise.resolve(
          new Response(s.includes('recentchanges') ? rcRaw : infoRaw, { status: 200 }),
        );
      }) as typeof fetch,
    });
    const info = await client.queryInfo(['Monkey D. Luffy', 'Gone Page']);
    expect(info.get('Monkey D. Luffy')).toMatchObject({
      pageId: 1444,
      lastRevId: 150,
      redirects: ['Straw Hat Luffy', 'Luffy'],
    });
    expect(info.has('Gone Page')).toBe(false);
    const changes = await client.recentChangesSince('2026-06-13T00:00:00Z');
    expect(changes).toEqual([
      { title: 'Chapter 1044', revId: 999, timestamp: '2026-06-14T10:00:00Z' },
    ]);
    expect(calls).toBe(2);
  });
});
