/**
 * Entity SUB-PAGES (ADR-110) — the answer to the maintainer's « tabs
 * pour pas avoir des pages trop longues […] Les tabs doivent maybe
 * être sous forme de sous-pages ? »
 *
 * They are sub-pages, at real URLs
 * (`/crew/straw-hat-pirates/appearances`), not client-side tabs. The
 * decisive argument is in VISION.md § 3: « Visiteur Google » is a
 * named audience, and a tab is not a destination — it cannot be
 * indexed, linked, shared or opened in a new tab. See ADR-110 for the
 * full reasoning and the options weighed.
 *
 * ## How it composes with the layout registry (ADR-106)
 *
 * It does not fork it. A section is a SUBSET OF SLOT NAMES; the type's
 * authored bands are computed exactly as before (`bandsFor`) and then
 * filtered down to the slots the current page owns
 * ({@link restrictBands}). A crew's roster therefore still leads at
 * full width on its overview, and the aside is still an aside — the
 * layout is authored once and sliced, never written twice.
 *
 * ## The two invariants
 *
 * 1. **No data can be dropped.** Every slot belongs to exactly one
 *    page: the sections take theirs, the overview takes ALL THE REST
 *    ({@link overviewSlots} is a set difference, never a list). A type
 *    whose sections are removed collapses back to a single page with
 *    everything on it.
 * 2. **No empty sub-page is ever offered.** {@link visibleSections}
 *    consults the view model, so a section whose modules have nothing
 *    to render is not linked (and a type with nothing to split shows
 *    no navigation at all — a lone tab is not navigation). The URL
 *    still resolves; it renders the "nothing here" state rather than
 *    a 404, because a section is part of the page, not a claim about
 *    what exists.
 *
 * Unauthored types keep the ADR-106 generic behaviour untouched: no
 * sections, one page, every module on it.
 */
import type { EntityView } from '../api';
import type { ChromeKey } from './chrome';
import { ALL_SLOTS, type LayoutBand, type SlotKey } from './entity-layout';

/** One sub-page of an entity. `id` is the URL segment (kebab, English). */
export type EntitySection = {
  readonly id: string;
  readonly labelKey: ChromeKey;
  readonly slots: readonly SlotKey[];
};

/**
 * Authored sub-pages, keyed by well-known entity type id (ADR-091
 * presentation binding). Order is the order of the navigation.
 *
 * What earns a sub-page: a module that GROWS WITHOUT BOUND with the
 * corpus (a roster's alumni, an appearance ledger over a thousand
 * chapters, a gallery of stills) or that answers a different question
 * from the one the page opened on. What stays on the overview: the
 * identity of the thing — its data sheet, its prose, and the one
 * module the type is really about (a crew IS its roster).
 */
const SECTIONS: Readonly<Record<string, readonly EntitySection[]>> = {
  crew: [
    { id: 'former-members', labelKey: 'formerMembers', slots: ['former'] },
    { id: 'gallery', labelKey: 'gallery', slots: ['gallery'] },
    { id: 'appearances', labelKey: 'appearances', slots: ['appearances', 'connections'] },
  ],
  organization: [
    { id: 'former-members', labelKey: 'formerMembers', slots: ['former'] },
    { id: 'gallery', labelKey: 'gallery', slots: ['gallery'] },
    { id: 'appearances', labelKey: 'appearances', slots: ['appearances', 'connections'] },
  ],
  character: [
    { id: 'relations', labelKey: 'connections', slots: ['connections'] },
    { id: 'gallery', labelKey: 'gallery', slots: ['gallery'] },
    { id: 'appearances', labelKey: 'appearances', slots: ['appearances'] },
  ],
};

export function sectionsFor(type: string): readonly EntitySection[] {
  return SECTIONS[type] ?? [];
}

export function sectionById(type: string, id: string): EntitySection | null {
  return sectionsFor(type).find((section) => section.id === id) ?? null;
}

/**
 * The slots the OVERVIEW page owns: everything no section claimed.
 * A set difference, which is what makes invariant 1 structural — a
 * slot added to `ALL_SLOTS` tomorrow lands on the overview by default
 * rather than falling off the site.
 */
export function overviewSlots(type: string): readonly SlotKey[] {
  const taken = new Set<SlotKey>(sectionsFor(type).flatMap((section) => section.slots));
  return ALL_SLOTS.filter((slot) => !taken.has(slot));
}

/** The slots one page of an entity owns (`null` section = the overview). */
export function slotsForSection(type: string, section: EntitySection | null): readonly SlotKey[] {
  return section === null ? overviewSlots(type) : section.slots;
}

/**
 * Keep only the named slots inside a set of authored bands, dropping
 * bands (and split sides) that end up empty. The layout's shape
 * survives: what led still leads, what was an aside is still an aside.
 */
export function restrictBands(
  bands: readonly LayoutBand[],
  allowed: readonly SlotKey[],
): readonly LayoutBand[] {
  const keep = new Set<SlotKey>(allowed);
  const filter = (slots: readonly SlotKey[]): SlotKey[] => slots.filter((slot) => keep.has(slot));
  const out: LayoutBand[] = [];
  for (const band of bands) {
    if (band.kind === 'split') {
      const main = filter(band.main);
      const aside = filter(band.aside);
      if (main.length > 0 || aside.length > 0) {
        out.push({ kind: 'split', side: band.side, main, aside });
      }
      continue;
    }
    const slots = filter(band.slots);
    if (slots.length > 0) out.push({ kind: band.kind, slots });
  }
  return out;
}

/**
 * Does a module have anything to render for this entity? The single
 * source of that judgement: the page uses it to skip a module, and the
 * navigation uses it to not offer an empty sub-page. Keeping the two
 * in one function is what stops a link from promising a blank page.
 */
export function slotHasContent(slot: SlotKey, view: EntityView): boolean {
  switch (slot) {
    case 'sheet':
      return view.properties.length > 0 || view.infoboxRelations.length > 0;
    case 'narrative':
      return view.narrative !== null;
    case 'affiliations':
      return view.template.kind === 'character' && view.template.crews.length > 0;
    case 'members':
      return (view.template.kind === 'crew' && view.template.members.length > 0)
        || (view.template.kind === 'devil-fruit' && view.template.users.length > 0);
    case 'former':
      return (view.template.kind === 'crew' && view.template.former.length > 0)
        || (view.template.kind === 'devil-fruit' && view.template.former.length > 0);
    case 'contents':
      return view.template.kind === 'container' && view.template.groups.length > 0;
    case 'position':
      return view.template.kind === 'source' && view.template.arc !== null;
    case 'cast':
      return view.cast.length > 0;
    case 'availability':
      return view.availability.length > 0;
    case 'gallery':
      return view.gallery.length > 0;
    case 'appearances':
      return view.appearances.length > 0;
    case 'connections':
      return view.relations.length > 0;
  }
}

/**
 * How many things a slot holds — the number `design/v2` prints beside
 * a tab (`Apparitions 342`, `Techniques 61`, `Galerie 18`).
 *
 * A slot whose content is not a countable list returns null and the
 * tab renders bare, which is what the plates do for `Vue d'ensemble`,
 * `Chronologie` and `Sources`. Counting is deliberately the SAME
 * predicate as `slotHasContent`, one case per slot, so a slot cannot
 * be shown by one and ignored by the other.
 */
export function slotCount(slot: SlotKey, view: EntityView): number | null {
  switch (slot) {
    case 'gallery':
      return view.gallery.length;
    case 'appearances':
      return view.appearances.reduce((total, group) => total + group.items.length, 0);
    case 'connections':
      return view.relations.reduce((total, group) => total + group.items.length, 0);
    case 'cast':
      return view.cast.reduce((total, group) => total + group.items.length, 0);
    case 'members':
      if (view.template.kind === 'crew') return view.template.members.length;
      if (view.template.kind === 'devil-fruit') return view.template.users.length;
      return null;
    case 'former':
      if (view.template.kind === 'crew') return view.template.former.length;
      if (view.template.kind === 'devil-fruit') return view.template.former.length;
      return null;
    case 'contents':
      if (view.template.kind !== 'container') return null;
      return view.template.groups.reduce((total, group) => total + group.items.length, 0);
    case 'availability':
      return view.availability.length;
    case 'sheet':
    case 'narrative':
    case 'affiliations':
    case 'position':
      return null;
  }
}

/** The count beside a section's tab: its slots' counts, summed. */
export function sectionCount(section: EntitySection, view: EntityView): number | null {
  let total: number | null = null;
  for (const slot of section.slots) {
    const count = slotCount(slot, view);
    if (count !== null) total = (total ?? 0) + count;
  }
  return total;
}

/**
 * The sub-pages worth linking for THIS entity: those with something to
 * show. Empty when the type authors none, or when everything it could
 * split is empty — and the page then renders no navigation at all.
 */
export function visibleSections(view: EntityView): readonly EntitySection[] {
  return sectionsFor(view.type).filter((section) =>
    section.slots.some((slot) => slotHasContent(slot, view))
  );
}
