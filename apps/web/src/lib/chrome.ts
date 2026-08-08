/**
 * Chrome microcopy for the public reader app — the ONLY strings the
 * app hardcodes (navigation labels, section headings, empty states).
 * All content labels (entity types, properties, vocabularies,
 * relation directions) come from the schema catalogue / the SQLite
 * artifact, resolved server-side in `server/views.ts`.
 */
export type Locale = 'en' | 'fr';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'fr'] as const;

const STRINGS = {
  siteName: { en: 'Grand Line Archives', fr: 'Grand Line Archives' },
  tagline: {
    en: 'A spoiler-aware One Piece encyclopedia',
    fr: 'Une encyclopédie One Piece sans spoilers',
  },
  browseByType: { en: 'Browse the archive', fr: 'Parcourir les archives' },
  entitiesIndexed: { en: 'entries indexed', fr: 'entrées indexées' },
  entries: { en: 'entries', fr: 'entrées' },
  entry: { en: 'entry', fr: 'entrée' },
  properties: { en: 'Facts', fr: 'Fiche' },
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
  backHome: { en: 'Back to the archive', fr: 'Retour aux archives' },
  footerNote: {
    en:
      'Community-built, versioned by in-universe progression. One Piece © Eiichiro Oda / Shueisha.',
    fr:
      'Construit par la communauté, versionné par progression dans l’œuvre. One Piece © Eiichiro Oda / Shueisha.',
  },
  languageLabel: { en: 'Language', fr: 'Langue' },
} as const;

export type ChromeKey = keyof typeof STRINGS;

export function t(locale: Locale, key: ChromeKey): string {
  return STRINGS[key][locale];
}
