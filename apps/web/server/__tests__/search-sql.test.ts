/**
 * The two pieces of the search SQL that are easy to break silently and
 * cheap to pin down without an artifact: the FTS5 MATCH expression and
 * the spoiler gate's shape + parameters (ADR-108).
 */
import { describe, expect, test } from 'bun:test';
import { CURSOR_AXES } from '../progress.ts';
import {
  DISPLAY_NAME_SQL,
  ftsMatchExpression,
  GATE_PREDICATE,
  gateParams,
  SEARCH_FUZZY_SQL,
  SEARCH_LEXICAL_SQL,
} from '../search-sql.ts';

describe('ftsMatchExpression', () => {
  test('turns each normalized term into a quoted prefix term, AND-ed', () => {
    expect(ftsMatchExpression('Straw Hat')).toBe('"straw"* AND "hat"*');
    expect(ftsMatchExpression('luffy')).toBe('"luffy"*');
  });

  test('folds accents and punctuation exactly like the index does', () => {
    expect(ftsMatchExpression('Équipage')).toBe('"equipage"*');
    expect(ftsMatchExpression('gomu-gomu')).toBe('"gomu"* AND "gomu"*');
  });

  test('neutralises FTS5 operators — a query is data, never syntax', () => {
    // Quotes, NEAR, column filters and the negation operator all
    // survive normalization only as plain words or not at all.
    expect(ftsMatchExpression('text:"a" OR b')).toBe('"text"* AND "a"* AND "or"* AND "b"*');
    expect(ftsMatchExpression('a NEAR/2 b')).toBe('"a"* AND "near"* AND "2"* AND "b"*');
    expect(ftsMatchExpression('"')).toBeNull();
  });

  test('is null for a query with no searchable characters', () => {
    expect(ftsMatchExpression('')).toBeNull();
    expect(ftsMatchExpression('   ')).toBeNull();
    expect(ftsMatchExpression('— …')).toBeNull();
  });
});

describe('the spoiler gate', () => {
  test('is generated from the cursor axes, one disjunct each', () => {
    const disjuncts = GATE_PREDICATE.split('g.source_type').length - 1;
    expect(disjuncts).toBe(CURSOR_AXES.length);
    expect(GATE_PREDICATE.startsWith('NOT EXISTS')).toBe(true);
    // The doc alias every pass uses.
    expect(GATE_PREDICATE).toContain('g.doc_id = d.doc_id');
    // Strictly greater: the anchor chapter itself is reached.
    expect(GATE_PREDICATE).toContain('g.ordinal > ?');
  });

  test("lie quatre paramètres par axe, dans l'ordre des axes", () => {
    const params = gateParams({ manga: 100, anime: null });
    expect(params).toHaveLength(CURSOR_AXES.length * 4);
    // Le premier dit qu'un filtrage s'applique du tout.
    expect(params.slice(0, 4)).toEqual([1, 'manga-chapter', 100, 100]);
    // L'axe vide est BLOQUANT : `? IS NULL` rend tout « au-delà ».
    expect(params.slice(4)).toEqual([1, 'anime-episode', null, null]);
  });

  test('sans aucune position déclarée, le prédicat est inerte', () => {
    // Le drapeau tombe à 0 sur chaque axe, donc aucun disjunct ne peut
    // être vrai — c'est ce qui empêche l'axe vide de vider le site
    // pour un premier visiteur.
    const params = gateParams({ manga: null, anime: null });
    expect(params.filter((_, i) => i % 4 === 0)).toEqual([0, 0]);
  });

  test('is applied in the WHERE clause of every pass, before any LIMIT', () => {
    for (const sql of [SEARCH_LEXICAL_SQL, SEARCH_FUZZY_SQL, DISPLAY_NAME_SQL]) {
      expect(sql).toContain(GATE_PREDICATE);
      const gateAt = sql.indexOf('NOT EXISTS');
      const limitAt = sql.lastIndexOf('LIMIT');
      expect(gateAt).toBeGreaterThan(-1);
      // A gate after the LIMIT would silently drop results instead of
      // excluding them from the ranking.
      expect(gateAt).toBeLessThan(limitAt);
    }
  });
});
