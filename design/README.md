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
