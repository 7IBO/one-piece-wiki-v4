/**
 * Phase 2 end-to-end integration test:
 *   1. Build the SQLite artefact from /data/ via @onepiece-wiki/db-builder.
 *   2. Open it via @onepiece-wiki/sdk.
 *   3. Query known seed entities and assert shape.
 *   4. Apply the spoiler filter and assert visibility cut-offs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../../db-builder/src/index.ts';
import {
  type Client,
  createClient,
  openDatabase,
  visibleProperties,
  visibleRelations,
} from '../src/index.ts';

describe('Phase 2 end-to-end', () => {
  let scratch: string;
  let dbPath: string;
  let manifestPath: string;
  let client: Client;

  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), 'opwiki-phase2-'));
    dbPath = join(scratch, 'onepiece.db');
    manifestPath = join(scratch, 'manifest.json');
    await build({ dbPath, manifestPath });
    client = createClient(openDatabase(dbPath));
  });

  afterAll(() => {
    client.close();
    // Best-effort cleanup: SQLite WAL files may briefly hold a lock on
    // Windows after close. Failure here doesn't affect test outcomes.
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('emits a non-trivial entity catalogue', () => {
    const characters = client.getByType('character');
    expect(characters.length).toBe(5);

    const chapters = client.getByType('manga-chapter');
    expect(chapters.length).toBeGreaterThanOrEqual(9);

    const images = client.getByType('image');
    expect(images.length).toBe(3);
  });

  it('returns a character with its first/last appearance', () => {
    const luffy = client.getEntity('character:luffy');
    expect(luffy).not.toBeNull();
    expect(luffy!.type).toBe('character');
    expect(luffy!.slug).toBe('monkey-d-luffy');
    expect(luffy!.first_appearance_source).toBe('manga-chapter:1');
    expect(luffy!.last_appearance_source).toBe('manga-chapter:1053');
  });

  it('exposes the historisable bounty as one row per entry', () => {
    const properties = client.getProperties('character:luffy');
    const bounty = properties.filter((p) => p.property_id === 'bounty');
    expect(bounty.length).toBe(4);
    expect(bounty.map((b) => b.since_source)).toEqual([
      'manga-chapter:96',
      'manga-chapter:432',
      'manga-chapter:1043',
      'manga-chapter:1053',
    ]);
  });

  it('generates the inverse direction for relations marked inverse_inferred', () => {
    const luffyRelations = client.getRelations('character:luffy', 'outgoing');
    const ateFruit = luffyRelations.find(
      (r) => r.relation_type === 'ate-fruit' && r.target_entity_id === 'devil-fruit:gomu-gomu',
    );
    expect(ateFruit).toBeDefined();
    expect(ateFruit!.is_inferred).toBe(false);

    const fruitOutgoing = client.getRelations('devil-fruit:gomu-gomu', 'outgoing');
    const inverse = fruitOutgoing.find(
      (r) => r.relation_type === 'ate-fruit.inverse' && r.target_entity_id === 'character:luffy',
    );
    expect(inverse).toBeDefined();
    expect(inverse!.is_inferred).toBe(true);
  });

  it('spoiler filter cuts bounty history at user progression', () => {
    const properties = client.getProperties('character:luffy');
    const earlyBounties = visibleProperties(properties, { manga_chapter: 432 });
    const bounty = earlyBounties.find((p) => p.property_id === 'bounty');
    expect(bounty).toBeDefined();
    const value = bounty!.value as { value: number; };
    expect(value.value).toBe(100000000);

    const lateBounties = visibleProperties(properties, { manga_chapter: 1053 });
    const lateBounty = lateBounties.find((p) => p.property_id === 'bounty');
    expect((lateBounty!.value as { value: number; }).value).toBe(3000000000);
  });

  it('spoiler filter hides relations whose qualifier since is unreached', () => {
    const luffyRelations = client.getRelations('character:luffy', 'outgoing');
    const allMemberOf = luffyRelations.filter((r) => r.relation_type === 'member-of');
    expect(allMemberOf.length).toBeGreaterThan(0);

    const preStoryVisible = visibleRelations(luffyRelations, { manga_chapter: 0 });
    const preStoryMember = preStoryVisible.filter((r) => r.relation_type === 'member-of');
    expect(preStoryMember.length).toBe(0);

    const chapter1Visible = visibleRelations(luffyRelations, { manga_chapter: 1 });
    const chapter1Member = chapter1Visible.filter((r) => r.relation_type === 'member-of');
    expect(chapter1Member.length).toBe(1);
  });

  it('handles a reused image (group photo) with multiple depicted-by inverses', () => {
    const groupRelations = client.getRelations('image:straw-hats-group', 'incoming');
    const depictedBy = groupRelations.filter((r) =>
      r.relation_type === 'depicted-by.inverse' && r.is_inferred
    );
    expect(depictedBy.length).toBe(3);
  });
});
