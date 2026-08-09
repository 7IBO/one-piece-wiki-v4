#!/usr/bin/env bun
/**
 * Contact sheet for the generative entity artwork.
 *
 * Renders `EntityArt` for every entity of the corpus, at all three
 * frames, plus a degradation strip of entity types that have no
 * grammar — so a human can judge the whole system at a glance instead
 * of clicking through the app. Dev-only: it is not part of the app
 * build and ships nothing.
 *
 *   bun run -F @onepiece-wiki/web art:preview [out.html]
 *
 * The palette is read straight out of `src/styles.css`, so the sheet
 * always shows the CURRENT skin — there is no second copy of the
 * tokens to keep in sync.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EntityArt } from '../src/components/EntityArt.tsx';
import { type ArtRatio, grammarForType } from '../src/lib/entity-art.ts';

const webRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(webRoot, '..', '..');
const entitiesRoot = resolve(repoRoot, 'data', 'universes', 'one-piece', 'entities');
const outPath = resolve(process.argv[2] ?? join(webRoot, 'art-preview.html'));

type Subject = { readonly type: string; readonly slug: string; readonly label: string; };

/** Entity types with no grammar, to prove the generic degradation. */
const UNKNOWN_TYPES: readonly string[] = ['location', 'film', 'anime-episode', 'sbs-question'];

function titleCase(slug: string): string {
  return slug.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(
    ' ',
  );
}

function readCorpus(): readonly Subject[] {
  const subjects: Subject[] = [];
  for (const type of readdirSync(entitiesRoot, { withFileTypes: true })) {
    if (!type.isDirectory()) continue;
    for (const file of readdirSync(join(entitiesRoot, type.name))) {
      if (!file.endsWith('.json')) continue;
      const raw: unknown = JSON.parse(readFileSync(join(entitiesRoot, type.name, file), 'utf8'));
      const slug =
        typeof raw === 'object' && raw !== null && 'slug' in raw && typeof raw.slug === 'string'
          ? raw.slug
          : file.replace(/\.json$/, '');
      subjects.push({ type: type.name, slug, label: titleCase(slug) });
    }
  }
  return subjects.sort((a, b) => a.type.localeCompare(b.type) || a.slug.localeCompare(b.slug));
}

/** The live art tokens, lifted from the stylesheet — single source. */
function readArtTokens(): string {
  const css = readFileSync(join(webRoot, 'src', 'styles.css'), 'utf8');
  return [...css.matchAll(/(--art-[a-z0-9-]+):\s*([^;]+);/g)]
    .map((match) => `    ${match[1]}: ${match[2]};`)
    .join('\n');
}

function tile(subject: Subject, ratio: ArtRatio, width: number): string {
  const svg = renderToStaticMarkup(
    createElement(EntityArt, {
      entityId: `${subject.type}:${subject.slug}`,
      entityType: subject.type,
      ratio,
      initial: subject.label.slice(0, 1),
      className: 'art',
    }),
  );
  return `<figure class="tile" style="width:${width}px">${svg}<figcaption>${subject.label}</figcaption></figure>`;
}

function section(
  title: string,
  note: string,
  subjects: readonly Subject[],
  ratio: ArtRatio,
  width: number,
): string {
  return `<section>
  <h2>${title} <span>${note}</span></h2>
  <div class="row">${subjects.map((subject) => tile(subject, ratio, width)).join('')}</div>
</section>`;
}

const corpus = readCorpus();
const byType = new Map<string, Subject[]>();
for (const subject of corpus) {
  const bucket = byType.get(subject.type) ?? [];
  bucket.push(subject);
  byType.set(subject.type, bucket);
}

const unknown: readonly Subject[] = UNKNOWN_TYPES.flatMap((type) =>
  ['alpha', 'beta', 'gamma', 'delta'].map((slug) => ({
    type,
    slug: `${slug}-${type}`,
    label: `${titleCase(type)} ${titleCase(slug)}`,
  }))
);

const sections = [
  ...[...byType.entries()].map(([type, subjects]) =>
    section(type, `→ ${grammarForType(type)} · portrait 3:4`, subjects, 'portrait', 150)
  ),
  section('every type · square', 'connection thumbs, 1:1', corpus, 'square', 96),
  section('every type · wide', 'banners, 7:3', corpus.slice(0, 12), 'wide', 300),
  section('unknown types', '→ field (generic degradation, ADR-091)', unknown, 'portrait', 150),
  section('thumb wall', 'the 40px reality check', [...corpus, ...corpus], 'square', 40),
];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Entity art — contact sheet</title>
<style>
  :root {
${readArtTokens()}
    --page: oklch(0.179 0.01 68);
    --fg: oklch(0.938 0.012 85);
    --faint: oklch(0.6 0.012 78);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 32px 80px; background: var(--page); color: var(--fg);
    font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
  }
  h1 { font-size: 18px; letter-spacing: -0.01em; margin: 0 0 4px; }
  p.lede { color: var(--faint); margin: 0 0 28px; max-width: 60ch; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin: 30px 0 10px; }
  h2 span { color: var(--faint); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .row { display: flex; flex-wrap: wrap; gap: 14px; }
  .tile { margin: 0; }
  .art { display: block; width: 100%; height: auto; border-radius: 5px; }
  figcaption {
    margin-top: 5px; color: var(--faint); font-size: 10.5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  section:last-child .row { gap: 6px; }
  section:last-child figcaption { display: none; }
</style>
</head>
<body>
<h1>Entity art — deterministic contact sheet</h1>
<p class="lede">Every entity of the corpus, composed from its <code>type:slug</code> id.
Judge composition, variety and per-type legibility; the palette lives in
<code>src/styles.css</code> and is about to change.</p>
${sections.join('\n')}
</body>
</html>
`;

writeFileSync(outPath, html, 'utf8');
process.stdout.write(`[art-preview] ${corpus.length} entities → ${outPath}\n`);
