/**
 * The DISPLAY-NAME SPOILER GATE (`resolveEntityName`, `server/views.ts`).
 *
 * A name is historised like any other value: an entity can be renamed
 * at chapter 96, and a devil fruit can acquire its true name at 1044.
 * Showing the reader a name they have not reached is a spoiler exactly
 * like showing them a bounty they have not reached — and it used to
 * happen, because `resolveEntityName` read `canonical_name_key`
 * WITHOUT the cursor while search resolved labels WITH it
 * (STATE.md, "Note de dette repérée en passant"; ADR-108 § gating).
 *
 * The real corpus cannot exhibit the bug: every entity that carries
 * several names happens to declare the EARLIEST one as its canonical
 * key, so the unguarded read gave the right answer by luck. This suite
 * therefore builds a throwaway artifact — a copy of the real one plus
 * two synthetic entities — and mirrors the two search cases:
 *
 *  1. **A later NAME is the spoiler.** `character:renamed-later` is
 *     introduced at chapter 1 and renamed at 96, with the LATER name
 *     as its canonical key. Before the fix its page, its `<title>`,
 *     its listing card and every link to it showed the post-96 name to
 *     a reader at chapter 50.
 *  2. **The ENTITY'S EXISTENCE is the spoiler.** `event:late-secret`
 *     first appears at chapter 900; below that the page must withhold
 *     it — and must not print its name either.
 *
 * The artifact path is set through `ONEPIECE_DB_PATH` before the first
 * dynamic import, which is what `server/db.ts` reads when it opens the
 * database. Bun gives every test FILE its own module registry, so this
 * never disturbs the suites that run against the real artifact.
 */
import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { EntityPageView, ProgressCursor } from '../views.ts';

const REAL_DB = resolve(import.meta.dirname, '..', '..', '..', '..', 'dist', 'onepiece.db');
const hasArtifact = existsSync(REAL_DB);

const EARLY_NAME = 'Kuina Test Early';
const LATER_NAME = 'Kuina Test Renamed';
const SECRET_NAME = 'The Late Secret';
/** The chapter the rename lands on — the boundary every case turns on. */
const RENAME_AT = 96;
const SECRET_AT = 900;

const cursor = (manga: number | null = null): ProgressCursor => ({ manga, anime: null });

let workdir: string | null = null;

/**
 * Copy the real artifact and graft the two synthetic entities onto it,
 * writing exactly the rows `packages/db-builder` would have written:
 * an `entities` row, its `translations`, and the `search_docs` /
 * `search_gates` pair that carries the display-name priority
 * (`name_rank`) and the progression anchors.
 */
function buildFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-display-name-'));
  workdir = dir;
  const path = join(dir, 'onepiece.db');
  copyFileSync(REAL_DB, path);
  const db = new Database(path);

  const entity = db.prepare(
    `INSERT INTO entities
       (id, type, slug, schema_version, first_appearance_source, canonical_name_key, data)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
  );
  const translation = db.prepare(
    `INSERT INTO translations (universe, locale, key, value) VALUES ('one-piece', ?, ?, ?)`,
  );
  const doc = db.prepare(
    `INSERT INTO search_docs
       (doc_id, entity_id, entity_type, slug, locale, field, kind, name_rank, entry_index, text)
     VALUES (?, ?, ?, ?, 'en', 'name', 'name', ?, ?, ?)`,
  );
  const gate = db.prepare(
    `INSERT INTO search_gates (doc_id, source_type, ordinal) VALUES (?, 'manga-chapter', ?)`,
  );
  const nextDocId =
    (db.prepare('SELECT MAX(doc_id) AS m FROM search_docs').get() as { m: number; }).m + 1;

  // 1. Renamed at chapter 96, canonical key pointing at the LATER name.
  const renamedData = {
    id: 'character:renamed-later',
    type: 'character',
    slug: 'renamed-later',
    canonical_name_key: 'character.renamed-later.name.later',
    properties: {
      name: [
        { value_key: 'character.renamed-later.name.early', since: 'manga-chapter:1' },
        { value_key: 'character.renamed-later.name.later', since: `manga-chapter:${RENAME_AT}` },
      ],
    },
  };
  entity.run(
    'character:renamed-later',
    'character',
    'renamed-later',
    'manga-chapter:1',
    'character.renamed-later.name.later',
    JSON.stringify(renamedData),
  );
  translation.run('en', 'character.renamed-later.name.early', EARLY_NAME);
  translation.run('en', 'character.renamed-later.name.later', LATER_NAME);
  // name_rank 1 = first entry of `display_name_properties`; 0 = the
  // canonical key, which here is the LATER entry (entry_index 1).
  doc.run(nextDocId, 'character:renamed-later', 'character', 'renamed-later', 1, 0, EARLY_NAME);
  gate.run(nextDocId, 1);
  doc.run(nextDocId + 1, 'character:renamed-later', 'character', 'renamed-later', 0, 1, LATER_NAME);
  gate.run(nextDocId + 1, RENAME_AT);

  // The membership makes the same name a LINK LABEL on the crew page.
  db.prepare(
    `INSERT INTO relations
       (source_entity_id, target_entity_id, relation_type, qualifiers, since_source, is_inferred)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    'crew:straw-hat-pirates',
    'character:renamed-later',
    'member-of.inverse',
    JSON.stringify({ role: 'crewmate' }),
    'manga-chapter:1',
    1,
  );

  // 2. An entity whose EXISTENCE only starts at chapter 900.
  const secretData = {
    id: 'event:late-secret',
    type: 'event',
    slug: 'late-secret',
    canonical_name_key: 'event.late-secret.name',
    properties: { name: [{ value_key: 'event.late-secret.name' }] },
  };
  entity.run(
    'event:late-secret',
    'event',
    'late-secret',
    `manga-chapter:${SECRET_AT}`,
    'event.late-secret.name',
    JSON.stringify(secretData),
  );
  translation.run('en', 'event.late-secret.name', SECRET_NAME);
  doc.run(nextDocId + 2, 'event:late-secret', 'event', 'late-secret', 0, 0, SECRET_NAME);
  gate.run(nextDocId + 2, SECRET_AT);

  db.close();
  return path;
}

async function view(slug: string, at: number | null, type = 'character'): Promise<EntityPageView> {
  const { buildEntityView } = await import('../views.ts');
  const built = await buildEntityView(type, slug, 'en', cursor(at), null);
  if (built === null) throw new Error(`no view for ${type}/${slug}`);
  return built;
}

beforeAll(() => {
  if (!hasArtifact) return;
  process.env['ONEPIECE_DB_PATH'] = buildFixture();
});

afterAll(() => {
  if (workdir !== null) rmSync(workdir, { recursive: true, force: true });
});

describe.skipIf(!hasArtifact)('display names go through the progression cursor', () => {
  // --- Case 1: a later NAME is the spoiler ---------------------------------

  test('an entity page titles itself with the name in force at the cursor', async () => {
    const before = await view('renamed-later', RENAME_AT - 1);
    expect(before.name).toBe(EARLY_NAME);
    // The page title / `<title>` / hero all read `view.name`.
    expect(before.name).not.toBe(LATER_NAME);
  });

  test('the rename shows from its own chapter onwards, boundary inclusive', async () => {
    expect((await view('renamed-later', RENAME_AT)).name).toBe(LATER_NAME);
    expect((await view('renamed-later', null)).name).toBe(LATER_NAME);
  });

  test('listing cards use the name at the cursor', async () => {
    const { buildTypeListView } = await import('../views.ts');
    const early = await buildTypeListView('character', 'en', cursor(50));
    expect(early?.items.find((i) => i.slug === 'renamed-later')?.name).toBe(EARLY_NAME);
    const late = await buildTypeListView('character', 'en', cursor(1000));
    expect(late?.items.find((i) => i.slug === 'renamed-later')?.name).toBe(LATER_NAME);
  });

  test('link labels on ANOTHER entity page use the name at the cursor', async () => {
    const crew = await view('straw-hat-pirates', 50, 'crew');
    if (crew.kind !== 'entity' || crew.template.kind !== 'crew') {
      throw new Error('expected the crew template');
    }
    const names = crew.template.members.map((m) => m.chip.name);
    expect(names).toContain(EARLY_NAME);
    expect(names).not.toContain(LATER_NAME);
  });

  test('result cards (the search label) use the name at the cursor', async () => {
    const { buildEntityCardView } = await import('../views.ts');
    const { getCatalogue } = await import('../catalogue.ts');
    const cat = await getCatalogue();
    const nameAt = (at: number): string | undefined =>
      buildEntityCardView('character:renamed-later', cat, 'en', cursor(at))?.chip.name;
    expect(nameAt(50)).toBe(EARLY_NAME);
    expect(nameAt(RENAME_AT)).toBe(LATER_NAME);
    // …and the card agrees with the page it links to, at every cursor.
    for (const at of [50, RENAME_AT, 1000]) {
      expect(nameAt(at)).toBe((await view('renamed-later', at)).name);
    }
  });

  // --- Case 2: the ENTITY'S EXISTENCE is the spoiler -----------------------

  test('an entity whose existence is later is withheld, name included', async () => {
    const hidden = await view('late-secret', SECRET_AT - 1, 'event');
    // Withheld exactly as WEB_APP.md § spoiler gating rule 3 prescribes
    // (the reader typed the URL: we warn, we do not gaslight) — but the
    // NAME is no longer printed, since it is gated like every other.
    expect(hidden.kind).toBe('gated');
    expect(hidden.name).not.toBe(SECRET_NAME);
    // …and nothing anywhere else surfaces it either.
    const { buildTypeListView } = await import('../views.ts');
    const events = await buildTypeListView('event', 'en', cursor(SECRET_AT - 1));
    expect(events?.items.find((i) => i.slug === 'late-secret')?.name).not.toBe(SECRET_NAME);
  });

  test('the same entity reads normally once the cursor reaches it', async () => {
    const reached = await view('late-secret', SECRET_AT, 'event');
    expect(reached.kind).toBe('entity');
    expect(reached.name).toBe(SECRET_NAME);
  });
});
