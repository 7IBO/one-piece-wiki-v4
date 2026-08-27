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

- L'**or** est la couleur d'identité (validée explicitement).
- Palette de **dix accords chauds ancrés sur l'or** (ADR-104) — aucun vert,
  cyan, bleu, violet ni magenta, ni dans les pages ni dans l'art génératif.
  Un test bloque le build si une teinte sort de la bande.
- **Teinte dérivée par entité** (ADR-103), contraste WCAG garanti.
- **Hero** : fond large en faible opacité pleine largeur + plaque arrondie
  format affiche par-dessus.
- **Layouts par type d'entité** (ADR-106), avec dégradation générique
  imposée par le moteur de rendu, pas par la discipline.
- **Art génératif déterministe** par entité (ADR-102), couleurs pilotées
  uniquement par variables CSS.
- **Pas de barre de progression dans le header** (rejetée explicitement).
- Mode **sombre uniquement** pour l'instant.

### Couleurs One Piece

Analyser les couleurs de l'œuvre sur ses différents supports (manga couleur,
anime, jaquettes, jeux) — mais **ne pas les reprendre telles quelles, c'est
kitsch**. Quelques touches seulement, par-dessus la palette or existante.

## 5. Chantiers produit

### 5.1 UI web

- Onglets ou sous-pages pour éviter les pages trop longues (équipage :
  membres / apparitions / historique). **Décision à prendre** : les
  sous-pages sont indexables et partageables, les onglets sont plus fluides.
  Le SEO pèse lourd vu que l'entrée par Google est un usage cité.
- Un composant de lien **adapté au type de la cible**, pas un rendu unique.
- **Hover card** sur desktop pour les liens sans image.
- Équipage : grille de cards personnage (nom, prime, image).
- Recherche complète : plein texte, tolérante aux fautes, multilingue.
- **Ratios d'image fixés par type d'image** (portrait, couverture, bandeau,
  still d'épisode…), analysés et documentés.
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
