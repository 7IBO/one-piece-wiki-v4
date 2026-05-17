/**
 * Validate + normalize a self-chosen anonymous nickname.
 *
 * Returns:
 *   - the trimmed string if acceptable
 *   - `null` if absent / empty (treat as "no nickname")
 *   - `{ error }` if the value violates the rules
 *
 * Rules:
 *   - 1-32 chars after trim
 *   - Letters / digits / dash / underscore / dot / space only
 *     (deliberately no `@` so a nickname can never be mistaken for
 *     a GitHub handle)
 *   - No control chars, no HTML
 */
export function normalizeNickname(raw: unknown): string | null | { error: string } {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return { error: 'nickname must be a string' };
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 32) return { error: 'nickname too long (max 32 chars)' };
  if (!/^[\p{L}\p{N}._\- ]+$/u.test(trimmed)) {
    return { error: 'nickname may contain letters, digits, dash, underscore, dot, space only' };
  }
  return trimmed;
}
