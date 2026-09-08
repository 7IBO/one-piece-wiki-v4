/**
 * La derivation de slug, en un seul endroit.
 *
 * `CLAUDE.md` : « IDs follow the pattern `type:slug` », « Slugs are
 * kebab-case English only », et un slug vaut au plus 60 caracteres
 * (`Slug` dans `packages/schemas/src/primitives.ts`). Trois copies de
 * cette fonction cohabitaient — celle de `fandom/box.ts` respectait la
 * borne, celles de `fandom/character.ts` et `onepiece-api/common.ts`
 * ne la respectaient pas et pouvaient donc produire un id que Zod
 * refuse. Une seule regle, un seul fichier.
 */

/**
 * Retire toute parenthese et son contenu.
 *
 * Regle produit : **aucune donnee entre parentheses dans un id**. Sur
 * Fandom la parenthese porte toujours un qualificatif, jamais le nom :
 * une edition (« Belle-Mère (VIZ Media) »), une desambiguisation
 * (« Zeus (Homies) »), une precision (« Mr. 3 (Galdino) »). Aucune des
 * trois n'est l'identite de la chose.
 *
 * Appliquee au SLUG seulement — le nom affiche garde ce que la source
 * ecrit ; c'est l'id qui est immuable et doit rester lisible.
 *
 * Consequence a surveiller : deux pages que Fandom ne distingue QUE
 * par leur parenthese retombent sur le meme slug. Le corpus n'en
 * contient aucune aujourd'hui (2485 pages du registre, 0 collision
 * mesuree apres retrait), mais le cas EXISTE sur le wiki, donc
 * `import:fandom crawl` refuse desormais la deuxieme page d'un id
 * deja produit dans le meme run au lieu de la fondre dans la
 * premiere.
 */
export function stripParentheticals(name: string): string {
  return name.replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

/** kebab-case English slug, ASCII-folded, capped at the Slug max (60). */
export function slugify(name: string, maxLength = 60): string {
  const base = stripParentheticals(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= maxLength) return base;
  const cut = base.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}
