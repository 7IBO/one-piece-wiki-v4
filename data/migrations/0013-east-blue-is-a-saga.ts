import type { EntityData, Migration } from '../../packages/schema-engine/src/index.ts';

/**
 * `arc:east-blue` n'est pas un arc : c'est une SAGA déguisée, et une
 * couche fantôme au-dessus des six vrais arcs.
 *
 * Mesuré avant d'y toucher :
 *
 *   romance-dawn    ch 1-7     (7)
 *   orange-town     ch 8-21   (14)
 *   syrup-village   ch 22-41  (20)
 *   baratie         ch 42-68  (27)
 *   arlong-park     ch 69-95  (27)
 *   loguetown       ch 96-100  (5)
 *
 * Les six couvrent **1 à 100 sans le moindre trou**. `arc:east-blue`,
 * lui, ne portait que DEUX chapitres — 1 et 96 — et tous les deux
 * étaient DÉJÀ dans leur vrai arc (`romance-dawn` et `loguetown`).
 * Ses arêtes étaient donc des doublons purs : les retirer n'orpheline
 * rien.
 *
 * C'est le même défaut que `arc:wano` / `arc:wano-country`, réglé par
 * la migration 0011 : un stub semé à la main qui a survécu à l'import
 * et qui concurrence la donnée réelle. La différence est qu'ici le
 * stub nomme la bonne chose au mauvais NIVEAU — East Blue existe, mais
 * c'est la saga.
 *
 * CE QUE ÇA SUPPRIME : une entité et ses deux arêtes, toutes deux
 * dupliquées ailleurs. La saga la remplace (`saga:east-blue`, écrite
 * à la main) et les six arcs la référencent par `part-of-saga` — ce
 * que la planche Progression réclame : « le dernier arc terminé,
 * groupé par saga ».
 */
const STUB = 'arc:east-blue';

const migration: Migration = {
  id: '0013-east-blue-is-a-saga',
  description:
    'Supprime le stub `arc:east-blue` — East Blue est une saga, et ses 2 chapitres sont déjà dans leur vrai arc.',
  up: (data: EntityData): EntityData | null => {
    const entity = data as { id?: string; relations?: { type: string; target: string; }[]; };
    if (entity.id === STUB) return null;
    // Les chapitres 1 et 96 gardent leur vrai arc et perdent le stub.
    const relations = entity.relations;
    if (relations === undefined) return data;
    const kept = relations.filter((r) => !(r.type === 'part-of-arc' && r.target === STUB));
    if (kept.length === relations.length) return data;
    return { ...data, relations: kept } as EntityData;
  },
};

export default migration;
