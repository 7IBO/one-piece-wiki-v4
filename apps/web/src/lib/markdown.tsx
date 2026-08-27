/**
 * Minimal markdown → React renderer for narrative prose (headings,
 * paragraphs, lists, blockquotes, fenced code, bold/italic/inline
 * code/links). Narratives are curated content from
 * `/data/universes/<u>/narratives/**` via the artifact's `narratives`
 * table — no raw HTML is ever interpreted, and no external renderer
 * dependency is pulled in for v1's needs.
 */
import { Fragment, type JSX, type ReactNode } from 'react';

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE_PATTERN);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className='rounded-sm bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]'>
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link !== null) {
      return (
        <a
          key={i}
          href={link[2]}
          rel='noreferrer'
          className='text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent'
        >
          {link[1]}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export type Block =
  | { kind: 'heading'; level: number; text: string; }
  | { kind: 'paragraph'; text: string; }
  | { kind: 'quote'; text: string; }
  | { kind: 'code'; text: string; }
  | { kind: 'list'; ordered: boolean; items: string[]; };

/** Exported for unit tests. */
export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const buffer: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        buffer.push(lines[i] ?? '');
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ kind: 'code', text: buffer.join('\n') });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      blocks.push({ kind: 'heading', level: heading[1]?.length ?? 1, text: heading[2] ?? '' });
      i += 1;
      continue;
    }
    if (line.startsWith('> ')) {
      const buffer: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('> ')) {
        buffer.push((lines[i] ?? '').slice(2));
        i += 1;
      }
      blocks.push({ kind: 'quote', text: buffer.join(' ') });
      continue;
    }
    const listMatch = /^(\s*)([-*]|\d+\.)\s+/.exec(line);
    if (listMatch !== null) {
      const ordered = /\d+\./.test(listMatch[2] ?? '');
      const items: string[] = [];
      while (i < lines.length) {
        const itemMatch = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(lines[i] ?? '');
        if (itemMatch === null) break;
        items.push(itemMatch[1] ?? '');
        i += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const buffer: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      if (
        current.trim() === '' || current.startsWith('#') || current.startsWith('> ')
        || current.startsWith('```') || /^\s*(?:[-*]|\d+\.)\s+/.test(current)
      ) break;
      buffer.push(current.trim());
      i += 1;
    }
    blocks.push({ kind: 'paragraph', text: buffer.join(' ') });
  }
  return blocks;
}

export function Markdown({ markdown }: { readonly markdown: string; }): JSX.Element {
  const blocks = parseBlocks(markdown);
  return (
    <div className='max-w-[68ch] space-y-4 text-[14.5px] leading-[1.7] text-fg/90'>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            const sizes = [
              'text-xl',
              'text-lg',
              'text-base',
              'text-base',
              'text-base',
              'text-base',
            ];
            return (
              <h3
                key={i}
                className={`display mt-7 font-bold text-fg ${
                  sizes[block.level - 1] ?? 'text-base'
                }`}
              >
                {renderInline(block.text)}
              </h3>
            );
          }
          case 'quote':
            return (
              <blockquote key={i} className='border-l-2 border-line-strong pl-4 text-muted italic'>
                {renderInline(block.text)}
              </blockquote>
            );
          case 'code':
            return (
              <pre
                key={i}
                className='overflow-x-auto rounded-md bg-surface-2 p-4 font-mono text-sm'
              >
                {block.text}
              </pre>
            );
          case 'list':
            return block.ordered
              ? (
                <ol key={i} className='list-decimal space-y-1 pl-6 marker:text-faint'>
                  {block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
                </ol>
              )
              : (
                <ul key={i} className='list-disc space-y-1 pl-6 marker:text-faint'>
                  {block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
                </ul>
              );
          case 'paragraph':
            return <p key={i}>{renderInline(block.text)}</p>;
        }
      })}
    </div>
  );
}
