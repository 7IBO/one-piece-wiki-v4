/**
 * The folding + trigram contract shared by the index builder and the
 * query side (ADR-108). If these two ever disagree the index silently
 * stops matching, which is exactly the kind of failure a test has to
 * catch rather than a reviewer.
 */
import { describe, expect, it } from 'bun:test';
import {
  diceCoefficient,
  normalizeSearchText,
  searchTerms,
  wordTrigrams,
} from '../src/search-text.ts';

/** Dice between two raw words, the way the SQL computes it per word. */
function similarity(a: string, b: string): number {
  const gramsA = wordTrigrams(normalizeSearchText(a));
  const gramsB = new Set(wordTrigrams(normalizeSearchText(b)));
  const shared = gramsA.filter((gram) => gramsB.has(gram)).length;
  return diceCoefficient(gramsA.length, gramsB.size, shared);
}

describe('normalizeSearchText', () => {
  it('folds case and diacritics — the French requirement', () => {
    expect(normalizeSearchText('Équipage du Chapeau de Paille')).toBe(
      'equipage du chapeau de paille',
    );
    expect(normalizeSearchText('Révélation')).toBe('revelation');
    expect(normalizeSearchText('modèle')).toBe('modele');
  });

  it('reduces punctuation, apostrophes and dashes to word boundaries', () => {
    expect(normalizeSearchText('Monkey D. Luffy')).toBe('monkey d luffy');
    expect(normalizeSearchText('gomu-gomu-no-mi')).toBe('gomu gomu no mi');
    expect(normalizeSearchText("Luffy's poster (₿30,000,000)")).toBe(
      'luffy s poster 30 000 000',
    );
  });

  it('is empty for a query that carries no searchable characters', () => {
    expect(normalizeSearchText('   ')).toBe('');
    expect(normalizeSearchText('—  …')).toBe('');
    expect(searchTerms('  ')).toEqual([]);
  });
});

describe('wordTrigrams', () => {
  it('pads word boundaries so a leading or trailing typo stays cheap', () => {
    expect(wordTrigrams('zoro')).toHaveLength(4); // 4 letters + 2 pads - 2
    expect(wordTrigrams('')).toEqual([]);
  });

  it('is sorted and de-duplicated, so a build is byte-deterministic', () => {
    const grams = wordTrigrams('banana');
    expect([...grams].sort()).toEqual([...grams]);
    expect(new Set(grams).size).toBe(grams.length);
  });
});

describe('similarity — the typo tolerance the fuzzy pass relies on', () => {
  it('scores real misspellings above the 0.5 threshold the query uses', () => {
    expect(similarity('zorro', 'zoro')).toBeGreaterThan(0.5);
    expect(similarity('luffi', 'luffy')).toBeGreaterThan(0.5);
    expect(similarity('nammi', 'nami')).toBeGreaterThan(0.5);
    expect(similarity('sandji', 'sanji')).toBeGreaterThan(0.5);
    expect(similarity('marinford', 'marineford')).toBeGreaterThan(0.5);
    expect(similarity('chapau', 'chapeau')).toBeGreaterThan(0.5);
  });

  it('scores unrelated words below it', () => {
    expect(similarity('zoro', 'nami')).toBeLessThan(0.5);
    expect(similarity('luffy', 'shanks')).toBeLessThan(0.5);
    expect(similarity('straw', 'strange')).toBeLessThan(0.55);
  });

  it('is 1 for an identical word and 0 for no overlap', () => {
    expect(similarity('luffy', 'LUFFY')).toBe(1);
    expect(similarity('luffy', 'ace')).toBe(0);
    expect(diceCoefficient(0, 0, 0)).toBe(0);
  });
});
