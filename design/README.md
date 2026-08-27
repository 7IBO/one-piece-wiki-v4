# Canevas de design

Sources des maquettes explorées avant d'écrire du code dans `apps/web`.
Chaque `*.dc.html` est une **planche** autonome : même page (personnage
`character:luffy`), mêmes données réelles du corpus, même police
(Archivo). Seules la couleur et la mise en page changent.

| Planche               | Direction       | Fond      | Accent                 |
| --------------------- | --------------- | --------- | ---------------------- |
| `Main.dc.html`        | A — Dossier     | `#0e1013` | vermillon `#e0553f`    |
| `Galerie.dc.html`     | B — Galerie     | `#08090b` | issu de l'illustration |
| `Chronologie.dc.html` | C — Chronologie | `#0b1622` | paille `#e8c15a`       |
| `Console.dc.html`     | D — Console     | `#08090c` | cyan + vermillon       |

`canvas.json` place les quatre planches en 2×2 et porte les notes
(motivation et risque de chaque direction).

Le fichier assemblé (~2,5 Mo) n'est **pas** versionné : il se régénère
depuis ces sources avec le helper de la compétence `design`. Ce sont les
sources ci-dessus qui font foi, jamais la sortie assemblée.

Ces planches ne sont pas du code de production : rien ici n'est importé
par `apps/web`. Elles servent à trancher une direction avant de
l'implémenter proprement, avec les règles habituelles (couleurs en
custom properties, aucun nom de propriété codé en dur).

## `v2/` — la direction retenue, sur quatre types d'entités

Arbitrage du mainteneur sur le premier canevas : **châssis D** (grille de
panneaux), **idée de C** conservée, **onglets** validés, et une exigence —
« page entière à chaque fois », avec des layouts adaptés par type
d'entité.

La fusion tient en trois décisions :

1. **La chronologie devient un type de panneau, pas une page.** Si elle
   est une page, elle sert un type d'entité. Si elle est un panneau,
   elle apparaît partout où une propriété a un historique — et le
   différenciateur du projet est visible sur toutes les pages.
2. **Le bandeau de B est conservé à hauteur réduite** (258 px) : une
   zone chaude par page, le reste sobre.
3. **Les onglets sont de vraies URLs** rendues côté serveur, présentées
   comme des onglets. Des onglets côté client coûteraient le
   référencement, que la VISION réclame explicitement.

| Planche            | Type            | Ce qu'elle prouve                                        |
| ------------------ | --------------- | -------------------------------------------------------- |
| `Main.dc.html`     | personnage      | chronologie de la prime, densité d'apparitions, équipage |
| `Chapitre.dc.html` | entité ordinale | prev/next encadrant le bandeau, chronologie **inversée** |
| `Fruit.dc.html`    | fruit du démon  | nom rétroactif, porteurs successifs, croyances par perso |
| `Equipage.dc.html` | équipage        | anciens membres, date connue ≠ présence attestée         |
| `Mineur.dc.html`   | entité pauvre   | le vrai test de « page entière à chaque fois »           |
| `Mobile.dc.html`   | mobile 390 px   | même grammaire, une colonne                              |

### Rôles de couleur — trois, jamais mélangés

| Rôle                          | Valeur    | Usage                |
| ----------------------------- | --------- | -------------------- |
| Liens                         | `#9fb8d0` | partout, donc calmes |
| Valeur actuelle, onglet actif | `#e0553f` | uniquement           |
| Position de lecture           | `#e8c15a` | uniquement           |

Fond `#0a0b0e`, panneaux `#101217`, bordures `#1e222a`.

### Remplir la page sans meubler

Ce qui remplit une page, ce sont des vues **dérivées** des mêmes
données : densité d'apparitions, arêtes entrantes, chronologies,
adaptations manga↔anime, et le décompte de ce qui est masqué par la
progression. Un panneau sans données **disparaît** — il ne s'affiche
jamais vide. C'est ce qui avait tué les v5 à v7.

### Compter ce qui est caché est un spoiler

La faute la plus grave de la première version, relevée par le mainteneur.
Les planches affichaient « 5 membres masqués par ta progression », « 17
valeurs masquées », « Wano : 146ᵉ sur 149 ». Chacune de ces mentions
**révèle exactement ce qu'elle prétend cacher** : que l'équipage monte à
dix, qu'il reste beaucoup à apprendre, que l'arc se termine dans trois
chapitres. Une barre grisée après la position de lecture dans un
graphique de densité trahit de la même façon le nombre d'arcs restants.

**Règle : l'absence doit être invisible, jamais dénombrée.** On peut dire
_que_ la page est celle qui existait à la position de lecture. On ne dit
jamais _combien_ il y a derrière — ni en compteur, ni en tuile
pointillée, ni en barre grisée.

Elle vaut pour toute la surface publique : compteurs d'onglets, totaux de
listes, graphiques, cartes au survol, métadonnées de page. Elle est plus
stricte que « ne pas afficher les valeurs futures » : il faut aussi ne
pas trahir leur nombre.

Reste légitime tout ce qui se compte **jusqu'à** la position de lecture :
« 342 apparitions sur 1044 chapitres » ne dit rien de l'avenir, puisque
1044 est le curseur du lecteur lui-même.

### Ce que les nouvelles planches répondent

**Carte au survol** (`Main.dc.html`). Demandée dans le brief d'origine,
absente de la première version. Elle est soumise **au même filtre que la
page** : Ace y est « Décédé · ch. 574 » pour un lecteur au chapitre 1044,
et « Vivant » pour un lecteur au chapitre 500.

**Entité pauvre en données** (`Mineur.dc.html`). Le vrai test de « page
entière à chaque fois » n'est pas Luffy, c'est un personnage à quatre
apparitions. Réponse : **moins de données ne veut pas dire plus de
panneaux, mais des panneaux plus grands**. Les quatre apparitions passent
en grandes cartes au lieu d'être résumées, les arêtes entrantes portent
la page — une entité peu documentée est presque toujours bien reliée — et
contribuer devient l'objet principal, avec les champs manquants
**nommés** plutôt que devinés. Les onglets suivent le contenu : trois
ici, sept sur la page personnage.

**Mobile** (`Mobile.dc.html`). La plaque passe au-dessus au lieu d'à
côté, la bande de statistiques et les onglets défilent horizontalement,
les panneaux s'empilent en une colonne. Mêmes URLs qu'en desktop.

### Nom du site

« One Piece.Wiki » dans l'en-tête, le point en accent vermillon. Les
formes acceptées sont « OnePiece.Wiki », « One Piece Wiki » et « One
Piece.Wiki ». L'abréviation « OP/WIKI » de la première version est
abandonnée.

## Ce que ces maquettes demandent au modèle de données

Analyse faite en lisant les schémas, pas de mémoire. La conclusion tient
en une phrase : **presque tout existe déjà**, et les deux manques réels
sont petits mais nets.

### Déjà supporté — rien à faire

| Ce que la maquette montre                            | Ce qui le porte                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Adhésions par intervalles (Nami : ch. 8–69, puis 95) | `member-of` : `since` + `until`, `allow_multiple_concurrent: true`, `historical: true`   |
| Membre parti puis revenu                             | idem, deux entrées ; règle `former-member-needs-until`                                   |
| Nom du fruit corrigé rétroactivement                 | `epistemic_status: retconned` + `since` + `actual_value`                                 |
| Qui croit quoi, personnage par personnage            | `believed_by` / `known_truth_by` (ADR-096 : provenance par item)                         |
| Apparitions au chapitre et à l'épisode               | ADR-105 : arête `features`, granularité portée par le type de source                     |
| Ratios d'images par type d'image                     | `image_width`/`image_height`, puis rôle de `depicted-by` (vocabulaire `depiction-roles`) |
| Fiches par type d'entité                             | ADR-106 : layouts par type, déjà en place                                                |

Ce qui reste à faire pour ces lignes est **du build, pas du schéma** :

- **« Ce qui devient vrai dans ce chapitre »** est un index inverse
  source → valeurs dont le `since` pointe cette source. Entièrement
  dérivable au `build:db`, aucune donnée nouvelle.
- **Densité d'apparitions par arc** : agrégat des arêtes `features`
  croisées avec l'appartenance à l'arc. Idem.
- **Adaptation manga ↔ anime** : arête `adapted-by`, déjà là ; il faut
  la remonter dans la vue.

### Manque n° 1 — la précision de `since` (le cas Rocks)

`member-of.since` est **obligatoire** et vaut un `source_ref`. Quand on
sait seulement qu'un personnage **était présent** au chapitre N sans
qu'aucune case ne montre son arrivée, écrire `since: manga-chapter:N`
**affirme qu'il a rejoint à ce moment-là**. C'est faux, et c'est
exactement le cas soulevé dans le brief d'origine à propos de l'équipage
de Rocks.

Rien dans les qualificateurs existants ne distingue « à partir de » de
« au plus tard à ». `attested_by` ne convient pas : il désigne une
référence **externe** (interview, site officiel), pas une borne
temporelle.

Piste : un qualificateur de précision sur `since` (`exact` par défaut,
`at_latest` sinon) plutôt qu'un second champ, pour que toutes les
propriétés historisées en profitent d'un coup et pas seulement
`member-of`. **Demande un ADR** — c'est le contrat des quatre axes qui
bouge.

### Manque n° 2 — « cette information n'existe pas dans l'œuvre »

Le panneau de contribution de la page pauvre nomme les propriétés
attendues qui n'ont pas de valeur. Sans marqueur d'absence délibérée, il
réclamera éternellement la date de naissance d'un bandit qu'Oda n'a
jamais datée, et un contributeur finira par inventer une valeur pour
faire taire l'alerte — le pire résultat possible pour un wiki.

Il faut pouvoir écrire « connu comme inexistant », distinct de « pas
encore renseigné ». Ce n'est pas un `epistemic_status` : celui-ci
qualifie une valeur présente, pas son absence. **Demande un ADR** aussi.

Les deux manques sont consignés dans `/IDEAS.md` conformément à
`CLAUDE.md` : rien n'est implémenté avant l'arbitrage.

### Le rôle des couleurs, corrigé

`apps/web/src/styles.css` avait déjà tranché : l'or est l'identité
(mot-symbole, chiffres de titre, anneau de focus), le vermillon est
l'accent interactif du chrome, re-pointé par la teinte d'entité
(ADR-103/111). Le canevas avait inventé un **troisième** rôle en donnant
au vermillon les valeurs courantes.

Corrigé, et dans le sens de la préférence du mainteneur :

| Rôle                     | Couleur             | Où                                                  |
| ------------------------ | ------------------- | --------------------------------------------------- |
| Vrai pour toi maintenant | or `#e8c15a`        | valeur actuelle, onglet actif, position de lecture  |
| Rupture                  | vermillon `#e0553f` | retcon, mort, contradiction — rare par construction |
| Identité de l'entité     | teinte par entité   | ambiance du bandeau, déjà en place                  |
| Liens                    | `#9fb8d0`           | partout, donc calmes                                |

L'or est désormais la couleur la plus vue, ce qui est cohérent : c'est
celle qui a été validée.

### Les ratios, alignés sur le code

`apps/web/src/lib/image-ratio.ts` définit cinq classes — portrait 3:4,
cover 2:3, square 1:1, plate 16:9, banner 21:9 — dérivées **d'abord des
pixels de l'image**, ensuite du rôle de l'arête `depicted-by`. Le
canevas inventait des hauteurs arbitraires (92, 84, 82, 148, 76 px).

Il obéit maintenant : un personnage est en 3:4 **partout** où il
apparaît, un chapitre en 2:3, un épisode et un navire en 16:9, un fruit
et un pavillon en 1:1. Les cadres sont posés en `aspect-ratio`, jamais
en hauteur fixe.

Corollaire visible sur la page pauvre : ses quatre apparitions mélangent
deux chapitres en 2:3 et deux épisodes en 16:9, alignés en haut, de
hauteurs différentes. C'est volontaire — recadrer un plan 16:9 en
portrait n'en fait pas un portrait, ça en fait un plan mutilé, ce que le
commentaire d'en-tête de `image-ratio.ts` dit déjà mot pour mot.

## Régler sa progression sans rien nommer

`Progression.dc.html`. Demande du mainteneur : « je veux du no spoil mais
pour autant ne pas avoir à mettre un id ou nom ».

Le problème est plus retors qu'il n'y paraît. Laisser choisir dans une
**liste de chapitres est déjà un spoiler** : les titres en disent trop,
et voir la liste renseigne sur ce qui reste. Chercher par personnage ou
par événement est pire encore.

La réponse retenue est une **recherche dichotomique sur des nombres
nus** : « As-tu déjà lu le chapitre 512 ? » — Oui / Non / Je ne sais
plus. Chaque réponse divise l'intervalle par deux ; une dizaine de
questions couvrent les 1 145 chapitres. **Aucune question ne peut rien
révéler**, puisque rien n'y est nommé : ni titre, ni image, ni
personnage. « Je ne sais plus » élargit l'intervalle du bon côté au lieu
de bloquer.

Le dialogue garde trois entrées, de la plus rapide à la plus sûre :

1. **Le curseur direct**, pour qui connaît son numéro — champ + réglette
   sur toute la série.
2. **Les questions guidées**, pour qui ne le connaît pas.
3. **Les préréglages en un clic** : « Je débute », « J'ai fini l'anime
   diffusé », « Je suis à jour du manga », « Anime à jour, manga en
   avance », « Tout afficher — aucun filtre ».

Deux exigences implicites, tenues : le réglage est **réversible depuis
l'en-tête** à tout moment, et l'intervalle en cours de recherche
s'affiche (« entre le chapitre 257 et le chapitre 1145 ») pour qu'on
sache où on en est sans avoir à faire confiance à l'algorithme.

Ce dialogue remplace le panneau à deux champs numériques actuel
(`apps/web/src/components/ProgressControl.tsx`), qui suppose que le
lecteur connaît son numéro — c'est-à-dire précisément l'hypothèse que
cette demande invalide.

## Trois corrections d'affichage

**Les liens rejoignent la famille de l'or** : or atténué `#c9ae72` au
repos, or plein `#e8c15a` au survol. Le vermillon ne subsiste que sur la
rupture — retcon, mort, contradiction. Il ne reste que trois occurrences
sur les sept planches.

**Les portraits d'équipage rétrécissent** à 158 px de large. La grille
en cinq colonnes pleine largeur donnait des cartes de 256 px, hors de
proportion avec le reste de la page.

**Les apparitions passent en liste.** En grille, un chapitre en 2:3 et
un épisode en 16:9 ne peuvent pas avoir la même taille — c'était visible
et désagréable. En liste, la vignette **garde son ratio d'origine mais
toutes ont la même hauteur** : un chapitre fait 27 px de large, un
épisode 78 px, et les lignes s'alignent quand même. Rien n'est déformé,
rien ne dépasse. C'est aussi la seule forme qui tienne à 342 entrées.

Le sélecteur de **langue** entre dans l'en-tête, en liste maison plutôt
qu'en `<select>` natif, montré ouvert sur la planche personnage.
