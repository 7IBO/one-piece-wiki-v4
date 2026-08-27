/**
 * Infobox field value profiling: the shape inference that turns a
 * field inventory into something a schema can be designed from.
 */
import { describe, expect, it } from 'bun:test';
import { describeShape, profileField } from '../src/fandom/field-shape.ts';

describe('profileField — shape inference', () => {
  it('reads all-numeric fields as numbers', () => {
    const shape = profileField(['1', '2', '1,044', '12'], 4);
    expect(shape.kind).toBe('number');
    expect(shape.distinct).toBe(4);
  });

  it('reads all-parseable dates as dates', () => {
    const shape = profileField(['January 4, 2022', 'March 12, 2019'], 2);
    expect(shape.kind).toBe('date');
  });

  it('reads a bare wikilink as a relation candidate, not a string', () => {
    const shape = profileField(['[[Monkey D. Luffy]]', '[[Roronoa Zoro|Zoro]]'], 2);
    expect(shape.kind).toBe('wikilink');
  });

  it('separates a list of links from a single one', () => {
    expect(profileField(['[[A]] [[B]]', '[[C]]'], 2).kind).toBe('wikilink_list');
  });

  it('does not call a linked sentence a relation', () => {
    // A link with prose around it is text that happens to link.
    const shape = profileField(
      ['He sails with [[Nami]] aboard.', 'Trained by [[Silvers Rayleigh]] for two years.'],
      2,
    );
    expect(shape.kind).toBe('text');
  });

  it('flags template-bearing values as needing their own parser', () => {
    expect(profileField(['{{Qref|chap=1|ep=1}}', 'plain'], 2).kind).toBe('template');
  });

  it('spots an enum candidate: many pages, few distinct values', () => {
    const shape = profileField(['Male', 'Female', 'Male', 'Male', 'Female', 'Male'], 6);
    expect(shape.kind).toBe('enum_like');
    expect(shape.distinct).toBe(2);
  });

  it('does not call a tiny sample an enum just because nothing repeated', () => {
    expect(profileField(['Alpha', 'Beta'], 2).kind).toBe('text');
  });

  it('separates prose from short text by length', () => {
    expect(profileField(['x'.repeat(250), 'y'.repeat(240), 'z'.repeat(230)], 3).kind).toBe('prose');
  });
});

describe('profileField — metrics', () => {
  it('computes the fill rate against pages sampled, not values seen', () => {
    // Field present on 2 of 10 pages, one of them blank.
    const shape = profileField(['Yes', ''], 10);
    expect(shape.fillRate).toBeCloseTo(0.1);
    expect(shape.distinct).toBe(1);
  });

  it('detects multi-value fields from their separators', () => {
    expect(profileField(['A<br>B', 'C<br />D'], 2).multiValue).toBe(true);
    expect(profileField(['A', 'B'], 2).multiValue).toBe(false);
  });

  it('carries distinct, truncated examples and the longest length', () => {
    const long = 'x'.repeat(200);
    const shape = profileField([long, 'short', 'short'], 3);
    expect(shape.maxLength).toBe(200);
    expect(shape.examples[0]?.endsWith('…')).toBe(true);
    expect(shape.examples[0]?.length).toBe(120);
    // Duplicates collapse.
    expect(shape.examples.filter((e) => e === 'short').length).toBe(1);
  });

  it('survives an entirely empty field without dividing by zero', () => {
    const shape = profileField([], 0);
    expect(shape.fillRate).toBe(0);
    expect(shape.kind).toBe('text');
    expect(shape.examples).toEqual([]);
  });
});

describe('describeShape', () => {
  it('summarises a shape in one line for the Markdown report', () => {
    const values = ['A<br>B', 'A<br>B', 'A<br>B', 'C<br>D'];
    expect(describeShape(profileField(values, 8)))
      .toBe('enum_like (50% filled, 2 distinct, multi)');
  });
});
