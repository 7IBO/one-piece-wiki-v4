# Vision produit

Pourquoi ce projet existe, pour qui, et ce qui a déjà été tranché sur le
goût et le positionnement. `/docs/ROADMAP.md` donne l'ordre de construction,
`/docs/DECISIONS.md` les décisions d'architecture ; ce fichier porte
l'intention.

> Écrit le 2026-08-09 à partir d'un brief mainteneur. À relire avant tout
> travail sur `apps/web`, sur les importeurs, ou sur la stratégie
> d'acquisition.

## 1. L'objectif réel

**Le projet n'a aucun utilisateur, et l'objectif est d'en avoir.** Toute
décision se juge à cette aune. Un raffinement invisible pour un visiteur ne
vaut pas un import de données qui remplit trois cents pages.

C'est un **wiki**, pas un site vitrine : l'information doit être dense et
visible, jamais sacrifiée au design.

## 2. Le concurrent, et ce qu'il nous apprend

**onenoobiece.fr** (site français de référence dans la niche) n'est pas un
wiki : c'est un **tracker**. Son cœur est une boucle sociale — compte, profil
(avatar, progression, favoris), suivi de l'avancement sur anime / films /
manga, communauté Discord — et ses encyclopédies (personnages, fruits, lieux,
techniques, chronologie) viennent en complément.

Lecture stratégique :

- Leur force n'est pas le contenu, c'est **l'appropriation personnelle**. On
  revient sur le site parce qu'on y a un profil et une progression.
- Nous avons construit la moitié difficile qu'ils n'ont pas : un modèle
  épistémique versionné par progression dans l'œuvre, avec filtrage
  anti-spoil réel sur chaque donnée.
- **Mais notre curseur de progression est un cookie anonyme.** Ni compte, ni
  profil, ni amis, ni favoris. C'est le manque le plus direct entre ce qu'on
  a et un site où les gens reviennent.

Conclusion : notre différenciateur défendable est le **wiki anti-spoil
versionné**, et il faut lui greffer la boucle d'appropriation, pas l'inverse.

## 3. Publics visés

Quatre profils, tous servis par le même curseur de progression :

| Profil          | Besoin                                        |
| --------------- | --------------------------------------------- |
| Débutant        | Découvrir sans se faire spoiler               |
| En rattrapage   | Retrouver qui est qui, à son point de lecture |
| À jour          | Densité, détail, exhaustivité                 |
| Visiteur Google | Une réponse rapide, une page indexable        |

Et deux usages : l'occasionnel qui arrive par une recherche, et le fan
quotidien qui veut partager, commenter, échanger, découvrir.

## 4. Calibration du design — l'information la plus chère du projet

Neuf itérations, sept rejetées. Ce qui suit évite de refaire le chemin.

### Références validées par le mainteneur

- **Aime** : `starwars.com/databank`, la page champions de League of Legends.
- **Tiède** : `letterboxd.com` — « ok mais sans plus, pas trop unique ».
- **Rejette** : le Pokédex officiel (« moche »), `mubi.com` et
  `criterion.com` (« bof, et je vois pas comment faire un wiki avec ça »).

### Le motif à respecter

L'image EST l'interface. Sombre et atmosphérique, mais la couleur vient de
l'œuvre et non de l'UI. Typo display affirmée. Grilles filtrables par
facette. Mouvement au survol. Sensation de **produit officiel de franchise**,
pas d'ouvrage de référence neutre.

### Les registres qui ont échoué — et pourquoi

| Registre                             | Verdict                                  |
| ------------------------------------ | ---------------------------------------- |
| Minimalisme arty (v6 « La Gazette ») | « unique mais dégueulasse, pas moderne » |
| Éditorial imprimé / pastiche gazette | daté                                     |
| Plat, coloré, façon jouet            | « moche »                                |
| Sombre + un accent, façon SaaS       | « hyper IA » — le piège principal        |

Le diagnostic qui a débloqué la situation : les cinq premières versions
partageaient l'ADN « web app moderne à composants » (cards arrondies
flottantes, pills, grilles uniformes, accents lumineux). **C'est cet ADN
lui-même qui lit « IA »**, indépendamment de la palette. Si une proposition
ressemble à un dashboard SaaS ou à une maquette générée, elle est ratée.

Deuxième diagnostic, tout aussi important : le site n'avait **aucune image**.
Une grille de carrés gris à lettre est la signature visuelle d'une maquette
générée. D'où ADR-102.

### Acquis, à ne pas défaire sans raison explicite

- ~~Palette de **dix accords chauds ancrés sur l'or** (ADR-104) — aucun
  vert, cyan, bleu, violet ni magenta.~~ → **périmé, ADR-111
  (2026-08-27)**. La contrainte de bande chaude était l'erreur : l'or
  devait être un **accent d'identité**, elle en a fait tout le spectre,
  et or/parchemin/trésor est justement le cliché pirate kitsch. Le fond
  est désormais une **nuit océanique** (le bleu profond de la mer et du
  ciel, la constante environnementale de l'œuvre) ; l'or redevient un
  accent, ré-écrit en **jaune chapeau de paille**, réservé au wordmark,
  aux chiffres-titres (primes), au focus et à la sélection ; le
  **vermillon du gilet de Luffy** est la couleur interactive du chrome
  neutre. « Quelques touches par ci par là. »
- **Douze accords qui parcourent la roue une fois** (ADR-111), dans
  l'ordre du spectre — la logique réelle d'une **étagère de tankōbon**,
  dont les tranches alignées forment un arc-en-ciel. Ce n'est pas une
  roue libre : chaque accord est ancré sur une teinte d'une liste
  fermée, toutes ses couleurs restent à moins de 40° de cette teinte, et
  **tous les fonds d'illustration appartiennent à la même famille
  sombre et peu chromatique** — c'est ce partage du fond qui empêche la
  lecture « couleurs aléatoires ». Trois tests tiennent la barrière, un
  quatrième épingle les jetons neutres de `styles.css` sur un accord
  authentifié.
- **Teinte dérivée par entité** (ADR-103), contraste WCAG garanti — et
  la garantie compte davantage depuis ADR-111 : un bleu à la même
  clarté qu'un jaune est bien plus sombre, c'est la remontée de clarté
  mesurée qui rend les douze accords également lisibles.
- **Hero** : fond large en faible opacité pleine largeur + plaque arrondie
  format affiche par-dessus.
- **Layouts par type d'entité** (ADR-106), avec dégradation générique
  imposée par le moteur de rendu, pas par la discipline.
- **Art génératif déterministe** par entité (ADR-102), couleurs pilotées
  uniquement par variables CSS — inchangé par ADR-111, qui n'a touché
  qu'aux valeurs des neuf jetons.
- **Pas de barre de progression dans le header** (rejetée explicitement).
- Mode **sombre uniquement** pour l'instant.

### Couleurs One Piece — analysé, tranché (ADR-111)

Analyser les couleurs de l'œuvre sur ses différents supports (manga couleur,
anime, jaquettes, jeux) — mais **ne pas les reprendre telles quelles, c'est
kitsch**. Quelques touches seulement.

Ce que l'analyse a donné, et ce qui est maintenant dans le code :

- **L'océan et le ciel dominent l'anime** — bleu marine profond jusqu'au
  cyan clair. C'est une histoire en mer : c'est la constante
  environnementale, donc le **fond** du site au repos.
- **Le jaune du chapeau de paille** et le **vermillon du gilet de Luffy**
  sont les accents iconiques — un jaune solaire, _pas_ un or métallique.
- **Les tranches de tankôbon alignées forment un arc-en-ciel** : chaque
  volume prend sa propre teinte saturée, et Oda re-pigmente entièrement
  chaque planche couleur (le chapitre 642, rose et doux, sans traits
  noirs). C'est la justification réelle, dans l'œuvre, du mécanisme de
  teinte par entité — et l'ordre de l'étagère est celui des douze
  accords d'ADR-111.

## 5. Chantiers produit

### 5.1 UI web

- ~~Onglets ou sous-pages pour éviter les pages trop longues~~ →
  **tranché : sous-pages** (`/crew/x/appearances`), ADR-110. Le SEO a
  emporté la décision, comme annoncé ici : un onglet n'est pas une
  destination. La fluidité est préservée par le routeur client.
- Un composant de lien **adapté au type de la cible**, pas un rendu unique.
- ~~**Hover card** sur desktop pour les liens sans image.~~ → livré
  (2026-08-27), filtrée par le curseur.
- Équipage : grille de cards personnage (nom, prime, image).
- ~~Recherche complète : plein texte, tolérante aux fautes, multilingue.~~
  → livrée (ADR-108).
- ~~**Ratios d'image fixés par type d'image**~~ → livrés (2026-08-27) :
  dérivés du schéma (`image_width`/`image_height`, puis le rôle
  `depicted-by`), documentés dans `WEB_APP.md` § Image ratios.
- Performance : rapide et mis en cache.
- Desktop et mobile.

### 5.2 Données — le vrai levier

Le corpus fait 37 entités et **aucune image réelle**. C'est le premier
facteur limitant de tout le reste, y compris du rendu visuel.

- Analyser **l'ensemble des pages Fandom** pour en déduire un meilleur
  schéma. On est en v0.1 : **refaire le schéma est autorisé et sans impact**.
- Importer depuis Fandom, api-onepiece, et TMDB si besoin.
- Détecter les mises à jour Fandom (nouveaux chapitres, épisodes).
- Couvrir personnages, histoires, concepts, équipages, alliances, fruits.
- Tout historisé autant que possible.

**Rôle de l'IA dans le pipeline** (précisé par le mainteneur) : produire des
**données structurées** à partir des sources, et une **version no-spoil de
chaque donnée**. Ce n'est pas de la réécriture cosmétique : c'est de
l'extraction structurée plus une déclinaison anti-spoil systématique.

**Appartenances à connaissance partielle** : distinguer le cas où l'on
connaît les dates d'arrivée et de départ du cas où l'on sait seulement
« présent à tel épisode » (équipage de Rocks). Ce sont deux formes de
connaissance différentes ; le modèle épistémique doit les représenter
distinctement plutôt que d'inventer des dates.

### 5.3 Communauté — décision ouverte

Forum intégré sur les épisodes et la série avec comptes utilisateurs, ou tout
renvoyer sur Discord ? Et un bot Discord : leaderboard de contributions,
quiz, notifications de sorties (chapitre, épisode, film), alertes spoilers,
fiches d'entités.

Élément de décision : c'est précisément la boucle sociale qui fait revenir
les utilisateurs de onenoobiece. Le minimum viable est probablement un
compte avec progression + favoris, le reste pouvant vivre sur Discord.

### 5.4 Marketing

Analyser l'acquisition de onenoobiece et proposer une stratégie. Le SEO est
prioritaire vu le profil « visiteur Google ».

### 5.5 Plus tard — ne pas commencer

API publique (cf. `PUBLIC_API_DESIGN.md`, design-only, ADR-025), uploads
d'images maison, TCG des personnages et concepts.

## 6. Contraintes dures

- **Egress bloqué en sandbox** : `fandom.com`, `api-onepiece`, les CDN
  d'images, TMDB et `onenoobiece.fr` répondent tous 403 au CONNECT. Seul
  GitHub passe. Les importeurs se construisent et se testent sur fixtures,
  mais **le mainteneur doit les lancer en local**.
- **Zéro image réelle** dans le corpus ; les trois entités image pointent
  vers un domaine fictif.
- Le projet est en **bêta, zéro utilisateur** : casser et migrer d'un coup
  est le mode normal (cf. l'en-tête de `STATE.md`).

## 7. Position juridique — tranchée (ADR-107)

La tension ouverte ici a été tranchée le 2026-08-27. Le détail, les
options écartées et les règles opérationnelles sont dans **ADR-107** ;
en résumé :

- **Faits structurés uniquement** depuis Fandom — nombres, dates, noms,
  valeurs énumérées, relations typées. Jamais de phrases.
- **Aucune prose copiée, paraphrasée, traduite ou réécrite par IA.** Le
  passage par un modèle ne blanchit rien : une paraphrase d'une
  expression protégée reste une œuvre dérivée. Le rôle de l'IA est
  l'extraction structurée et les variantes no-spoil de notre propre
  texte, pas la reformulation d'articles Fandom.
- **Trois couches distinctes**, à ne pas confondre : le droit d'auteur
  (protège l'expression, pas les faits), le **droit sui generis des
  bases de données** (dir. 96/9/CE, art. L341-1 CPI — il protège
  l'investissement et se déclenche sur l'extraction d'une part
  substantielle même de faits libres, et il n'a pas d'équivalent
  américain), et les CGU de Fandom. Nos garde-fous : 1 req/s, crawls
  bornés et reprenables, aucune republication d'un dump tel quel.
- **Sources primaires préférées** (l'œuvre, databooks, api-onepiece,
  TMDB) ; Fandom sert d'inventaire de ce qui existe plus que de corpus
  de référence.
- **Notre corpus est publié en CC BY-SA 4.0.**
- **Images** : arbitrage mainteneur, risque assumé. TMDB en source
  privilégiée là où elle couvre ; visuels tiers ré-hébergés avec
  ayant-droit nommé, licence explicite et URL source ; page de retrait
  publique avec suppression sous 48 h ; jamais de hotlink vers le CDN
  Fandom. Ce n'est pas licite, c'est toléré — l'ADR le dit au lieu de
  le maquiller.
