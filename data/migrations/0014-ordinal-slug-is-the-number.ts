import type { EntityData, Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * L'id et le slug d'une entité ORDINALE disaient deux choses
 * différentes.
 *
 *   id manga-chapter:1044   slug chapter-1044
 *   id anime-episode:1071   slug episode-1071
 *   id volume:115           slug volume-115
 *
 * Mesuré : **2484 entités sur 2557** — soit 97 % du corpus — avaient
 * `id != type:slug`. Les 73 restantes étaient conformes, sauf quatre
 * (trois personnages, un fruit) traitées à part : ici c'est le SLUG
 * qui est corrigé, là-bas ce sera l'id.
 *
 * Le sens du correctif n'est pas symétrique, et c'est le système
 * anti-spoil qui tranche : `isSourceVisible` (apps/web) et
 * `isNumberedSource` (db-builder) lisent l'ORDINAL dans le suffixe de
 * l'id — `manga-chapter:1044` → 1044. Renommer l'id en
 * `manga-chapter:chapter-1044` casserait tout le filtrage par
 * progression. C'est donc le slug qui s'aligne sur l'id, jamais
 * l'inverse.
 *
 * La règle est structurelle, pas une liste de types : « si le suffixe
 * de l'id est entièrement numérique, le slug EST ce nombre ». C'est
 * mot pour mot `isNumberedSource`, et un type ordinal ajouté demain
 * en hérite sans qu'on y pense.
 *
 * L'ancien slug part dans `slug_history` — la convention de
 * `CONVENTIONS.md` pour les redirections. Rien ne le consomme
 * aujourd'hui ; l'écrire coûte un champ et évite d'avoir à
 * reconstruire l'information plus tard.
 */
const migration: Migration = {
  id: '0014-ordinal-slug-is-the-number',
  description:
    "Le slug d'une entité ordinale est son numéro : `chapter-1044` → `1044` (l'id fait foi, l'anti-spoil le lit).",
  up: (data: EntityData): EntityData => {
    const entity = data as {
      id?: string;
      slug?: string;
      slug_history?: string[];
    };
    const id = entity.id;
    if (typeof id !== 'string') return data;
    const colon = id.indexOf(':');
    if (colon === -1) return data;
    const ordinal = id.slice(colon + 1);
    if (!/^\d+$/.test(ordinal)) return data;
    if (entity.slug === ordinal) return data;

    const history = entity.slug_history ?? [];
    const previous = entity.slug;
    const slug_history = typeof previous === 'string' && !history.includes(previous)
      ? [...history, previous]
      : history;
    return { ...data, slug: ordinal, ...(slug_history.length > 0 ? { slug_history } : {}) };
  },
};

export default migration;
