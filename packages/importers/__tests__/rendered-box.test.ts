/**
 * The rendered-infobox parser (ADR-119), against REAL captured pages.
 *
 * The fixtures are slices of responses captured by
 * `fandom-render.yml` — cut out of the real HTML, never authored.
 * That is the entire point: the arc mapper's previous fixture was
 * synthetic, and a synthetic fixture only proves a parser agrees with
 * whatever was invented for it. It is how an arc import returned zero
 * relations while looking perfectly correct.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { parseOrdinalRange, parseRenderedInfobox } from '../src/fandom/rendered-box.ts';

const fixture = (name: string): Promise<string> =>
  Bun.file(join(import.meta.dir, 'fixtures', 'rendered', `${name}.infobox.html`)).text();

describe('parseRenderedInfobox — the real Arc Box, expanded', () => {
  it('reads the ranges the wikitext does not contain', async () => {
    // This is the whole reason ADR-119 exists. In the wikitext these
    // three fields read `auto`; the numbers only exist once the Lua
    // module has run.
    const box = parseRenderedInfobox(await fixture('Arabasta_Arc'));
    expect(box.get('chapter')).toContain('155-217');
    expect(box.get('episode')).toContain('92-130');
    expect(box.get('vol')).toContain('17-24');
  });

  it('keys fields by the WIKITEXT param name, not the visible label', async () => {
    // `data-source` is the param name, so a mapper written against the
    // wikitext reads the same field here. The visible label ("Manga
    // Chapters:") is translatable presentation.
    const box = parseRenderedInfobox(await fixture('Arabasta_Arc'));
    expect([...box.keys()]).toEqual(expect.arrayContaining(['chapter', 'episode', 'vol']));
    expect([...box.keys()]).not.toContain('Manga Chapters');
  });

  it('reads the adjacent-arc links the plate navigates by', async () => {
    const box = parseRenderedInfobox(await fixture('Arabasta_Arc'));
    expect(box.has('prev')).toBe(true);
    expect(box.has('next')).toBe(true);
  });

  it('works on the first arc and on the longest one', async () => {
    // Romance Dawn is the corpus edge; Wano is the biggest page
    // captured (1.09 MB rendered).
    for (const name of ['Romance_Dawn_Arc', 'Wano_Country_Arc']) {
      const box = parseRenderedInfobox(await fixture(name));
      expect(parseOrdinalRange(box.get('chapter') ?? '')).not.toBeNull();
    }
  });

  it('answers empty for html carrying no portable infobox', () => {
    expect(parseRenderedInfobox('<p>nothing here</p>').size).toBe(0);
  });
});

describe('parseOrdinalRange', () => {
  it('reads the real shapes, skipping the label rather than matching it', () => {
    expect(parseOrdinalRange('Manga Chapters: 155-217, 63 chapters'))
      .toEqual({ from: 155, to: 217 });
    expect(parseOrdinalRange('Volumes 17-24, 8 volumes')).toEqual({ from: 17, to: 24 });
    expect(parseOrdinalRange('Anime Episodes: 92-130, 39 episodes'))
      .toEqual({ from: 92, to: 130 });
  });

  it('treats a single work as a range of one', () => {
    expect(parseOrdinalRange('Chapter 1, 1 chapter')).toEqual({ from: 1, to: 1 });
  });

  it('returns null rather than fabricating a span', () => {
    // What an arc with no chapters actually renders.
    expect(parseOrdinalRange('-, chapters')).toBeNull();
    expect(parseOrdinalRange('')).toBeNull();
    // A descending range is a parse gone wrong, not a fact.
    expect(parseOrdinalRange('217-155, 63 chapters')).toBeNull();
  });

  describe('the ONGOING arc renders an open range', () => {
    it('reads `1126-` as a start with no end', async () => {
      // Elbaph, the arc being serialised right now. Read off the real
      // capture, not invented: `1126-` with nothing after the dash.
      const box = parseRenderedInfobox(await fixture('Elbaph_Arc'));
      expect(box.get('chapter')).toBe('1126-');
      expect(parseOrdinalRange('1126-')).toEqual({ from: 1126, to: null });
      expect(parseOrdinalRange('1126-, chapters')).toEqual({ from: 1126, to: null });
    });

    it('still refuses a dash with no number before it', () => {
      // The distinction that matters: `-, chapters` names nothing,
      // `1126-` names a start. The first version conflated them and
      // the current arc got zero edges because of it.
      expect(parseOrdinalRange('-, chapters')).toBeNull();
      expect(parseOrdinalRange('-')).toBeNull();
    });

    it('never mistakes half of a closed range for an open one', async () => {
      const box = parseRenderedInfobox(await fixture('Egghead_Arc'));
      expect(parseOrdinalRange(box.get('chapter') ?? '')).toEqual({ from: 1058, to: 1125 });
      expect(parseOrdinalRange('1058-1125, 68 chapters')).toEqual({ from: 1058, to: 1125 });
    });
  });
});
