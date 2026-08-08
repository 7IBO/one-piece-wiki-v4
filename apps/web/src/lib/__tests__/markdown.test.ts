import { describe, expect, test } from 'bun:test';
import { parseBlocks } from '../markdown';

describe('parseBlocks', () => {
  test('splits headings, paragraphs and lists', () => {
    const blocks = parseBlocks(
      '# Title\n\nFirst paragraph\nstill first.\n\n- one\n- two\n\n1. a\n2. b\n',
    );
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'paragraph', text: 'First paragraph still first.' },
      { kind: 'list', ordered: false, items: ['one', 'two'] },
      { kind: 'list', ordered: true, items: ['a', 'b'] },
    ]);
  });

  test('handles blockquotes and fenced code', () => {
    const blocks = parseBlocks('> quoted\n> lines\n\n```\ncode here\n```\n');
    expect(blocks).toEqual([
      { kind: 'quote', text: 'quoted lines' },
      { kind: 'code', text: 'code here' },
    ]);
  });

  test('unterminated fence does not loop', () => {
    const blocks = parseBlocks('```\ndangling');
    expect(blocks).toEqual([{ kind: 'code', text: 'dangling' }]);
  });

  test('empty input yields no blocks', () => {
    expect(parseBlocks('')).toEqual([]);
    expect(parseBlocks('\n\n')).toEqual([]);
  });
});
