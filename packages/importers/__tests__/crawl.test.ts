/**
 * Full-auto crawl (ADR-079/081): kind auto-detection, category
 * seeding, redirect following, frontier + unknown-box reporting, and
 * batch-PR plan assembly — all on fixture-backed fetch stubs.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { buildImportPRPlan } from '../src/emit-pr.ts';
import { FandomClient } from '../src/fandom/client.ts';
import { crawl, detectKind } from '../src/fandom/crawl.ts';

async function fixtureRaw(name: string): Promise<string> {
  return await Bun.file(join(import.meta.dir, 'fixtures', `${name}.json`)).text();
}

function stubClient(routes: Record<string, string>): FandomClient {
  return new FandomClient({
    minDelayMs: 0,
    fetchImpl: ((url: string | URL | Request) => {
      const s = decodeURIComponent(String(url)).replace(/\+/g, ' ');
      for (const [needle, raw] of Object.entries(routes)) {
        if (s.includes(needle)) return Promise.resolve(new Response(raw, { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'missingtitle', info: 'nope' } })),
      );
    }) as typeof fetch,
  });
}

describe('detectKind', () => {
  it('routes known infoboxes, reports unknown ones, skips boxless pages', async () => {
    const chapter = JSON.parse(await fixtureRaw('chapter-1044')) as {
      parse: { wikitext: string; };
    };
    expect(detectKind(chapter.parse.wikitext)).toEqual({ kind: 'chapter' });
    expect(detectKind('{{Crew Box|name=Straw Hats}}')).toEqual({ kind: 'crew' });
    // Island Box is deliberately mapper-less (ADR-109 §scope: islands
    // need their own modelling ADR) — the analyzer's "next mapper to
    // build" signal has to keep working.
    expect(detectKind('{{Island Box|name=Water 7}}')).toEqual({
      kind: 'unknown',
      box: 'Island Box',
    });
    expect(detectKind('just prose')).toEqual({ kind: 'none' });
  });
});

describe('categoryMembers', () => {
  it('descends subcategories to the given depth and dedupes page titles', async () => {
    const top = JSON.stringify({
      query: {
        categorymembers: [
          { title: 'Category:Chapters by Volume', ns: 14 },
          { title: 'Special Page', ns: 0 },
        ],
      },
    });
    const mid = JSON.stringify({
      query: { categorymembers: [{ title: 'Category:Volume 1', ns: 14 }] },
    });
    const leaf = JSON.stringify({
      query: {
        categorymembers: [
          { title: 'Chapter 1', ns: 0 },
          { title: 'Special Page', ns: 0 }, // duplicate across categories
        ],
      },
    });
    const client = stubClient({
      'cmtitle=Category:One Piece Chapters': top,
      'cmtitle=Category:Chapters by Volume': mid,
      'cmtitle=Category:Volume 1': leaf,
    });

    expect(await client.categoryMembers('One Piece Chapters', { depth: 2 })).toEqual([
      'Special Page',
      'Chapter 1',
    ]);
    // Default depth 0 collects direct main-namespace members only.
    expect(await client.categoryMembers('One Piece Chapters')).toEqual(['Special Page']);
  });

  it('surfaces MediaWiki error envelopes instead of returning an empty list', async () => {
    const client = stubClient({
      'cmtitle=Category:Broken': JSON.stringify({
        error: { code: 'invalidcategory', info: 'The category name is not valid.' },
      }),
    });
    await expect(client.categoryMembers('Broken')).rejects.toThrow('invalidcategory');
  });
});

describe('crawl', () => {
  it('seeds from categories, auto-detects, follows redirects, reports frontier + unknown boxes', async () => {
    const category = JSON.stringify({
      query: {
        categorymembers: [
          { title: 'Chapter 1044' },
          { title: 'Hyougoro' },
          { title: 'Monkey D. Luffy/Personality and Relationships' }, // redirect page
          { title: 'Water 7' }, // unknown box
        ],
      },
    });
    const islandPage = JSON.stringify({
      parse: {
        title: 'Water 7',
        pageid: 7,
        wikitext: '{{Island Box|name=Water 7}} Home port of the [[Going Merry]].',
      },
    });
    const personality = JSON.stringify({
      parse: {
        title: 'Monkey D. Luffy/Personality',
        pageid: 9,
        wikitext: '{{Char Box|ename=Monkey D. Luffy|first={{Qref|chap=1|ep=1}}}}',
      },
    });
    const client = stubClient({
      'list=categorymembers': category,
      'page=Chapter 1044': await fixtureRaw('chapter-1044'),
      'page=Hyougoro': await fixtureRaw('hyougoro'),
      'page=Monkey D. Luffy/Personality and Relationships': await fixtureRaw(
        'redirect-personality',
      ),
      'page=Monkey D. Luffy/Personality': personality,
      'page=Water 7': islandPage,
    });

    const report = await crawl(client, { categories: ['Test'] }, { limit: 10 });

    expect(report.results.map((r) => r.mapped.entity.id).sort()).toEqual([
      'character:hyogoro',
      'character:monkey-d-luffy',
      'manga-chapter:1044',
    ]);
    const redirected = report.results.find((r) => r.redirectedFrom !== undefined);
    expect(redirected?.redirectedFrom).toBe('Monkey D. Luffy/Personality and Relationships');
    expect(report.unknownBoxes).toEqual([{ box: 'Island Box', count: 1 }]);
    expect(report.failures.some((f) => f.reason.includes('Island Box'))).toBe(true);
    // The island page's link feeds the frontier.
    expect(report.frontier.some((f) => f.title === 'Going Merry')).toBe(true);
  });

  it('orders category members so `limit` takes the real pages, not the variants', async () => {
    // The 2026-08-07 regression in miniature: the API hands back the
    // recap variants first, and a limit of 2 used to swallow them.
    const category = JSON.stringify({
      query: {
        categorymembers: [
          { title: 'Chapter 1044 (Digital Colored)' },
          { title: 'Chapter 1044' },
        ],
      },
    });
    const client = stubClient({
      'list=categorymembers': category,
      'page=Chapter 1044': await fixtureRaw('chapter-1044'),
    });

    const report = await crawl(client, { categories: ['Test'] }, { limit: 1 });
    expect(report.results.map((r) => r.mapped.entity.id)).toEqual(['manga-chapter:1044']);
  });

  it('names the reason when a variant page is refused', async () => {
    const client = stubClient({
      'page=Chapter 1044 (Digital Colored)': JSON.stringify({
        parse: {
          title: 'Chapter 1044 (Digital Colored)',
          pageid: 3,
          wikitext: '{{Chapter Box|chapter=1044}}',
        },
      }),
    });
    const report = await crawl(client, { pages: ['Chapter 1044 (Digital Colored)'] }, { limit: 5 });
    expect(report.results).toEqual([]);
    expect(report.failures[0]?.reason).toContain('variant of Chapter 1044');
    expect(report.failures[0]?.reason).toContain('Digital Colored');
  });

  it('skipKnown advances past pages the registry already tracks', async () => {
    const client = stubClient({
      'page=Chapter 1044': await fixtureRaw('chapter-1044'),
      'page=Hyougoro': await fixtureRaw('hyougoro'),
    });
    const registry = {
      pages: [
        { entityId: 'manga-chapter:1044', page: 'Chapter 1044', pageId: 1, redirects: [] },
      ],
    };

    const report = await crawl(
      client,
      { pages: ['Chapter 1044', 'Hyougoro'] },
      { limit: 1, registry, skipKnown: true },
    );
    // Without the skip, `limit: 1` would have burned its single fetch
    // re-importing Chapter 1044 for the Nth time.
    expect(report.skippedKnown).toBe(1);
    expect(report.results.map((r) => r.mapped.entity.id)).toEqual(['character:hyogoro']);
  });

  it('skipKnown honours redirect aliases, and stays off by default', async () => {
    const client = stubClient({ 'page=Chapter 1044': await fixtureRaw('chapter-1044') });
    const registry = {
      pages: [
        {
          entityId: 'manga-chapter:1044',
          page: 'Ch. 1044',
          pageId: 1,
          redirects: ['Chapter 1044'],
        },
      ],
    };

    const skipped = await crawl(client, { pages: ['Chapter 1044'] }, {
      limit: 5,
      registry,
      skipKnown: true,
    });
    expect(skipped.skippedKnown).toBe(1);
    expect(skipped.results).toEqual([]);

    const included = await crawl(client, { pages: ['Chapter 1044'] }, { limit: 5, registry });
    expect(included.skippedKnown).toBe(0);
    expect(included.results.length).toBe(1);
  });

  it('respects the fetch limit', async () => {
    const client = stubClient({ 'page=Chapter 1044': await fixtureRaw('chapter-1044') });
    const report = await crawl(
      client,
      { pages: ['Chapter 1044', 'Hyougoro', 'Episode 1071'] },
      { limit: 1 },
    );
    expect(report.results.length + report.failures.length).toBe(1);
  });
});

describe('buildImportPRPlan', () => {
  it('assembles one reviewable batch PR from a crawl report', async () => {
    const client = stubClient({
      'page=Chapter 1044': await fixtureRaw('chapter-1044'),
      'page=Hyougoro': await fixtureRaw('hyougoro'),
    });
    const report = await crawl(client, { pages: ['Chapter 1044', 'Hyougoro'] }, { limit: 5 });
    const plan = buildImportPRPlan(report, { runId: 'test-1' });
    expect(plan).not.toBeNull();
    expect(plan?.branch).toBe('import/fandom-test-1');
    expect(plan?.title).toContain('Import 2 entities');
    expect(plan?.body).toContain('`manga-chapter:1044`');
    expect(plan?.body).toContain('**Warnings (review before merge):**');
    // One entity file per result, plus one translation file per locale
    // the mapper actually filled. Asserted as a RELATION rather than
    // as 4: the chapter mapper gained `ja` and `ja-latn` sidecars
    // (2026-08-27) and a pinned count made that enrichment look like a
    // regression.
    const entityFiles = plan?.files.filter((f) => f.kind === 'entity') ?? [];
    expect(entityFiles.length).toBe(report.results.length);
    expect(plan?.files.length).toBeGreaterThan(entityFiles.length);
    // Every file belongs to one of the mapped entities — nothing is
    // emitted for an entity the crawl did not produce.
    const slugs = report.results.map((r) => r.mapped.entity.id.split(':')[1]);
    for (const file of plan?.files ?? []) {
      expect(slugs.some((slug) => file.path.endsWith(`/${slug}.json`))).toBe(true);
    }
  });

  it('returns null on an empty report', () => {
    expect(
      buildImportPRPlan(
        { results: [], frontier: [], unknownBoxes: [], failures: [], skippedKnown: 0 },
        { runId: 'x' },
      ),
    ).toBeNull();
  });
});
