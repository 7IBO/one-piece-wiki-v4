/**
 * Les sources CITÉES doivent exister.
 *
 * Un Qref (`{{Qref|sbs=90}}`, `{{Qref|card=0740}}`) nomme une source
 * réelle : la colonne SBS du tome 90, la fiche 0740 de la Vivre Card.
 * `qrefSourceIds` en fait un `since`/`source` — et le corpus se
 * retrouve avec une référence vers une entité que personne n'a
 * écrite. Sur le seul import des 441 personnages : **85 cibles
 * manquantes, 152 références pendantes**.
 *
 * Trois issues étaient possibles, et deux sont mauvaises :
 *
 * - jeter la citation → on perd la provenance, qui est le contrat des
 *   quatre axes ;
 * - écrire les entités à la main → ça remarche à chaque import ;
 * - **matérialiser la source citée**, avec exactement ce que la
 *   citation dit et rien de plus. C'est ce que fait ce module.
 *
 * Un stub ne porte donc AUCUNE donnée devinée : pas de date de
 * parution pour une colonne SBS (c'est celle de son tome, déjà portée
 * par le `volume` et reliée par `part-of-volume`), pas de titre pour
 * une fiche. Ce que la citation donne — le numéro — et l'arête vers
 * son conteneur quand elle est connue.
 */
import type { MapperEmit } from '../emit.ts';

/** Toutes les entités sont en schema_version 1 depuis le reset v1 (ADR-115). */
const SCHEMA_VERSION = 1;

/**
 * Un id de source citée → l'entité minimale qui la rend réelle, ou
 * `null` quand ce module ne sait pas la matérialiser (auquel cas la
 * référence reste pendante et `check:references` le dira, ce qui est
 * le bon comportement : mieux vaut une erreur qu'une entité inventée).
 */
export function stubForCitedSource(sourceId: string): MapperEmit | null {
  const colon = sourceId.indexOf(':');
  if (colon === -1) return null;
  const type = sourceId.slice(0, colon);
  const slug = sourceId.slice(colon + 1);

  if (type === 'sbs') {
    // `sbs:volume-90` — la colonne SBS du tome 90. Le seul fait que
    // l'id porte est le tome, et il devient l'arête.
    const volume = /^volume-(\d+)$/.exec(slug)?.[1];
    if (volume === undefined) return null;
    return {
      entity: {
        id: sourceId,
        type: 'sbs',
        schema_version: SCHEMA_VERSION,
        slug,
        properties: { canon_scope: { value: 'sbs' } },
        relations: [{ type: 'part-of-volume', target: `volume:${volume}` }],
      },
      translations: { en: {} },
    };
  }

  if (type === 'databook-card') {
    // `databook-card:0740` — la fiche 0740. Son NUMÉRO est tout ce que
    // la citation donne : ni le databook dont elle vient, ni son type
    // de fiche, qui demanderaient de lire la fiche elle-même.
    if (!/^\d+$/.test(slug)) return null;
    return {
      entity: {
        id: sourceId,
        type: 'databook-card',
        schema_version: SCHEMA_VERSION,
        slug,
        properties: { card_number: { value: slug } },
        relations: [],
      },
      translations: { en: {} },
    };
  }

  return null;
}

/** Les types de source que ce module sait matérialiser. */
export const STUBBABLE_SOURCE_TYPES: readonly string[] = ['sbs', 'databook-card'];

/**
 * Les ids de source cités par une entité mappée, tous axes confondus
 * (`since`, `source`, `until`…). On lit la sortie du mapper telle
 * quelle : un parcours de valeurs, pas une liste de champs, pour que
 * le jour où un axe s'ajoute la couverture suive.
 */
export function citedSourceIds(emit: MapperEmit): readonly string[] {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      const colon = value.indexOf(':');
      if (colon > 0 && STUBBABLE_SOURCE_TYPES.includes(value.slice(0, colon))) found.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const item of Object.values(value)) visit(item);
    }
  };
  visit(emit.entity);
  return [...found];
}
