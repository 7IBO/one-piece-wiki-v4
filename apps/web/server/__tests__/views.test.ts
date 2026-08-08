/**
 * Integration coverage of the reader view models against the real
 * build artifact. Skipped gracefully when `/dist/onepiece.db` has not
 * been built (the suite must stay green on a fresh clone without
 * `bun run build:db`); CI and local runs that have the artifact get
 * the full assertions.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DB_PATH = resolve(import.meta.dirname, '..', '..', '..', '..', 'dist', 'onepiece.db');
const hasArtifact = existsSync(DB_PATH);

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
    const { buildEntityView } = await import('../views.ts');
    const luffy = await buildEntityView('character', 'monkey-d-luffy', 'en');
    expect(luffy).not.toBeNull();
    if (luffy === null) return;
    expect(luffy.name).toBe('Monkey D. Luffy');
    // Schema-labelled property with historised entries.
    const bounty = luffy.properties.find((p) => p.id === 'bounty');
    expect(bounty?.label).toBe('Bounty');
    expect(bounty?.entries.length).toBeGreaterThan(1);
    expect(bounty?.entries.every((e) => e.since !== null)).toBe(true);
    // Stored direction (label column, `active` labels).
    const memberOf = luffy.relations.find((g) => g.key === 'member-of');
    expect(memberOf?.inverse).toBe(false);
    expect(memberOf?.label).toBe('Member of');
    // Materialized inverse direction (ADR-086, `inverse` labels).
    const inverse = luffy.relations.filter((g) => g.inverse);
    expect(inverse.length).toBeGreaterThan(0);
    const participated = luffy.relations.find((g) => g.key === 'participant.inverse');
    expect(participated?.label).toBe('Participated in');
  });

  test('locale switches labels and translated values', async () => {
    const { buildEntityView } = await import('../views.ts');
    const luffy = await buildEntityView('character', 'monkey-d-luffy', 'fr');
    expect(luffy).not.toBeNull();
    if (luffy === null) return;
    const bounty = luffy.properties.find((p) => p.id === 'bounty');
    expect(bounty?.label).toBe('Prime');
    const epithet = luffy.properties.find((p) => p.id === 'epithet');
    expect(epithet?.entries[0]?.display).toBe('Chapeau de Paille');
    const memberOf = luffy.relations.find((g) => g.key === 'member-of');
    expect(memberOf?.label).toBe('Membre de');
  });

  test('epistemic axis surfaces on Sabo status history', async () => {
    const { buildEntityView } = await import('../views.ts');
    const sabo = await buildEntityView('character', 'sabo', 'en');
    expect(sabo).not.toBeNull();
    if (sabo === null) return;
    const status = sabo.properties.find((p) => p.id === 'status');
    const presumedDead = status?.entries.find((e) => e.display === 'Presumed dead');
    expect(presumedDead).toBeDefined();
    expect(presumedDead?.epistemic).not.toBeNull();
    expect(presumedDead?.actualDisplay).toBe('Alive');
  });
});
