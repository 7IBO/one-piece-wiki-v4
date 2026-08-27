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
