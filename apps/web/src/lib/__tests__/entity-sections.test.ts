/**
 * Entity sub-pages (ADR-110). Two invariants are worth a test, because
 * breaking either is silent:
 *
 * 1. **No data can be dropped.** Slots are partitioned between the
 *    overview and the sections — never listed twice, never forgotten.
 * 2. **No empty sub-page is ever offered**, and a type with nothing to
 *    split shows no navigation at all.
 *
 * Plus the layout-slicing rule that keeps ADR-106 unforked: a
 * restricted band keeps the shape the type authored.
 */
import { describe, expect, test } from 'bun:test';
import type { EntityView } from '../../api.ts';
import { ALL_SLOTS, bandsFor, type LayoutBand, type SlotKey } from '../entity-layout.ts';
import {
  overviewSlots,
  restrictBands,
  sectionById,
  sectionsFor,
  slotHasContent,
  slotsForSection,
  visibleSections,
} from '../entity-sections.ts';

const AUTHORED = ['character', 'crew', 'organization'] as const;

/** A view model with every module empty; tests fill in what they need. */
function emptyView(type: string, over: Partial<EntityView> = {}): EntityView {
  return {
    kind: 'entity',
    id: `${type}:x`,
    type,
    typeLabel: type,
    slug: 'x',
    name: 'X',
    firstAppearance: null,
    image: null,
    gallery: [],
    sequence: null,
    cast: [],
    availability: [],
    appearances: [],
    infobox: [],
    infoboxRelations: [],
    properties: [],
    relations: [],
    narrative: null,
    template: { kind: 'generic' },
    propagateScope: null,
    ...over,
  } as EntityView;
}

describe('slots are partitioned, never dropped', () => {
  test('overview + sections cover every slot exactly once, for every type', () => {
    for (const type of [...AUTHORED, 'devil-fruit', 'arc', 'type-invented-tomorrow']) {
      const claimed = [
        ...overviewSlots(type),
        ...sectionsFor(type).flatMap((section) => section.slots),
      ];
      expect([...claimed].sort(), type).toEqual([...ALL_SLOTS].sort());
      expect(new Set(claimed).size, type).toBe(ALL_SLOTS.length);
    }
  });

  test('an unauthored type has no sub-pages and keeps everything on one page', () => {
    expect(sectionsFor('type-invented-tomorrow')).toEqual([]);
    expect([...overviewSlots('type-invented-tomorrow')]).toEqual([...ALL_SLOTS]);
    expect(sectionById('type-invented-tomorrow', 'appearances')).toBeNull();
  });

  test('section ids are URL segments: kebab-case English, unique per type', () => {
    for (const type of AUTHORED) {
      const ids = sectionsFor(type).map((section) => section.id);
      for (const id of ids) expect(id, `${type}/${id}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(new Set(ids).size, type).toBe(ids.length);
    }
  });

  test('sectionById resolves only declared ids', () => {
    expect(sectionById('crew', 'appearances')?.slots).toEqual(['appearances', 'connections']);
    expect(sectionById('crew', 'nope')).toBeNull();
    // A section declared on one type is not implicitly on another.
    expect(sectionById('crew', 'relations')).toBeNull();
    expect(sectionById('character', 'relations')).not.toBeNull();
  });
});

describe('restrictBands slices the authored layout instead of forking it', () => {
  test('a crew overview keeps the roster leading at full width', () => {
    const bands = restrictBands(bandsFor('crew'), slotsForSection('crew', null));
    const lead = bands[0];
    expect(lead?.kind).toBe('full');
    if (lead?.kind === 'full') expect(lead.slots).toContain('members');
    const all = bands.flatMap(slotsOf);
    expect(all).not.toContain('appearances'); // it has its own sub-page
    expect(all).toContain('sheet');
  });

  test('a sub-page renders exactly its own slots', () => {
    const section = sectionById('character', 'relations');
    expect(section).not.toBeNull();
    if (section === null) return;
    const bands = restrictBands(bandsFor('character'), slotsForSection('character', section));
    expect(bands.flatMap(slotsOf)).toEqual(['connections']);
  });

  test('bands (and split sides) that end up empty disappear', () => {
    const input: readonly LayoutBand[] = [
      { kind: 'full', slots: ['members'] },
      { kind: 'split', side: 'end', main: ['narrative'], aside: ['sheet'] },
    ];
    expect(restrictBands(input, ['sheet'])).toEqual([
      { kind: 'split', side: 'end', main: [], aside: ['sheet'] },
    ]);
    expect(restrictBands(input, [])).toEqual([]);
  });
});

describe('no empty sub-page is ever offered', () => {
  test('a crew with only a roster shows no navigation at all', () => {
    const view = emptyView('crew', {
      template: { kind: 'crew', members: [{}] as never, former: [] },
      properties: [{ id: 'name', label: 'Name', entries: [] }] as never,
    });
    expect(visibleSections(view)).toEqual([]);
  });

  test('a section appears as soon as one of its modules has content', () => {
    const withFormer = emptyView('crew', {
      template: { kind: 'crew', members: [], former: [{}] as never },
    });
    expect(visibleSections(withFormer).map((s) => s.id)).toEqual(['former-members']);
    const withLinks = emptyView('character', { relations: [{}] as never });
    expect(visibleSections(withLinks).map((s) => s.id)).toEqual(['relations']);
  });

  test('slotHasContent answers for every slot without throwing', () => {
    const view = emptyView('character');
    for (const slot of ALL_SLOTS) expect(slotHasContent(slot, view), slot).toBe(false);
    expect(slotHasContent('gallery', emptyView('character', { gallery: [{}] as never })))
      .toBe(true);
  });
});

function slotsOf(band: LayoutBand): readonly SlotKey[] {
  return band.kind === 'split' ? [...band.main, ...band.aside] : band.slots;
}
