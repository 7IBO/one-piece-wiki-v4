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
    const home = await buildHomeView('en', cursor());
    expect(home.totalEntities).toBeGreaterThan(0);
    const allTypes = home.groups.flatMap((group) => group.types.map((t) => t.id));
    expect(allTypes).toContain('character');
    const character = home.groups
      .flatMap((group) => group.types)
      .find((t) => t.id === 'character');
    expect(character?.label).toBe('Character');
    expect(character?.count).toBeGreaterThan(0);
  });

  test('with NO progression declared, the home names nothing', async () => {
    // The maintainer's rule for the landing page: a reader who has
    // told this wiki nothing is protected, not exposed. It may say a
    // chapter EXISTS and give its number — a bookshop shelf says as
    // much — but never what it is called, because a chapter title
    // tells you what happens in it.
    //
    // This does NOT fall out of the gate for free: `isSourceVisible`
    // answers true for an axis with no cursor, so without an explicit
    // rule the unset home would hand out every title on the site.
    const { buildHomeView } = await import('../views.ts');
    const home = await buildHomeView('en', cursor());
    expect(home.reading).toBeNull();
    expect(home.releases.length).toBeGreaterThan(0);
    for (const release of home.releases) {
      expect(release.title).toBeNull();
      expect(release.beyondCursor).toBe(true);
      // What EXISTS is still stated — the page is protective, not empty.
      expect(release.number).not.toBeNull();
    }
  });

  test('with a progression, titles appear up to it and stop there', async () => {
    const { buildHomeView } = await import('../views.ts');
    const home = await buildHomeView('en', cursor(100));
    expect(home.reading).not.toBeNull();
    const manga = home.reading?.axes.find((a) => a.sourceType === 'manga-chapter');
    expect(manga?.at).toBe(100);
    // The denominator counts WORKS THAT EXIST (public), never withheld
    // facts — so it exceeds the reader's own position.
    expect(manga?.total).toBeGreaterThan(100);
    for (const release of home.releases) {
      if (release.sourceType !== 'manga-chapter' || release.number === null) continue;
      if (release.number > 100) expect(release.title).toBeNull();
    }
  });

  test('an ordered type lists in its own order, not alphabetically', async () => {
    // Alphabetical was the only order until the corpus grew. With 400
    // episodes it put "A Man's Oath Never Dies" before "I'm Luffy!"
    // and left no way at all to reach episode 250.
    const { buildTypeListView } = await import('../views.ts');
    const list = await buildTypeListView('manga-chapter', 'en', cursor());
    expect(list).not.toBeNull();
    const ordinals = (list?.items ?? []).map((i) => i.ordinal);
    expect(ordinals.length).toBeGreaterThan(50);
    for (const o of ordinals) expect(o).not.toBeNull();
    // Monotonic: the list reads 0, 1, 2, … not by title.
    const sorted = [...ordinals].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(ordinals).toEqual(sorted);
  });

  test('a type with no ordinal still lists alphabetically', async () => {
    const { buildTypeListView } = await import('../views.ts');
    const list = await buildTypeListView('character', 'en', cursor());
    const items = list?.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.ordinal).toBeNull();
    const names = items.map((i) => i.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
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
    // ADR-096 — the mixed believed_by list (Luffy carries per-item
    // provenance, Ace is a plain ref) renders resolved names, never
    // raw JSON: "Monkey D. Luffy (Chapter 585), Portgas D. Ace".
    const believedBy = presumedDead?.qualifiers.find((q) => q.label === 'Believed by');
    expect(believedBy).toBeDefined();
    expect(believedBy?.value).toContain('Monkey D. Luffy (');
    expect(believedBy?.value).toContain('Portgas D. Ace');
    expect(believedBy?.value).not.toContain('{');
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
    // The gate reads `first_appearance_source`. The Nika reveal carries
    // one (chapter 1044), so a reader at 100 gets the name and nothing
    // else.
    //
    // This used to assert on `arc:wano` — a hand-seeded stub whose
    // `since` was the ONLY thing anchoring an arc. Merging it away
    // (migration 0011) exposed that 46 of the 50 arcs carry no anchor
    // at all and so render ungated at any cursor. That is a real
    // spoiler leak, it predates this change, and it is NOT fixed here
    // — see STATE.md. Anchoring on a stub was never the coverage this
    // test looked like it had.
    const gated = await buildEntityView('event', 'nika-reveal', 'en', cursor(100), null);
    expect(gated?.kind).toBe('gated');
    if (gated?.kind === 'gated') expect(gated.name.length).toBeGreaterThan(0);
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
    const open = await buildEntityView('arc', 'wano-country', 'en', cursor(), null);
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

  test('chapter page: arc siblings + availability', async () => {
    const ch1044 = await entity('manga-chapter', 'chapter-1044');
    expect(ch1044.template.kind).toBe('source');
    if (ch1044.template.kind !== 'source') return;
    expect(ch1044.template.arc?.chip.slug).toBe('wano-country');
    // The ribbon's CONTRACT, not the corpus: the chapter is in its own
    // arc exactly once, flagged current, among ordered siblings. The
    // count moves with every import; these three claims do not.
    const siblings = ch1044.template.arc?.items ?? [];
    expect(siblings.filter((s) => s.number === 1044)).toHaveLength(1);
    expect(siblings.find((s) => s.number === 1044)?.current).toBe(true);
    expect(siblings.filter((s) => s.current)).toHaveLength(1);
    const numbers = siblings.map((s) => s.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => (a ?? 0) - (b ?? 0)));
    // Chapter 1 resolves its Manga Plus link template + external_id.
    // Availability is a page-level module now, not a source-only one.
    const ch1 = await entity('manga-chapter', 'chapter-1');
    const mangaPlus = ch1.availability.find((a) => a.platform.slug === 'manga-plus');
    expect(mangaPlus?.url).toBe('https://mangaplus.shueisha.co.jp/viewer/1000486');
  });

  // -------------------------------------------------------------------------
  // Ordinal sequence (prev/next), discovered from the schema

  test('sequence derives the ordinal property and both neighbours', async () => {
    const ch1044 = await entity('manga-chapter', 'chapter-1044');
    expect(ch1044.sequence?.propertyId).toBe('number');
    expect(ch1044.sequence?.number).toBe(1044);
    expect(ch1044.sequence?.prev?.chip.slug).toBe('chapter-1043');
    expect(ch1044.sequence?.prev?.number).toBe(1043);
    // `next` was asserted null here, with the comment "no chapter-1045
    // in corpus". True when the corpus stopped at 1044, false the
    // moment an import went past it — the third time this file has
    // pinned a corpus fact and had a DATA pull request pay for it.
    // What cannot change is that a neighbour BRACKETS the ordinal.
    expect(ch1044.sequence?.next?.number ?? Number.POSITIVE_INFINITY).toBeGreaterThan(1044);
    expect(ch1044.sequence?.prev?.number ?? Number.NEGATIVE_INFINITY).toBeLessThan(1044);
    // `total` counts the population the reader may see. Asserted as a
    // property, not a magic number: this count grows with every import
    // (a chapter crawl took it from 34 to 406), and pinning it made an
    // unrelated DATA pull request fail on a test about SEQUENCE logic.
    // The rest of this file already states corpus-sized facts this way.
    expect(ch1044.sequence?.total).toBeGreaterThan(1);
    // Chapter 1 is NOT the start of the axis: chapter 0 exists — the
    // Strong World prologue one-shot (Jump 2009). It was long absent
    // from the corpus, and `number` even forbade it (min 1) until
    // ADR-116. Now that it is imported, chapter 1 has a predecessor,
    // and that is the sequence logic working, not a regression.
    const ch1 = await entity('manga-chapter', 'chapter-1');
    expect(ch1.sequence?.prev?.number).toBe(0);
    const ch0 = await entity('manga-chapter', 'chapter-0');
    expect(ch0.sequence?.number).toBe(0);
    expect(ch0.sequence?.prev).toBeNull(); // 0 IS the start of the axis
  });

  test('sequence hides a neighbour beyond the progression cursor', async () => {
    const ch1043 = await entity('manga-chapter', 'chapter-1043', 'en', cursor(1043));
    // 1044 exists, but announcing even its title would be a spoiler.
    expect(ch1043.sequence?.next).toBeNull();
    // `prev` was asserted null with the comment "1042 is not in the
    // corpus" — an absence, which proved nothing about the gate, and
    // which a later import falsified. The claim that holds for ANY
    // corpus is the gate's own rule: every neighbour it hands out sits
    // at or before the cursor, in either direction.
    for (const side of [ch1043.sequence?.prev, ch1043.sequence?.next]) {
      if (side !== null && side !== undefined) {
        expect(side.number).toBeLessThanOrEqual(1043);
      }
    }
    expect(ch1043.sequence?.number).toBe(1043);
    // The load-bearing claim is that gating SHRINKS the visible
    // population — chapters past the cursor (1044, 1053) drop out. The
    // exact sizes follow the corpus; the inequality between them does
    // not, so it is what we assert.
    const ungated = (await entity('manga-chapter', 'chapter-1043')).sequence?.total ?? 0;
    expect(ch1043.sequence?.total ?? 0).toBeLessThan(ungated);
    // Same rule on the arc ribbon: it never hands out a sibling past
    // the cursor, and the current chapter is still in it.
    const siblings = ch1043.template.kind === 'source' ? ch1043.template.arc?.items ?? [] : [];
    expect(siblings.length).toBeGreaterThan(0);
    for (const sibling of siblings) expect(sibling.number ?? 0).toBeLessThanOrEqual(1043);
    expect(siblings.some((s) => s.number === 1043 && s.current)).toBe(true);
  });

  test('a type with no ordinal property gets no sequence', async () => {
    // `character` declares no `number` / `*_number` property.
    const luffy = await entity('character', 'monkey-d-luffy');
    expect(luffy.sequence).toBeNull();
    // `arc` DOES declare `arc_number`, but East Blue carries no value
    // for it — the axis exists, this entity is not on it. (Only 32 of
    // the 50 arcs are numbered; the arc-edge pass numbers what the
    // source numbers.)
    const eastBlue = await entity('arc', 'east-blue');
    expect(eastBlue.sequence).toBeNull();
    // An ordered type, read at its FIRST instance. This asserted
    // `next === null` too, back when the corpus held one volume — the
    // fifth assertion this week to break on an import rather than on
    // a defect. What is true of volume 1 whatever the corpus holds:
    // it is on the axis, it is number 1, and nothing precedes it.
    const volume = await entity('volume', 'volume-1');
    expect(volume.sequence?.propertyId).toBe('number');
    expect(volume.sequence?.number).toBe(1);
    expect(volume.sequence?.prev).toBeNull();
    // And if a neighbour exists at all, it comes after — never before.
    const next = volume.sequence?.next;
    if (next !== null && next !== undefined) expect(next.number ?? 0).toBeGreaterThan(1);
  });

  test('container template groups everything an entity contains', async () => {
    const wano = await entity('arc', 'wano-country');
    expect(wano.template.kind).toBe('container');
    if (wano.template.kind !== 'container') return;
    const chapters = wano.template.groups.find((g) => g.type === 'manga-chapter');
    expect(chapters?.relationKey).toBe('part-of-arc.inverse');
    // Derived and ordered, without pinning the population: the arc
    // holds its opening chapter, holds them in ordinal order, and
    // holds no chapter twice.
    const arcChapters = (chapters?.items ?? []).map((c) => c.number);
    expect(arcChapters).toContain(909);
    expect(arcChapters).toEqual([...arcChapters].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(new Set(arcChapters).size).toBe(arcChapters.length);
    // A volume is a container too — same derivation, no arc-specific code.
    const volume = await entity('volume', 'volume-1');
    if (volume.template.kind !== 'container') return;
    const held = volume.template.groups.find((g) => g.type === 'manga-chapter');
    expect(held?.relationKey).toBe('part-of-volume.inverse');
    // Volume 1 opens on chapter 1 and its contents run upward. It used
    // to assert `['chapter-1']` exactly, which held only while the
    // corpus had ONE `part-of-volume` edge in total; the ADR-120
    // enrichment gave the volume its eight chapters and the test
    // failed on the feature working.
    const heldNumbers = (held?.items ?? []).map((c) => c.number);
    expect(heldNumbers[0]).toBe(1);
    expect(heldNumbers).toEqual([...heldNumbers].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(new Set(heldNumbers).size).toBe(heldNumbers.length);
  });

  test('a container is gated by what it CONTAINS (ADR-122)', async () => {
    // Le défaut mesuré : 46 arcs sur 50 n'avaient aucune ancre, donc
    // s'affichaient entièrement à n'importe quel curseur — la page
    // `arc/wano-country` déballait ses 149 chapitres à un lecteur au
    // chapitre 100. L'ancre est maintenant dérivée à la construction.
    const { buildEntityView } = await import('../views.ts');
    const beyond = await buildEntityView('arc', 'wano-country', 'en', cursor(100), null);
    expect(beyond?.kind).toBe('gated');
    // Et elle s'ouvre bien une fois la position atteinte.
    const reached = await buildEntityView('arc', 'wano-country', 'en', cursor(1050), null);
    expect(reached?.kind).toBe('entity');
    // Sans curseur, le wiki montre tout — c'est le défaut assumé.
    const open = await buildEntityView('arc', 'wano-country', 'en', cursor(), null);
    expect(open?.kind).toBe('entity');
  });

  test('a hand-written anchor is never overwritten by the derived one', async () => {
    // `arc:baratie` portait `manga-chapter:42` avant la dérivation, et
    // la dérivation retombe exactement dessus — ce qui la valide au
    // lieu de la contredire. Le test vaut pour la règle, pas pour la
    // valeur : ce qui est écrit à la main reste la vérité.
    const gated = await import('../views.ts').then((m) =>
      m.buildEntityView('arc', 'baratie', 'en', cursor(10), null)
    );
    expect(gated?.kind).toBe('gated');
  });

  test('ordinal ribbons stay lean — no thumbnail, no container per sibling', async () => {
    // `sourceItem` and `appearanceItem` are split on purpose: the LIST
    // form of an appearance resolves an image and an arc per row, and
    // a Wano ribbon is 149 siblings. If someone ever swaps the cheap
    // builder for the rich one, this fails instead of the page
    // quietly doing 149 extra relation reads.
    const chapter = await entity('manga-chapter', 'chapter-1044');
    expect(chapter.template.kind).toBe('source');
    if (chapter.template.kind !== 'source') return;
    const ribbon = chapter.template.arc?.items ?? [];
    expect(ribbon.length).toBeGreaterThan(1);
    expect(ribbon.every((item) => item.image === null && item.context === null)).toBe(true);
  });

  test('appearances stay empty until appearance edges exist', async () => {
    // The corpus has no chapter/episode → character `features` edges
    // yet (a known data gap): the module must simply not render.
    const luffy = await entity('character', 'monkey-d-luffy');
    expect(luffy.appearances).toEqual([]);
    // …and a container's contents are NOT mistaken for appearances.
    const volume = await entity('volume', 'volume-1');
    expect(volume.appearances).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Rich entity cards (epithet second line, micro-stats, status tags)

  test('crew member cards carry epithet, role and the bounty micro-stat', async () => {
    const crew = await entity('crew', 'straw-hat-pirates');
    expect(crew.template.kind).toBe('crew');
    if (crew.template.kind !== 'crew') return;
    const luffy = crew.template.members.find((m) => m.chip.slug === 'monkey-d-luffy');
    expect(luffy?.secondary).toBe('Straw Hat');
    expect(luffy?.role).toBe('Captain');
    expect(luffy?.stat).toBe('3B Berry'); // currency_short, like the infobox
    const zoro = crew.template.members.find((m) => m.chip.slug === 'roronoa-zoro');
    expect(zoro?.secondary).toBe('Pirate Hunter');
    expect(zoro?.stat).toBe('1.1B Berry');
  });

  test('card epithet and bounty respect the spoiler cursor', async () => {
    // Luffy: epithet @96, bounty 30M @96 (then 100M/1.5B/3B later).
    const at100 = await entity('crew', 'straw-hat-pirates', 'en', cursor(100));
    if (at100.template.kind !== 'crew') return;
    const luffy100 = at100.template.members.find((m) => m.chip.slug === 'monkey-d-luffy');
    expect(luffy100?.secondary).toBe('Straw Hat'); // boundary inclusive
    expect(luffy100?.stat).toBe('30M Berry'); // NOT the later 3B
    const at95 = await entity('crew', 'straw-hat-pirates', 'en', cursor(95));
    if (at95.template.kind !== 'crew') return;
    const luffy95 = at95.template.members.find((m) => m.chip.slug === 'monkey-d-luffy');
    expect(luffy95?.secondary).toBeNull(); // epithet not yet earned
    expect(luffy95?.stat).toBeNull(); // no bounty yet → no empty line
  });

  test('devil-fruit user cards carry the epithet but no bounty stat', async () => {
    const fruit = await entity('devil-fruit', 'gomu-gomu-no-mi');
    if (fruit.template.kind !== 'devil-fruit') return;
    const luffy = fruit.template.users.find((u) => u.chip.slug === 'monkey-d-luffy');
    expect(luffy?.secondary).toBe('Straw Hat');
    expect(luffy?.stat).toBeNull();
    expect(luffy?.since?.id).toBe('manga-chapter:1');
  });

  test('character-page other-member thumbs carry epithet + role', async () => {
    const luffy = await entity('character', 'monkey-d-luffy');
    if (luffy.template.kind !== 'character') return;
    const zoro = luffy.template.crews[0]?.members.find((m) => m.chip.slug === 'roronoa-zoro');
    expect(zoro?.secondary).toBe('Pirate Hunter');
    expect(zoro?.note).toBe('First Mate');
  });

  test('type listing carries type-appropriate second lines and status tags', async () => {
    const { buildTypeListView } = await import('../views.ts');
    const characters = await buildTypeListView('character', 'en');
    const luffy = characters?.items.find((i) => i.slug === 'monkey-d-luffy');
    expect(luffy?.secondary).toBe('Straw Hat');
    expect(luffy?.tag).toBeNull(); // alive = unremarkable, no tag
    const ace = characters?.items.find((i) => i.slug === 'portgas-d-ace');
    expect(ace?.tag).toBe('Dead');
    // Chapters: release date; platforms: kind (both via their schemas).
    //
    // The claim is that the second line is the release date FORMATTED
    // for the locale — not that it is one particular date. It used to
    // name `July 22, 1997`, a hand-seeded value that the rendered
    // infobox later corrected to July 19 (ADR-120); the test then
    // failed on an import doing exactly what it was built to do.
    const chapters = await buildTypeListView('manga-chapter', 'en');
    const chapterOne = chapters?.items.find((i) => i.slug === 'chapter-1')?.secondary;
    expect(chapterOne).toMatch(/^[A-Z][a-z]+ \d{1,2}, 1997$/);
    const platforms = await buildTypeListView('streaming-platform', 'en');
    expect(platforms?.items.find((i) => i.slug === 'netflix')?.secondary)
      .toBe('Streaming (video)');
  });

  test('listing tags/epithets respect the cursor and never leak the truth', async () => {
    const { buildTypeListView } = await import('../views.ts');
    // Ace dies @574 — before that, no tag.
    const early = await buildTypeListView('character', 'en', cursor(100));
    expect(early?.items.find((i) => i.slug === 'portgas-d-ace')?.tag).toBeNull();
    // Sabo @600 is BELIEVED dead: the tag shows the believed value,
    // never the concealed actual_value ("alive").
    const mid = await buildTypeListView('character', 'en', cursor(600));
    expect(mid?.items.find((i) => i.slug === 'sabo')?.tag).toBe('Presumed dead');
    // After the reveal (@731) the latest visible status is alive → no tag.
    const late = await buildTypeListView('character', 'en', cursor(731));
    expect(late?.items.find((i) => i.slug === 'sabo')?.tag).toBeNull();
    // Epithets beyond the cursor stay hidden on listing cards too.
    const at95 = await buildTypeListView('character', 'en', cursor(95));
    expect(at95?.items.find((i) => i.slug === 'monkey-d-luffy')?.secondary).toBeNull();
  });

  test('unknown scope degrades silently (no live-action corpus)', async () => {
    const luffy = await entity('character', 'monkey-d-luffy', 'en', cursor(), 'live_action');
    expect(luffy.propagateScope).toBe('live_action');
    // No entry is scoped, so nothing is dropped and values still show.
    expect(luffy.infobox.some((row) => row.id === 'bounty')).toBe(true);
    expect(luffy.template.kind).toBe('character');
  });
});
