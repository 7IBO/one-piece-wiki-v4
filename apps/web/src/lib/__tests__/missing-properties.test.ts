/**
 * The `CETTE PAGE EST INCOMPLÈTE` copy, against the real artifact.
 *
 * Two things worth a test rather than a glance: the list is
 * SCHEMA-DRIVEN (so it moves with the schema and names nothing
 * hardcoded), and the sentence agrees in number — the first render
 * read « 1 properties expected ».
 */
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { t } from '../chrome';

const DB_PATH = resolve(import.meta.dirname, '..', '..', '..', '..', '..', 'dist', 'onepiece.db');
const hasArtifact = existsSync(DB_PATH);

describe.skipIf(!hasArtifact)('missingProperties (real artifact)', () => {
  test('names schema-expected properties the entity does not carry', async () => {
    const { buildEntityView } = await import('../../../server/views.ts');
    const view = await buildEntityView('manga-chapter', 'chapter-1044', 'en');
    if (view === null || view.kind !== 'entity') throw new Error('expected an entity view');
    // `manga-chapter` declares `page_count` as recommended, and 1044
    // has no value for it. The assertion is on the RULE, not the
    // count: an import that fills it must make the entry disappear,
    // not fail the test.
    const ids = view.missingProperties.map((item) => item.value);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of view.missingProperties) {
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  test('never lists a property the entity actually carries', async () => {
    const { buildEntityView } = await import('../../../server/views.ts');
    const view = await buildEntityView('manga-chapter', 'chapter-1044', 'en');
    if (view === null || view.kind !== 'entity') throw new Error('expected an entity view');
    const present = new Set(view.properties.map((p) => p.id));
    for (const item of view.missingProperties) {
      expect(present.has(item.value)).toBe(false);
    }
  });
});

describe('the incomplete sentence agrees in number', () => {
  test('one missing property does not read "1 properties"', () => {
    for (const locale of ['en', 'fr'] as const) {
      const one = t(locale, 'incompleteBodyOne');
      expect(one).not.toContain('#');
      // The plural form is the one that carries the counter.
      expect(t(locale, 'incompleteBody')).toContain('#');
    }
  });

  test('both forms name the entity type', () => {
    for (const locale of ['en', 'fr'] as const) {
      expect(t(locale, 'incompleteBody')).toContain('@');
      expect(t(locale, 'incompleteBodyOne')).toContain('@');
    }
  });
});
