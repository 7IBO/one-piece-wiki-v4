# La structure des entités Fandom, et ce qu'elle nous demande de changer

Analyse des **39 infobox** relevées sur les 2 641 catégories du wiki
Fandom (`docs/audits/fandom-structure-2026-08-27.json`), croisée avec ce
que nos mappers lisent réellement et ce que le schéma déclare.

Écrit en comptant, pas de mémoire. Chaque pourcentage est un taux de
remplissage mesuré sur l'échantillon de pages indiqué.

> **Rappel de périmètre.** Les champs `image` des infobox n'apparaissent
> nulle part dans les plans ci-dessous : ADR-107 met les fichiers de
> Fandom **hors** de la frontière d'ingestion (« jamais hot-linké, jamais
> miroité »). L'image reste un travail TMDB.

## 1. Deux formes reviennent partout

Avant le détail par boîte, le fait le plus utile de tout l'inventaire :
**presque chaque infobox porte les deux mêmes structures**, et nous les
savons déjà lire.

| forme                                              | ce qu'elle porte                             | remplissage            | déjà géré par                     |
| -------------------------------------------------- | -------------------------------------------- | ---------------------- | --------------------------------- |
| le **triplet de noms** `ename` / `jname` / `rname` | le nom anglais, le japonais, sa romanisation | 75–100 % sur 15 boîtes | `box.ts` → `parseJapaneseNames`   |
| le **début** `first`                               | un Qref `Chapter N; Episode M`               | 80–100 % sur 12 boîtes | `box.ts` → `parseFirstAppearance` |

Conséquence pratique : **un nouveau mapper hérite gratuitement du nom
localisé et de la première apparition.** Le coût réel d'un mapper, ce
sont ses trois ou quatre champs propres, pas ces deux-là.

## 2. Deux trous de traduction, mesurés

C'est le constat le plus rentable de l'analyse, parce que la donnée
existe à 100 % côté Fandom et à 0 % chez nous.

| type            |  `en` |  `ja` | `ja-latn` | le champ Fandom qui manque    |
| --------------- | ----: | ----: | --------: | ----------------------------- |
| `anime-episode` | 1 176 | **0** |     **0** | `Kanji` 100 %, `Romaji` 100 % |
| `character`     |   451 | **1** |     **1** | `jname` 100 %, `rname` 72 %   |
| `manga-chapter` | 1 193 | 1 193 |     1 193 | —                             |
| `devil-fruit`   |   210 |   210 |        49 | —                             |
| `crew`          |   139 |   138 |       138 | —                             |

Les mappers « * Box » (fruit, équipage, navire, arme, organisation)
passent par `box.ts` et sortent les trois locales. Les deux mappers les
plus anciens — **personnage** et **épisode** — ne le font pas :

- le mapper d'épisode **nomme** `Kanji` et `Romaji` dans son propre
  docblock, puis ne les lit jamais ; son type de sortie est
  `translations: { en: … }`, sans place pour autre chose ;
- le mapper de personnage lit `ename` mais pas la paire japonaise.

**≈ 3 250 valeurs de traduction** sont donc à portée immédiate, sans une
seule requête réseau supplémentaire au-delà d'un ré-import.

## 3. L'Episode Box est le gisement le plus riche

43 champs, dont **37 non lus**. Les six qui comptent :

| champ                                       |    remplissage | ce qu'il donne                                           | ce qu'il faut pour le prendre                                     |
| ------------------------------------------- | -------------: | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `Kanji` / `Romaji`                          |          100 % | les titres `ja` / `ja-latn`                              | rien — voir §2                                                    |
| **`charDebut`**                             |       **52 %** | la liste des personnages qui **débutent** dans l'épisode | l'arête `features` + `is_first`, et l'index de titres du registre |
| `techDebut`                                 |           65 % | les techniques qui débutent                              | le type `technique` existe, **0 entité**                          |
| `Airdate_Funi` / `Airdate_4` / `Airdate_RM` | 80 / 50 / 48 % | les dates de diffusion par territoire                    | rien — `released_at` porte déjà le qualificatif `territory`       |
| `locationDebut`                             |           22 % | les lieux qui débutent                                   | le type `location` existe, **0 entité**                           |
| `Opening` / `Ending`                        |           10 % | le générique                                             | le type `theme-song` existe, **0 entité**                         |

`charDebut` est le point d'appui : `DESIGN_PLAN.md` §5 note que les
arêtes personnage → source sont à **zéro**, et qu'elles débloquent d'un
coup les compteurs d'en-tête de chapitre, « personnages présents »,
« premières apparitions », « apparitions par arc » et le dénominateur
« 342 apparitions lues sur 1 044 ».

Un piège à ne pas répéter : `rating` est la **part d'audience japonaise**
(3,9 %), pas une classification de contenu. Le mapper le déclare déjà
comme ignoré délibéré — la bonne façon de traiter un champ qu'on
comprend mais qu'on refuse.

## 4. `colorscheme` : une identité visuelle canonique, ignorée

Présent à **95–100 %** sur huit boîtes (Char, Crew, Ship, Organization,
Weapon, Island, Race, Fighting Style, Occupation), avec seulement une
dizaine de valeurs distinctes par échantillon :
`EastBlueCiviliansColors`, `GiantWarriorPiratesColors`,
`Galley-LaCompanyColors`…

C'est une **palette par faction**, pas par entité. Aujourd'hui la teinte
d'une entité est dérivée du hachage de son id (`entity-tint.ts`) — d'où
la remarque du mainteneur sur « les couleurs random de contours ». Une
palette canonique par faction remplacerait un hasard par un fait.

Ce n'est pas gratuit : il faut un vocabulaire de palettes et une
propriété pour la porter, donc un ADR. **Parqué dans `IDEAS.md`**, pas
implémenté ici.

## 5. `switch = timeskip` : le wiki fait notre historisation, en pire

13 % des Char Box portent `switch = timeskip`, et les champs voisins
(`age2`, `dfbackcolor`…) sont les variantes d'après-ellipse. Fandom
résout cela par un **bouton** qui bascule l'affichage.

Nous, c'est l'axe `since` qui le porte : deux entrées de `age`, l'une
ancrée avant l'ellipse, l'autre après. Le champ `age2` est donc lisible
— mais son ancre (« le chapitre 597 ») n'est pas dans l'infobox. La
prendre demanderait de décider une ancre, ce qui est exactement ce qu'un
import ne doit pas faire. **Laissé en avertissement.**

## 6. Les boîtes sans mapper, par volume

| infobox                      |     pages | notre type                       | ce qui manque                                                                                                                                                       |
| ---------------------------- | --------: | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Island Box**               |       414 | `location` (0 entité)            | `region` 85 % (wikilink_list) ; le reste est le triplet + `first`                                                                                                   |
| **Simple Box**               |       263 | `concept` (0 entité)             | fourre-tout : Volume Vide, Will of D… `extra1`/`extra1title` 65 % portent une donnée libre                                                                          |
| **Song Box**                 |       207 | `theme-song` (0 entité)          | `Singer` 100 %, `Use` 92 % (prose : « Opening: Episodes 1-47 »), `Length` 80 %, `Album` 70 %                                                                        |
| **Game Box**                 |        87 | `video-game` (0 entité)          | `release` 100 % (multi-territoire), `platform` 97 %, `genre` 95 %, `developer`/`publisher` 92 %                                                                     |
| **Spin-Off Chapter Box**     |        84 | —                                | hors périmètre : les séries dérivées ne sont pas le canon One Piece                                                                                                 |
| **Fighting Style Box**       |        60 | `technique` (0 entité)           | `focus` 100 %, `user` 92 %, `meaning` 90 %                                                                                                                          |
| **Race Box**                 |        41 | `race` (0 entité)                | `features` 87 % (prose descriptive), `homeland` 75 %                                                                                                                |
| **Merch Box**                |        39 | `merchandise` (0 entité)         | `type` 100 %, `date` 97 %, `price` 74 %                                                                                                                             |
| **Album Box**                |        31 | `album` (0 entité)               | `length` 100 %, `released` 100 %, `artist` 67 %, `label` 61 %                                                                                                       |
| **Movie Box**                |        28 | `film` (0 entité)                | `date` 100 %, `time` 92 %, `director` 67 % ; **24 champs**, la boîte la plus dense                                                                                  |
| **Event Box**                |        26 | `event` (2 entités)              | `location` 92 %, `outcome` 88 % (prose), `instigator` 80 %, `duration` 53 %                                                                                         |
| **Occupation Box**           |        23 | vocabulaire `occupations`        | pas une entité : alimente un vocabulaire déjà existant                                                                                                              |
| **International box**        |        19 | —                                | hors périmètre : c'est de la méta-édition par pays                                                                                                                  |
| **Live-Action Episode Box**  |        16 | `live-action-episode` (0 entité) | `Airdate` 100 %, `Episode`/`Season` 100 %, `Runtime` 100 % — la boîte la plus propre de tout l'inventaire                                                           |
| **Manga Box**                |        12 | —                                | hors périmètre : décrit des séries dérivées                                                                                                                         |
| **Scroll Box / Message Box** | 500 / 137 | —                                | **ce ne sont pas des entités** : ce sont des bandeaux de mise en page. Leur présence en tête du classement par volume est un artefact de comptage, pas un gisement. |

## 6 bis. Qui apparaît dans une source — et pourquoi ce n'est pas dans l'infobox

La question « quelles entités sont présentes dans ce chapitre / cet
épisode / ce film » ne se répond **pas** depuis l'infobox. Relevé sur
les pages rendues :

| source   | section                               |      pages | forme                        |
| -------- | ------------------------------------- | ---------: | ---------------------------- |
| chapitre | « Characters »                        |    39 / 40 | `<table class="CharTable">`  |
| épisode  | « Characters in Order of Appearance » |    40 / 40 | `<ul>` dans un bloc défilant |
| film     | « Characters in Order of Appearance » | **4 / 28** | —                            |

**Le film n'est pas couvert, et c'est une mesure, pas un renoncement.**
Sa section n'existe que sur 4 pages sur 28 ; ce qu'il porte à la place
(« Cast », 21/28) liste des comédiens de doublage, donc des `person` et
une relation `staffed-by`, pas des personnages présents. Vérifié page
par page sur _Film: Red_, qui n'a pas la section du tout.

### Ce que la CharTable dit, et ce qu'elle ne dit pas

Elle groupe **par faction** (colonnes : Pirates, Marines, World
Government, Bounty Hunters, Shipwrights, Revolutionary Army, Citizens,
Animals) **puis par équipage** (`<dt>`). C'est tentant, et c'est un
piège : `narrative-roles` — le vocabulaire du qualificatif `role` —
porte protagoniste, antagoniste, mentor, allié… pas une faction. Et
déduire une appartenance d'équipage **à la date du chapitre** serait
une inférence, pas une lecture. Le groupement est donc **ignoré**.

Ce qui est lu, en revanche : l'annotation entre parenthèses. Relevé sur
six pages — `(flashback)` 21 fois, `(cover)` 7 — et elle tombe
exactement sur le vocabulaire `appearance-types`.

### Ce qui est perdu, et qui demande un ADR

Le **rang** d'apparition. La section d'épisode s'appelle « in Order of
Appearance » et l'ordre est donc une donnée de la source ; mais
`features` n'a que `appearance_type` et `role` comme qualificatifs, et
aucun n'est un ordinal.

## 7. Ce qui est décidé, et dans quel ordre

**Fait dans cette passe** (la donnée existe, le schéma a déjà sa place) :

1. Les titres `ja` / `ja-latn` des 1 176 épisodes (`Kanji` / `Romaji`).
2. Les noms `ja` / `ja-latn` des 451 personnages (`jname` / `rname`).
3. Le mapper de l'**Island Box** → `location` (voir ci-dessous).

4. **L'Island Box** (414 pages) → le type `location`.

> **Correction de ce classement, faite en mesurant.** Cette section
> plaçait d'abord `charDebut` en tête et l'Island Box en dernier. La
> mesure dit l'inverse : les **451 personnages importés portent 6
> relations à eux tous**, et le mapper de personnage explique pourquoi
> — `origin` (89 % des Char Box) et `residence` (62 %) pointent des
> lieux qui **n'existent pas** dans le corpus. Ce n'est pas un défaut
> de résolution : testé avec un registre peuplé, le résultat est le
> même. Importer les lieux est donc le premier déblocage, et il en
> apporte deux : les 414 pages elles-mêmes, et les relations des
> personnages.
>
> Au passage, la même mesure a montré que le vide des relations a une
> **seconde** cause, délibérée celle-là : le mapper refuse les lignes
> d'affiliation annotées « (former) », qui demandent une ancre `until`
> qu'aucun fait de page ne donne. Ça, ça reste juste.

**Ensuite, par rendement décroissant** :

4. ~~`charDebut`~~ **dépassé** : la section « Characters » du chapitre
   et « Characters in Order of Appearance » de l'épisode couvrent
   39/40 et 40/40 des pages, contre 52 % pour `charDebut`, et elles
   donnent TOUTES les apparitions, pas seulement les débuts. Fait —
   voir §6 bis.
5. Les dates de diffusion par territoire (`released_at` + `territory`).
6. Live-Action Episode Box, puis Album, puis Game : trois boîtes propres
   dont le type existe déjà.

**Refusé, et pourquoi** :

- les fichiers `image` de Fandom — ADR-107 ;
- `age2` / `switch` — l'ancre d'historisation n'est pas dans la source ;
- Spin-Off Chapter/Volume, Manga Box, International box — séries
  dérivées et méta-édition, hors du canon que le wiki décrit ;
- Scroll Box, Message Box, Article Message Box — des bandeaux, pas des
  entités.

**Demande un ADR avant toute ligne de code** :

- `colorscheme` → une palette canonique par faction (§4) ;
- `Use` de la Song Box (« Opening: Episodes 1-47 ») → une relation
  générique-vers-plage-d'épisodes, qui n'existe pas au modèle.
