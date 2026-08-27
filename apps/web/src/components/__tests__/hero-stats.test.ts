/**
 * Which cells the hero's stat strip shows.
 *
 * The rule that needed a test: the generic fallback once promoted
 * `name`, so the strip under `Monkey D. Luffy` read
 * `NAME / Monkey D. Luffy`. A strip that repeats the title is worse
 * than a shorter strip.
 */
import { describe, expect, it } from 'bun:test';
import type { InfoboxRowView } from '../../api';
import { heroStatRows } from '../HeroStats';

const row = (id: string): InfoboxRowView => ({
  id,
  label: id.toUpperCase(),
  entry: {
    display: id,
    valueChip: null,
    since: null,
    until: null,
    epistemic: null,
    actualDisplay: null,
    event: null,
    qualifiers: [],
    autoImported: false,
  },
});

describe('heroStatRows', () => {
  it('takes the type preference first, in the plate order', () => {
    const rows = heroStatRows('character', [row('epithet'), row('status'), row('bounty')]);
    expect(rows.map((r) => r.id)).toEqual(['bounty', 'status', 'epithet']);
  });

  it('never fills with the name — the title already says it', () => {
    const rows = heroStatRows('character', [row('name'), row('bounty'), row('epithet')]);
    expect(rows.map((r) => r.id)).not.toContain('name');
    expect(rows.map((r) => r.id)).toEqual(['bounty', 'epithet']);
  });

  it('shows fewer cells rather than padding them', () => {
    expect(heroStatRows('character', [row('bounty')]).map((r) => r.id)).toEqual(['bounty']);
    expect(heroStatRows('character', [])).toEqual([]);
  });

  it('caps at three, whatever the infobox holds', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map(row);
    expect(heroStatRows('unknown-type', many)).toHaveLength(3);
  });

  it('falls back to the infobox order for a type with no preference', () => {
    const rows = heroStatRows('sbs-qa', [row('question'), row('volume')]);
    expect(rows.map((r) => r.id)).toEqual(['question', 'volume']);
  });
});
