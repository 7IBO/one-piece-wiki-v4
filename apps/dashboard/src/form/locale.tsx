/**
 * UI locale for the dashboard. Drives both the chrome language
 * (entity-type labels, enum labels, property labels, source titles…)
 * AND the active translation field in the form. A header switcher
 * lets the maintainer toggle without leaving the page.
 *
 * Initial value: localStorage if set, else browser language, else `en`.
 * Persisted to localStorage on every change so the choice survives
 * reloads.
 */
import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export type Locale = 'en' | 'fr';
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'fr'] as const;

const STORAGE_KEY = 'dashboard.locale';

function detectInitialLocale(): Locale {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'fr') return stored;
    } catch {
      // localStorage unavailable; fall through.
    }
  }
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('fr')) return 'fr';
  return 'en';
}

type LocaleContextValue = {
  readonly locale: Locale;
  readonly setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {/* no-op default; replaced by Provider */},
});

export function LocaleProvider({ children }: { children: ReactNode; }): JSX.Element {
  // HYDRATION: the first client render MUST match the server-rendered
  // HTML ('en' — the server can't see localStorage). Seeding useState
  // from localStorage made the hydration render diverge ('fr'), and
  // React does NOT patch attribute mismatches (aria-pressed,
  // className…) during hydration — the header switcher stayed frozen
  // on EN while the app state was 'fr', so clicking FR no-oped.
  // Detect the stored/browser locale in a post-hydration effect
  // instead; the setState re-renders everything through React and the
  // DOM ends up consistent (at the cost of a one-frame 'en' flash).
  const [locale, setLocaleState] = useState<Locale>('en');
  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore quota / privacy mode
    }
  }, []);
  useEffect(() => {
    // Mirror the active locale to <html lang> so screen readers and
    // browser autofill pick the right language.
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}

export function useSetLocale(): (next: Locale) => void {
  return useContext(LocaleContext).setLocale;
}

/**
 * Tiny in-line dictionary for chrome strings that form widgets need
 * (placeholders, button labels). We deliberately avoid a full i18n
 * runtime — the dictionary is small and lives alongside the code
 * that uses it.
 */
const UI_STRINGS = {
  queueTitle: { en: 'Moderation queue', fr: 'File de modération' },
  queueOpenPRs: { en: 'open PR(s)', fr: 'PR ouverte(s)' },
  queueAdminOnly: {
    en: 'Admin only — sign in with an admin GitHub account to moderate contributions.',
    fr: 'Réservé aux admins — connectez-vous avec un compte GitHub admin pour modérer.',
  },
  queueRefresh: { en: 'Refresh', fr: 'Rafraîchir' },
  queueEmpty: {
    en: 'No open contributions. The queue is clear 🎉',
    fr: 'Aucune contribution ouverte. La file est vide 🎉',
  },
  queueReview: { en: 'Review', fr: 'Examiner' },
  queueApprove: { en: 'Approve & merge', fr: 'Approuver et fusionner' },
  queueReject: { en: 'Reject', fr: 'Rejeter' },
  queueWorking: { en: 'Working…', fr: 'En cours…' },
  queueApproved: { en: 'PR #{n} merged.', fr: 'PR #{n} fusionnée.' },
  queueRejected: { en: 'PR #{n} closed.', fr: 'PR #{n} fermée.' },
  queueOpenOnGithub: { en: 'Open on GitHub', fr: 'Ouvrir sur GitHub' },
  queueConfirmApproveTitle: {
    en: 'Approve & merge PR #{n}?',
    fr: 'Approuver et fusionner la PR #{n} ?',
  },
  queueConfirmApproveBody: {
    en: '“{title}” will be merged into the data repository.',
    fr: '« {title} » sera fusionnée dans le dépôt de données.',
  },
  queueConfirmRejectTitle: { en: 'Reject PR #{n}?', fr: 'Rejeter la PR #{n} ?' },
  queueConfirmRejectBody: {
    en: '“{title}” will be closed and its staged images deleted.',
    fr: '« {title} » sera fermée et ses images en attente supprimées.',
  },
  queueDetailEmpty: {
    en: 'No structured data change in this PR.',
    fr: 'Aucun changement de données structurées dans cette PR.',
  },
  queueDetailTranslations: { en: 'Translations', fr: 'Traductions' },
  pickOne: { en: '— pick one —', fr: '— choisir —' },
  pickSource: { en: '— pick a source —', fr: '— choisir une source —' },
  noMatch: { en: 'No match.', fr: 'Aucun résultat.' },
  loading: { en: 'Loading…', fr: 'Chargement…' },
  addEntry: { en: 'Add entry', fr: 'Ajouter une entrée' },
  setValue: { en: 'Set value', fr: 'Définir une valeur' },
  moreOptions: { en: 'More options', fr: 'Plus d’options' },
  translations: { en: 'Translations', fr: 'Traductions' },
  translationsFor: { en: 'Translations of', fr: 'Traductions de' },
  use: { en: 'Use', fr: 'Utiliser' },
  cancel: { en: 'Cancel', fr: 'Annuler' },
  done: { en: 'Done', fr: 'Terminé' },
  search: { en: 'Search…', fr: 'Rechercher…' },
  // Home page
  homeTitle: { en: 'Entity types', fr: 'Types d’entités' },
  homeSubtitle: {
    en: 'pick one to browse and edit entities.',
    fr: 'choisissez-en un à parcourir et éditer.',
  },
  entitiesWord: { en: 'entities', fr: 'entités' },
  entityWord: { en: 'entity', fr: 'entité' },
  ofWord: { en: 'of', fr: 'sur' },
  emptyTypesSection: { en: 'Empty types ({n})', fr: 'Types vides ({n})' },
  noEntitiesYet: {
    en: 'No entities of this type yet.',
    fr: 'Aucune entité de ce type pour l’instant.',
  },
  createFirstEntity: { en: 'Create the first one', fr: 'Créer la première entrée' },
  noMatchSearch: {
    en: 'No match — try a different search.',
    fr: 'Aucun résultat — essayez une autre recherche.',
  },
  // New-entity page + slug input
  newEntityLabel: { en: 'New:', fr: 'Nouveau :' },
  draftLabel: { en: 'draft', fr: 'brouillon' },
  nameEnglish: { en: 'Name (English)', fr: 'Nom (anglais)' },
  namePlaceholder: { en: 'e.g. Monkey D. Luffy', fr: 'ex. Monkey D. Luffy' },
  nameFromSlugHelp: {
    en: 'The slug below is derived from this name automatically — you can override it.',
    fr: 'Le slug ci-dessous est dérivé de ce nom automatiquement — vous pouvez le modifier.',
  },
  newGateName: {
    en: "Type the entity's name above to start editing its properties and relations.",
    fr: 'Saisissez le nom de l’entité ci-dessus pour éditer ses propriétés et relations.',
  },
  newGateSlug: {
    en: 'Pick a valid, unused slug above to continue.',
    fr: 'Choisissez un slug valide et libre ci-dessus pour continuer.',
  },
  newPrBannerPre: { en: 'Opened PR', fr: 'PR ouverte' },
  newPrBannerPost: {
    en: '. Your entry will appear in the catalogue once it’s merged and Vercel redeploys.',
    fr: '. Votre entrée apparaîtra dans le catalogue une fois la PR fusionnée et Vercel redéployé.',
  },
  nothingToSaveYet: { en: 'Nothing to save yet.', fr: 'Rien à enregistrer pour le moment.' },
  createPrOpened: { en: 'Create PR opened', fr: 'PR de création ouverte' },
  slugLabel: { en: 'Slug', fr: 'Slug' },
  slugPlaceholder: { en: 'e.g. monkey-d-luffy', fr: 'ex. monkey-d-luffy' },
  slugRequired: {
    en: 'Required. URL-safe identifier — e.g. `monkey-d-luffy`.',
    fr: 'Requis. Identifiant compatible URL — ex. `monkey-d-luffy`.',
  },
  slugInvalidFormat: {
    en: 'Use lowercase letters, digits, and `-` or `_` between them.',
    fr: 'Lettres minuscules, chiffres et `-` ou `_` entre eux.',
  },
  slugChecking: { en: 'Checking availability…', fr: 'Vérification de la disponibilité…' },
  slugTaken: {
    en: 'This slug is already taken for this type.',
    fr: 'Ce slug est déjà utilisé pour ce type.',
  },
  slugLookupFailed: {
    en: 'Couldn’t verify uniqueness — the server will re-check on save.',
    fr: 'Impossible de vérifier l’unicité — le serveur revérifiera à l’enregistrement.',
  },
  slugWillSaveAs: { en: 'Will be saved as', fr: 'Sera enregistré comme' },
  // Property nav
  propertiesHeader: { en: 'Properties', fr: 'Propriétés' },
  filledProgress: { en: 'filled', fr: 'remplies' },
  requiredMissing: { en: 'required missing', fr: 'requis manquants' },
  completenessLabel: { en: 'of a complete article', fr: 'd’un article complet' },
  recommendedTag: { en: 'Recommended', fr: 'Recommandé' },
  entryWord: { en: 'Entry', fr: 'Entrée' },
  missingValue: { en: 'missing value', fr: 'valeur manquante' },
  invalidValue: { en: 'invalid value', fr: 'valeur invalide' },
  notSet: { en: 'not set', fr: 'non défini' },
  coherenceAdvisories: { en: 'Coherence checks', fr: 'Vérifications de cohérence' },
  incompleteEntriesExcluded: {
    en: 'Incomplete entries are kept as a draft and left out of the PR until finished.',
    fr:
      'Les entrées incomplètes restent en brouillon et sont exclues de la PR tant qu’elles ne sont pas terminées.',
  },
  required: { en: 'required', fr: 'requis' },
  optional: { en: 'optional', fr: 'optionnel' },
  // Anonymous nickname (used on the /login page now that identity
  // is captured server-side, not per-form)
  nickname: { en: 'Nickname', fr: 'Pseudo' },
  nicknamePlaceholder: { en: 'Your name', fr: 'Votre pseudo' },
  nicknameHelp: {
    en: 'Shown on the PR. No GitHub account needed.',
    fr: 'Affiché sur la PR. Pas besoin de compte GitHub.',
  },
  signInToSave: {
    en: 'Sign in to save',
    fr: 'Connectez-vous pour sauvegarder',
  },
  // Login page
  loginTitle: { en: 'Contribute to the wiki', fr: 'Contribuer au wiki' },
  loginExplainer: {
    en:
      'Every edit becomes a Pull Request on GitHub, reviewed by a maintainer before publication. Pick how you want to be credited — you can come back later to see, modify, or abandon your contributions.',
    fr:
      'Chaque modification devient une Pull Request sur GitHub, examinée par un mainteneur avant publication. Choisissez comment apparaître — vous pourrez revenir plus tard pour voir, modifier ou abandonner vos contributions.',
  },
  loginAnonymousTitle: { en: 'With a nickname', fr: 'Avec un pseudo' },
  loginAnonymousSubtitle: {
    en: 'No GitHub account needed. Pick a name; it will appear on your PRs.',
    fr: 'Pas besoin de compte GitHub. Choisissez un pseudo ; il apparaîtra sur vos PRs.',
  },
  loginAnonymousCta: { en: 'Continue', fr: 'Continuer' },
  loginAnonymousFootnote: {
    en: 'Keep the same nickname on each visit to find your in-progress contributions again.',
    fr: 'Gardez le même pseudo à chaque visite pour retrouver vos contributions en cours.',
  },
  loginGithubTitle: { en: 'With GitHub', fr: 'Avec GitHub' },
  loginGithubSubtitle: {
    en: 'Sign in with your GitHub account. Your @handle will be mentioned on the PRs you open.',
    fr:
      'Connectez-vous avec votre compte GitHub. Votre @handle sera mentionné sur les PRs que vous ouvrez.',
  },
  loginGithubCta: { en: 'Sign in with GitHub', fr: 'Se connecter avec GitHub' },
  loginGithubFootnote: {
    en: 'Maintainers (the admin allow-list) also approve PRs and promote images.',
    fr: 'Les mainteneurs (liste autorisée) valident aussi les PRs et publient les images.',
  },
  loginContinueReadOnly: {
    en: 'Continue without signing in',
    fr: 'Continuer sans se connecter',
  },
  loginReadOnlyHint: {
    en: 'You can browse everything; saving requires a session.',
    fr: 'Vous pouvez tout consulter ; sauvegarder nécessite une connexion.',
  },
  nicknameRequired: { en: 'Please type a nickname.', fr: 'Saisissez un pseudo.' },
  signingIn: { en: 'Signing in…', fr: 'Connexion…' },
  signedInToastTitle: { en: 'Signed in.', fr: 'Connecté.' },
  validationFailed: {
    en: 'Validation failed',
    fr: 'Validation échouée',
  },
  // My contributions panel
  contributionsTitle: { en: 'Your open contributions', fr: 'Vos contributions en cours' },
  contributionsSubtitle: {
    en: 'Pull Requests you opened that are still awaiting review.',
    fr: 'Pull Requests que vous avez ouvertes et qui attendent une revue.',
  },
  contributionsRefresh: { en: 'Refresh', fr: 'Rafraîchir' },
  contributionsOpenPr: { en: 'Open the PR on GitHub', fr: 'Ouvrir la PR sur GitHub' },
  // Resume editing
  resumePRBanner: {
    en:
      'Resuming your in-progress PR #{n}. Every save will add a commit to it instead of opening a new PR.',
    fr:
      "Reprise de votre PR #{n} en cours. Chaque sauvegarde ajoute un commit dessus au lieu d'ouvrir une nouvelle PR.",
  },
  toastPrOpened: { en: 'PR #{n} opened', fr: 'PR #{n} ouverte' },
  toastCommitAdded: {
    en: 'Commit added to PR #{n}',
    fr: 'Commit ajouté à la PR #{n}',
  },
  toastNoOp: {
    en: "Nothing to save — the entity already matches what's on the repo.",
    fr: "Rien à enregistrer — l'entité correspond déjà à ce qui est sur le repo.",
  },
  // Section labels (FORM_SECTIONS)
  sectionIdentity: { en: 'Identity & naming', fr: 'Identité & noms' },
  sectionNumbers: { en: 'Numbers', fr: 'Nombres' },
  sectionDates: { en: 'Dates & sources', fr: 'Dates & sources' },
  sectionCategorical: { en: 'Categorical', fr: 'Catégoriel' },
  sectionBoolean: { en: 'Yes / no', fr: 'Oui / non' },
  sectionReferences: { en: 'References', fr: 'Références' },
  sectionOther: { en: 'Other', fr: 'Autres' },
  sectionRelations: { en: 'Relations', fr: 'Relations' },
  fieldsSingular: { en: 'field', fr: 'champ' },
  fieldsPlural: { en: 'fields', fr: 'champs' },
  // Form chrome
  showSchemaDetails: { en: 'Show schema details', fr: 'Voir les détails du schéma' },
  hideSchemaDetails: { en: 'Hide schema details', fr: 'Masquer les détails du schéma' },
  addProperty: { en: 'Add property', fr: 'Ajouter une propriété' },
  available: { en: 'available', fr: 'disponibles' },
  noProperties: {
    en: 'No properties yet — pick one from the sidebar to start.',
    fr: 'Aucune propriété — choisissez-en une dans la barre latérale.',
  },
  // Relations
  relations: { en: 'Relations', fr: 'Relations' },
  total: { en: 'total', fr: 'au total' },
  noRelations: {
    en: 'No relations yet — pick a type below to add one.',
    fr: 'Aucune relation — choisissez un type ci-dessous.',
  },
  addRelation: { en: 'Add relation', fr: 'Ajouter une relation' },
  typesAvailable: { en: 'types available', fr: 'types disponibles' },
  // Save bar / drawer footer
  unsavedChanges: { en: 'Unsaved changes', fr: 'Modifications non sauvegardées' },
  saveShortcut: { en: '⌘S to save', fr: '⌘S pour sauvegarder' },
  sections: { en: 'Sections', fr: 'Sections' },
  jumpToSection: { en: 'Jump to a section', fr: 'Aller à une section' },
  apparitionSearchPlaceholder: {
    en: 'Filter by chapter / episode / slug…',
    fr: 'Filtrer par chapitre / épisode / slug…',
  },
  removeAll: { en: 'Remove all', fr: 'Tout retirer' },
  confirmRemoveAll: { en: 'Remove all {n}?', fr: 'Retirer les {n} ?' },
  rangeView: { en: 'Range view', fr: 'Vue par plages' },
  chipView: { en: 'List view', fr: 'Vue par liste' },
  rangeHint: {
    en: 'Comma-separated numbers and `A-B` ranges. Example: 1, 5-10, 96, 432-450.',
    fr: 'Nombres et plages `A-B` séparés par des virgules. Exemple : 1, 5-10, 96, 432-450.',
  },
  applyRange: { en: 'Apply', fr: 'Appliquer' },
  noChanges: { en: 'No changes', fr: 'Aucune modification' },
  openingPr: { en: 'Opening PR…', fr: 'Ouverture de la PR…' },
  openPr: { en: 'Open PR', fr: 'Ouvrir une PR' },
  saveAndOpenPr: { en: 'Save & open PR', fr: 'Sauvegarder & ouvrir une PR' },
  saving: { en: 'Saving…', fr: 'Sauvegarde…' },
  // Draft banner
  unsavedDraft: {
    en: 'Unsaved draft.',
    fr: 'Brouillon non sauvegardé.',
  },
  // Cross-page drafts surface (home section + per-type list indicator)
  draftsTitle: { en: 'Drafts in progress', fr: 'Brouillons en cours' },
  draftsSubtitle: {
    en: 'Local edits not yet sent as a PR. Stored in this browser.',
    fr: 'Modifications locales non envoyées en PR. Stockées dans ce navigateur.',
  },
  draftsResume: { en: 'Resume', fr: 'Reprendre' },
  draftsThisType: {
    en: '{n} draft(s) in this type — click any row to resume.',
    fr: '{n} brouillon(s) dans ce type — cliquez pour reprendre.',
  },
  draftBadge: { en: 'Draft', fr: 'Brouillon' },
  savedAt: { en: 'Saved', fr: 'Sauvegardé' },
  discard: { en: 'Discard', fr: 'Annuler' },
  restore: { en: 'Restore', fr: 'Restaurer' },
  discardAllTitle: { en: 'Discard all drafts?', fr: 'Abandonner tous les brouillons ?' },
  discardAllBody: {
    en: 'This permanently deletes {n} local draft(s) from this browser. This cannot be undone.',
    fr:
      'Cela supprime définitivement {n} brouillon(s) de ce navigateur. Cette action est irréversible.',
  },
  discardAllConfirm: { en: 'Discard all', fr: 'Tout abandonner' },
  draftDiscarded: { en: 'Draft discarded.', fr: 'Brouillon abandonné.' },
  undo: { en: 'Undo', fr: 'Annuler' },
  // Drawer / linked entity
  fullPage: { en: 'Full page', fr: 'Page complète' },
  editingType: { en: 'Editing', fr: 'Édition de' },
  close: { en: 'Close', fr: 'Fermer' },
  // Source picker extras
  otherSourceType: { en: 'Other source type', fr: 'Autre type de source' },
  // Suggestion fallback
  fromSlug: { en: 'from slug', fr: 'depuis le slug' },
  // Aria
  editLinked: {
    en: 'Edit linked entity in a side panel',
    fr: 'Éditer l’entité liée dans un panneau',
  },
  removeEntry: { en: 'Remove entry', fr: 'Supprimer l’entrée' },
  removeRelation: { en: 'Remove relation', fr: 'Supprimer la relation' },
  // Qualifier labels (base + common). Keys map 1:1 to qualifier ids.
  qSince: { en: 'Since', fr: 'Depuis' },
  qUntil: { en: 'Until', fr: 'Jusqu’à' },
  qSource: { en: 'Source', fr: 'Source' },
  qTarget: { en: 'Target', fr: 'Cible' },
  qCanonScope: { en: 'Canon scope', fr: 'Portée canon' },
  qInUniverseDate: { en: 'In-universe date', fr: 'Date in-universe' },
  qEpistemicStatus: { en: 'Epistemic status', fr: 'Statut épistémique' },
  qActualValue: { en: 'Actual value', fr: 'Valeur réelle' },
  qEvent: { en: 'Event', fr: 'Évènement' },
  qBelievedBy: { en: 'Believed by', fr: 'Cru par' },
  qKnownTruthBy: { en: 'Known truth by', fr: 'Vérité connue par' },
  qAssistedBy: { en: 'Assisted by', fr: 'Assisté par' },
  qReviewStatus: { en: 'Review status', fr: 'Statut de revue' },
  qRole: { en: 'Role', fr: 'Rôle' },
  qLoyaltyStatus: { en: 'Loyalty', fr: 'Loyauté' },
  qAppearanceType: { en: 'Appearance', fr: 'Apparition' },
  qNameType: { en: 'Name type', fr: 'Type de nom' },
  qGivenBy: { en: 'Given by', fr: 'Donné par' },
  qContext: { en: 'Context', fr: 'Contexte' },
  qIssuedBy: { en: 'Issued by', fr: 'Émis par' },
  qCoverage: { en: 'Coverage', fr: 'Couverture' },
  qPropertyName: { en: 'Property name', fr: 'Nom de la propriété' },
  // Entity list page (toolbar, rows, completeness meter)
  sortBy: { en: 'Sort by', fr: 'Trier par' },
  sortByName: { en: 'Name', fr: 'Nom' },
  sortBySlug: { en: 'Slug', fr: 'Slug' },
  sortById: { en: 'ID', fr: 'ID' },
  sortAscending: { en: 'Sort ascending', fr: 'Tri croissant' },
  sortDescending: { en: 'Sort descending', fr: 'Tri décroissant' },
  newButton: { en: 'New', fr: 'Nouveau' },
  searchEntitiesPlaceholder: {
    en: 'Search by name, slug or id…',
    fr: 'Rechercher par nom, slug ou id…',
  },
  completenessOf: {
    en: '{filled} of {expected} recommended fields filled',
    fr: '{filled} champs recommandés remplis sur {expected}',
  },
  completeWord: { en: 'complete', fr: 'complet' },
  // Bulk table view
  tableView: { en: 'Table view', fr: 'Vue tableau' },
  columns: { en: 'Columns', fr: 'Colonnes' },
  pickColumns: { en: 'Pick columns', fr: 'Choisir les colonnes' },
  entity: { en: 'Entity', fr: 'Entité' },
  empty: { en: 'empty', fr: 'vide' },
  editInFullForm: { en: 'Edit in full form', fr: 'Éditer dans le formulaire complet' },
  notEditableInline: { en: 'Not editable inline', fr: 'Non éditable en ligne' },
  bulkSavePending: { en: 'unsaved changes', fr: 'modifications non sauvegardées' },
  bulkSaveAll: { en: 'Save all', fr: 'Tout sauvegarder' },
  bulkSavingProgress: { en: 'Saving', fr: 'Sauvegarde' },
  bulkSaveDone: { en: 'PRs opened', fr: 'PRs ouvertes' },
  bulkSaveFailed: { en: 'Some saves failed', fr: 'Certaines sauvegardes ont échoué' },
  noColumnsSelected: {
    en: 'Pick at least one column to show.',
    fr: 'Choisissez au moins une colonne à afficher.',
  },
  resetCell: { en: 'Reset', fr: 'Réinitialiser' },
  // Apparitions hub (ADR-021) — both per-source cast manager and
  // per-entity apparitions sub-page.
  apparitionsTitle: { en: 'Apparitions of {slug}', fr: 'Apparitions de {slug}' },
  apparitionsButton: { en: 'Apparitions', fr: 'Apparitions' },
  apparitionsCountTotal: { en: '{n} total', fr: '{n} au total' },
  apparitionsEmpty: {
    en: 'No apparitions recorded yet.',
    fr: 'Aucune apparition enregistrée pour le moment.',
  },
  apparitionsNotApplicable: {
    en: "{type} entities don't carry apparitions — `appears-in` doesn't accept them as origin.",
    fr:
      "Les entités {type} ne portent pas d'apparitions — la relation `appears-in` ne les accepte pas comme origine.",
  },
  apparitionsHint: {
    en: 'Add or remove apparitions below — saving opens a single PR editing this entity.',
    fr:
      'Ajoutez ou supprimez des apparitions ci-dessous — la sauvegarde ouvre une seule PR sur cette entité.',
  },
  castTitle: { en: 'Cast — {slug}', fr: 'Distribution — {slug}' },
  castManage: { en: 'Manage cast', fr: 'Gérer la distribution' },
  castEditSource: { en: 'Edit source', fr: 'Éditer la source' },
  castSaveHint: {
    en: 'One PR per save will be opened, touching every entity whose apparitions change.',
    fr: 'Une PR par sauvegarde sera ouverte, touchant chaque entité dont les apparitions changent.',
  },
  castNoneOfType: { en: 'No {type} listed yet.', fr: 'Aucun(e) {type} pour le moment.' },
  castDiffSummary: {
    en: '{add} to add · {remove} to remove',
    fr: '{add} à ajouter · {remove} à supprimer',
  },
  reset: { en: 'Reset', fr: 'Annuler' },
  saveCast: { en: 'Save cast', fr: 'Sauvegarder la distribution' },
  saveApparitions: { en: 'Save apparitions', fr: 'Sauvegarder les apparitions' },
  // `saving` + `openPr` already defined earlier in the table (used by
  // the entity edit save flow). Reused here for the cast / apparitions
  // toasts so the contributor sees consistent copy.
  nothingChanged: { en: 'Nothing changed.', fr: 'Aucun changement.' },
  saveFailed: { en: 'Save failed: {message}', fr: 'Échec de la sauvegarde : {message}' },
  castPrOpened: { en: 'Cast PR opened (#{n})', fr: 'PR de distribution ouverte (#{n})' },
  apparitionsPrOpened: {
    en: 'Apparitions PR opened (#{n})',
    fr: "PR d'apparitions ouverte (#{n})",
  },
  removeFromCast: { en: 'Remove from cast', fr: 'Retirer de la distribution' },
  removeApparition: { en: 'Remove apparition', fr: 'Retirer cette apparition' },
  apparitionsOtherGroup: { en: 'Other', fr: 'Autres' },
  apparitionAdded: { en: 'added', fr: 'ajouté' },
  apparitionRemoved: { en: 'removed', fr: 'retiré' },
  openEntityPage: { en: 'Open the entity page', fr: 'Ouvrir la page de l’entité' },
  backToEntity: { en: 'Back to entity', fr: "Retour à l'entité" },
  appearsInMissing: {
    en: 'The `appears-in` relation schema is missing or has no `valid_from_types`.',
    fr: "Le schéma `appears-in` est absent ou n'a pas de `valid_from_types`.",
  },
  // Header locale switcher
  interfaceLanguage: { en: 'Interface language', fr: 'Langue de l’interface' },
  // Entity header — link to the entity file's GitHub commit history
  history: { en: 'History', fr: 'Historique' },
  notOnGithubYet: { en: 'not on GitHub yet', fr: 'pas encore sur GitHub' },
  // Entity links panel (all links of an entity + inverse coherence)
  linksPanelTitle: { en: 'All links', fr: 'Tous les liens' },
  linksPanelCounts: {
    en: '{in} incoming · {out} outgoing',
    fr: '{in} entrants · {out} sortants',
  },
  linksIncomingTitle: { en: 'Incoming links', fr: 'Liens entrants' },
  linksOutgoingTitle: { en: 'Outgoing links', fr: 'Liens sortants' },
  linksIncomingEmpty: { en: 'No incoming links.', fr: 'Aucun lien entrant.' },
  linksOutgoingEmpty: { en: 'No outgoing links.', fr: 'Aucun lien sortant.' },
  linksConflictsTitle: {
    en: '{n} coherence issue(s) between relations and their inverses',
    fr: '{n} incohérence(s) entre relations et leurs inverses',
  },
  linksConflictDuplicateSymmetric: {
    en: 'Relation stored on both sides',
    fr: 'Relation stockée des deux côtés',
  },
  linksConflictDuplicateEdge: {
    en: 'Duplicate relation entry',
    fr: 'Entrée de relation dupliquée',
  },
  linksConflictQualifierMismatch: {
    en: 'The two sides disagree on “since”',
    fr: 'Les deux côtés divergent sur « since »',
  },
  // Both-directions storage is an informative note, not an error: the
  // pipeline generates inverses, so a missing opposite is BY DESIGN.
  linksSymmetricInfoTitle: {
    en: '{n} link(s) stored in both directions',
    fr: '{n} lien(s) stocké(s) dans les deux sens',
  },
  linksSymmetricInfoNote: {
    en: 'Storing one direction is enough — the inverse link is generated automatically, '
      + 'so a missing opposite is never an error. These links are saved on both entities; '
      + 'the duplicate side can be removed.',
    fr: 'Stocker une seule direction suffit — le lien inverse est généré automatiquement, '
      + 'un opposé manquant n’est donc jamais une erreur. Ces liens sont enregistrés sur les '
      + 'deux entités ; le doublon peut être supprimé.',
  },
  linksEditHere: { en: 'Edit this relation', fr: 'Modifier cette relation' },
  linksEditOnOther: {
    en: 'Stored on the linked entity — edit there',
    fr: 'Stocké sur l’entité liée — modifier là-bas',
  },
  // Cross-type data explorer (/explore)
  exploreTitle: { en: 'Explore', fr: 'Explorer' },
  exploreSubtitle: {
    en: 'Every entity across all types — values, gaps, audit issues.',
    fr: 'Toutes les entités, tous types confondus — valeurs, manques, problèmes d’audit.',
  },
  exploreTypesFilter: { en: 'Types', fr: 'Types' },
  exploreAllTypes: { en: 'All types', fr: 'Tous les types' },
  exploreMissingTranslationsToggle: {
    en: 'Missing translations',
    fr: 'Traductions manquantes',
  },
  exploreMissingValuesToggle: { en: 'Missing values', fr: 'Valeurs manquantes' },
  exploreHideCompleteToggle: { en: 'Hide complete', fr: 'Masquer les complets' },
  exploreMissingTranslationsBadge: {
    en: '{n} missing translation(s)',
    fr: '{n} traduction(s) manquante(s)',
  },
  exploreMissingValuesBadge: {
    en: '{n} missing value(s)',
    fr: '{n} valeur(s) manquante(s)',
  },
  exploreValuesHeader: { en: 'Values', fr: 'Valeurs' },
  exploreNoValues: { en: 'No values recorded.', fr: 'Aucune valeur enregistrée.' },
  exploreEmptyFiltered: {
    en: 'No entity matches the current filters.',
    fr: 'Aucune entité ne correspond aux filtres.',
  },
  exploreClearFilters: { en: 'Clear filters', fr: 'Réinitialiser les filtres' },
  exploreToggleDetails: { en: 'Toggle details', fr: 'Afficher/masquer le détail' },
  // In-app entity history page (/types/$type/$slug/history)
  historyViewOnGithub: { en: 'View on GitHub', fr: 'Voir sur GitHub' },
  historyCommitCount: { en: '{n} commit(s)', fr: '{n} commit(s)' },
  historyEmpty: {
    en: 'No commits touch this entity yet.',
    fr: 'Aucun commit ne touche cette entité pour le moment.',
  },
  historyUnavailableDev: {
    en: 'History requires the GitHub connection — unavailable in dev.',
    fr: "L'historique nécessite la connexion GitHub — indisponible en dev.",
  },
  historyOpenCommit: {
    en: 'Open this commit on GitHub',
    fr: 'Ouvrir ce commit sur GitHub',
  },
  // /explore v2 — property-column picker + inline editing
  explorePropsFilter: { en: 'Displayed properties', fr: 'Propriétés affichées' },
  exploreEditValue: { en: 'Edit value', fr: 'Modifier la valeur' },
  exploreNotApplicable: {
    en: 'Not applicable to this entity type',
    fr: 'Non applicable à ce type d’entité',
  },
  exploreSaveChanges: {
    en: 'Save {n} change(s)',
    fr: 'Enregistrer {n} modification(s)',
  },
  exploreEditsCount: {
    en: '{n} entity(ies) edited — one PR each',
    fr: '{n} entité(s) modifiée(s) — une PR chacune',
  },
} as const;

/**
 * Map a qualifier id to its UI string key. Used by QualifierField to
 * resolve the label in the active locale without changing the
 * QualifierDef shape. Unknown ids fall through to humanizeId().
 */
const QUALIFIER_LABEL_KEYS: Partial<Record<string, UiStringKey>> = {
  since: 'qSince',
  until: 'qUntil',
  source: 'qSource',
  target: 'qTarget',
  canon_scope: 'qCanonScope',
  in_universe_date: 'qInUniverseDate',
  epistemic_status: 'qEpistemicStatus',
  actual_value: 'qActualValue',
  event: 'qEvent',
  believed_by: 'qBelievedBy',
  known_truth_by: 'qKnownTruthBy',
  assisted_by: 'qAssistedBy',
  review_status: 'qReviewStatus',
  role: 'qRole',
  loyalty_status: 'qLoyaltyStatus',
  appearance_type: 'qAppearanceType',
  name_type: 'qNameType',
  given_by: 'qGivenBy',
  context: 'qContext',
  issued_by: 'qIssuedBy',
  coverage: 'qCoverage',
  property_name: 'qPropertyName',
};

export function useQualifierLabel(): (qualifierId: string, fallback: string) => string {
  const t = useT();
  return (id, fallback) => {
    const key = QUALIFIER_LABEL_KEYS[id];
    return key !== undefined ? t(key) : fallback;
  };
}

type UiStringKey = keyof typeof UI_STRINGS;

export function useT(): (key: UiStringKey) => string {
  const locale = useLocale();
  return (key) => UI_STRINGS[key][locale] ?? UI_STRINGS[key].en;
}

type TypeLabelSource = {
  readonly entityTypes: Record<
    string,
    { readonly labels: { readonly en: string; readonly fr: string; }; }
  >;
};

/**
 * Localized entity-type label, or `null` while the schema catalogue is
 * still loading. Callers render a skeleton on `null` rather than the raw
 * kebab-case `type` id, which otherwise flashes lowercase (e.g. "arc"
 * before "Arc") on a cold load. One shared resolver replaces the memo
 * that was copy-pasted across the type routes.
 */
export function useEntityTypeLabel(schemas: TypeLabelSource | null, type: string): string | null {
  const locale = useLocale();
  if (schemas === null) return null;
  const et = schemas.entityTypes[type];
  return et?.labels[locale] ?? et?.labels.en ?? type;
}
