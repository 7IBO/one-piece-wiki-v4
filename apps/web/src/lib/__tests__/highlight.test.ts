/**
 * Splitting a label around a free-text query.
 *
 * The query is typed by a reader, so the cases that matter are the
 * hostile ones: regex metacharacters, an empty string, a term that
 * appears twice, and accents.
 */
import { describe, expect, it } from 'bun:test';
import { highlightRuns } from '../highlight';

const shape = (label: string, query: string): string =>
  highlightRuns(label, query).map((r) => (r.match ? `[${r.text}]` : r.text)).join('');

describe('highlightRuns', () => {
  it('marks the term inside the label', () => {
    expect(shape('Gomu Gomu no Mi', 'gomu')).toBe('[Gomu] [Gomu] no Mi');
  });

  it('keeps the label’s own casing, not the query’s', () => {
    expect(highlightRuns('Gomu Gomu no Mi', 'GOMU')[0]).toEqual({ text: 'Gomu', match: true });
  });

  it('never interprets the query as a pattern', () => {
    // `.*` would match everything and `(` would throw, if this went
    // through a RegExp. It does not.
    expect(shape('Gomu Gomu no Mi', '.*')).toBe('Gomu Gomu no Mi');
    expect(() => highlightRuns('Gomu Gomu no Mi', 'gomu (')).not.toThrow();
    expect(shape('Gomu Gomu no Mi', 'gomu (')).toBe('Gomu Gomu no Mi');
  });

  it('folds accents the way the index does', () => {
    expect(shape('Révélation', 'revel')).toBe('[Révél]ation');
  });

  it('returns the whole label as one run when there is nothing to mark', () => {
    expect(highlightRuns('Nika', '')).toEqual([{ text: 'Nika', match: false }]);
    expect(highlightRuns('Nika', '   ')).toEqual([{ text: 'Nika', match: false }]);
    expect(highlightRuns('Nika', 'zoro')).toEqual([{ text: 'Nika', match: false }]);
  });

  it('marks a term at the very start and the very end', () => {
    expect(shape('Nika', 'ni')).toBe('[Ni]ka');
    expect(shape('Nika', 'ka')).toBe('Ni[ka]');
    expect(shape('Nika', 'nika')).toBe('[Nika]');
  });
});
