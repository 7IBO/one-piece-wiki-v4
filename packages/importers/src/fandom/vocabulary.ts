/**
 * Vocabulary indexes for the deterministic infobox mappers (ADR-109).
 *
 * Fandom writes enum-ish infobox values as free English ("Supreme
 * Grade", "Mythical Zoan", "Single-edged greatsword"); our schema
 * stores vocabulary VALUE IDS. The bridge is an index built from the
 * COMMITTED vocabulary files — never a table of literals in mapper
 * code — so adding a value to a vocabulary is all it takes for the
 * importers to start recognising it.
 *
 * The loader is generic over the catalogue (core + universe
 * vocabularies): no vocabulary id is special-cased here.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { VocabularyIndex, VocabularyIndexes } from './box.ts';

type VocabularyFile = {
  readonly id: string;
  readonly values: Readonly<
    Record<string, { readonly labels?: Readonly<Record<string, string>>; }>
  >;
};

/** Lowercased value id, every label, and the label's parenthesis-free
 *  head ("Supreme Grade (Saijō Ō Wazamono)" → "supreme grade"). */
export function indexVocabulary(vocabulary: VocabularyFile): VocabularyIndex {
  const index = new Map<string, string>();
  const put = (key: string, id: string): void => {
    const normalized = key.toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalized === '' || index.has(normalized)) return;
    index.set(normalized, id);
  };
  for (const [id, term] of Object.entries(vocabulary.values)) {
    put(id, id);
    put(id.replace(/_/g, ' '), id);
    for (const label of Object.values(term.labels ?? {})) {
      put(label, id);
      const head = label.split('(')[0];
      if (head !== undefined) put(head, id);
      const inside = /\(([^)]+)\)/.exec(label)?.[1];
      if (inside !== undefined) put(inside, id);
    }
  }
  return index;
}

const VOCABULARY_DIRS: readonly (readonly string[])[] = [
  ['data', 'schemas', 'vocabulary'],
  ['data', 'universes', 'one-piece', 'schemas', 'vocabulary'],
];

/** Every vocabulary in the catalogue, keyed by vocabulary id. */
export async function loadVocabularyIndexes(repoRoot: string): Promise<VocabularyIndexes> {
  const indexes = new Map<string, VocabularyIndex>();
  for (const parts of VOCABULARY_DIRS) {
    const dir = join(repoRoot, ...parts);
    // eslint-disable-next-line no-await-in-loop
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      // eslint-disable-next-line no-await-in-loop
      const vocabulary = (await Bun.file(join(dir, file)).json()) as VocabularyFile;
      indexes.set(vocabulary.id, indexVocabulary(vocabulary));
    }
  }
  return indexes;
}
