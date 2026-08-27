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
