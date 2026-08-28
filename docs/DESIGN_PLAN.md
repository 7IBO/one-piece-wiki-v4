# Le canevas design, et ce qu'il reste à faire par entité

Analyse des dix planches validées et des douze annotations du canevas,
puis le plan par type d'entité. Écrit après avoir **rendu** chaque
planche et **compté** le corpus — pas d'après les noms de fichiers.

## 1. Ce que le dossier `design/` contient vraiment

Deux jeux, et un seul est une spec.

| dossier      | contenu                                     | statut                                      |
| ------------ | ------------------------------------------- | ------------------------------------------- |
| `design/`    | `Main`, `Galerie`, `Chronologie`, `Console` | **4 DIRECTIONS CONCURRENTES**, pas une spec |
| `design/v2/` | 10 planches + `canvas.json` annoté          | la spec validée                             |

`design/canvas.json` le dit lui-même : « 4 directions, même page
(Luffy), mêmes données. Archivo partout — c'est la seule chose que tu
as validée. Les variables sont la couleur et le layout. » Chaque
direction porte sa note de risque. **Les implémenter serait
implémenter des propositions écartées.**

Une annotation de v1 mérite pourtant d'être retenue, parce que v2 l'a
absorbée : « C — CHRONOLOGIE. L'axe du temps EST le layout : chaque
donnée est accrochée au chapitre où elle devient vraie. C'est le seul
qui montre notre vrai différenciateur. » C'est ce que rend aujourd'hui
la fiche du fruit (« Hito Hito no Mi · révélé au ch. 1044 » au-dessus
de « Gomu Gomu no Mi · depuis toujours »).

## 2. Les règles du manifeste, et où on en est

`design/v2/canvas.json` porte douze annotations qui sont des
**décisions**, pas des légendes. État vérifié :

| règle                                                                                                          | état                             |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Facettes issues du SCHÉMA, jamais écrites à la main                                                            | ✅                               |
| Apparitions : un onglet par type de source                                                                     | ✅ `SourceTabs`                  |
| L'or partout (valeur courante, onglet actif, liens) ; vermillon **réservé** à la rupture                       | ✅ thème v12                     |
| Cinq classes de ratio dérivées des pixels puis du rôle                                                         | ✅ `image-ratio.ts`              |
| Les sorties récentes masquent les TITRES, montrent numéro + date                                               | ✅                               |
| **Anti-spoil : aucun compteur d'absence, aucune tuile pointillée, aucune barre grisée au-delà de la position** | ⚠️ à auditer                      |
| **Apparitions en LISTE : vignette au ratio natif, toutes à la MÊME HAUTEUR**                                   | ❌ on rend une grille de numéros |
| **Langue : liste maison ouverte, la courante en or avec sa coche**                                             | ❌ on bascule entre 2 langues    |
| Progression : par ARC groupé par SAGA, pas par numéro                                                          | ❌ bloqué (0 saga)               |

Les trois ❌ sont du travail identifié, pas des inconnues.

## 3. Le comptage qui décide du plan

C'est le chiffre le plus important de cette analyse.

| type                    |   corpus | planche dédiée         |
| ----------------------- | -------: | ---------------------- |
| `manga-chapter`         | **1193** | Chapitre ✅ fait       |
| `anime-episode`         | **1174** | — (même grammaire)     |
| `volume`                |  **115** | — (conteneur)          |
| `arc`                   |   **50** | — ✅ fait              |
| `character`             |   **10** | Personnage ✅ fait     |
| `streaming-platform`    |        4 | —                      |
| `image`                 |        3 | —                      |
| `event`                 |        2 | —                      |
| `crew`                  |    **1** | Équipage ❌            |
| `devil-fruit`           |    **1** | Fruit ✅ fait          |
| `document`, `reference` |    1 + 1 | —                      |
| `saga`                  |    **0** | requis par Progression |

**39 types sont déclarés au schéma ; 12 existent dans le corpus.**

Les planches qui montrent le mieux le design décrivent des types à
**10, 1 et 1** entités. Les types qui ont de la masse sont les types
ORDINAUX — chapitres, épisodes, volumes, arcs — et ce sont eux qui
viennent d'être faits.

Donc « faire les autres entités » se scinde en deux travaux de nature
très différente, et il faut le dire avant de commencer :

- **(A) du layout** pour les types sans mise en page dédiée : c'est
  petit, et la mise en page générique les tient déjà ;
- **(B) de la donnée** pour les types dont les planches parlent : sans
  elle, la planche Équipage a **un** équipage à rendre.

## 4. Plan (A) — layout, par ordre de rendement

1. **Apparitions en liste à hauteur constante.** La règle du manifeste
   qu'on enfreint le plus visiblement. Une vignette 2:3 fait 27 px de
   large, une 16:9 en fait 78, et les deux tiennent sur la même ligne
   sans déformation. Touche toutes les pages entité d'un coup.
2. **Équipage** (`Equipage.dc.html`) : adhésions par INTERVALLES
   (« à bord ch. 8 → 69, puis depuis le ch. 95 »), badges
   « Dates connues » / « Revenue » / « Présence attestée », chronologie
   des arrivées avec « Ta position de lecture » en or. Le modèle porte
   déjà `since`/`until` ; c'est du rendu.
3. **Épisode** : miroir du chapitre (ruban d'arc, ruban de saison,
   adaptation inverse manga←anime). La donnée existe depuis ADR-120.
4. **Volume** : conteneur + ruban ; déjà correct par la grammaire
   partagée, à vérifier au rendu.
5. **Sélecteur de langue** en liste ouverte. Divergence assumée
   aujourd'hui : à deux langues, une bascule vaut mieux qu'un menu.
   À reprendre quand une troisième arrive.
6. **Audit anti-spoil** : relire chaque compteur affiché et vérifier
   qu'aucun ne compte ce qui est caché.

## 5. Plan (B) — la donnée, qui est le vrai goulot

Par ordre de déblocage :

1. **Les personnages.** 10 sur ~1500. C'est le type le plus
   important du wiki et celui dont la planche est la plus riche.
   Catégorie Fandom `Characters`.
2. **Les arêtes personnage → chapitre** (`features`). **Zéro**
   aujourd'hui. Elles débloquent d'un coup : les trois compteurs de
   l'en-tête du chapitre, « personnages présents », « premières
   apparitions », « apparitions par arc », et le dénominateur
   « 342 apparitions lues sur 1044 ».
3. **Les fruits du démon.** 1 sur ~200.
4. **Les équipages.** 1.
5. **Les sagas.** 0 — et la planche Progression en dépend
   structurellement (« le dernier arc terminé, **groupé par saga** »).
   Lié à l'arbitrage `arc:east-blue`.

## 6. Ce qui reste bloqué sur un arbitrage

Trois questions, toutes mesurées, aucune tranchée :

1. **`opens_at`** — 46 arcs sur 50 sans ancre anti-spoil ; 3 des 4
   ancres existantes contredisent la dérivation.
2. **Axe de curseur vide** — manga:100 + anime non renseigné rend
   « Bonney's Nika Punch » dans la recherche.
3. **`saga:east-blue`** — une saga modélisée en arc ; bloque Progression.

Et deux manques que le manifeste v2 parque lui-même dans `IDEAS.md`,
chacun demandant un ADR : **la précision de `since`** (le cas Rocks —
« présence attestée ≠ date connue », visible sur la planche Équipage)
et **le marqueur « cette information n'existe pas dans l'œuvre »**,
dont le panneau « page incomplète » a besoin pour distinguer
« personne ne l'a écrit » de « l'œuvre ne le dit jamais ».
