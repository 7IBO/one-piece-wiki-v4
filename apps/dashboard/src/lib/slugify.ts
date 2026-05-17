/**
 * Derive a slug from a free-form display name. The output mirrors the
 * `SLUG` primitive in `packages/schemas/src/primitives.ts`
 * (`^[a-z0-9]+(?:[-_][a-z0-9]+)*$`): lowercase a–z + 0–9, with `-`
 * between alphanumeric runs.
 *
 * Used in the dashboard's "create new entity" flow where the
 * contributor types the entity's name first; the slug is then
 * auto-suggested but always remains editable.
 *
 * Unicode handling: we normalise with NFKD and drop combining marks
 * (U+0300–U+036F), so "Cœur" → "coeur", "Portgas D. Ace" →
 * "portgas-d-ace", "Roronoa Zoro" → "roronoa-zoro". Non-Latin scripts
 * (e.g. kanji) collapse to empty — callers should treat an empty
 * result as "user needs to type a slug manually".
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
