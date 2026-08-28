/**
 * Extract rows for each SQLite table from the loaded entity catalogue.
 * The extractor is pure: it does not touch the database. The writer
 * inserts the rows in a single transaction.
 */
import type { LoadedEntity, RelationType, ValidatedCatalogue } from '@onepiece-wiki/schema-engine';

export type EntityRow = {
  id: string;
  type: string;
  slug: string;
  schema_version: number;
  first_appearance_source: string | null;
  last_appearance_source: string | null;
  primary_canon_scope: string | null;
  canonical_name_key: string | null;
  data: string;
};

export type PropertyRow = {
  entity_id: string;
  property_id: string;
  value: string;
  since_source: string | null;
  until_source: string | null;
  epistemic_status: string;
  review_status: string;
  assisted_by: string | null;
  canon_scope: string | null;
  event_id: string | null;
  entry_index: number;
};

export type RelationRow = {
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  qualifiers: string | null;
  since_source: string | null;
  until_source: string | null;
  // Relation base qualifiers (ADR-037), promoted from the qualifiers bag.
  epistemic_status: string;
  believed_by: string | null;
  known_truth_by: string | null;
  revealed_since: string | null;
  /**
   * Localized display label for THIS row's direction, as a sorted
   * locale → string JSON object: the relation type's `active` labels on
   * a stored edge, its `inverse` labels on a materialized inverse edge.
   */
  label: string | null;
  is_inferred: number;
};

export type AppearanceRow = {
  entity_id: string;
  source_id: string;
  appearance_type: string;
  is_first: number;
  qualifiers: string | null;
};

export type ExtractedRows = {
  entities: EntityRow[];
  properties: PropertyRow[];
  relations: RelationRow[];
  appearances: AppearanceRow[];
};

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

/**
 * Serialize an entity_ref[] qualifier (`believed_by` / `known_truth_by`)
 * for its column, or null when absent / not a non-empty array. The full
 * value is also preserved in the `qualifiers` JSON blob.
 */
function jsonArrayOrNull(value: unknown): string | null {
  return Array.isArray(value) && value.length > 0 ? JSON.stringify(value) : null;
}

function compareSources(a: string, b: string): number {
  // For Phase 2: chapters compare by their numeric suffix when the
  // prefix matches. Returns negative if a < b, positive if a > b.
  const [typeA, slugA = ''] = a.split(':');
  const [typeB, slugB = ''] = b.split(':');
  if (typeA === typeB) {
    const numA = Number(slugA.replace(/[^0-9]/g, ''));
    const numB = Number(slugB.replace(/[^0-9]/g, ''));
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    return slugA.localeCompare(slugB);
  }
  return a.localeCompare(b);
}

function readCanonScope(data: Record<string, unknown>): string | null {
  // An entity's canon scope is declared as a (historisable) property on
  // the source itself, e.g. a manga-chapter carries `canon_scope`. Read
  // the first declared value. No inference from the entity type: if the
  // source never declares its scope, the answer is honestly null rather
  // than a hardcoded type-to-scope guess.
  const properties = data['properties'];
  if (properties === null || properties === undefined || typeof properties !== 'object') {
    return null;
  }
  const canonScope = (properties as Record<string, unknown>)['canon_scope'];
  if (canonScope === undefined || canonScope === null) return null;
  const entries = Array.isArray(canonScope) ? canonScope : [canonScope];
  for (const entry of entries) {
    if (entry === null || entry === undefined || typeof entry !== 'object') continue;
    const value = (entry as Record<string, unknown>)['value'];
    if (typeof value === 'string') return value;
  }
  return null;
}

/**
 * Mark, for each entity, the appearance whose source is earliest in
 * in-universe order as `is_first = 1`. Ties on the same earliest source
 * are all marked (defensive; the data should not produce duplicates).
 */
function markFirstAppearances(appearances: AppearanceRow[]): void {
  const earliestByEntity = new Map<string, string>();
  for (const row of appearances) {
    const current = earliestByEntity.get(row.entity_id);
    if (current === undefined || compareSources(row.source_id, current) < 0) {
      earliestByEntity.set(row.entity_id, row.source_id);
    }
  }
  for (const row of appearances) {
    if (earliestByEntity.get(row.entity_id) === row.source_id) {
      row.is_first = 1;
    }
  }
}

function collectSinceSources(data: Record<string, unknown>): string[] {
  const sources = new Set<string>();
  const properties = data['properties'];
  if (properties !== null && properties !== undefined && typeof properties === 'object') {
    for (const value of Object.values(properties as Record<string, unknown>)) {
      const entries = Array.isArray(value) ? value : [value];
      for (const entry of entries) {
        if (entry === null || entry === undefined || typeof entry !== 'object') continue;
        const since = (entry as Record<string, unknown>)['since'];
        if (typeof since === 'string') sources.add(since);
      }
    }
  }
  const relations = data['relations'];
  if (Array.isArray(relations)) {
    for (const rel of relations) {
      if (rel === null || rel === undefined || typeof rel !== 'object') continue;
      const q = (rel as Record<string, unknown>)['qualifiers'];
      if (q !== null && q !== undefined && typeof q === 'object') {
        const since = (q as Record<string, unknown>)['since'];
        if (typeof since === 'string') sources.add(since);
      }
    }
  }
  return [...sources];
}

/**
 * Une entité est-elle SA PROPRE ancre ?
 *
 * Le test est celui du filtre de lecture (`progress.ts#isSourceVisible`)
 * et pas un autre : un identifiant à suffixe NUMÉRIQUE
 * (`manga-chapter:1044`) se compare au curseur, donc l'entité se ferme
 * sur elle-même ; un identifiant à slug (`arc:wano-country`) ne le peut
 * pas et reste visible quoi qu'il arrive.
 *
 * C'était le piège de la première version de cette règle : elle
 * excluait les types « ordinaux », et un arc DÉCLARE `arc_number` —
 * donc les 50 arcs étaient sautés en silence, précisément ceux qu'il
 * fallait ancrer. Avoir un numéro et être filtrable par le curseur
 * sont deux choses différentes.
 *
 * Le builder n'a pas à savoir quels types sont des AXES : c'est une
 * liaison de présentation (ADR-091), et `search.ts` prend soin de ne
 * pas la connaître non plus.
 */
function isNumberedSource(id: string): boolean {
  const colon = id.indexOf(':');
  return colon !== -1 && /^\d+$/.test(id.slice(colon + 1));
}

/**
 * L'ancre anti-spoil d'un CONTENEUR, dérivée de ce qu'il contient.
 *
 * Le problème mesuré : 46 arcs sur 50 n'avaient pas de
 * `first_appearance_source`, parce que cette valeur vient des axes
 * `since` portés par l'entité elle-même — et un arc n'en porte aucun.
 * Un arc sans ancre s'affiche ENTIÈREMENT à n'importe quel curseur :
 * la page `arc/wano-country` déballait ses 149 chapitres à un lecteur
 * au chapitre 100. C'est la promesse centrale du produit qui fuyait.
 *
 * La règle, et elle ne nomme aucun type ni aucune relation : **une
 * entité sans ancre, vers laquelle pointent des arêtes venant de
 * sources ORDINALES, s'ouvre à la plus petite d'entre elles.** Un arc
 * s'ouvre à son premier chapitre, un volume au sien, une saga au
 * premier chapitre de ses arcs.
 *
 * Deux garde-fous :
 *
 * - on ne dérive QUE pour les types non ordinaux. Un épisode est
 *   lui-même une source : il se ferme sur son propre id, sur SON axe.
 *   Lui ajouter l'ancre du chapitre qu'il adapte lui imposerait en
 *   plus le curseur manga, ce qui changerait le comportement de 1145
 *   épisodes sans que personne l'ait demandé ;
 * - on ne dérive QUE si l'ancre est absente. Une valeur écrite à la
 *   main reste la vérité — et sur les 4 arcs qui en portaient une, la
 *   dérivation retombe exactement dessus, ce qui la valide au lieu de
 *   la contredire.
 *
 * 17 arcs n'ont encore aucun chapitre connu : ils restent sans ancre,
 * ce qui est honnête — un conteneur dont on ignore le contenu n'a rien
 * sur quoi se fermer.
 */
function deriveContainerAnchors(
  rows: readonly EntityRow[],
  relations: readonly RelationRow[],
): void {
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Par CONTENEUR puis par TYPE de source : « le plus petit » n'a de
  // sens qu'à l'intérieur d'un même axe. Comparer `anime-episode:92` à
  // `manga-chapter:155` revenait à les trier alphabétiquement, et
  // `arabasta` s'ancrait sur l'épisode 92.
  const perType = new Map<string, Map<string, { id: string; ordinal: number; count: number; }>>();
  for (const edge of relations) {
    const from = edge.source_entity_id;
    const colon = from.indexOf(':');
    if (!isNumberedSource(from) || !byId.has(from)) continue;
    const sourceType = from.slice(0, colon);
    const ordinal = Number(from.slice(colon + 1));
    const byTypeForTarget = perType.get(edge.target_entity_id)
      ?? new Map<string, { id: string; ordinal: number; count: number; }>();
    perType.set(edge.target_entity_id, byTypeForTarget);
    const current = byTypeForTarget.get(sourceType);
    if (current === undefined) byTypeForTarget.set(sourceType, { id: from, ordinal, count: 1 });
    else {
      current.count += 1;
      if (ordinal < current.ordinal) {
        current.id = from;
        current.ordinal = ordinal;
      }
    }
  }

  for (const row of rows) {
    if (row.first_appearance_source !== null) continue;
    if (isNumberedSource(row.id)) continue;
    const candidates = perType.get(row.id);
    if (candidates === undefined || candidates.size === 0) continue;
    // Plusieurs médias décrivent le même conteneur — 26 arcs sur 44
    // portent à la fois des chapitres et des épisodes. On retient
    // celui qui fournit LE PLUS d'arêtes : c'est le média dans lequel
    // ce conteneur est le mieux documenté, et une ancre tirée d'un
    // index partiel vaut moins qu'une ancre tirée d'un index complet.
    // Départage par id de type, pour que la construction reste
    // déterministe.
    let best: { id: string; ordinal: number; count: number; } | null = null;
    let bestType = '';
    for (const [sourceType, candidate] of candidates) {
      if (
        best === null || candidate.count > best.count
        || (candidate.count === best.count && sourceType < bestType)
      ) {
        best = candidate;
        bestType = sourceType;
      }
    }
    if (best !== null) row.first_appearance_source = best.id;
  }
}

function extractEntityRow(entity: LoadedEntity): EntityRow {
  const sources = collectSinceSources(entity.data).sort(compareSources);
  return {
    id: entity.id,
    type: entity.type,
    slug: asString(entity.data['slug']) ?? '',
    schema_version: asNumber(entity.data['schema_version']),
    first_appearance_source: sources[0] ?? null,
    last_appearance_source: sources[sources.length - 1] ?? null,
    primary_canon_scope: null,
    canonical_name_key: asString(entity.data['canonical_name_key']),
    data: JSON.stringify(entity.data),
  };
}

function extractPropertyRows(entity: LoadedEntity): PropertyRow[] {
  const rows: PropertyRow[] = [];
  const properties = entity.data['properties'];
  if (properties === null || properties === undefined || typeof properties !== 'object') {
    return rows;
  }

  for (const [propertyId, rawValue] of Object.entries(properties as Record<string, unknown>)) {
    const entries = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const [entryIndex, entry] of entries.entries()) {
      if (entry === null || entry === undefined || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      rows.push({
        entity_id: entity.id,
        property_id: propertyId,
        value: JSON.stringify(record),
        since_source: asString(record['since']),
        until_source: asString(record['until']),
        epistemic_status: asString(record['epistemic_status']) ?? 'true',
        review_status: asString(record['review_status']) ?? 'reviewed',
        assisted_by: asString(record['assisted_by']),
        canon_scope: asString(record['canon_scope']),
        event_id: asString(record['event']),
        entry_index: entryIndex,
      });
    }
  }
  return rows;
}

/**
 * Serialize the localized labels of one direction of a relation type
 * (locale keys sorted for deterministic output). Null when the type is
 * unknown to the catalogue — validation makes that impossible on a real
 * build, but synthetic fixtures may omit the definition.
 */
function relationLabel(
  def: RelationType | undefined,
  direction: 'active' | 'inverse',
): string | null {
  if (def?.labels === undefined) return null;
  const byLocale: Record<string, string> = {};
  for (const locale of Object.keys(def.labels).sort()) {
    const pair = (def.labels as Record<string, { active: string; inverse: string; }>)[locale];
    if (pair !== undefined) byLocale[locale] = pair[direction];
  }
  return JSON.stringify(byLocale);
}

function edgeKey(relationType: string, sourceId: string, targetId: string): string {
  return `${relationType} ${sourceId} ${targetId}`;
}

function extractRelationRows(
  entity: LoadedEntity,
  catalogue: ValidatedCatalogue,
): RelationRow[] {
  const rows: RelationRow[] = [];
  const relations = entity.data['relations'];
  if (!Array.isArray(relations)) return rows;

  for (const rel of relations) {
    if (rel === null || rel === undefined || typeof rel !== 'object') continue;
    const record = rel as Record<string, unknown>;
    const relationType = asString(record['type']);
    const target = asString(record['target']);
    if (relationType === null || target === null) continue;
    const qualifiers = record['qualifiers'];
    const qualifiersObj = qualifiers !== null && qualifiers !== undefined
        && typeof qualifiers === 'object'
      ? (qualifiers as Record<string, unknown>)
      : null;
    const since = qualifiersObj !== null ? asString(qualifiersObj['since']) : null;
    const until = qualifiersObj !== null ? asString(qualifiersObj['until']) : null;
    // Relation base qualifiers (ADR-037). The materialized inverse edge
    // carries the same epistemic state — a hidden link is equally hidden
    // in both directions.
    const epistemicStatus = (qualifiersObj !== null
      ? asString(qualifiersObj['epistemic_status'])
      : null) ?? 'true';
    const believedBy = qualifiersObj !== null
      ? jsonArrayOrNull(qualifiersObj['believed_by'])
      : null;
    const knownTruthBy = qualifiersObj !== null
      ? jsonArrayOrNull(qualifiersObj['known_truth_by'])
      : null;
    const revealedSince = qualifiersObj !== null ? asString(qualifiersObj['revealed_since']) : null;

    rows.push({
      source_entity_id: entity.id,
      target_entity_id: target,
      relation_type: relationType,
      qualifiers: qualifiersObj !== null ? JSON.stringify(qualifiersObj) : null,
      since_source: since,
      until_source: until,
      epistemic_status: epistemicStatus,
      believed_by: believedBy,
      known_truth_by: knownTruthBy,
      revealed_since: revealedSince,
      label: relationLabel(catalogue.relationTypes.get(relationType), 'active'),
      is_inferred: 0,
    });
  }
  return rows;
}

/**
 * Materialize the inverse edge B→A for EVERY stored edge A→B, for every
 * relation type — the JSON source stores one direction only, the
 * artifact carries both. Inverse rows get `is_inferred = 1`, the base
 * type id suffixed `.inverse`, the type's localized `inverse` labels,
 * and every qualifier/axis mirrored (ADR-037: a hidden link is equally
 * hidden in both directions).
 *
 * Dedup: when the opposite direction is ALSO stored in the JSON (known
 * double-stored symmetric edges, e.g. the `family-of` ace↔luffy pairs),
 * no inverse is materialized for either side — the two stored rows
 * already cover both directions.
 */
function materializeInverses(
  stored: readonly RelationRow[],
  catalogue: ValidatedCatalogue,
): RelationRow[] {
  const storedKeys = new Set(
    stored.map((r) => edgeKey(r.relation_type, r.source_entity_id, r.target_entity_id)),
  );
  const rows: RelationRow[] = [];
  for (const r of stored) {
    if (storedKeys.has(edgeKey(r.relation_type, r.target_entity_id, r.source_entity_id))) {
      continue; // Opposite direction is double-stored — skip the inferred copy.
    }
    rows.push({
      ...r,
      source_entity_id: r.target_entity_id,
      target_entity_id: r.source_entity_id,
      relation_type: `${r.relation_type}.inverse`,
      label: relationLabel(catalogue.relationTypes.get(r.relation_type), 'inverse'),
      is_inferred: 1,
    });
  }
  return rows;
}

function extractAppearanceRows(
  entity: LoadedEntity,
): AppearanceRow[] {
  const rows: AppearanceRow[] = [];
  const relations = entity.data['relations'];
  if (!Array.isArray(relations)) return rows;

  for (const rel of relations) {
    if (rel === null || rel === undefined || typeof rel !== 'object') continue;
    const record = rel as Record<string, unknown>;
    if (record['type'] !== 'features') continue;
    const target = asString(record['target']);
    if (target === null) continue;
    const qualifiers = record['qualifiers'];
    const qualifiersObj = qualifiers !== null && qualifiers !== undefined
        && typeof qualifiers === 'object'
      ? (qualifiers as Record<string, unknown>)
      : null;
    const appearanceType = qualifiersObj !== null
      ? (asString(qualifiersObj['appearance_type']) ?? 'full')
      : 'full';
    rows.push({
      entity_id: target,
      source_id: entity.id,
      appearance_type: appearanceType,
      is_first: 0,
      qualifiers: qualifiersObj !== null ? JSON.stringify(qualifiersObj) : null,
    });
  }
  return rows;
}

export function extract(
  entities: ReadonlyMap<string, LoadedEntity>,
  catalogue: ValidatedCatalogue,
): ExtractedRows {
  const out: ExtractedRows = {
    entities: [],
    properties: [],
    relations: [],
    appearances: [],
  };

  for (const entity of entities.values()) {
    out.entities.push(extractEntityRow(entity));
    out.properties.push(...extractPropertyRows(entity));
    out.relations.push(...extractRelationRows(entity, catalogue));
    out.appearances.push(...extractAppearanceRows(entity));
  }

  // Materialize the inverse of every stored edge (deduplicated against
  // double-stored symmetric edges). Runs after the entity loop because
  // the dedup needs the full set of stored edges.
  out.relations.push(...materializeInverses(out.relations, catalogue));

  // Derived: a container's anti-spoiler anchor comes from what it
  // CONTAINS. Runs before the canon-scope pass, which reads the anchor
  // this one may have just written.
  deriveContainerAnchors(out.entities, out.relations);

  // Derived: an entity's primary canon scope is the canon_scope declared
  // by the source where it first appears. Resolved here because it needs
  // the full entity map to look the source up.
  for (const row of out.entities) {
    if (row.first_appearance_source === null) continue;
    const source = entities.get(row.first_appearance_source);
    if (source !== undefined) {
      row.primary_canon_scope = readCanonScope(source.data);
    }
  }

  // Derived: flag the earliest appearance per entity.
  markFirstAppearances(out.appearances);

  // Stable order for deterministic builds.
  out.entities.sort((a, b) => a.id.localeCompare(b.id));
  out.properties.sort((a, b) =>
    a.entity_id.localeCompare(b.entity_id)
    || a.property_id.localeCompare(b.property_id)
    || a.entry_index - b.entry_index
  );
  out.relations.sort((a, b) =>
    a.source_entity_id.localeCompare(b.source_entity_id)
    || a.relation_type.localeCompare(b.relation_type)
    || a.target_entity_id.localeCompare(b.target_entity_id)
    || (a.since_source ?? '').localeCompare(b.since_source ?? '')
    || (a.qualifiers ?? '').localeCompare(b.qualifiers ?? '')
  );
  out.appearances.sort((a, b) =>
    a.entity_id.localeCompare(b.entity_id) || a.source_id.localeCompare(b.source_id)
  );

  return out;
}
