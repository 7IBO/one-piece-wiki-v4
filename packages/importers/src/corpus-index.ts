/**
 * Le CORPUS comme index de résolution, en complément du registre.
 *
 * Le registre d'import (`data/import/fandom-pages.json`) dit quelle
 * page Fandom a produit quelle entité. Il ne connaît donc que ce qui
 * est passé par un crawl — et **une entité écrite à la main n'y est
 * pas**.
 *
 * Mesuré, et c'est ce qui a motivé ce module : la première passe
 * d'apparitions sur 100 chapitres a rangé « hors corpus » 78 mentions
 * de Roronoa Zoro, 71 de Nami, 57 d'Usopp et 55 de Sanji. Les quatre
 * sont dans le corpus depuis toujours ; ils avaient été semés à la
 * main, jamais importés. Le registre disait vrai — il ne les a pas
 * importés — mais la question posée n'était pas celle-là.
 *
 * La résolution de repli lit donc les fichiers d'entité : le slug
 * dérivé du titre de page est comparé aux slugs réellement présents.
 * Ce n'est pas une invention, c'est la règle d'identité du projet
 * (ADR-126 : l'id est `type:` suivi du slug, et le slug vient du nom).
 *
 * **Une ambiguïté ne se tranche pas.** Si deux types portent le même
 * slug — un personnage et un lieu nommés pareil — le module refuse et
 * le dit, plutôt que d'en choisir un.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slugify } from './slug.ts';

/** slug → les ids d'entité qui le portent (plusieurs = ambigu). */
export type CorpusSlugIndex = ReadonlyMap<string, readonly string[]>;

export async function buildCorpusSlugIndex(
  repoRoot: string,
  universe = 'one-piece',
): Promise<CorpusSlugIndex> {
  const root = join(repoRoot, 'data', 'universes', universe, 'entities');
  const index = new Map<string, string[]>();
  let types: string[];
  try {
    types = await readdir(root);
  } catch {
    return index;
  }
  for (const type of types) {
    let files: string[];
    try {
      // eslint-disable-next-line no-await-in-loop
      files = await readdir(join(root, type));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      // eslint-disable-next-line no-await-in-loop
      const raw = await readFile(join(root, type, file), 'utf8');
      const entity = JSON.parse(raw) as { id?: string; slug?: string; };
      if (entity.id === undefined || entity.slug === undefined) continue;
      const bucket = index.get(entity.slug);
      if (bucket === undefined) index.set(entity.slug, [entity.id]);
      else if (!bucket.includes(entity.id)) bucket.push(entity.id);
    }
  }
  return index;
}

export type CorpusResolution =
  | { readonly kind: 'resolved'; readonly entityId: string; }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly string[]; }
  | { readonly kind: 'absent'; };

/**
 * Un titre de page Fandom → l'entité du corpus qui porte le même slug.
 *
 * `allowedTypes` restreint aux types que la relation accepte : sans
 * lui, « Nami » pourrait résoudre vers un lieu homonyme et produire
 * une arête que le schéma refuse.
 */
export function resolveAgainstCorpus(
  index: CorpusSlugIndex,
  title: string,
  allowedTypes?: readonly string[],
): CorpusResolution {
  const slug = slugify(title);
  if (slug === '') return { kind: 'absent' };
  const candidates = (index.get(slug) ?? []).filter((id) =>
    allowedTypes === undefined || allowedTypes.includes(id.slice(0, id.indexOf(':')))
  );
  if (candidates.length === 0) return { kind: 'absent' };
  if (candidates.length > 1) return { kind: 'ambiguous', candidates };
  return { kind: 'resolved', entityId: candidates[0]! };
}
