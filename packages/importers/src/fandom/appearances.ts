/**
 * « Qui apparaît dans ce chapitre / cet épisode » → les arêtes
 * `features` (ADR-105).
 *
 * **Le corpus en compte zéro aujourd'hui**, et `DESIGN_PLAN.md` §5 en
 * fait le premier déblocage produit : les compteurs d'en-tête de
 * chapitre, « personnages présents », « premières apparitions »,
 * « apparitions par arc » et le dénominateur « 342 apparitions lues
 * sur 1 044 » en dépendent tous.
 *
 * La donnée n'est PAS dans l'infobox. Relevé sur les pages rendues :
 *
 * | source    | section                              | pages   | forme |
 * | --------- | ------------------------------------ | ------- | ----- |
 * | chapitre  | « Characters »                       | 39 / 40 | `<table class="CharTable">` |
 * | épisode   | « Characters in Order of Appearance »| 40 / 40 | `<ul>` dans un bloc défilant |
 * | film      | « Characters in Order of Appearance »| 4 / 28  | — |
 *
 * Les deux formes sont donc lues séparément, et **le film n'est pas
 * couvert** : sa section n'existe que sur 4 pages sur 28, et ce qu'il
 * porte à la place (« Cast ») liste des comédiens de doublage, pas des
 * personnages présents.
 *
 * Ce que la page RENDUE donne et que le wikitexte ne donne pas : les
 * modèles de la CharTable sont expansés, donc les liens sont là. Même
 * raison qu'ADR-119/120.
 */

/** Une apparition relevée sur une page source. */
export type Appearance = {
  /** Titre de page Fandom de l'entité qui apparaît. */
  readonly title: string;
  /** Valeur d'`appearance-types`, quand la page en annote une. */
  readonly appearanceType?: string;
  /**
   * Rang dans l'ordre d'apparition, pour les sources qui l'ordonnent
   * (les épisodes le font, les chapitres non). 1-indexé.
   */
  readonly order?: number;
};

/**
 * Annotation entre parenthèses → terme d'`appearance-types`.
 *
 * Relevé sur six pages rendues : `(flashback)` 21 fois, `(cover)` 7,
 * et un `(flashback, as Kouzuki Momonosuke)` qui porte DEUX choses.
 * Seul le premier segment est lu ; le reste — « as X », une identité
 * sous laquelle le personnage apparaît — n'a pas de qualificatif au
 * schéma, et l'inventer serait pire que de l'ignorer.
 */
export function parseAppearanceType(raw: string): string | null {
  const head = (raw.split(',')[0] ?? '').trim().toLowerCase();
  return APPEARANCE_ANNOTATIONS.get(head) ?? null;
}

/**
 * Les annotations vues, mappées sur le vocabulaire. Une annotation
 * inconnue ne devient PAS une valeur : elle disparaît, et l'arête
 * reste une apparition ordinaire (`full` par défaut au schéma).
 */
const APPEARANCE_ANNOTATIONS: ReadonlyMap<string, string> = new Map([
  ['flashback', 'flashback'],
  ['cover', 'cover_story'],
  ['cover story', 'cover_story'],
  ['mentioned', 'mentioned'],
  ['silhouette', 'silhouette'],
  ['photograph', 'photograph'],
  ['photo', 'photograph'],
  ['portrait', 'portrait'],
  ['corpse', 'corpse'],
  ['vision', 'vision'],
  ['recap', 'recap'],
  ['eyecatcher', 'eyecatcher'],
  ['wanted poster', 'wanted_poster'],
  ['imagined', 'imagined'],
  ['partial', 'partial'],
]);

/** Le titre de page d'un lien `/wiki/X`, décodé. */
function titleFromHref(href: string): string | null {
  const m = /^\/wiki\/([^#?]+)/.exec(href);
  if (m?.[1] === undefined) return null;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ');
  } catch {
    return m[1].replace(/_/g, ' ');
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * Les `<li>` d'un fragment HTML qui portent un lien d'article, avec
 * l'annotation qui suit le lien.
 *
 * Un `<li>` sans lien `/wiki/` n'est pas une apparition — c'est du
 * texte libre, et le laisser passer produirait des cibles fantômes.
 * Un lien de fichier ou de catégorie non plus.
 */
function listItems(fragment: string): readonly Appearance[] {
  const out: Appearance[] = [];
  for (const m of fragment.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const li = m[1] ?? '';
    const link = /<a\s[^>]*href="([^"]+)"/.exec(li);
    if (link?.[1] === undefined) continue;
    const title = titleFromHref(link[1]);
    if (title === null || /^(File|Category|Template|Help):/i.test(title)) continue;
    const text = decodeEntities(li.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
    const annotation = /\(([^)]{1,60})\)/.exec(text)?.[1];
    const appearanceType = annotation === undefined ? null : parseAppearanceType(annotation);
    out.push({
      title,
      ...(appearanceType !== null ? { appearanceType } : {}),
    });
  }
  return out;
}

/**
 * Les apparitions d'une page de CHAPITRE, depuis sa `CharTable`.
 *
 * Les colonnes (« Pirates », « Marines », « World Government »…) et
 * les sous-titres `<dt>` (l'équipage) sont une **présentation** : ils
 * groupent, ils ne qualifient pas. Les mapper sur le qualificatif
 * `role` serait faux — `narrative-roles` porte protagoniste,
 * antagoniste, mentor, pas une faction — et en déduire une
 * appartenance d'équipage à cette date serait une inférence, pas une
 * lecture. Seuls les `<li>` sont lus.
 */
export function parseChapterAppearances(html: string): readonly Appearance[] {
  const table = /<table[^>]*class="[^"]*CharTable[^"]*"[^>]*>[\s\S]*?<\/table>/i.exec(html);
  if (table === null) return [];
  return dedupe(listItems(table[0]));
}

/**
 * Les apparitions d'une page d'ÉPISODE, depuis « Characters in Order
 * of Appearance ».
 *
 * La section porte l'ordre dans son titre, donc chaque entrée reçoit
 * son rang. C'est la seule des deux formes qui l'ait.
 */
export function parseEpisodeAppearances(html: string): readonly Appearance[] {
  const anchor = html.indexOf('id="Characters_in_Order_of_Appearance"');
  const scope = anchor === -1 ? html : html.slice(anchor);
  const list = /<ul>[\s\S]*?<\/ul>/.exec(scope);
  if (list === null) return [];
  return dedupe(listItems(list[0])).map((entry, index) => ({ ...entry, order: index + 1 }));
}

/**
 * Un personnage listé deux fois (une fois normalement, une fois en
 * flashback) est UNE apparition. La première gagne : sur un épisode
 * elle porte le vrai rang, et sur un chapitre une apparition pleine
 * précède ses annotations.
 */
function dedupe(entries: readonly Appearance[]): readonly Appearance[] {
  const seen = new Set<string>();
  const out: Appearance[] = [];
  for (const entry of entries) {
    if (seen.has(entry.title)) continue;
    seen.add(entry.title);
    out.push(entry);
  }
  return out;
}

/** Une arête `features` prête à fondre dans l'entité source. */
export type FeaturesEdge = {
  readonly type: 'features';
  readonly target: string;
  readonly qualifiers?: { readonly appearance_type: string; };
};

export type AppearancePlan = {
  readonly edges: readonly FeaturesEdge[];
  /** Cibles que le registre ne connaît pas — la frontière d'import. */
  readonly unresolved: readonly string[];
  readonly warnings: readonly string[];
};

/**
 * Les apparitions relevées → les arêtes que la source doit porter.
 *
 * **Une cible non résolue ne produit pas d'arête.** Le registre dit
 * quelles pages sont des entités chez nous ; le reste est un
 * personnage pas encore importé, et fabriquer un id à partir du titre
 * créerait une référence pendante — ce que `check:references` refuse,
 * à raison. Ces titres repartent en `unresolved`, qui EST la liste de
 * ce qu'il faut importer ensuite.
 *
 * **Le rang d'apparition est perdu, et c'est dit.** La section
 * d'épisode l'ordonne, mais `features` n'a que `appearance_type` et
 * `role` comme qualificatifs : aucun n'est un ordinal. Le garder
 * demanderait un qualificatif de plus, donc un ADR.
 */
export function planAppearanceEdges(
  appearances: readonly Appearance[],
  resolve: (title: string) => string | null,
  options: { readonly targetTypes?: readonly string[]; } = {},
): AppearancePlan {
  const edges: FeaturesEdge[] = [];
  const unresolved: string[] = [];
  const warnings: string[] = [];
  const allowed = options.targetTypes;
  const seen = new Set<string>();

  for (const appearance of appearances) {
    const id = resolve(appearance.title);
    if (id === null) {
      if (!unresolved.includes(appearance.title)) unresolved.push(appearance.title);
      continue;
    }
    const type = id.slice(0, id.indexOf(':'));
    if (allowed !== undefined && !allowed.includes(type)) {
      warnings.push(`${appearance.title} → ${id} : \`features\` n'accepte pas le type ${type}`);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({
      type: 'features',
      target: id,
      ...(appearance.appearanceType !== undefined
        ? { qualifiers: { appearance_type: appearance.appearanceType } }
        : {}),
    });
  }

  const ordered = appearances.filter((a) => a.order !== undefined).length;
  if (ordered > 0) {
    warnings.push(
      `${ordered} apparition(s) ordonnée(s) : le rang n'est pas conservé — `
        + "`features` n'a pas de qualificatif ordinal (demanderait un ADR)",
    );
  }
  return { edges, unresolved, warnings };
}

/** Les types que `features` accepte comme cible (schéma, ADR-105). */
export const FEATURES_TARGET_TYPES: readonly string[] = [
  'character',
  'devil-fruit',
  'crew',
  'image',
  'concept',
  'title',
  'event',
  'ship',
  'technique',
  'weapon',
  'location',
  'organization',
  'race',
];
