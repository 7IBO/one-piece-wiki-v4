/**
 * Schema-driven image discovery, shared by the dashboard server (`api/`)
 * and client (`src/`). Mirrors {@link ./display-name.ts} in spirit: pure,
 * dependency-free (no sqlite, no fs) so it is safe to import from both the
 * Bun server process and the Vite browser bundle.
 *
 * Two things app code must NOT hardcode (CLAUDE.md: "no property name is
 * hardcoded; all properties, relations and entity types are discovered
 * through schema files"):
 *
 *  - the property holding an image's displayable URL (`url` today), and
 *  - the relation linking an entity to its images (`depicted-by` today).
 *
 * Both are discovered from the schema instead of named literally:
 *
 *  - the URL property is the one tagged `ui_hint.role === "image_url"`
 *    (ADR-072); its `applies_to_entity_types` names the image entity
 *    type(s).
 *  - the depiction relation(s) are those whose `valid_to_types` point at
 *    an image entity type.
 *
 * The only literal here is {@link IMAGE_URL_ROLE} — the role *value* that
 * forms the ADR-072 contract, analogous to
 * {@link ./display-name.ts}'s documented default constant. It is a
 * discovery key, not a property id.
 */
import type { PropertyTypeSchema } from './meta/property-type.ts';
import type { RelationTypeSchema } from './meta/relation-type.ts';

/** Same loose shape used across the read helpers: an entity's content
 *  object, holding `properties` and `relations`. */
type EntityData = Record<string, unknown>;

/**
 * The `ui_hint.role` value marking the property that holds an image
 * entity's displayable URL. See ADR-072.
 */
export const IMAGE_URL_ROLE = 'image_url';

/** A single image depiction extracted from an entity's relations. */
export type Depiction = {
  /** Target image entity id, e.g. `image:luffy-primary-portrait`. */
  readonly imageId: string;
  /** The discovered depiction relation id (e.g. `depicted-by`). */
  readonly relationType: string;
  /** The relation qualifiers verbatim (e.g. `{ role, since, … }`). */
  readonly qualifiers: Record<string, unknown>;
};

/**
 * The property type tagged `ui_hint.role === "image_url"` (ADR-072), or
 * null when the catalogue defines none. First match wins — the contract
 * expects exactly one.
 */
export function findImageUrlProperty(
  propertyTypes: Record<string, PropertyTypeSchema>,
): PropertyTypeSchema | null {
  for (const pt of Object.values(propertyTypes)) {
    if (pt.ui_hint?.role === IMAGE_URL_ROLE) return pt;
  }
  return null;
}

/**
 * Entity types the image-URL property applies to — i.e. the "image"
 * entity type(s), discovered via the property's `applies_to_entity_types`
 * rather than the literal id. Empty when no such property exists or it is
 * unscoped.
 */
export function imageEntityTypes(
  propertyTypes: Record<string, PropertyTypeSchema>,
): readonly string[] {
  const prop = findImageUrlProperty(propertyTypes);
  return (prop?.applies_to_entity_types ?? []) as readonly string[];
}

/**
 * Relation ids whose `valid_to_types` include an image entity type — i.e.
 * the depiction relation(s) (`depicted-by` in the One Piece catalogue),
 * discovered structurally rather than by id. Empty when no image entity
 * type or no such relation exists.
 */
export function findDepictionRelationIds(
  relationTypes: Record<string, RelationTypeSchema>,
  propertyTypes: Record<string, PropertyTypeSchema>,
): readonly string[] {
  const imageTypes = new Set(imageEntityTypes(propertyTypes));
  if (imageTypes.size === 0) return [];
  const ids: string[] = [];
  for (const rt of Object.values(relationTypes)) {
    const to = rt.valid_to_types as readonly string[];
    if (to.some((t) => imageTypes.has(t))) ids.push(rt.id);
  }
  return ids;
}

/**
 * This entity's image depictions: each relation whose type is a
 * discovered depiction relation, yielding the target image id and the
 * relation qualifiers. Source order is preserved. Empty when the entity
 * has none (or the catalogue defines no depiction relation).
 */
export function depictionsOf(
  data: EntityData,
  relationTypes: Record<string, RelationTypeSchema>,
  propertyTypes: Record<string, PropertyTypeSchema>,
): readonly Depiction[] {
  const depictionIds = new Set(findDepictionRelationIds(relationTypes, propertyTypes));
  if (depictionIds.size === 0) return [];
  const relations = data['relations'];
  if (!Array.isArray(relations)) return [];
  const out: Depiction[] = [];
  for (const raw of relations) {
    if (raw === null || typeof raw !== 'object') continue;
    const rel = raw as Record<string, unknown>;
    const type = rel['type'];
    const target = rel['target'];
    if (typeof type !== 'string' || !depictionIds.has(type)) continue;
    if (typeof target !== 'string' || target.length === 0) continue;
    const qualifiers = rel['qualifiers'];
    out.push({
      imageId: target,
      relationType: type,
      qualifiers: qualifiers !== null && typeof qualifiers === 'object'
        ? qualifiers as Record<string, unknown>
        : {},
    });
  }
  return out;
}

/**
 * An image entity's displayable URL: the latest entry of the
 * `ui_hint.role === "image_url"` property (the property is historical, so
 * entries are scanned latest-first). Returns the raw stored value, which
 * may still be a `staging://` reference — resolve it for display
 * separately (see the dashboard's `resolveImageUrl`). Null when absent.
 */
export function imageUrlOf(
  imageData: EntityData,
  propertyTypes: Record<string, PropertyTypeSchema>,
): string | null {
  const prop = findImageUrlProperty(propertyTypes);
  if (prop === null) return null;
  const props = imageData['properties'];
  if (props === null || typeof props !== 'object') return null;
  const rawValue = (props as Record<string, unknown>)[prop.id];
  if (rawValue === null || rawValue === undefined) return null;
  const list = Array.isArray(rawValue) ? rawValue : [rawValue];
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    if (entry === null || typeof entry !== 'object') continue;
    const value = (entry as Record<string, unknown>)['value'];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}
