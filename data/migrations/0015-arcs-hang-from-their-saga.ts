import type { EntityData, Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * Les 32 arcs canon manga reçoivent leur `part-of-saga`.
 *
 * Six l'avaient (East Blue, semés à la main) ; 26 ne l'avaient pas, et
 * la planche Progression réclame « le dernier arc terminé, GROUPÉ PAR
 * SAGA ». Sans ces arêtes, le sélecteur n'a rien à grouper.
 *
 * **L'arête n'est pas devinée, elle est dérivée** (même geste
 * qu'ADR-122, l'ancrage dérivé des conteneurs) : chaque saga porte une
 * plage de chapitres, chaque arc porte les siens par `part-of-arc`.
 * Un arc appartient à la saga dont la plage contient ses chapitres.
 *
 * Les plages viennent des 11 pages de saga RENDUES (workflow
 * `fandom-render`, run 34427821554) : le Saga Box les calcule en Lua
 * (`chapter = auto`), elles n'existent pas dans le wikitexte. Elles
 * sont contiguës et sans recouvrement — 1-100, 101-217, 218-302,
 * 303-441, 442-489, 490-597, 598-653, 654-801, 802-908, 909-1057,
 * 1058-… — ce qui rend l'affectation unique par construction.
 *
 * **Les 17 arcs sans chapitre ne reçoivent RIEN.** Ce sont les arcs
 * d'anime (filler, cover story) : ils n'appartiennent à aucune saga du
 * manga, et leur en inventer une les ferait apparaître dans la
 * progression du lecteur à une place qui n'existe pas.
 */

/** Premier chapitre de chaque saga, dans l'ordre de la chaîne. */
const SAGA_STARTS: readonly (readonly [start: number, sagaId: string])[] = [
  [1, 'saga:east-blue'],
  [101, 'saga:arabasta'],
  [218, 'saga:sky-island'],
  [303, 'saga:water-7'],
  [442, 'saga:thriller-bark'],
  [490, 'saga:summit-war'],
  [598, 'saga:fish-man-island'],
  [654, 'saga:dressrosa'],
  [802, 'saga:whole-cake-island'],
  [909, 'saga:wano-country'],
  [1058, 'saga:final'],
];

/**
 * Le premier chapitre de chaque arc, relevé sur le corpus (arêtes
 * `part-of-arc` des 1193 chapitres). Il est figé ici parce qu'une
 * migration ne voit qu'UNE entité à la fois : elle ne peut pas
 * ré-agréger les chapitres pour trouver la borne de l'arc courant.
 */
const ARC_FIRST_CHAPTER: Readonly<Record<string, number>> = {
  'arc:romance-dawn': 1,
  'arc:orange-town': 8,
  'arc:syrup-village': 22,
  'arc:baratie': 42,
  'arc:arlong-park': 69,
  'arc:loguetown': 96,
  'arc:reverse-mountain': 101,
  'arc:whisky-peak': 106,
  'arc:little-garden': 115,
  'arc:drum-island': 130,
  'arc:arabasta': 155,
  'arc:jaya': 218,
  'arc:skypiea': 237,
  'arc:long-ring-long-land': 303,
  'arc:water-7': 322,
  'arc:enies-lobby': 375,
  'arc:post-enies-lobby': 431,
  'arc:thriller-bark': 442,
  'arc:sabaody-archipelago': 490,
  'arc:amazon-lily': 514,
  'arc:impel-down': 525,
  'arc:marineford': 550,
  'arc:post-war': 581,
  'arc:return-to-sabaody': 598,
  'arc:fish-man-island': 603,
  'arc:punk-hazard': 654,
  'arc:dressrosa': 700,
  'arc:zou': 802,
  'arc:whole-cake-island': 825,
  'arc:levely': 903,
  'arc:wano-country': 909,
  'arc:egghead': 1058,
};

function sagaOf(firstChapter: number): string | null {
  let found: string | null = null;
  for (const [start, sagaId] of SAGA_STARTS) {
    if (firstChapter >= start) found = sagaId;
  }
  return found;
}

const migration: Migration = {
  id: '0015-arcs-hang-from-their-saga',
  description: 'Chaque arc canon manga reçoit son `part-of-saga`, dérivé de sa plage de chapitres.',
  up: (data: EntityData): EntityData => {
    const entity = data as {
      id?: string;
      type?: string;
      relations?: { type: string; target: string; }[];
    };
    if (entity.type !== 'arc' || entity.id === undefined) return data;
    const first = ARC_FIRST_CHAPTER[entity.id];
    if (first === undefined) return data;
    const sagaId = sagaOf(first);
    if (sagaId === null) return data;
    const relations = entity.relations ?? [];
    if (relations.some((r) => r.type === 'part-of-saga')) return data;
    return {
      ...data,
      relations: [...relations, { type: 'part-of-saga', target: sagaId }],
    } as EntityData;
  },
};

export default migration;
