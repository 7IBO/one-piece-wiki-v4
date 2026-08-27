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
  recordImports,
  resolveTitle,
  staleEntries,
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

  it('fetchParse asks for the revid and carries it onto the page', async () => {
    // The ledger's `lastRevId` is the whole basis of staleness: a page
    // recorded without one re-fetches forever.
    const seen: string[] = [];
    const client = new FandomClient({
      minDelayMs: 0,
      fetchImpl: ((url: string | URL | Request) => {
        seen.push(String(url));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              parse: {
                title: 'Chapter 1044',
                pageid: 333114,
                revid: 987,
                wikitext: '{{Chapter Box}}',
              },
            }),
            { status: 200 },
          ),
        );
      }) as typeof fetch,
    });
    const page = await client.fetchParse('Chapter 1044');
    expect(seen[0]).toContain('prop=wikitext%7Crevid');
    expect(page.revId).toBe(987);
  });

  it('recordImports appends new pages and keeps the ledger sorted by id', () => {
    const next = recordImports(registry, [
      {
        entityId: 'manga-chapter:1045',
        page: 'Chapter 1045',
        pageId: 333115,
        revId: 42,
        importedAt: '2026-06-14T22:00:00Z',
      },
    ]);
    expect(next.pages.map((p) => p.entityId)).toEqual([
      'character:luffy',
      'manga-chapter:1044',
      'manga-chapter:1045',
    ]);
    expect(next.pages[2]?.lastRevId).toBe(42);
    expect(next.pages[2]?.lastImportedAt).toBe('2026-06-14T22:00:00Z');
  });

  it('recordImports never drops aliases an earlier run learned', () => {
    // A crawl reaches a page through at most ONE alias; a wholesale
    // replace would erase the rest of the redirect set.
    const next = recordImports(registry, [{
      entityId: 'character:luffy',
      page: 'Monkey D. Luffy',
      pageId: 1444,
      revId: 150,
      alias: 'Mugiwara',
      importedAt: '2026-06-14T22:00:00Z',
    }]);
    expect(next.pages[0]?.redirects).toEqual(['Luffy', 'Mugiwara', 'Straw Hat Luffy']);
    expect(next.pages[0]?.lastRevId).toBe(150);
  });

  it('recordImports keeps a renamed page reachable under its old title', () => {
    const next = recordImports(registry, [{
      entityId: 'manga-chapter:1044',
      page: 'Chapter 1044 (canonical)',
      pageId: 333114,
      importedAt: '2026-06-14T22:00:00Z',
    }]);
    const moved = next.pages.find((p) => p.entityId === 'manga-chapter:1044');
    expect(moved?.redirects).toEqual(['Chapter 1044']);
    // No revid observed this run: the one already on file survives.
    expect(moved?.lastRevId).toBe(200);
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

describe('rendered html (ADR-119)', () => {
  it('asks for prop=text and returns the expanded page', async () => {
    // Some infobox values exist ONLY after template expansion: an arc
    // page writes `chapter = auto` and a Lua module computes the range.
    // `prop=wikitext` can never see that number.
    const seen: string[] = [];
    const client = new FandomClient({
      minDelayMs: 0,
      fetchImpl: ((url: string | URL | Request) => {
        seen.push(String(url));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              parse: { title: 'Arabasta Arc', text: '<aside>106-114, 9 chapters</aside>' },
            }),
            { status: 200 },
          ),
        );
      }) as typeof fetch,
    });
    const rendered = await client.fetchRendered('Arabasta Arc');
    expect(seen[0]).toContain('prop=text');
    expect(rendered.title).toBe('Arabasta Arc');
    expect(rendered.html).toContain('106-114');
  });

  it('surfaces a MediaWiki error rather than returning empty html', async () => {
    const client = new FandomClient({
      minDelayMs: 0,
      fetchImpl: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: 'missingtitle', info: 'The page does not exist.' } }),
            { status: 200 },
          ),
        )) as typeof fetch,
    });
    expect(client.fetchRendered('Nope')).rejects.toThrow(/missingtitle/);
  });
});

describe('CLI argument parsing (2026-08-27)', () => {
  // The `render` run captured all five real pages, then asked Fandom
  // for a page called "docs/audits/rendered" and failed — because the
  // VALUE of `--out` was read as a positional. The parse rule belongs
  // in a test, not only in the CLI.
  const VALUE_FLAGS = new Set(['--category', '--page', '--limit', '--depth', '--out']);
  const positionals = (args: readonly string[]): readonly string[] =>
    args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1] ?? ''));

  it('never reads a flag VALUE as a positional', () => {
    expect(positionals(['render', 'Arabasta Arc', '--out', 'docs/audits/rendered']))
      .toEqual(['render', 'Arabasta Arc']);
  });

  it('keeps positionals that merely FOLLOW a boolean flag', () => {
    expect(positionals(['chapter', '--stage', 'Chapter 1044']))
      .toEqual(['chapter', 'Chapter 1044']);
  });

  it('handles a crawl line with several value flags', () => {
    expect(positionals([
      'crawl',
      '--category',
      'Episodes',
      '--depth',
      '8',
      '--limit',
      '600',
      '--skip-known',
      '--stage',
    ])).toEqual(['crawl']);
  });
});
