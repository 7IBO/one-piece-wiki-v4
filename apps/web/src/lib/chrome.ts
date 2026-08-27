/**
 * Chrome microcopy for the public wiki app — the ONLY strings the
 * app hardcodes (navigation labels, section headings, empty states).
 * All content labels (entity types, properties, vocabularies,
 * relation directions) come from the schema catalogue / the SQLite
 * artifact, resolved server-side in `server/views.ts`.
 */
export type Locale = 'en' | 'fr';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'fr'] as const;

const STRINGS = {
  siteName: { en: 'One Piece Wiki', fr: 'One Piece Wiki' },
  tagline: {
    en: 'A spoiler-aware One Piece encyclopedia',
    fr: 'Une encyclopédie One Piece sans spoilers',
  },
  browseByType: { en: 'Browse the wiki', fr: 'Parcourir le wiki' },
  entitiesIndexed: { en: 'entries indexed', fr: 'entrées indexées' },
  entries: { en: 'entries', fr: 'entrées' },
  entry: { en: 'entry', fr: 'entrée' },
  properties: { en: 'Facts', fr: 'Fiche' },
  history: { en: 'History', fr: 'Historique' },
  connections: { en: 'Connections', fr: 'Connexions' },
  referencedBy: { en: 'Referenced by', fr: 'Référencé par' },
  about: { en: 'About', fr: 'À propos' },
  firstAppearance: { en: 'First appearance', fr: 'Première apparition' },
  since: { en: 'since', fr: 'depuis' },
  until: { en: 'until', fr: 'jusqu’à' },
  during: { en: 'during', fr: 'pendant' },
  actually: { en: 'In truth', fr: 'En vérité' },
  autoImported: {
    en: 'Not yet reviewed by a human',
    fr: 'Pas encore relu par un humain',
  },
  emptyType: {
    en: 'Nothing catalogued under this type yet.',
    fr: 'Rien de catalogué sous ce type pour le moment.',
  },
  notFoundTitle: { en: 'Lost at sea', fr: 'Perdu en mer' },
  notFoundBody: {
    en: 'This page does not exist — or has not been logged yet.',
    fr: 'Cette page n’existe pas — ou n’a pas encore été consignée.',
  },
  backHome: { en: 'Back to the wiki', fr: 'Retour au wiki' },
  footerNote: {
    en:
      'Community-built, versioned by in-universe progression. One Piece © Eiichiro Oda / Shueisha.',
    fr:
      'Construit par la communauté, versionné par progression dans l’œuvre. One Piece © Eiichiro Oda / Shueisha.',
  },
  languageLabel: { en: 'Language', fr: 'Langue' },

  // Spoiler cursor
  setProgress: { en: 'Set my progress', fr: 'Définir ma progression' },
  progressTitle: { en: 'My progress', fr: 'Ma progression' },
  progressHint: {
    en: 'Everything beyond these points is hidden across the wiki.',
    fr: 'Tout ce qui dépasse ces repères est masqué sur tout le wiki.',
  },
  progressManga: { en: 'Manga chapter', fr: 'Chapitre (manga)' },
  progressAnime: { en: 'Anime episode', fr: 'Épisode (anime)' },
  progressSave: { en: 'Save', fr: 'Enregistrer' },
  progressReset: { en: 'Show everything', fr: 'Tout afficher' },
  chapterShort: { en: 'Ch.', fr: 'Ch.' },
  episodeShort: { en: 'Ep.', fr: 'Ép.' },
  bannerTitle: { en: 'Dodge the spoilers', fr: 'Éviter les spoilers' },
  bannerBody: {
    en:
      'Tell the wiki where you are in the manga or the anime and every page hides what happens later.',
    fr:
      'Indique au wiki où tu en es dans le manga ou l’anime : chaque page masquera ce qui arrive ensuite.',
  },
  bannerDismiss: { en: 'Later', fr: 'Plus tard' },
  gatedTitle: {
    en: 'Not yet in your progress',
    fr: 'Pas encore dans ta progression',
  },
  gatedBody: {
    en:
      'This entry only appears beyond your current progress. Keep reading — or raise your cursor.',
    fr:
      'Cette entrée n’apparaît qu’au-delà de ta progression actuelle. Continue ta lecture — ou avance ton curseur.',
  },

  // Per-type sections
  affiliations: { en: 'Affiliations', fr: 'Affiliations' },
  otherMembers: { en: 'Other members', fr: 'Autres membres' },
  formerMembers: { en: 'Former members', fr: 'Anciens membres' },
  currentUsers: { en: 'Current users', fr: 'Utilisateurs actuels' },
  formerUsers: { en: 'Former users', fr: 'Anciens utilisateurs' },
  cast: { en: 'Appearing in this source', fr: 'Présents dans cette source' },
  availability: { en: 'Where to read / watch', fr: 'Où lire / regarder' },
  previous: { en: 'Previous', fr: 'Précédent' },
  next: { en: 'Next', fr: 'Suivant' },
  chapters: { en: 'Chapters', fr: 'Chapitres' },
  episodes: { en: 'Episodes', fr: 'Épisodes' },
  arcs: { en: 'Arcs', fr: 'Arcs' },
  role: { en: 'Role', fr: 'Rôle' },
  rank: { en: 'Rank', fr: 'Grade' },

  // Contribute strip + footer
  contributeLead: { en: 'This data is open —', fr: 'Ces données sont libres —' },
  contributeEdit: { en: 'View / edit the data', fr: 'Voir / modifier les données' },
  contributeHistory: { en: 'History', fr: 'Historique' },
  footerContribute: { en: 'Contribute', fr: 'Contribuer' },
  footerSupport: { en: 'Support', fr: 'Soutenir' },

  // v6 "La Gazette" additions (append-only)
  members: { en: 'Members', fr: 'Membres' },

  // v7 "Vignette" additions (append-only). `#` is replaced by a count.
  formerTag: { en: 'Former', fr: 'Ancien' },
  showNMore: { en: 'Show # more', fr: 'Voir les # autres' },
  showLess: { en: 'Show less', fr: 'Réduire' },

  // v9 per-type layouts (append-only).
  dataSheet: { en: 'Data', fr: 'Fiche' },
  appearances: { en: 'Appearances', fr: 'Apparitions' },
  gallery: { en: 'Gallery', fr: 'Galerie' },
  outOf: { en: 'of', fr: 'sur' },
  contents: { en: 'Contents', fr: 'Contenu' },

  // Search (ADR-108, append-only).
  searchLabel: { en: 'Search the wiki', fr: 'Rechercher dans le wiki' },
  searchPlaceholder: { en: 'Search…', fr: 'Rechercher…' },
  searchSubmit: { en: 'Search', fr: 'Rechercher' },
  searchTitle: { en: 'Search', fr: 'Recherche' },
  searchLead: {
    en: 'Names, epithets, titles — in English or in French, typos forgiven.',
    fr: 'Noms, surnoms, titres — en français ou en anglais, fautes pardonnées.',
  },
  searchPrompt: {
    en: 'Type a name to search the wiki.',
    fr: 'Tape un nom pour chercher dans le wiki.',
  },
  searchResults: { en: 'results', fr: 'résultats' },
  searchResult: { en: 'result', fr: 'résultat' },
  searchApproximate: {
    en: 'No exact match — showing the closest entries.',
    fr: 'Aucune correspondance exacte — voici les entrées les plus proches.',
  },
  searchEmpty: {
    en: 'Nothing found. Check the spelling — or it may lie beyond your progress.',
    fr:
      'Aucun résultat. Vérifie l’orthographe — ou cela se trouve peut-être au-delà de ta progression.',
  },

  // Entity sub-pages (ADR-110, append-only).
  sectionOverview: { en: 'Overview', fr: 'Vue d’ensemble' },
  emptySection: {
    en: 'Nothing under this section yet.',
    fr: 'Rien dans cette section pour le moment.',
  },
} as const;

export type ChromeKey = keyof typeof STRINGS;

export function t(locale: Locale, key: ChromeKey): string {
  return STRINGS[key][locale];
}
