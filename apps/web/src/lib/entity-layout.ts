/**
 * Per-entity-type page layouts (ADR-105).
 *
 * An entity page is a set of MODULES ("slots"): the data sheet, the
 * narrative, the member grids, the contents ledger, the cast, the
 * gallery, the appearances, the leftover connection groups… This
 * module decides, per entity type, WHICH module leads, which sits in
 * the aside, and how the rest packs — so a crew page opens on its
 * roster, an arc page on its chapter ledger and a chapter page on its
 * position in the arc, instead of every type rendering the same
 * stack with different words.
 *
 * **Degradation is mandatory (ADR-091).** A type with no authored
 * layout gets `GENERIC_LAYOUT`, and — for authored ones too —
 * `bandsFor()` appends a trailing band holding every slot the layout
 * did not mention. A layout can therefore reorder and re-weight the
 * page, but it can NEVER drop data: whatever the type, every module
 * that has content is rendered somewhere. A unit test asserts that
 * invariant for every registered type and for an unknown one.
 *
 * Pure data + pure functions: no JSX, no view-model knowledge beyond
 * the slot names.
 */

/** Every module an entity page can render. Order = generic fallback order. */
export const ALL_SLOTS = [
  'narrative',
  'position',
  'contents',
  'members',
  'former',
  'affiliations',
  'cast',
  'gallery',
  'connections',
  'appearances',
  'sheet',
  'availability',
] as const;

export type SlotKey = typeof ALL_SLOTS[number];

/**
 * A horizontal band of the page.
 * - `full`: slots stacked at the full reading width (a lead module).
 * - `split`: a wide main column plus a narrow aside; `side` names the
 *   edge the aside sits on, which is what makes an index-like type
 *   (arc, volume) read differently from a profile-like one.
 * - `pack`: slots flowed into a balanced multi-column masonry — the
 *   answer to a row of one-item sections leaving half the screen empty.
 */
export type LayoutBand =
  | { readonly kind: 'full'; readonly slots: readonly SlotKey[]; }
  | {
    readonly kind: 'split';
    readonly side: 'start' | 'end';
    readonly main: readonly SlotKey[];
    readonly aside: readonly SlotKey[];
  }
  | { readonly kind: 'pack'; readonly slots: readonly SlotKey[]; }
  | { readonly kind: 'grid'; readonly cells: readonly GridCell[]; };

/**
 * One panel of a `grid` band: a slot and how many of the twelve
 * columns it takes.
 *
 * `design/v2` composes every page this way — `IDENTITÉ` over three
 * columns beside `PRIME — CHRONOLOGIE` over five and `APPARITIONS PAR
 * ARC` over four — and that density is what the band model could not
 * express: `split` only ever yields two columns, so a page of eight
 * small panels came out as two tall ones.
 *
 * A cell whose slot has nothing to show is dropped and the rest
 * reflow, so a sparse entity gets fewer, wider panels rather than
 * holes.
 */
export type GridCell = {
  readonly slot: SlotKey;
  /** Columns out of twelve, 1–12. */
  readonly span: number;
};

export type EntityLayout = {
  /** Shape of the figure in the hero: a poster tile or a wide plate. */
  readonly figure: 'poster' | 'plate';
  readonly bands: readonly LayoutBand[];
};

/**
 * The fallback: a profile shape that names EVERY slot, so an unknown
 * entity type renders all of its properties, relations and modules
 * with no authored knowledge whatsoever.
 */
export const GENERIC_LAYOUT: EntityLayout = {
  figure: 'poster',
  bands: [
    {
      kind: 'split',
      side: 'end',
      main: [
        'narrative',
        'position',
        'contents',
        'members',
        'former',
        'affiliations',
        'cast',
        'gallery',
        'connections',
      ],
      aside: ['sheet', 'availability', 'appearances'],
    },
  ],
};

/**
 * Authored layouts. Keys are well-known entity type ids (ADR-091
 * presentation binding); anything absent falls back to the generic
 * layout above.
 */
const LAYOUTS: Readonly<Record<string, EntityLayout>> = {
  // A profile: prose and affiliations lead, the full data sheet (with
  // each property's own history) fills the aside.
  character: {
    figure: 'poster',
    // `design/v2` Main.dc.html: `IDENTITÉ` over three columns, the
    // prose over five, the appearance ledger over four; then the crew
    // and the relations sharing a row; then the gallery.
    bands: [
      {
        kind: 'grid',
        cells: [
          { slot: 'sheet', span: 3 },
          { slot: 'narrative', span: 5 },
          { slot: 'appearances', span: 4 },
          { slot: 'affiliations', span: 6 },
          { slot: 'connections', span: 6 },
          { slot: 'gallery', span: 12 },
        ],
      },
    ],
  },
  // A roster: the crew IS its members, so they lead at full width.
  crew: {
    figure: 'poster',
    // The roster still LEADS at full width — a crew is its members —
    // and everything under it is the plate's grid.
    bands: [
      { kind: 'full', slots: ['members'] },
      {
        kind: 'grid',
        cells: [
          { slot: 'sheet', span: 3 },
          { slot: 'narrative', span: 5 },
          { slot: 'appearances', span: 4 },
          { slot: 'former', span: 6 },
          { slot: 'connections', span: 6 },
          { slot: 'gallery', span: 12 },
        ],
      },
    ],
  },
  organization: {
    figure: 'poster',
    bands: [
      { kind: 'full', slots: ['members'] },
      {
        kind: 'grid',
        cells: [
          { slot: 'sheet', span: 3 },
          { slot: 'narrative', span: 5 },
          { slot: 'appearances', span: 4 },
          { slot: 'former', span: 6 },
          { slot: 'connections', span: 6 },
          { slot: 'gallery', span: 12 },
        ],
      },
    ],
  },
  // The classification sheet IS the fruit — its history (Paramecia
  // believed, Mythical Zoan revealed) is the page. Its users are few
  // by nature, so they become a portrait rail rather than a wide grid
  // holding three cards and a lot of nothing.
  'devil-fruit': {
    figure: 'poster',
    // Fruit.dc.html: `FICHE` (3) beside the name's chronology (5) and
    // the successive bearers (4); the description and what points
    // here share the row below.
    bands: [
      {
        kind: 'grid',
        cells: [
          { slot: 'sheet', span: 3 },
          { slot: 'narrative', span: 5 },
          { slot: 'members', span: 4 },
          { slot: 'former', span: 4 },
          { slot: 'connections', span: 4 },
          { slot: 'appearances', span: 4 },
          { slot: 'gallery', span: 12 },
        ],
      },
    ],
  },
  // An index: the ledger of everything it contains is the page, and
  // the aside on the left reads like a printed index rail.
  arc: {
    figure: 'plate',
    bands: [
      {
        kind: 'split',
        side: 'start',
        main: ['narrative', 'contents', 'cast', 'connections'],
        aside: ['sheet', 'appearances', 'gallery'],
      },
    ],
  },
  saga: {
    figure: 'plate',
    bands: [
      {
        kind: 'split',
        side: 'start',
        main: ['narrative', 'contents', 'cast', 'connections'],
        aside: ['sheet', 'appearances', 'gallery'],
      },
    ],
  },
  volume: {
    figure: 'poster',
    bands: [
      {
        kind: 'split',
        side: 'start',
        main: ['contents', 'cast', 'connections'],
        aside: ['sheet', 'availability', 'gallery'],
      },
    ],
  },
  // A numbered instalment: its position in the arc is the first thing
  // on the page, stills next, then who appears in it.
  'manga-chapter': {
    figure: 'poster',
    bands: [
      { kind: 'full', slots: ['position'] },
      {
        kind: 'split',
        side: 'end',
        main: ['narrative', 'gallery', 'cast', 'connections'],
        aside: ['sheet', 'availability', 'appearances'],
      },
    ],
  },
  'anime-episode': {
    figure: 'plate',
    bands: [
      { kind: 'full', slots: ['position'] },
      {
        kind: 'split',
        side: 'end',
        main: ['gallery', 'narrative', 'cast', 'connections'],
        aside: ['sheet', 'availability', 'appearances'],
      },
    ],
  },
  'live-action-episode': {
    figure: 'plate',
    bands: [
      { kind: 'full', slots: ['position'] },
      {
        kind: 'split',
        side: 'end',
        main: ['gallery', 'narrative', 'cast', 'connections'],
        aside: ['sheet', 'availability', 'appearances'],
      },
    ],
  },
  film: {
    figure: 'poster',
    bands: [
      {
        kind: 'split',
        side: 'end',
        main: ['narrative', 'gallery', 'cast', 'connections'],
        aside: ['sheet', 'availability', 'appearances'],
      },
    ],
  },
  'live-action-series': {
    figure: 'plate',
    bands: [
      {
        kind: 'split',
        side: 'end',
        main: ['contents', 'cast', 'connections'],
        aside: ['sheet', 'availability', 'gallery'],
      },
    ],
  },
  // A moment, not a thing: prose leads, participants follow.
  event: {
    figure: 'plate',
    bands: [
      {
        kind: 'split',
        side: 'end',
        main: ['narrative', 'connections', 'appearances'],
        aside: ['sheet', 'gallery'],
      },
    ],
  },
  // An artefact: show the artefact, then what it says about whom.
  document: {
    figure: 'poster',
    bands: [
      {
        kind: 'split',
        side: 'start',
        main: ['gallery', 'narrative', 'connections'],
        aside: ['sheet', 'appearances'],
      },
    ],
  },
  reference: {
    figure: 'poster',
    bands: [
      {
        kind: 'split',
        side: 'start',
        main: ['narrative', 'connections'],
        aside: ['sheet', 'appearances'],
      },
    ],
  },
  image: {
    figure: 'plate',
    bands: [
      {
        kind: 'split',
        side: 'end',
        main: ['gallery', 'narrative', 'connections'],
        aside: ['sheet', 'appearances'],
      },
    ],
  },
};

export function layoutFor(type: string): EntityLayout {
  return LAYOUTS[type] ?? GENERIC_LAYOUT;
}

/** Every slot a band names, whatever shape the band is. */
export function slotsOfBand(band: LayoutBand): readonly SlotKey[] {
  if (band.kind === 'split') return [...band.main, ...band.aside];
  if (band.kind === 'grid') return band.cells.map((cell) => cell.slot);
  return band.slots;
}

/** Slots an authored layout forgot — never dropped, always appended. */
export function missingSlots(layout: EntityLayout): readonly SlotKey[] {
  const used = new Set<SlotKey>(layout.bands.flatMap(slotsOfBand));
  return ALL_SLOTS.filter((slot) => !used.has(slot));
}

/**
 * The bands to render for a type: the authored ones, plus a trailing
 * masonry band holding every slot the layout did not mention. This is
 * the ADR-091 guarantee in code — no authored layout can hide data.
 */
export function bandsFor(type: string): readonly LayoutBand[] {
  const layout = layoutFor(type);
  const missing = missingSlots(layout);
  return missing.length === 0
    ? layout.bands
    : [...layout.bands, { kind: 'pack', slots: missing }];
}
