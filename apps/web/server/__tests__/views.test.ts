/**
 * Integration coverage of the wiki view models against the real
 * build artifact. Skipped gracefully when `/dist/onepiece.db` has not
 * been built (the suite must stay green on a fresh clone without
 * `bun run build:db`); CI and local runs that have the artifact get
 * the full assertions.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EntityView, ProgressCursor } from '../views.ts';

const DB_PATH = resolve(import.meta.dirname, '..', '..', '..', '..', 'dist', 'onepiece.db');
const hasArtifact = existsSync(DB_PATH);

const cursor = (manga: number | null = null, anime: number | null = null): ProgressCursor => ({
  manga,
  anime,
});

/** Load one entity view and assert it is NOT progression-gated. */
async function entity(
  type: string,
  slug: string,
  locale: 'en' | 'fr' = 'en',
  progression: ProgressCursor = cursor(),
  scope: string | null = null,
): Promise<EntityView> {
  const { buildEntityView } = await import('../views.ts');
  const view = await buildEntityView(type, slug, locale, progression, scope);
  expect(view).not.toBeNull();
  if (view === null || view.kind !== 'entity') throw new Error(`expected entity view for ${slug}`);
  return view;
}

describe.skipIf(!hasArtifact)('reader view models (real artifact)', () => {
  test('home view groups every entity type with counts', async () => {
    const { buildHomeView } = await import('../views.ts');
    const home = await buildHomeView('en');
    expect(home.totalEntities).toBeGreaterThan(0);
    const allTypes = home.groups.flatMap((group) => group.types.map((t) => t.id));
    expect(allTypes).toContain('character');
    const character = home.groups
      .flatMap((group) => group.types)
      .find((t) => t.id === 'character');
    expect(character?.label).toBe('Character');
    expect(character?.count).toBeGreaterThan(0);
  });

  test('type list resolves localized names', async () => {
    const { buildTypeListView } = await import('../views.ts');
    const list = await buildTypeListView('character', 'en');
    expect(list).not.toBeNull();
    expect(list?.items.map((i) => i.name)).toContain('Monkey D. Luffy');
    const unknown = await buildTypeListView('does-not-exist', 'en');
    expect(unknown).toBeNull();
  });

  test('entity view carries properties and BOTH relation directions', async () => {
    const luffy = await entity('character', 'monkey-d-luffy');
    expect(luffy.name).toBe('Monkey D. Luffy');
    // Schema-labelled property with historised entries.
    const bounty = luffy.properties.find((p) => p.id === 'bounty');
    expect(bounty?.label).toBe('Bounty');
    expect(bounty?.entries.length).toBeGreaterThan(1);
    expect(bounty?.entries.every((e) => e.since !== null)).toBe(true);
    // The infobox surfaces the LATEST entry of each property.
    const infoboxBounty = luffy.infobox.find((row) => row.id === 'bounty');
    expect(infoboxBounty?.entry.since?.id).toBe('manga-chapter:1053');
    // Materialized inverse direction (ADR-086, `inverse` labels).
    const participated = luffy.relations.find((g) => g.key === 'participant.inverse');
    expect(participated?.label).toBe('Participated in');
    expect(participated?.inverse).toBe(true);
  });

  test('locale switches labels and translated values', async () => {
    const luffy = await entity('character', 'monkey-d-luffy', 'fr');
    const bounty = luffy.properties.find((p) => p.id === 'bounty');
    expect(bounty?.label).toBe('Prime');
    const epithet = luffy.properties.find((p) => p.id === 'epithet');
    expect(epithet?.entries[0]?.display).toBe('Chapeau de Paille');
  });

  test('epistemic axis surfaces on Sabo status history', async () => {
    const sabo = await entity('character', 'sabo');
    const status = sabo.properties.find((p) => p.id === 'status');
    const presumedDead = status?.entries.find((e) => e.display === 'Presumed dead');
    expect(presumedDead).toBeDefined();
    expect(presumedDead?.epistemic).not.toBeNull();
    // No cursor = wiki default, everything (incl. the truth) visible.
    expect(presumedDead?.actualDisplay).toBe('Alive');
  });

  // -------------------------------------------------------------------------
  // Spoiler cursor

  test('cursor hides later property entries and picks the right latest', async () => {
    const luffy = await entity('character', 'monkey-d-luffy', 'en', cursor(100));
    const bounty = luffy.properties.find((p) => p.id === 'bounty');
    // Data: 30M @96, 100M @432, 1.5B @1043, 3B @1053 → only @96 visible.
    expect(bounty?.entries).toHaveLength(1);
    expect(bounty?.entries[0]?.since?.id).toBe('manga-chapter:96');
    const infoboxBounty = luffy.infobox.find((row) => row.id === 'bounty');
    expect(infoboxBounty?.entry.since?.id).toBe('manga-chapter:96');
    // Epithet (@96) still visible at exactly the cursor boundary.
    expect(luffy.properties.some((p) => p.id === 'epithet')).toBe(true);
    // Below the boundary the epithet disappears entirely.
    const early = await entity('character', 'monkey-d-luffy', 'en', cursor(95));
    expect(early.properties.some((p) => p.id === 'epithet')).toBe(false);
  });

  test('cursor never leaks actual_value before the reveal', async () => {
    // Reveal is at chapter 731; at 600 the reader believes Sabo dead.
    const mid = await entity('character', 'sabo', 'en', cursor(600));
    const status = mid.properties.find((p) => p.id === 'status');
    expect(status?.entries).toHaveLength(2);
    const believed = status?.entries[1];
    expect(believed?.display).toBe('Presumed dead');
    expect(believed?.epistemic).not.toBeNull();
    expect(believed?.actualDisplay).toBeNull(); // ← the non-leak
    const infoboxStatus = mid.infobox.find((row) => row.id === 'status');
    expect(infoboxStatus?.entry.display).toBe('Presumed dead');
    expect(infoboxStatus?.entry.actualDisplay).toBeNull();
    // Once the revealing entry is within the cursor, truth may show.
    const late = await entity('character', 'sabo', 'en', cursor(731));
    const lateStatus = late.properties.find((p) => p.id === 'status');
    expect(lateStatus?.entries).toHaveLength(3);
    expect(lateStatus?.entries[1]?.actualDisplay).toBe('Alive');
    const lateInfobox = late.infobox.find((row) => row.id === 'status');
    expect(lateInfobox?.entry.display).toBe('Alive');
  });

  test('devil fruit true nature stays hidden before chapter 1044', async () => {
    const fruit = await entity('devil-fruit', 'gomu-gomu-no-mi', 'en', cursor(1000));
    const classification = fruit.properties.find((p) => p.id === 'classification');
    expect(classification?.entries).toHaveLength(1);
    expect(classification?.entries[0]?.display).toBe('Paramecia');
    expect(classification?.entries[0]?.actualDisplay).toBeNull();
    expect(fruit.properties.some((p) => p.id === 'zoan_model')).toBe(false);
    const name = fruit.properties.find((p) => p.id === 'name');
    expect(name?.entries).toHaveLength(1);
  });

  test('cursor hides relation edges anchored later', async () => {
    // Nami joined @96: below that, the crew has no Nami row.
    const crewLate = await entity('crew', 'straw-hat-pirates', 'en', cursor(100));
    expect(crewLate.template.kind).toBe('crew');
    if (crewLate.template.kind !== 'crew') return;
    const namesLate = crewLate.template.members.map((m) => m.chip.name);
    expect(namesLate).toContain('Nami');
    const crewEarly = await entity('crew', 'straw-hat-pirates', 'en', cursor(50));
    if (crewEarly.template.kind !== 'crew') return;
    const namesEarly = crewEarly.template.members.map((m) => m.chip.name);
    expect(namesEarly).toContain('Monkey D. Luffy');
    expect(namesEarly).not.toContain('Nami');
  });

  test('images beyond their spoiler_since are withheld', async () => {
    // The crew's only image (group photo) is spoiler_since ch. 96.
    const early = await entity('crew', 'straw-hat-pirates', 'en', cursor(50));
    expect(early.image).toBeNull();
    const late = await entity('crew', 'straw-hat-pirates', 'en', cursor(96));
    expect(late.image).not.toBeNull();
    // Luffy prefers the primary portrait over the group photo.
    const luffy = await entity('character', 'monkey-d-luffy');
    expect(luffy.image?.url).toContain('luffy-primary-portrait');
  });

  test('entities beyond the progression render gated', async () => {
    const { buildEntityView } = await import('../views.ts');
    // Wano arc first appears at chapter 1043.
    const arc = await buildEntityView('arc', 'wano', 'en', cursor(100), null);
    expect(arc?.kind).toBe('gated');
    if (arc?.kind === 'gated') expect(arc.name.length).toBeGreaterThan(0);
    // A source page beyond the cursor gates on its own id.
    const chapter = await buildEntityView(
      'manga-chapter',
      'chapter-1044',
      'en',
      cursor(1043),
      null,
    );
    expect(chapter?.kind).toBe('gated');
    // No cursor → fully rendered.
    const open = await buildEntityView('arc', 'wano', 'en', cursor(), null);
    expect(open?.kind).toBe('entity');
  });

  // -------------------------------------------------------------------------
  // Per-type templates

  test('character template lists the crew with its OTHER members', async () => {
    const luffy = await entity('character', 'monkey-d-luffy', 'fr');
    expect(luffy.template.kind).toBe('character');
    if (luffy.template.kind !== 'character') return;
    const crew = luffy.template.crews[0];
    expect(crew?.crew.slug).toBe('straw-hat-pirates');
    expect(crew?.label).toBe('Membre de');
    expect(crew?.role).toBe('Capitaine');
    const others = crew?.members.map((m) => m.chip.name) ?? [];
    expect(others).toContain('Roronoa Zoro');
    expect(others).not.toContain('Monkey D. Luffy');
    // member-of is consumed by the template — not repeated below.
    expect(luffy.relations.some((g) => g.key === 'member-of')).toBe(false);
    // ate-fruit surfaces as an infobox row.
    const fruitRow = luffy.infoboxRelations.find((r) => r.key === 'ate-fruit');
    expect(fruitRow?.chips[0]?.slug).toBe('gomu-gomu-no-mi');
  });

  test('crew template groups members with roles', async () => {
    const crew = await entity('crew', 'straw-hat-pirates');
    expect(crew.template.kind).toBe('crew');
    if (crew.template.kind !== 'crew') return;
    expect(crew.template.former).toHaveLength(0);
    const luffy = crew.template.members.find((m) => m.chip.slug === 'monkey-d-luffy');
    expect(luffy?.role).toBe('Captain');
    const zoro = crew.template.members.find((m) => m.chip.slug === 'roronoa-zoro');
    expect(zoro?.role).toBe('First Mate');
  });

  test('devil-fruit template lists users via the inverse edge', async () => {
    const fruit = await entity('devil-fruit', 'gomu-gomu-no-mi');
    expect(fruit.template.kind).toBe('devil-fruit');
    if (fruit.template.kind !== 'devil-fruit') return;
    expect(fruit.template.users.map((u) => u.chip.slug)).toContain('monkey-d-luffy');
    expect(fruit.template.former).toHaveLength(0);
  });

  test('chapter template: number, prev/next, arc siblings, availability', async () => {
    const ch1044 = await entity('manga-chapter', 'chapter-1044');
    expect(ch1044.template.kind).toBe('source');
    if (ch1044.template.kind !== 'source') return;
    expect(ch1044.template.number).toBe(1044);
    expect(ch1044.template.prev?.slug).toBe('chapter-1043');
    expect(ch1044.template.next).toBeNull(); // no chapter-1045 in corpus
    expect(ch1044.template.arc?.chip.slug).toBe('wano');
    const siblings = ch1044.template.arc?.items ?? [];
    expect(siblings.map((s) => s.number)).toEqual([1043, 1044, 1053]);
    expect(siblings.find((s) => s.number === 1044)?.current).toBe(true);
    // Chapter 1 resolves its Manga Plus link template + external_id.
    const ch1 = await entity('manga-chapter', 'chapter-1');
    if (ch1.template.kind !== 'source') return;
    expect(ch1.template.prev).toBeNull();
    const mangaPlus = ch1.template.availability.find((a) => a.platform.slug === 'manga-plus');
    expect(mangaPlus?.url).toBe('https://mangaplus.shueisha.co.jp/viewer/1000486');
  });

  test('prev/next hide siblings beyond the cursor', async () => {
    const ch1043 = await entity('manga-chapter', 'chapter-1043', 'en', cursor(1043));
    if (ch1043.template.kind !== 'source') return;
    expect(ch1043.template.next).toBeNull(); // 1044 exists but is beyond
    const siblings = ch1043.template.arc?.items ?? [];
    expect(siblings.map((s) => s.number)).toEqual([1043]);
  });

  test('arc template lists its chapters in order', async () => {
    const wano = await entity('arc', 'wano');
    expect(wano.template.kind).toBe('arc');
    if (wano.template.kind !== 'arc') return;
    expect(wano.template.chapters.map((c) => c.number)).toEqual([1043, 1044, 1053]);
    expect(wano.template.episodes).toHaveLength(0);
  });

  test('unknown scope degrades silently (no live-action corpus)', async () => {
    const luffy = await entity('character', 'monkey-d-luffy', 'en', cursor(), 'live_action');
    expect(luffy.propagateScope).toBe('live_action');
    // No entry is scoped, so nothing is dropped and values still show.
    expect(luffy.infobox.some((row) => row.id === 'bounty')).toBe(true);
    expect(luffy.template.kind).toBe('character');
  });
});
