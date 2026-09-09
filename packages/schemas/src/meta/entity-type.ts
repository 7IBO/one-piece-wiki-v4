import { z } from 'zod';
import { LocalizedLabel, Slug } from '../primitives.ts';

export const PropertyDeclaration = z.object({
  id: Slug,
  required: z.boolean().default(false),
  /**
   * Wikipedia-style completeness tier (ADR-083): a complete article of
   * this type is expected to carry this property, but its absence is
   * never a validation error. Drives the dashboard's completeness
   * meter and the "recommended, still empty" field state. `required`
   * implies recommended — do not set both.
   */
  recommended: z.boolean().default(false),
  historical: z.boolean().default(false),
  localizable: z.boolean().default(false),
});
export type PropertyDeclaration = z.infer<typeof PropertyDeclaration>;

export const EntityTypeUiHint = z
  .object({
    icon: z.string().optional(),
    group: z.string().optional(),
    color: z.string().optional(),
  })
  .partial();

export const EntityTypeSchema = z.object({
  $schema: z.string().optional(),
  id: Slug,
  schema_version: z.number().int().positive(),
  /** Universe scope; omitted = shared core (e.g. `character`, `image`). See ADR-035. */
  universes: z.array(Slug).optional(),
  labels: LocalizedLabel,
  /**
   * Libelle COURT, pour les endroits ou le type est deja evident par le
   * contexte : un lien vers un chapitre dit « Chapter 1044 », pas
   * « Manga chapter 1044 ». Optionnel — sans lui les appelants
   * retombent sur `labels`, ce qui reste correct, seulement plus long.
   *
   * Ce n'est pas une abreviation decorative : `labels.en` doit rester
   * « Manga chapter » parce qu'un titre de page doit distinguer le
   * chapitre du manga de l'episode de l'anime. C'est en INLINE que la
   * distinction est deja portee par ce qui entoure le lien.
   */
  short_labels: LocalizedLabel.optional(),
  /**
   * Ce type a-t-il sa place dans le wiki PUBLIC (accueil, listes,
   * recherche) ? Defaut `true`.
   *
   * `streaming-platform` est l'exemple : Crunchyroll et Netflix sont
   * de la donnee de production, utile sur la fiche d'un episode (« ou
   * le regarder ») et sans aucun interet comme rubrique a parcourir.
   * Le drapeau vit au SCHEMA et non dans `apps/web` pour la meme
   * raison que tout le reste : une liste de types en dur dans le
   * template serait un id code en dur de plus.
   *
   * Ne cache RIEN d'autre : la page de l'entite existe toujours a son
   * URL, et une relation qui la cible s'affiche toujours.
   */
  public_listing: z.boolean().default(true),
  url_segment: Slug,
  properties: z.array(PropertyDeclaration),
  allowed_relations: z.array(Slug).default([]),
  /**
   * Subset of `allowed_relations` a complete article is expected to
   * carry (ADR-083) — the relation half of the completeness meter.
   * Checked against `allowed_relations` by `schema:check`.
   */
  recommended_relations: z.array(Slug).optional(),
  requires_translations: z.boolean().optional(),
  /**
   * Property ids scanned, in priority order, to resolve this type's
   * display name (the latest entry of the first present one wins). When
   * omitted, callers fall back to a code-level default (`['name',
   * 'title_key']`). This is what keeps display-name resolution
   * schema-driven rather than hardcoding property names in app code.
   */
  display_name_properties: z.array(Slug).optional(),
  ui_hint: EntityTypeUiHint.optional(),
});
export type EntityTypeSchema = z.infer<typeof EntityTypeSchema>;
