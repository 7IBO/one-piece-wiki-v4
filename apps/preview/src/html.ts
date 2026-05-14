/**
 * Tiny HTML rendering helpers. Tagged-template `html` escapes
 * interpolated values; arrays of strings are joined as-is so
 * pre-rendered fragments compose. Strings already marked safe (via
 * `raw`) are not escaped a second time.
 *
 * Replaces JSX / React / template engines for the Phase 3 preview.
 * The dashboard (Phase 4) and the public web app (Phase 6) bring back
 * React + TanStack Start; the preview's job is read-only sandbox
 * rendering of SDK data.
 */
const SAFE = Symbol('safe-html');

export type SafeHtml = { readonly [SAFE]: true; readonly value: string; };

function isSafe(value: unknown): value is SafeHtml {
  return typeof value === 'object' && value !== null && SAFE in value;
}

export function raw(value: string): SafeHtml {
  return { [SAFE]: true, value };
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (isSafe(value)) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return escape(String(value));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = '';
  for (const [i, part] of strings.entries()) {
    out += part;
    if (i < values.length) out += renderValue(values[i]);
  }
  return raw(out);
}

export function htmlPage(title: string, body: SafeHtml): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} — One Piece Wiki preview</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  ${body.value}
</body>
</html>`;
}

const BASE_CSS = `
  :root { color-scheme: light dark; --fg: #1a1a1a; --bg: #ffffff;
    --muted: #6b7280; --accent: #1e40af; --border: #e5e7eb;
    --warn: #b45309; --inferred: #6b7280; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #f4f4f5; --bg: #0a0a0a; --muted: #9ca3af;
      --accent: #93c5fd; --border: #1f2937; --inferred: #6b7280; }
  }
  * { box-sizing: border-box; }
  body { font: 16px/1.5 system-ui, sans-serif; color: var(--fg);
    background: var(--bg); margin: 0; padding: 0; }
  header { padding: 1rem 1.5rem; border-bottom: 1px solid var(--border);
    display: flex; gap: 1.5rem; align-items: baseline; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: 1.1rem; }
  header h1 a { color: inherit; text-decoration: none; }
  header form { display: flex; gap: .5rem; align-items: center;
    font-size: .85rem; color: var(--muted); }
  header form input { width: 5rem; padding: .2rem .4rem;
    border: 1px solid var(--border); border-radius: .25rem;
    background: var(--bg); color: var(--fg); }
  header form select { padding: .2rem .4rem; border: 1px solid var(--border);
    border-radius: .25rem; background: var(--bg); color: var(--fg); }
  main { max-width: 56rem; margin: 0 auto; padding: 1.5rem; }
  h2 { margin-top: 2rem; font-size: 1.1rem; border-bottom: 1px solid var(--border);
    padding-bottom: .25rem; }
  a { color: var(--accent); }
  ul { padding-left: 1.25rem; }
  table { border-collapse: collapse; width: 100%; margin-top: .5rem; }
  th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid var(--border);
    vertical-align: top; font-size: .9rem; }
  th { font-weight: 600; color: var(--muted); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .85em; background: color-mix(in srgb, var(--fg) 8%, transparent);
    padding: .1rem .3rem; border-radius: .2rem; }
  .badge { display: inline-block; font-size: .7rem; padding: .1rem .35rem;
    border-radius: .25rem; background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent); margin-left: .35rem; }
  .badge--warn { background: color-mix(in srgb, var(--warn) 20%, transparent); color: var(--warn); }
  .badge--inferred { background: color-mix(in srgb, var(--inferred) 20%, transparent);
    color: var(--inferred); }
  .muted { color: var(--muted); font-size: .85rem; }
  .empty { color: var(--muted); font-style: italic; }
`;
