# Project state & handoff

The living "where things stand and what to resume" snapshot, so a fresh
session can pick up mid-stream. Architectural _rationale_ lives in
`/docs/DECISIONS.md` (ADRs); the build order in `/docs/ROADMAP.md`;
this file is the current status + the open threads.

> **DIRECTIVE MAINTENEUR (2026-08-08, valable jusqu'à révocation
> explicite)** : le projet est en BÊTA avec 0 utilisateur. Aucune
> dépendance externe à préserver — la priorité absolue est la base la
> plus solide possible, même au prix de très grosses migrations,
> refontes ou refactors complets. Ne pas ajouter de couches de
> compatibilité/dépréciation pour protéger des usages inexistants ;
> `check:compat` sert à DÉTECTER les breaking changes pour les faire
> consciemment, pas à les interdire. Casser + migrer le corpus d'un
> coup est le mode normal.

**Last updated**: 2026-08-27 (ADR-120 substrat rendu pour les
chapitres ; ADR-121 plage ouverte ; 114 volumes importés ; fuite
anti-spoil sur 46 arcs en attente d'arbitrage)

### Chaîne de merge en cours

`#157` (ADR-121 + test dépunaisé) → `#158` (114 volumes) →
`import/chapter-render-33125002723` (enrichissement chapitres 0-100).

L'ordre est **contraint** : l'enrichissement écrit des
`part-of-volume` que `check:references` refuse tant que les volumes ne
sont pas dans le corpus, et #158 ne passe pas tant que le test
dépunaisé de #157 n'est pas sur `main`.

Il reste **11 tranches** d'enrichissement à lancer (chapitres 101 à
1131), une requête rendue par chapitre.

## 2026-08-27 — 46 arcs sur 50 ne sont pas anti-spoilés — À DÉCIDER

**C'est la promesse centrale du produit qui fuit, et je ne l'ai pas
corrigé dans la PR qui l'a révélée.**

`buildEntityView` ferme une page quand `first_appearance_source` est
au-delà du curseur. Comptage sur l'artefact courant :

| type            | entités |                        avec ancre |
| --------------- | ------: | --------------------------------: |
| `arc`           |      50 |                             **4** |
| `manga-chapter` |    1193 | 0 (se ferment sur leur propre id) |
| `anime-episode` |     594 |                          0 (idem) |
| `character`     |      10 |                                10 |

Un arc sans ancre s'affiche **entièrement, à n'importe quel curseur**,
avec la liste de ses chapitres. Pour un lecteur au chapitre 100, la
page `arc/wano-country` déballe 149 chapitres jusqu'à 1057.

Comment c'est sorti : le test `entities beyond the progression render
gated` s'appuyait sur `arc:wano`, un stub semé à la main dont le
`since` était **la seule chose** qui ancrait un arc. La migration 0011
l'a fusionné dans `arc:wano-country` (voir plus bas) et le test est
tombé. Le test n'a jamais couvert « les arcs sont anti-spoilés » ; il
couvrait « ce stub-là a un `since` ».

Les 4 arcs ancrés sont les rescapés du semis manuel. Les 46 autres
viennent de Fandom, qui ne fournit rien de tel.

**Ce qui est maintenant calculable** — et ne l'était pas avant la passe
d'arêtes (ADR-119) : l'ancre d'un conteneur est le minimum ordinal de
ce qu'il contient. 44 arcs sur 50 ont des chapitres ; Wano tomberait
sur 909, East Blue sur 1.

**Pourquoi je ne l'ai pas fait tout de suite** : `first_appearance_source`
est une primitive du modèle épistémique, pas un détail de pipeline. La
dériver pour les conteneurs change ce que le mot veut dire (« première
apparition » vs « ouverture »), et CLAUDE.md interdit ce genre de
glissement sans ADR.

### Mesure : les deux notions ne coïncident pas, et c'est tranchant

44 arcs sur 50 ont des membres numérotés, donc une ouverture
dérivable ; 6 resteraient sans ancre (`caesar-retrieval`,
`cidre-guild`, `elbaph`, `marine-rookie`, `silver-mine`, `uta-s-past`
— les mêmes orphelins que la passe d'arêtes n'a pas atteints).

Mais **3 des 4 ancres existantes contredisent la dérivation**, et
toujours dans le même sens :

| arc           | ancre semée | ouverture dérivée |
| ------------- | ----------: | ----------------: |
| `baratie`     |      ch. 42 |        ch. **19** |
| `whisky-peak` |     ch. 106 |        ch. **64** |
| `marineford`  |     ch. 550 |       ch. **457** |

Ce n'est pas une erreur de saisie : c'est une autre notion. Le Baratie
est _nommé_ vers 42, l'arc _commence_ à 19. Marineford est nommé à 550,
la guerre s'ouvre à 457. `first_appearance_source` semé à la main
voulait dire « où ce nom apparaît », pas « où l'arc commence ».

**Conséquence pour l'arbitrage** : écraser `first_appearance_source`
avec l'ouverture détruirait une information réelle sur ces 3 arcs, et
en dirait une fausse sur les 41 autres. Ça oriente fortement vers une
**primitive distincte** (`opens_at`) plutôt que vers une dérivation qui
réécrit celle qui existe.

Reste la question de fond, qui est produit et pas technique : sur quoi
une page d'arc doit-elle se fermer ? Un lecteur au chapitre 500 est _au
milieu_ de Marineford — se fermer sur 550 lui cacherait un arc qu'il
est en train de lire. Se fermer sur 457 est juste pour « puis-je voir
cette page », et le _nom_ de l'arc garde son propre `since` pour le
reste. C'est l'option que je proposerais, mais elle n'est pas à moi.

**Décision demandée** : primitive `opens_at` distincte, dérivée du
minimum ordinal des membres, et c'est elle qui ferme une page de
conteneur ?

En attendant, la fuite est là, antérieure à la migration, et élargie
d'exactement un arc par elle.

## 2026-08-27 — doublon `arc:wano` / `arc:wano-country` (migration 0011)

Deux entités décrivaient un seul arc : un stub semé à la main (3
relations) et la page Fandom (`arc_number: 31`, 149 chapitres après
ADR-119). Rien ne l'a détecté jusqu'à ce qu'une page chapitre soit
**rendue** : le chapitre 1044 affichait « PART OF ARC / WANO COUNTRY »
au-dessus d'un ruban de deux cases, parce qu'il portait les deux
arêtes.

`mergeEntity` avait raison de les unir — il ne peut pas savoir que deux
ids nomment la même chose. Résolu dans les données
(`data/migrations/0011-merge-duplicate-wano-arc.ts`, `--allow-lossy` :
le `since: manga-chapter:1043` du stub était écrit à la main et faux).

Deux leçons opérationnelles :

1. **Quatre séries d'assertions étaient épinglées au corpus**
   (`views.test.ts` : `[1043, 1044, 1053]` en dur). Réécrites pour
   affirmer le contrat — le chapitre courant est dans son ruban une
   seule fois, marqué courant, parmi des frères ordonnés — plutôt que
   la population.
2. **Le serveur web bundle sa copie de `dist/onepiece.db` au build.**
   Un serveur laissé tourner sert l'ancien artefact et ment. Première
   relecture de la page après migration : ruban à 3 cases. Après
   redémarrage : 149. Toujours redémarrer avant de conclure.

## 2026-08-28 — `arc:east-blue` est une SAGA, pas un arc — À DÉCIDER

Après l'enrichissement, **3 chapitres sur 1193** portent deux
`part-of-arc`. Ce sont les trois chapitres semés à la main avant
l'importeur, dont l'ancienne arête entre en collision avec celle de
Fandom. Mais les deux cas ne sont pas de même nature :

| chapitre | arête semée  | arête Fandom   | nature                                        |
| -------- | ------------ | -------------- | --------------------------------------------- |
| 585      | `marineford` | `post-war`     | **contradiction** — corrigée (migration 0012) |
| 1        | `east-blue`  | `romance-dawn` | **granularité** — ouvert                      |
| 96       | `east-blue`  | `loguetown`    | **granularité** — ouvert                      |

Pour 585, la source tranche : la passe d'arêtes planifie les plages
FERMÉES par chapitre d'ouverture, donc si la plage Marineford avait
couvert 585, elle l'aurait réclamé avant que Post-War ne tourne. Elle
ne l'a pas fait. L'arête `marineford` était un reliquat.

Pour East Blue, non :

```
arc:east-blue     2 membres   arc_number —    ← semé à la main
arc:romance-dawn 10 membres   arc_number 1    ← Fandom
arc:loguetown    11 membres   arc_number 6    ← Fandom
```

East Blue n'est pas un arc, c'est une **saga** — elle contient Romance
Dawn, Orange Town, Syrup Village, Baratie, Arlong Park et Loguetown.
Elle n'a ni `arc_number` ni membres au-delà des 2 semés, parce que
Fandom ne la publie pas comme un arc.

Le corpus a déjà un type d'entité `saga`… avec **0 entité**.

**Décision demandée** : migrer `arc:east-blue` en `saga:east-blue` et
peupler le type `saga` (les 4 sagas de One Piece), ou garder les sagas
hors modèle pour l'instant ? Tant que ce n'est pas tranché, le
chapitre 1 affiche « East Blue » là où la planche afficherait
« Romance Dawn ».

C'est la troisième fois ce soir que la même famille de défaut sort :
une donnée semée à la main avant l'importeur qui survit et contredit
la source (`arc:wano`, les 9 titres placeholders, ceci). `mergeEntity`
a raison de ne pas trancher — il ne peut pas savoir que deux ids
nomment la même chose, ni qu'un est plus grossier que l'autre.

## 2026-08-27 — la limitation v1 du curseur a un coût, et le voici

`progress.ts` le dit depuis le début, noir sur blanc :

> « Anchors with no cursor on their axis […] stay visible — **a
> documented v1 limitation, not an accident**. »

Ce n'est donc pas un défaut découvert, c'est une décision déjà prise.
Mais elle n'avait jamais d'instance concrète. En voici une, sortie de
l'import des épisodes 595-1176 :

Un lecteur qui déclare **manga : chapitre 100** et **rien sur l'anime**
cherche « nika ». La recherche lui rend :

> **anime-episode:1152 — « Her Father and Mother's Legacy! Bonney's
> Nika Punch »**

Soit, en une ligne : que Nika existe, et que Bonney a un pouvoir lié à
Nika. C'est la révélation centrale de l'arc Egghead, ~1000 chapitres
devant lui.

`isSourceVisible` rend `true` dès que l'axe n'a pas de curseur. Donc
**déclarer sa progression manga n'achète aucune protection sur l'axe
anime.** Les deux lectures possibles d'un axe vide sont « je n'ai rien
vu » et « je me fiche des spoilers anime » ; le code choisit la
seconde, en silence.

**Pas corrigé ici** : c'est une décision produit écrite, pas un bug, et
la changer touche toutes les pages, pas seulement la recherche.
**Question** : un axe laissé vide alors qu'un autre est renseigné
devrait-il valoir 0 plutôt que ∞ ?

Le test qui l'a révélé affirmait « le résultat est vide » — vrai
seulement tant qu'aucune autre entité ne pouvait matcher « nika ». Il
affirme maintenant ce qu'il voulait dire : `event:nika-reveal` est
introuvable. Même correction, même fichier, que celle déjà appliquée
au test des chapitres.

## 2026-08-27 — l'arc EN COURS ne pouvait structurellement pas être placé

Trouvé en cherchant pourquoi 6 arcs n'avaient aucune arête. Cinq sont
`arc_subtype: filler` — anime-only, donc pas de chapitres, c'est
correct. **Elbaph était la seule anomalie**, et c'est l'arc manga en
cours : les chapitres 1126 à 1131 n'avaient aucun arc.

Capture de la page rendue avant d'écrire une ligne :

| arc        | `chapter` rendu          | parsé      |
| ---------- | ------------------------ | ---------- |
| Egghead    | `1058-1125, 68 chapters` | 1058…1125  |
| **Elbaph** | **`1126-`**              | **`null`** |

Elbaph est en cours de sérialisation : pas de dernier chapitre, donc
plage ouverte. `parseOrdinalRange` la rejetait sous ma propre règle
« jamais une plage fabriquée » — juste pour `-, chapters`, fausse ici.

**Le coût était exact et invisible : l'arc que le lecteur est en train
de lire était le seul que le wiki ne pouvait jamais placer**, et il le
serait resté à chaque nouvel arc. Corrigé par ADR-121.

Le piège du correctif, qui vaut d'être retenu : une plage ouverte
réclame tout à partir de son début, donc si elle passe avant un arc
fermé elle avale ses chapitres sur la règle « le premier arc gagne ».
Les plages fermées sont désormais planifiées d'abord — une
réclamation bornée est plus spécifique qu'une non bornée.

## 2026-08-27 — 9 titres de chapitre sont restés des placeholders

Même famille que le stub `arc:wano` : de la donnée semée à la main que
l'import ne peut pas corriger.

`stageToLocal` fusionne les traductions avec « les clés existantes
gagnent », **y compris sous `--overwrite`** — la règle protège une
traduction humaine d'un écrasement machine, et elle a raison. Mais elle
ne distingue pas une traduction humaine d'un **placeholder semé**.
Résultat, 9 chapitres sur 1193 gardent `"Chapter N"` comme titre
pendant que les 1184 autres ont le vrai :

`96, 432, 550, 574, 585, 731, 1043, 1044, 1053` — exactement les
chapitres semés à la main avant l'importeur.

Visible sur la page : `manga-chapter/chapter-1044` affiche
« TITRE : Chapter 1044 » alors que 1045 affiche « Next Level ».

Correction possible en un run CI (supprimer les 9 clés puis
réimporter ces 9 pages), pas faite ici pour ne pas mélanger une
correction de données à une correction d'UI. Fandom n'est pas
joignable depuis cette session (proxy 403), donc ça passe forcément
par le workflow.

## 2026-08-27 — pourquoi l'import des arcs n'a rien donné

**Décision en attente du mainteneur**, en bas de section.

J'avais lancé l'import des arcs en annonçant qu'il débloquerait le
dialogue de progression. Il ne l'a pas fait : 5 `since` sur 51, 0
`arc_number`, 0 relation. Le relevé de structure Fandom du 2026-08-27
dit pourquoi, et ce n'est pas un défaut du mapper.

`Arc Box` porte `chapter`, `episode` et `vol`. Mais sur 25 pages
d'arcs, ces champs prennent **3 ou 4 valeurs distinctes** en tout, dont
`auto` — alors que `Volume Box.chapters` en prend **25 sur 25**
(`100 - 108`, `109 - 117`). La comparaison tranche : quand une plage
est vraiment écrite dans le wikitext, chaque page a la sienne. Les
plages d'arcs sont **calculées par un module Lua à l'expansion**, donc
absentes du wikitext brut. Aucun mapper lisant
`action=parse&prop=wikitext` ne les verra jamais.

Les deux autres portes sont fermées : **ni `Chapter Box` ni
`Episode Box` n'ont de champ d'arc**, et les pages d'arc **n'ont
aucune wikitable** (`structure.tables` vide sur 25 pages).

C'est le pont qui manque au dialogue de progression ET à la dérivation
anime→manga que tu as choisie. Détail complet dans `FANDOM_SYNC.md`.

### Ce qui est disponible sans rien changer

- **L'ordre des arcs** : `prev`/`next` sont des wikiliens littéraux
  (18-19 distincts sur 25), et `prev anime`/`next anime` donnent la
  chaîne côté anime, filler compris. De quoi remplir `arc_number`.
- **Le pont volume → chapitres**, littéral et complet à 100 %
  (`Volume Box.chapters`, 115 volumes).
- `Episode Box.chapter` (`Chapter 432 (p. 2-19)`) — le pont
  épisode → chapitre, mais rempli à 0,16 seulement.

### La décision

`action=parse&prop=text` renvoie le gabarit **expansé** : les plages y
sont. Techniquement direct. Mais ça fait lire de l'**HTML rendu** là où
tout l'importeur lit du wikitext, et ADR-079 a bâti l'extraction sur ce
substrat-là. Je ne l'ouvre pas sans toi — c'est un changement de
contrat d'extraction, pas un réglage.

Trois options, si tu veux trancher :

1. **HTML rendu pour ce seul mapper.** Les plages tout de suite, au
   prix d'un second substrat à maintenir.
2. **Ordre des arcs seulement** (`prev`/`next`), sans plages. Sûr,
   suffisant pour ordonner et naviguer, insuffisant pour dériver
   l'anime du manga.
3. **Passer par les volumes** : `Volume Box.chapters` est complet, donc
   volume → chapitres est acquis. Reste à relier volume → arc, ce que
   le relevé ne montre nulle part.

## 2026-08-27 — la palette de recherche (ADR-118)

La planche `Recherche.dc.html` du canevas v2 est implémentée. ADR-108
avait pourtant écrit « No autocomplete popover » ; le mainteneur a
validé un canevas qui en contient une, donc le renversement est le
sien et ADR-118 l'enregistre plutôt que de l'opposer.

Ce qui survit d'ADR-108 : `/search` reste la page, l'URL partageable,
le rendu serveur et le chemin sans JavaScript. Le `<form>` de
l'en-tête reste un vrai formulaire ; la palette se greffe dessus (⌘K,
Ctrl-K, ou le focus sur le champ) et interroge la même `fetchSearch`.

Deux règles anti-spoil portées par le code et ses tests
(`lib/search-groups.ts`) :

- **les compteurs de puces comptent l'écran, jamais le corpus** — la
  barrière tourne en SQL, un résultat non atteint n'arrive jamais au
  composant, et le compter reviendrait à imprimer un décompte de ce
  qu'on cache ;
- **« au-delà de ta progression » n'est dit que si un curseur
  existe** ; le pied « Limité à ta progression » aussi.

La palette n'invente rien : la maquette montrait « résultats pour
_gomu gomu_ » sur une faute de frappe, mais `buildSearchView` renvoie
`approximate: boolean` sans terme corrigé — on affiche la mention
existante, pas une correction fabriquée.

## 2026-08-27 — la frontière d'import était un no-op

Le plan « sources d'abord, sujets ensuite » (chapitres 398→1145,
épisodes 401→1122, puis les 117 fruits qui les référencent) butait sur
un défaut simple et invisible : `data/import/fandom-pages.json` était
**lu et jamais écrit**. Trois entrées au registre face à 881 entités
importées. `--skip-known` sautait donc une page sur 881, et chaque run
borné repartait de « Chapter 0 » — le commentaire du code affirmait
depuis le run 5 que « successive bounded runs should ADVANCE », et
c'était faux.

Réparé : tout run qui **stage** replie ses résultats dans le registre
(`recordImports`) et le réécrit. Trois points qui comptent :

- **Les alias s'accumulent.** Un crawl n'atteint une page que par UN
  redirect au plus ; un remplacement en bloc effacerait le reste du jeu
  d'alias appris par les runs précédents et par `check-updates` (qui les
  lit par paquets de cinquante). `mergeImport` fusionne, et garde
  l'ancien titre d'une page renommée comme alias — les wikiliens
  entrants l'utilisent encore.
- **La révision est capturée.** `action=parse` demande maintenant
  `prop=wikitext|revid`, donc une entrée porte la révision réellement
  lue. Sans ça `check-updates` aurait déclaré les 881 pages périmées à
  perpétuité (`lastRevId === undefined` ⇒ jamais importée).
- **Une entrée est écrite même quand le fichier d'entité a été sauté**
  parce qu'il existait : c'est ce que ce saut veut dire, et le registre
  est la seule mémoire de la provenance (aucun fichier d'entité ne la
  porte).

Pas d'ADR : ADR-081 décrivait déjà ce registre et ce comportement. Ce
n'était pas une décision à prendre, c'était du code qui ne faisait pas
ce qu'il disait.

**Conduite à tenir pour la reprise des imports** : le premier run par
catégorie part **sans** `skip_known` (il remappe l'existant sans
l'écraser et l'inscrit au registre avec de vraies `pageId`/`revid`) ;
les suivants passent `skip_known` et avancent. Une PR d'import mergée
avant de lancer la suivante, sinon deux runs repartent du même point.

## 2026-08-27 — refonte design v12, et le vrai goulot d'étranglement

Après **onze rejets** du design, la méthode a changé : plus de v12
livrée à l'aveugle, mais un **canevas de maquettes** validé avant
d'écrire du code (`design/v2`, dix planches, PR #127). Le mainteneur a
tranché — châssis en grille de panneaux, chronologie en type de
panneau, onglets à vraies URLs — puis a dit « tu peux commencer à
implémenter ».

**Quatre tranches livrées**, chacune avec typecheck + lint + 158 tests

- build de l'app :

| Commit    | Tranche                                                 |
| --------- | ------------------------------------------------------- |
| `e8c6f9e` | Trois rôles de couleur disjoints, l'or au premier plan  |
| `7a22474` | Les modules d'entité deviennent des panneaux            |
| `80f9a96` | L'historique se lit sur un axe, valeur courante en tête |
| `faef5ed` | Un onglet par type de source dans les apparitions       |

**ADR-112** consigne la cause des onze rejets : ADR-111 avait retravaillé
la palette sans toucher à la sémantique, or le défaut était là — une
même couleur disait trois choses et changeait de valeur d'une page à
l'autre.

### Le goulot d'étranglement n'est plus le design, c'est la donnée

**Constat qui a arrêté la cinquième tranche.** Le dialogue de
progression retenu se règle **par arc**. Le corpus contient :

|                 |                |
| --------------- | -------------- |
| arcs            | **3**          |
| sagas           | **0**          |
| personnages     | 10             |
| équipages       | 1              |
| fruits du démon | 1              |
| chapitres       | 34             |
| **total**       | **61 entités** |

Un sélecteur d'arcs listerait trois arcs sans aucun regroupement par
saga. Les pages de liste montreraient dix personnages. Le module « ce
que tu viens de croiser » de l'accueil n'aurait rien à montrer.

**Le design est en avance sur les données.** Continuer à coder des
surfaces qui n'ont rien à afficher produit du travail invérifiable :
on ne peut ni juger le rendu, ni détecter les cas limites que seul un
corpus réel fait apparaître.

**Prochaine action recommandée** : lancer le premier import Fandom
**réel** sur une seule catégorie. Les six mappers d'ADR-109 n'ont
jamais tourné que sur des fixtures synthétiques — le premier passage
live est leur véritable test. Le workflow `fandom-import`
(`workflow_dispatch`, entrée `category`) ouvre une PR de données, donc
l'opération est relisible et réversible.

### Vérifié au passage : la règle anti-spoil tient déjà côté serveur

Audit du code existant, pas une supposition : les comptes affichés sont
**tous** bornés à la progression (`isSourceVisible`, `visiblePopulation`
dans `server/views.ts`). « 342 sur 1044 » signifie 342 apparitions sur
les 1044 chapitres **lus**, pas sur le total paru. Aucun compteur
d'absence nulle part. Rien à corriger.

### Trois arbitrages en attente du mainteneur

1. **Balayage `JSX.Element`.** react-doctor remonte 39 erreurs sur ce
   seul motif, préexistant et répandu (~200 occurrences sur les deux
   apps). Attention : **le correctif proposé par l'outil est mauvais
   ici** — il suggère `ReactNode`, qui est _plus large_ et ferait
   perdre la garantie de type de retour exigée par `CLAUDE.md`. Le bon
   balayage est `ReactElement`.
2. **Précision de `since`** (le cas Rocks) — parqué dans `IDEAS.md`,
   demande un ADR.
3. **Marqueur « cette information n'existe pas dans l'œuvre »** — parqué
   dans `IDEAS.md`, demande un ADR.

**2026-08-27 — remontée et tri de toutes les PR ouvertes.**
`main` = `f0101b7`.

- **#121 mergée** — design v7→v9, ADR-102..107, `docs/VISION.md`, lot
  licence + correctifs d'import + instrumentation de l'analyseur.
- **#94 mergée** (chapitres Fandom) — vérifiée titre par titre avant
  merge (« Incident at the Tavern », « Dog », « Gong »… sont les vrais
  titres). Corpus **37 → 61 entités**, `validate` / `schema:check` /
  `check:references` verts après merge.
- **#96 fermée sans merge** (épisodes Fandom, run 31224649430) —
  **données fausses, pas incomplètes** : les 25 premières pages de la
  catégorie `Episodes` sont les « Special Edited Version », et huit
  récapitulatifs post-ellipse avaient été écrits sous
  `anime-episode:1..8`. `anime-episode:1` portait « The New Beginning!
  The Straw Hats Reunite! » au lieu de « I'm Luffy! ... ». La forme
  étant parfaite, `validate` ne pouvait pas le voir. Le correctif
  (`ordinal-title.ts` + `orderCrawlQueue`) est sur `main` ; **relancer
  `fandom-import` sur la catégorie Episodes** produira les bons.
- **#90 fermée** (bande d'images dashboard, ADR-070/072) — la
  fonctionnalité reste souhaitable mais la branche n'est pas
  rattrapable : ses numéros d'ADR sont **déjà pris sur `main`** par
  d'autres décisions (070 = runner de migrations, 071 = entité
  `volume`), plus 4 conflits dont `url.json` (qui a gagné `factual`).
  À réimplémenter sur base actuelle. Sans urgence : le corpus n'a
  aucune image réelle.
- **#1 et #2 fermées** — tests de bout en bout du dashboard de mai.
  #1 fusionnait nom et épithète (« Baggy le clown ») là où `main` les
  sépare correctement ; #2 réintroduisait `caused-death-of`,
  supprimée par ADR-098, et aurait cassé `validate`.

**Livré (2026-08-27) — six mappers Fandom** (ADR-109), écrits contre
le relevé structurel `docs/audits/fandom-structure-2026-08-27.*` :
`devil-fruit` (211 pages), `crew` (149), `ship` (141), `organization`
(114), `weapon` (112), `arc` (70). **4 infobox mappées sur 39 → 10.**
Couverture des champs relevés : **71 mappés / 18 ignorés / 0 non
mappé**. Les shapes du relevé décident de la destination : `wikilink*`
→ relation (dans le seul sens canonique — ADR-033/098), `first` → axe
`since` + warning nommant l'arête `features` à poser côté chapitre,
`jname`/`rname` → locales de données `ja`/`ja-latn` (ADR-095, `emit.ts`
écrit les deux sidecars), `enum_like` → vocabulaire existant,
`colorscheme`/`image` → ignorés explicitement (ADR-107 pour les
images). 4 valeurs de vocabulaire **additives** (`ship-types.unknown`,
`weapon-types.unknown`, `org-types.unknown`, `arc-subtypes.filler`) —
`check:compat` : 4 additifs, 0 breaking, snapshot régénéré.

- **À faire en premier après merge** : lancer `fandom-import` sur les
  six catégories (le maintainer a l'egress ; la sandbox non), puis
  **relire les fixtures synthétiques** `packages/importers/__tests__/
  fixtures/{devil-fruit,crew,ship,organization,weapon,arc}-*.json`
  contre les vraies réponses `action=parse` et les remplacer.
- **Pauvretés de schéma relevées, NON contournées** (voir ADR-109) :
  `name` n'a **aucun qualifieur de variante de traduction**, donc les
  listes `ename` (VIZ/Funimation/4Kids, remplies à 100% sur cinq des
  six boîtes) n'ont nulle part où aller ; `ship` n'a ni classe de
  navire ni dimensions ; `weapon` n'a pas de relation côté arme vers
  son porteur ; `organization` n'a ni `status` ni `disbanded_at` ;
  `arc` n'a pas de plage de dates.
- **Îles hors périmètre** : Island Box (414 pages) reste le plus gros
  trou et demande un ADR de modélisation des lieux.

**Lancé** : `fandom-analyze` (workflow_dispatch sur `main`, preset
complet) — le relevé structurel est l'entrée obligée de la refonte de
schéma, et le runner GitHub a l'egress que la sandbox n'a pas. Le
rapport est commité sur une branche `audit/`.

**Livré (2026-08-27) — v11 « Deep Water » : la palette re-fondée**
(ADR-111, supersede ADR-104). Verdict mainteneur sur la v10 :
« l'ui du site me convient pas du tout. j'ai bien le font du texte mais
c'est tout » + « analyse les couleurs de One Piece, différents
supports. Ça ne doit être exactement ces couleurs car trop kitsch mais
quelques touches par ci par là ». **Archivo reste** ; tout le reste de
la couleur a changé.

_Le diagnostic_ : « j'aime bien le gold » avait été transformé par
ADR-104 en contrainte sur TOUTE la palette (dix accords dans la bande
12°–100°, plus un fond brun chaud, plus un test bloquant). L'or devait
être un **accent d'identité** ; il est devenu le spectre entier — et
or/parchemin/trésor est précisément le cliché pirate kitsch, pas le
langage chromatique de l'œuvre.

_Ce qui remplace_ :

- **Fond = nuit océanique** `oklch(0.165 0.03 250)`. La mer et le ciel
  sont la constante environnementale de l'anime. Le chrome (barre,
  pied) descend d'un cran, `--color-abyss`, pour ne pas être un
  n-ième panneau plat sombre.
- **Deux accents, parcimonieux** : `--color-gold` ré-écrit en **jaune
  chapeau de paille** (wordmark, primes, focus, sélection — rien
  d'autre) et `--color-accent` en **vermillon du gilet de Luffy**
  (couleur interactive du chrome neutre).
- **Douze accords qui parcourent la roue une fois**, dans l'ordre du
  spectre — la logique réelle d'une étagère de tankôbon. Ce n'est pas
  une roue libre : liste d'ancres fermée, ≤ 40° d'écart interne par
  accord, et surtout **tous les fonds d'illustration dans la même
  famille sombre peu chromatique**. C'est ce fond partagé qui empêche
  la lecture « couleurs aléatoires » qui avait fait échouer la roue
  libre avant ADR-104.
- **La garantie de contraste survit et compte davantage** : chaque
  accent est remonté en clarté jusqu'à ≥ 4.5:1 mesuré contre le
  canvas (5.6 → 12.4 selon l'accord). Un bleu à la clarté d'un jaune
  est bien plus sombre.
- **Les jetons `--art-*` neutres de `styles.css` ne sont plus tapés à
  la main** : ils SONT l'accord `outremer`, comparés valeur par valeur
  par un test.
- **Héros calmé** (0.62 / 0.30 + scrims des deux côtés) : à douze
  teintes, un fond de héros à l'opacité v8 transformait tout le
  viewport en cette teinte — le même échec que la palette chaude, dans
  une autre couleur.
- **Zéro poids ajouté** : édition de palette + deux opacités. Aucune
  dépendance, aucun script, aucun calcul couleur au runtime.

Tests : la bande chaude est supprimée, **trois tests structurels** la
remplacent (ancres fermées, cohérence interne d'un accord, famille de
fonds) plus un quatrième qui épingle `styles.css` sur un accord
authentifié. 667 tests verts.

**Livré (2026-08-27) — quatre chantiers UI du wiki public**
(`apps/web` + `docs/`). Détail complet dans `docs/WEB_APP.md` ;
la décision tabs/sous-pages est **ADR-110**.

1. **Fuite de spoiler sur les noms — corrigée.** `resolveEntityName`
   ne lit plus `canonical_name_key` : elle exécute `DISPLAY_NAME_SQL`
   (`server/search-sql.ts`), **la même requête et la même barrière
   `search_gates`** que le libellé d'un résultat de recherche. Titre de
   page, hero, `<title>`, puces, libellés de liens, cartes de listing
   et résultats de recherche partagent désormais UNE résolution :
   ils ne peuvent plus se contredire. Repli 1 : entité dont la clé
   canonique n'est portée par aucune propriété localisable (les
   entités `image`) — sans ancre, donc résolue directement. Repli 2 :
   entité dont **tous** les noms sont au-delà du curseur → le slug,
   jamais la clé brute. Le corpus réel ne pouvait pas exhiber le bug
   (toutes les entités multi-nommées déclarent leur nom le PLUS ANCIEN
   comme canonique) : `server/__tests__/display-name.test.ts` greffe
   donc deux entités synthétiques sur une copie jetable de l'artefact
   et rejoue les deux cas de la recherche (nom postérieur, existence
   postérieure). 4 de ses 7 tests échouent sans le correctif.
2. **Hover card desktop** sur les liens sans image (puces en ligne,
   numéros de chapitre, listes de contenu). Filtrée par le curseur
   côté serveur (`buildEntityPreview`) — un aperçu est une
   _surfaçation_, comme un résultat de recherche. `(hover: hover) and
   (pointer: fine)` uniquement, focus clavier, Échap, reduced-motion.
   Chargement : intention de survol 170 ms + mémo module clé
   `locale/type/slug/scope` + une seule promesse en vol par clé.
3. **Ratios d'image fixés par type d'image** (`src/lib/image-ratio.ts`)
   — dérivés de ce que l'image EST : `image_width`/`image_height` du
   schéma d'abord, sinon le rôle `depicted-by` (vocabulaire
   `depiction-roles`), sinon rien et le cadre appelant reste (ADR-091).
   Cinq classes documentées ; une image dont le ratio s'écarte du cadre
   est `contain`ée sur l'art plutôt que massacrée en `cover`.
4. **Sous-pages plutôt qu'onglets** (ADR-110) :
   `/{type}/{slug}/{section}`, registre `src/lib/entity-sections.ts`
   qui **découpe** les bandes d'ADR-106 au lieu de les dupliquer.
   Aujourd'hui les Chapeaux de Paille s'affichent en une seule page —
   leur équipage est le seul module peuplé du corpus, donc l'invariant
   « jamais de sous-page vide » supprime la navigation. C'est le
   mécanisme qui fonctionne, pas un manque.

**Livré (2026-08-27) — recherche du wiki public** (ADR-108). `apps/web`
n'en avait **aucune** ; il y a maintenant un index FTS5 + trigrammes
construit DANS `dist/onepiece.db` par `packages/db-builder`, une route
`/search` et un champ dans la barre du haut.

- **Plein texte** : FTS5 `unicode61 remove_diacritics 2` (préfixes,
  multi-mots, insensible aux accents — « equipage » trouve « Équipage
  du Chapeau de Paille »), classé par `bm25`.
- **Fautes** : recouvrement de trigrammes (Sørensen–Dice) par MOT du
  document, en **repli strict** — il ne se déclenche que si la passe
  lexicale n'a rien trouvé. « zorro » → Roronoa Zoro, « nammi » → Nami,
  « marinford » → Marineford.
- **Multilingue** : une ligne par locale d'INTERFACE (`en`, `fr`) ;
  `ja` / `ja-latn` restent des locales de DONNÉES (ADR-095) et ne sont
  **pas** indexées — un résultat de recherche est une exposition. Le
  match est inter-locale, l'affichage est dans la locale du lecteur.
- **Anti-spoil** : chaque chaîne indexée porte ses ancres de
  progression (`search_gates`) ; le curseur filtre **en SQL, avant le
  LIMIT**. Les deux cas sont couverts et testés : une entité dont
  l'_existence_ est un spoiler (`event:nika-reveal`, ch. 1044) ne
  renvoie **rien** — jamais une ligne « résultat masqué », qui serait
  elle-même un spoiler ; et une entité qui existe mais dont le _nom
  tardif_ est un spoiler reste trouvable sous le nom qu'elle porte au
  curseur (Luffy au ch. 50 : « Luffy » oui, « Straw Hat » non).
- **Ce qui reste ouvert** (Phase 6.3) : la palette ⌘K et les facettes
  de résultats. Les narratifs ne sont pas indexés tant que les marqueurs
  `:::spoiler:::` ne sont pas analysés (voir ADR-108).

**Note de dette repérée en passant — CORRIGÉE le 2026-08-27** (voir
l'entrée « chantiers UI » ci-dessous) : `resolveEntityName`
(`server/views.ts`) résolvait `canonical_name_key` **sans** le curseur,
si bien qu'une page d'entité pouvait afficher un nom postérieur au
curseur là où la recherche, elle, filtrait.

> **LIRE `/docs/VISION.md` AVANT TOUT TRAVAIL SUR `apps/web`, LES
> IMPORTEURS OU L'ACQUISITION.** Il porte l'intention produit, les publics
> visés, la lecture du concurrent (onenoobiece.fr), la **calibration du
> goût du mainteneur** (9 itérations de design, 7 rejetées — références
> aimées et rejetées, registres qui échouent et pourquoi), les acquis à ne
> pas défaire, et la tension de licence CC-BY-SA à trancher avant tout
> import massif depuis Fandom.

**2026-08-27 — ADR-107 (licence) + le pipeline d'import débloqué et
instrumenté.** Brief mainteneur : données d'abord, comptes plus tard,
refonte complète du schéma pilotée par une analyse Fandom réelle,
images « TMDB + visuels tiers avec politique de retrait ».

_Ce que l'inspection a trouvé_ — le récit « 37 entités parce que
l'egress est bloqué » était faux. Le pipeline existe, tourne en CI (les
runners ont l'egress), et il échouait pour trois raisons opérationnelles,
toutes visibles dans le log du run 5 de `fandom-import` (2026-08-07) :
(a) `gh pr create` interdit — _GitHub Actions is not permitted to create
or approve pull requests_ ; la branche `import/fandom-31224649430` était
poussée avec 8 épisodes, seule la PR manquait, et le job mourait en
exit 1 (3 runs sur 5 morts là) ; (b) le crawl prenait les 25 premières
pages retournées par l'API sur une catégorie de 1231, soit les
« Episode N (Special Edited Version) » — des remontages récapitulatifs
dont l'Episode Box porte `#=N`, donc écrits comme `anime-episode:1..8` :
**des données fausses aux bons identifiants**, que la validation ne peut
pas voir puisque la forme est parfaite ; (c) 17 échecs sur 25 sans
aucune raison affichée, alors que `crawl()` les collectait déjà.

_Livré._ **ADR-107** — faits structurés seulement, jamais de prose (y
compris paraphrasée par IA : le modèle n'est pas une étape de
blanchiment), les trois couches juridiques distinguées (droit d'auteur /
droit sui generis des bases art. L341-1 CPI / CGU), corpus en
CC BY-SA 4.0, et la posture images assumée par le mainteneur avec ses
garde-fous (ayant-droit nommé, `unverified-external` interdit sur `main`,
page de retrait 48 h, jamais de hotlink Fandom). `VISION.md` §7 est
tranché, `IMAGES.md` porte les règles. **Garde des ordinaux**
(`fandom/ordinal-title.ts`) : seule la page au titre canonique peut
réclamer l'ordinal, appliquée aux trois mappers chapitre/épisode/volume ;
plus l'ordre de file déterministe (`orderCrawlQueue`) qui fait que
`--limit N` veut enfin dire « les N premiers ». **Reprise** :
`--skip-known` saute les pages déjà au registre, pour que deux runs
successifs avancent. **Échecs imprimés** groupés par raison.
**`fandom:analyze` devient un instrument de conception** : profil de
valeurs par champ (`field-shape.ts` — taux de remplissage, cardinalité,
exemples réels, forme inférée number/date/wikilink/template/enum_like/
prose) lu sur le wikitext BRUT, car `cleanValue` détruit précisément les
trois signaux utiles ; et surtout **survol hors infobox**
(`page-structure.ts`) : titres de section, **signatures de colonnes des
wikitables avec compte de lignes**, densité de `{{Qref}}`. C'est là que
vit le gros de la donnée — listes de chapitres et d'épisodes, tableaux de
casting, apparitions par source — et un inventaire limité aux infobox
n'en voyait rien. Preset `--full` (40 échantillons, sans plafond).
**Workflow `fandom-analyze.yml`** qui lance le relevé et **commite le
rapport** sur une branche `audit/` : le CI voit Fandom, la session le lit
par l'API GitHub. 147 tests importers verts, typecheck vert.

_Ce qui attend le mainteneur._ (1) **Réglage dépôt** : Settings →
Actions → General → Workflow permissions → _Allow GitHub Actions to
create and approve pull requests_. Sans lui l'import pousse des branches
sans jamais ouvrir de PR (le workflow ne meurt plus, il imprime l'URL de
comparaison, et accepte un secret `IMPORT_PR_TOKEN` en contournement).
(2) **Décision de déploiement d'`apps/web`** — voir le fil ouvert
ci-dessous. (3) Lancer `fandom-analyze` une fois le lot mergé : c'est
l'entrée obligée de la refonte de schéma.

**2026-08-09 — v9 : layouts par type + apparitions au grain unité.**
Demande mainteneur : trous à droite sur la page personnage, layouts
distincts par type, toutes les données avec leur historique,
apparitions sur total de chapitres/épisodes, hero « version large
faible opacité en pleine largeur + rectangle arrondi format affiche
par-dessus », prev/next dans le hero pour les entités numérotées.
(a) **ADR-105** : `features-characters` fusionnée dans `features` —
le grain (arc / chapitre / épisode) est porté par le type de la
source, pas par le nom de la relation ; `arc-roles` →
`narrative-roles` ; `role` et `appearance_type` deviennent
optionnels ; 63 relations, 10 règles ; 3 changements cassants
assumés, aucune migration (0 arête concernée). (b) **ADR-106** :
registre de layouts par type — 12 modules, bandes `full`/`split`/
`pack`, 16 types écrits, dégradation imposée par le _renderer_
(`bandsFor` ajoute une bande finale contenant tout slot omis, type
inconnu → `GENERIC_LAYOUT`), testée sur les 16 types + 3 inconnus.
Historique affiché en ligne sous chaque propriété. prev/next dérivé
de la propriété ordinale déclarée par le type (aucune liste en dur),
voisin au-delà du curseur supprimé (le titre fuiterait). Module
apparitions livré mais invisible : 0 arête `features` unité→personnage
dans le corpus, il s'allumera sans changement de code. 520 tests.
**Ne pas merger avant validation du rendu par le mainteneur.**

**2026-08-09 — v8.1, révision ciblée du v8.** Retour mainteneur :
« j'aime pas le header au niveau de la progress bar et les couleurs
un peu aléatoires vertes et bleu. j'aime bien le gold par contre. »
Direction v8 conservée, deux corrections. (a) **ADR-104** : la teinte
par entité ne parcourt plus les 360° — elle indexe une liste de dix
accords écrits à la main dans la bande chaude 12–100° (or, laiton,
ocre, cuivre, safran, orange brûlé, vermillon, sang-de-bœuf, terre,
ambre). Plus aucun vert/cyan/bleu/violet, y compris dans les tokens
`--art-*`. L'or reste l'identité constante (wordmark, primes, focus).
La variété passe par la structure de valeurs (fonds 0.17→0.31, ≥0.4
d'amplitude par accord), pas par la teinte ; vérifié sur le mur de
vignettes 40 px. Tests : bande chaude imposée sur les couleurs
écrites ET sur les `--art-*` extraits de `styles.css`. (b) **LogRail
supprimé** du header avec sa queue morte serveur (`logAnchors`,
`collectLogAnchors`) ; la progression tient dans le `ProgressControl`
compact. Sémantique du cookie `web_progress`, filtrage anti-spoil et
`isDepartureVisible` inchangés. 511 tests verts. **Ne pas merger
avant validation explicite du rendu.**

**2026-08-09 — design v8 « Grand Line ».** v7 rejeté (« hyper IA,
même les couleurs vont pas »). Premier retour de goût exploitable du
mainteneur sur des sites de référence : **aime** starwars.com/databank
et la page champions de League of Legends ; **tiède** letterboxd
(« pas assez unique ») ; **rejette** pokedex (« moche »), mubi et
criterion (« bof »). Motif extrait : l'image EST l'interface, sombre
atmosphérique mais la couleur vient de l'œuvre, typo display brandée,
grilles filtrables par facette, mouvement au survol, sensation de
produit officiel de franchise — l'inverse du minimalisme arty et de
l'éditorial imprimé, ce qui explique rétrospectivement l'échec de v6
et v7 qui visaient précisément ce registre. Livré : héros plein cadre
pour toutes les entités (art génératif poussé à l'échelle 1440×560,
passes d'atmosphère), rosters filtrés par facettes dérivées du schéma,
**teinte par entité** (ADR-103) — le hash de l'id donne une teinte qui
repointe les tokens de thème, donc chaque page a sa couleur sans rien
à saisir, contraste WCAG garanti par boucle de remontée de luminance
et testé sur les 360 teintes. Bug corrigé au passage : `Math.hypot`
diverge entre JSC (SSR Bun) et V8 sur ~11 % des entrées → mismatch
d'hydratation sur toute page portant de l'art ; routé via `Math.sqrt`.
507 tests verts. **Ne pas merger avant validation explicite du rendu
par le mainteneur.**

**2026-08-09 — art génératif d'entité (ADR-102).** Le corpus n'a
aucune image utilisable (3 entités `image`, domaine factice, 0
fichier) : la tuile monogramme « lettre dans un carré gris » — le
tell « maquette IA » le plus visible — est remplacée par une
composition abstraite déterministe par entité
(`apps/web/src/lib/entity-art.ts` + `components/EntityArt.tsx`).
Hash FNV-1a de l'id → PRNG mulberry32 → mêmes paramètres pour
toujours, SSR/client identiques, aucun JS client. **Grammaire par
type** : character→figure, crew→ensign, arc→horizon, event→impact,
devil-fruit→spiral, manga-chapter→panels, volume→stack,
document/reference→folio ; **tout type non mappé dégrade vers la
famille générique `field`** (variante dérivée du hash du TYPE) —
règle ADR-091. **Zéro littéral de couleur** : le générateur n'émet
que `var(--art-*)`, les 9 tokens vivent dans `src/styles.css`
(`--art-bg/ink/glow` + `--art-1..6`, des RÔLES pas des teintes) →
le re-skin v8 = éditer ces 9 valeurs. Planche de contrôle :
`bun run -F @onepiece-wiki/web art:preview`. 489 tests verts,
lint/typecheck/knip/build OK.

**2026-08-09 — design v7 « Vignette » (7e itération, remplace v6).**
v6 rejeté (« unique mais dégueulasse, ça fait pas moderne du
tout »). Lecture du pendule : v2–v5 modernes-mais-génériques, v6
unique-mais-daté → la cible est les deux (finition Letterboxd/A24,
identité propre). v7 : Archivo Variable semi-étendue en display +
Inter data, charbon chaud/os, or = identité/chiffres, vermillon =
interactif, petits rayons 2–6px, connexions en modules-liens
image + nom + sous-label groupés par type avec compteurs et
repli « Voir les N autres » (`ShowMoreList`), ordre d'importance
ADR-091 avec dégradation. Nouveautés fonctionnelles demandées :
**anciens membres visibles** (grille « Anciens membres » atténuée,
période affichée) avec règle anti-spoil testée — un départ au-delà
du curseur rend le membre ACTUEL (`isDepartureVisible` dans
`server/progress.ts`, 5 tests) ; **design prévu pour beaucoup de
relations** (budgets de repli 8/12/28 par type de groupe). 472
tests verts. NB : le corpus n'a aucune arête `until` → pas
d'ancien membre visible en captures ; chemin testé unitairement.

**2026-08-09 — design v6 « La Gazette » (après merge PR #120).** Le
v5 « Le Log » a été rejeté par le mainteneur (« trop IA », 6e rejet).
Diagnostic : les 5 itérations partageaient l'ADN « web app moderne à
composants » (cards arrondies, pills, grilles uniformes, accents
lumineux) — c'est cet ADN qui lit « IA ». v6 l'abandonne : **objet
imprimé sombre** (almanach/gazette) — Fraunces (display) +
Newsreader (texte) auto-hébergées, encre chaude
`oklch(0.168 0.009 65)` + texte os, filets hairline 1px + doubles
filets + points de conduite, zéro border-radius/ombre/dégradé/pill,
accent unique vermillon sceau (or réservé à la plaque prime),
LogRail restylée en règle imprimée, membres en blocs photo de
journal (treillis 1px, légende sérif + petites capitales). 467 tests
verts, lint/typecheck/build OK, fonctionnel inchangé
(`server/views.ts` intact). **Ne pas merger sur main avant
validation explicite du rendu par le mainteneur** (engagement pris
après le 6e rejet).

**2026-08-09 — lot PR #120 livré.** (a) **ADR-099** implémenté :
`led-by`/`captains`/`introduces-character`/`awakening-of`/`total_bounty`
supprimés (dérivations en présentation : leader/prime totale depuis
les arêtes member-of entrantes), vocabulaires fusionnés, DSL
arêtes-entrantes avec `CorpusContext` (check:coherence uniquement)

- règle fruit-mangé≠détenu — 64 relations / 104 propriétés / 9
  règles. (b) **ADR-100** : flag `factual` posé sur 51 propriétés de
  production — le formulaire n'y offre plus le sac épistémique.
  (c) **ADR-101** : importeur api-onepiece complet (9 ressources,
  fusion EN/FR, match-diff, images en URL seule avec licence
  `unverified-external`) — 103 tests fixtures ; endpoint bloqué ici,
  run mainteneur : `bun run -F @onepiece-wiki/importers
onepiece-api:import`. (d) **Design v5 « Le Log »** : rail de
  progression signature (frise manga, remplissage or jusqu'au
  curseur, ancres de savoir par page calculées post-filtre spoiler),
  spine verticale 68 px, bento 12 colonnes à spans dérivés du volume,
  plaque BOUNTY, palette abysse/os/or-paille/vermillon, cartes riches
  (épithète/rôle/prime) taillées au contenu. 467 tests.

**2026-08-09 — arbitrage mainteneur sur l'audit + directives UI.**
Principe posé par le mainteneur : « une seule propriété/relation
pour gérer une donnée — pas 2x capitaine, pas 2x l'enregistrement ».
**ADR-099** tranche TOUTES les questions de goût de l'audit :
`led-by`/`captains`/`introduces-character`/`awakening-of` supprimées
(leadership = `member-of{role: leader}`, crew-roles gagne `leader`,
la règle org-rank ADR-098 tombe), `total_bounty` supprimée (dérivée
en présentation), vocabulaires loyalty/membership fusionnés en un
seul `membership-statuses`, DSL étendu aux arêtes entrantes
(`has_active_incoming_relation` / `no_active_incoming_relation`,
évalué avec contexte corpus dans check:coherence uniquement) + règle
fruit-mangé≠détenu. Relations 68→64. **ADR-100** : flag
`factual: true` sur les propriétés de production (numéros, titres de
sources, dates, runtime, métadonnées d'images…) — le formulaire n'y
offre plus le sac épistémique (cru par, attesté par…), uniquement
les qualifiers déclarés ; `name` des personnages garde tout
(identités cachées). Côté wiki : cartes entités enrichies (image +
nom + épithète + rôle/rang + micro-stat contextuelle) généralisées
membres/cast/utilisateurs/listings, prime totale d'équipage dérivée.
PR #119 (design v4 sombre dense + unification liens + ADR-098)
mergée sur main juste avant.

**2026-08-09 — lot PR #119 : design wiki v3, unification dashboard,
audit de redondance.** (a) Le wiki public a été redessiné DEUX fois
sur verdicts mainteneur : v2 sombre (Bricolage/ambre) jugée « trop
IA » → **v3 registre ouvrage de référence** : blanc papier, encre,
filets pleine largeur au lieu de boîtes, infobox liste de
définitions à la Wikipedia, un seul bleu éditorial (liens), zéro
pastille/ornement, Bricolage 700 + Inter, chiffres tabulaires —
look unique clair assumé (spec WEB_APP.md §Identity/Style). (b) Les
relations inverses du dashboard rendent au design des propriétés
(lignes cliquables, détail lecture seule, Gérer ADR-097 au niveau
groupe) et `EntityLinksPanel` est SUPPRIMÉ (bannières de cohérence
et retry migrés dans la section unifiée). (c) **Audit complet des
redondances du catalogue** archivé à
`docs/audits/2026-08-09-catalogue-redundancy.md` (22 constats) ;
**ADR-098** implémente le lot net (suppression `captained-by`,
`caused-death-of`, `pilots` ; `part-of-arc` sans `event` ;
name-types sans epithet/title ; loyalty-statuses sans allied ;
`qualifier_absent` dans le DSL + 2 règles advisory ; fix du registre
`role` ; `features-characters.role` requis). **Questions de goût en
attente mainteneur** (documentées dans l'audit §prioritized) :
devenir de `led-by` et `captains`, dérivation
`introduces-character` et `total_bounty`, `awakening-of`
(renverserait ADR-058), fusion loyalty/membership-statuses,
extension DSL `has_active_incoming_relation` pour les règles
inter-entités (held-vs-eaten…).

**2026-08-09 — ADR-096 livré sur main (PR #117) ; chantier ADR-097 +
web v2.1 en cours.** Provenance par item sur
`believed_by`/`known_truth_by` livrée (forme union, normaliseur
`entityRefItems`, 375 tests). Nouveau lot sur directive mainteneur :
(1) **ADR-097** — gestionnaire d'arêtes entrantes généralisé
(GET/POST `/api/entities/:type/:slug/incoming/:R`, bouton « Gérer »
sur chaque groupe inverse autorisé par le schéma, deltas en un
commit/une PR, gate ADR-088, généralisation du flow cast ADR-021) ;
(2) **web** : URLs canoniques `/{type}/{slug}` (301 depuis
`/e`/`/t`, domaine one-piece.wiki = config déploiement côté
mainteneur) + refonte du traitement d'images (« moins IA » : aucun
cadre cassé, tuiles monogramme éditoriales, ratios réservés,
fade-in) — spec dans WEB_APP.md §URLs / §Image treatment.

**2026-08-08 — ADR-095 livré sur main (PR #116) ; ADR-096 en
cours.** Les locales de données `ja`/`ja-latn` sont éditables au
dashboard (popover de traductions : 日本語 partout, Rōmaji gated par
`romanizable` sur name/epithet/title_key ; `translationLocalesFor`
est l'unique siège de la règle), seed Luffy en kana/rōmaji, 353
tests. **ADR-096** (dernier item noté→code) : items de
`believed_by`/`known_truth_by` en `EntityId | { target, source? }`
(pas de migration — la chaîne nue reste canonique sans provenance),
normaliseur unique `entityRefItems`, coherence compte cibles + sources
par item, diff d'historique rend « Cible (since …) », affordance
source par item dans le formulaire ; démo sur l'entrée
`presumed_dead` de Sabo. Après ça, l'inventaire « noté mais pas dans
le code » est SOLDÉ : tout est livré, fixé par ADR (affiliation
089), ou explicitement gated (knowledge graph → filtre spoiler ;
runs Fandom live → egress mainteneur).

**2026-08-08 — One Piece Wiki v1 + sync Fandom livrés sur main (PR
#115, ADR-091/092/093/094).** `apps/web` est devenu le wiki public
(layout wiki, curseur anti-spoil SSR `web_progress`, layouts par type
avec dégradation générique, contexte `?scope=`, strip contribution →
dashboard, footer GitHub + Buy Me a Coffee) — 31 tests + 35 checks
Playwright ; captures envoyées au mainteneur. `packages/importers` a
gagné `fandom:analyze` (sweep structurel complet, rapport
JSON+MD + GAPS) et `fandom:updates` (file de deltas par révisions vs
registre ADR-081) — 68 tests fixtures ; l'egress Fandom reste bloqué
ici (CONNECT 403), exécution live côté mainteneur. Références
externes + documents in-universe promus d'IDEAS (voir entrée
précédente). **ADR-095 en cours** : locales de données `ja` +
`ja-latn` éditables au dashboard uniquement (Rōmaji restreint aux
propriétés `romanizable: true` — name/epithet/title_key), jamais en
UI ni sur le wiki v1, narratifs en/fr inchangés. **Wave 3 toujours en
file** : provenance par item sur `believed_by` (séquencée après
ADR-095 — même surface EntityForm).

**2026-08-08 — promotions IDEAS : références externes (ADR-093) +
documents in-universe (ADR-094).** Both parked entries promoted per
the IDEAS contract (ROADMAP follow-up 6 + ADRs + DATA_MODEL sections
first). ADR-093: core `reference` entity type (`url` required,
`reference_kind` vocab, `accessed_at`) + `attested_by` BASE qualifier
(entity_ref→reference, multi, order 8) available on every entry via
the ADR-078 registry; `BaseQualifierBag` types it; the coherence
UNREFERENCED scan counts it; seeded
`reference:onepiece-com-character-log` attesting Luffy's epithet.
ADR-094: one-piece `document` entity type (`document_kind` vocab,
`first_source`, `narrative_key`) + new `issued-by` relation +
`profiles`/`held-by`/`depicted-by` extended to document; seeded
`document:luffy-first-wanted-poster` (profiles character:luffy since
manga-chapter:96). 37 entities, all additive (compat snapshot
updated). Wave 3 (per-item provenance on `believed_by`) stays queued
— big cross-cutting migration, own ADR needed.

**2026-08-08 — inventaire "tout ce qui est noté mais pas dans le
code", vague 1 (ADR-089 + ADR-090).** Sweep of every deferred note
(IDEAS.md, ADR-087 leftovers, ADR-009 follow-ups): (a) **ADR-089**
fixes the affiliate-links architecture (canonical URLs only in
`/data`, render-time decoration from deploy config, `rel="sponsored
nofollow"` + mandatory disclosure) — design-only, implementation
gated on a real signed program; the IDEAS.md bullet now points at
it. (b) **ADR-090**: the rule DSL gains `scope: 'relation'`
(`relation_type` selector, edge conditions `qualifier_equals` /
`target_type_is`, expectations `qualifier_present` /
`qualifier_present_one_of`; findings anchor `relationType` /
`relationIndex`) — shipped rule
`available-on-needs-target-anchor` (advisory: an `available-on`
edge needs `external_id` OR `url`); and `link_template` became
multi-entry with a `region` qualifier per the `publications`
precedent (entry without region = worldwide default; migration
`0006-link-template-per-region`, streaming-platform v2→3, amazon
seed shows `.com` default + `.fr` FR). (c) ADR-009 leftovers
closed: CONVENTIONS.md formatter section now states the real dprint
setup (npm-pinned plugins, `bun run format` only), DATA_MODEL.md
Luffy ₿3B example unified on `manga-chapter:1053`. **Still blocked
on environment (egress to onepiece.fandom.com)**: live validation
of the volume-mapper fixture and any arc-mapper work. **Kept
parked deliberately**: knowledge graph (gated on the spoiler
filter, per IDEAS.md), public-app feature parking lot (ADR-027
list), AI ingest / schema admin / Yjs / mobile-app entries.

**2026-08-08 — public reader app skeleton (`apps/web`, Phase 6.0
foundation).** New workspace `@onepiece-wiki/web` (TanStack Start +
Base UI + Tailwind v4, dev port 4200): the read-only public site over
the SQLite artifact, first consumer of the ADR-086 additions
(materialized inverse relations with per-direction `label`, plus the
`translations` / `narratives` tables). Structure: `server/db.ts`
(prepared `bun:sqlite` statements, lazy singleton, walk-up artifact
discovery + `ONEPIECE_DB_PATH` override), `server/catalogue.ts`
(schema-engine catalogue, fs in dev / glob bundle in prod — dashboard
recipe), `server/views.ts` (display-ready view models: localized
names, schema/vocab labels, epistemic badges + `actual_value`, both
relation directions from `source_entity_id` alone), `src/api.ts`
(server functions). Routes `/`, `/t/<type>`, `/e/<type>/<slug>`;
`web_locale` cookie FR/EN with SSR-correct first paint; dark-first
editorial theme (Fraunces/Inter display/body), tiny built-in markdown
renderer (no new render dep). Turbo: `web#build` depends on
`db-builder#build:db`; dev auto-builds the artifact when missing
(`scripts/ensure-db.ts`). Verified: Playwright run over home /
characters / Luffy (properties, both relation directions, FR toggle,
404), `vite build` + `.output` smoke test under Bun, 9 new bun tests
(markdown parser + real-artifact view models incl. Sabo epistemic
history — suite skips when the artifact is absent). Gotcha logged in
`server/views.ts`: a mixed `import { type X, fn }` from the
bun:sqlite-backed module lost its value specifiers in the dev SSR
transform — namespace import instead. Not yet (later 6.x): spoiler
cursor, search, per-type templates, SEO/SSG, locale routes, images.
Vercel deploy config for this app is intentionally untouched
(dashboard-only `vercel.json`; deploy wiring is a flagged follow-up
per CLAUDE.md §7).

**2026-08-08 — rules gain opt-in `enforcement: 'blocking'`
(ADR-088).** Maintainer's "custom rules between entities in the Zod
verification": `RuleSchema` grew an optional
`enforcement: 'advisory' | 'blocking'` (default advisory — the
ADR-085 principle is untouched, all five canon-knowledge rules stay
advisory). Blocking = the dashboard save/create endpoints re-run
`evaluateRules` on the save payload and refuse with
`422 { code: 'rule_blocked', findings }` (server gate in
`apps/dashboard/server/rule-block.ts`, wired in handleSaveEntity +
handleCreateEntity BEFORE any GitHub call); the form shows blocking
findings red live (entity-level panel + per-property, error styling;
save button stays enabled, the server refuses) and maps the 422 onto
the same red field/top-level surfaces as Zod issues
(`ruleBlockedFindings` guard in src/api.ts); `check:coherence`
reports blocking RULE_FINDINGs as errors (non-zero exit). Exactly one
rule shipped blocking as the structural example:
`until-not-before-since` (incomparable refs already yield no finding,
so no canon false-positive is possible). Tests: rules.test.ts
(enforcement default/blocking), coherence.test.ts (severity mapping),
server rule-block.test.ts (422 payload). Docs: DATA_MODEL /
SCHEMA_SPEC § Rules + ADR-088.

**2026-08-08 — providers generalised (ADR-087).** Maintainer's
"structure providers" (Amazon/Crunchyroll/…): NO new entity type —
`streaming-platform` is already the generic provider node (generic
labels + `platform-kinds` streaming/reader/store). Additive widening
only: `available-on` v3 (`valid_from_types` += `volume`), `volume` v2
(`allowed_relations` += `available-on`), `store` label broadened to
"Store (purchase)"/"Boutique (achat)". Corpus seeds: 4 providers with
`link_template` (`amazon` `…/dp/{id}`, `crunchyroll` `…/watch/{id}`,
`manga-plus` `…/viewer/{id}`, `netflix` `…/title/{id}`), `volume:1`
(→ amazon, `external_id` ISBN-10) and `manga-chapter:1` (→ manga-plus,
`external_id` 1000486, + factual `part-of-volume`). Qualifier registry
completed for `available-on` (ADR-078 follow-up: `external_id`,
`verified_at`, `url`, `region`, `requires_subscription`,
`subtitle_langs`, `dub_langs` — 27 qualifier types; the edge editor no
longer shows humanized English ids in FR). Compat snapshot
regenerated (purely additive). Crunchyroll/netflix are seed-only for
now (advisory UNREFERENCED warnings) — they get edges when
anime-episode availability data lands. Per-region templates +
"external_id-or-url" coherence rule still parked (ADR-084/087).

**2026-08-08 — build pipeline: materialized inverses + translations/
narratives in the artifact (ADR-086).** `packages/db-builder` extended
(NOT a new package — BUILD_PIPELINE/ARCHITECTURE already name it as the
pipeline): every stored edge now gets its inverse row materialized
(`is_inferred=1`, `<type>.inverse`, new `label` column carrying the
direction's localized labels; ADR-037 axes mirrored), deduplicated
against the 3 known double-stored `family-of` pairs; new `translations`

- `narratives` tables loaded from the corpus trees (narratives error on
  unknown entity ids; tree currently empty). CLI `bun run build:db` (root
  script + uncached turbo task; `build:data` kept as alias). Real-corpus
  build: 30 entities / 110 properties / 56 relations (25 inferred = 31
  stored − 6 double-stored) / 86 translations / 0 narratives;
  byte-identical sha256 across runs. 13 new tests (in-memory DB round
  trip, dedup, labels, axes, content loaders). Docs: BUILD_PIPELINE §5 +
  §10 rewritten, SCHEMA_SPEC `inverse_inferred` reinterpreted as
  editorial-only.

**2026-08-08 — history quiet lines + explore entry links + property
info (maintainer feedback batch).** (1) History pages toned down: the
change-line wire format went from `string` to
`{ text, details? }` (`server/history-diff.ts` `HistoryChangeLine` —
`text` = value · compact since, `details` = the other qualifiers
`Label : Valeur`-joined); the shared renderer shows only `text` in the
normal foreground with the −/+ sign alone tinted (emerald/red at 70%),
and `details` unfolds behind a per-line "voir plus" — nothing open by
default. (2) /explore stays read-only but every value line (both
modes) is now a discreet link to the entity page with
`?edit=<propertyId>.<entryIndex>`, opening that entry's editor there
(Back closes it, per the existing URL-mirror). (3) With ≥1 chosen
property, /explore shows one info line per property (declaring entity
types from the catalogue + filled-entity count from the audit rows)
and a "types concernés uniquement" toggle (default ON) restricting the
list to entities whose type declares a chosen property. New UI_STRINGS
keys appended (historySeeMore/Less, exploreOpenEntry,
exploreDeclaredBy, exploreFilledCount, exploreRelevantTypesOnly).
Verified: 258 bun tests (history-diff tests adapted), typecheck, lint,
format, dashboard build, Playwright pass (mocked history API,
explore→editor deep link, Âge info line + filter).

**2026-08-08 — Narrative editor v1 (the missing content brick).**
Path convention settled and documented in DATA_MODEL § Narratives:
`data/universes/<u>/narratives/<locale>/<entityType>/<fileBase>.md`,
`<fileBase>` = the entity JSON's basename (pairs 1:1 with the entity
file). Server: `GET/POST /api/entities/:type/:slug/narrative`
(server/narrative.ts pure helpers, unit-tested; POST reuses the
entity-save PR flow via the new `submitNarrativeEdit` in
github-client — resume-PR routing included; emptied text deletes the
file, `commitMultipleFiles` now supports `content: null` deletions).
Dashboard: collapsed "Narratif" section on the entity page
(`NarrativeEditor.tsx`, EN/FR tabs + word counter + concision hint,
read-only until signed in). Prod data source now bundles
`data/**/*.md`. No optimistic locking on narratives in v1 (cast-flow
trade-off). Open thread: `[[type:slug]]` link validation + build
pipeline parsing of narratives still unimplemented (phase later).

**2026-06-14 (evening) — C8 closed + C9/C5 additive waves.** Catalogue **36
entities / 101 properties / 70 relations / 63 vocabularies**. ADR-073
(contract phase: legacy `volume` string dropped; migration `0005`, no-op on
corpus), ADR-074 (`sbs-qa` + `qa-of`), ADR-075 (`is_color_spread` +
`has-cover-story`), ADR-076 (C9 wave 1: `part-of-event` phases, race
`slave_price`/`danger_classification`/`hybrid-of`, location `log_pose_time`,
ship `figurehead`, bounty `reason`), ADR-077 (C5 wave: fruit
`weakness`/`awakening_outcome`/`interacts-with-fruit`/`held-by`, technique
`is_secret`/`requires_haki`/`variant-of`). `adapted-by` was already the
non-linear many-to-many — no change needed. **C8 complete; C9/C5 additive
halves complete.** All shipped on PR #91. **The rest of the data campaign is
blocked on the maintainer `[D]` calls** (DATA_EXPANSION_PLAN §4): #1 C1
edition-variant qualifier, #3 era/temporal value, #5 fighting-style
modelling, #6 ancient-weapon/artifact, #7 event breaking changes. **Also on
PR #91**: W-F closed (shared `useApiResource` + `LoadFailed`, ADR-032) and
W-A closed (qualifier-type registry, ADR-078 — catalogue is now 36 / 101 /
70 / 63 / **15 qualifier types**). NB: **ADR-072 is reserved by PR #90**
(dashboard image display, open at the time of writing — disjoint files,
merge order safe either way).

**2026-06-14 (late) — maintainer vision drop, recorded.** Direction
received in the maintainer's own words: (1) **Fandom-assisted ingestion**
via the MediaWiki content API → **ADR-079** (importers v1 programme;
BLOCKER for cloud runs: `onepiece.fandom.com` is denied by the session
network policy — allowlist it in the Claude environment settings, or run
imports locally/CI); (2) **public-API additions** → **ADR-080**
(field-lifecycle registry generated from compat snapshots, official npm
SDK, per-entity history endpoint; Stripe-style pinning confirmed as the
existing URL-MAJOR + `X-API-Version` design; all still design-only,
pre-freeze gate ADR-029 unchanged); (3) **dashboard UX coherence pass 2** and the SEO / partnerships /
"incontournable" polish → parked in IDEAS.md pending their own ADRs
(affiliate links explicitly need the dedicated ADR). **Importers v1 foundation
shipped (same evening, PR #91)**: `packages/importers/src/fandom/` —
`FandomClient` (action=parse, injectable fetch, response cache, rate
limit), the wikitext utilities (nesting-aware template parser,
`findTemplate`, `cleanValue`, `parseQrefs` → source ids,
loose number/date parsing) and the first deterministic mapper
(`mapChapter`: Chapter Box → corpus-shaped `manga-chapter` JSON +
EN-title sidecar + warnings; validated against the generated Zod in
tests — 10 tests, fixtures only). **Sync registry shipped
(ADR-081)**: `data/import/fandom-pages.json` ledger + registry module
(title normalization, redirect aliases, `detectEntityLinks`,
`staleEntries`) + client `queryInfo`/`recentChangesSince` + real
redirect fixture. Real fixtures from the maintainer replaced the
hand-written ones (Qref params are `chap`/`ep`/`sbs`/`vol`; Chapter Box
has no number/date params — ordinal from the page title; Episode Box
ordinal is `#`). **Character mapper shipped** (real Hyougoro Char Box fixture):
deterministic scalars with per-value provenance — Qref parsing is now
recursive with named-backref resolution (`{{Qref|name=vivre card}}` →
`databook-card:1329`), `{{Nihongo}}` alias/epithet parsing, MM-DD
birthdays; affiliation/occupation/VAs surface as warnings for the AI
pass. New Qref variants covered: `cover=`, `card=`, `ep2=`, long
`chapter=`/`episode=`. **Emit adapter + CLI + sync workflow shipped**:
`emit.ts` (corpus-layout file building; translation merge where
existing keys win; entity files conflict-safe unless `--overwrite`),
`bun run import:fandom <chapter|episode|character> <page…> [--stage]`
end-to-end CLI (dry-run default; response cache under `.cache/fandom`),
`import:fandom check-updates` (ledger vs live revisions, exit 2 =
stale), and `.github/workflows/fandom-sync.yml` — **manual-only**
(`workflow_dispatch`; the daily cron line is committed commented-out —
enabling unattended runs is the maintainer's call). First live run
needs only: local/CI execution (CI runners have egress) or the sandbox
allowlist (ADR-079 §6). **Full-auto crawl shipped**:
`crawl()` orchestrator (category seeding via `categoryMembers` with
continuation, infobox **auto-detection** routing to the right mapper,
one-hop redirect following, frontier of most-linked unknown pages,
ranked report of unmapped infobox kinds = which mapper to build next),
`import:fandom crawl --category X --depth N --limit N [--stage]` CLI,
batch-PR plan/emit (`emit-pr.ts` → labels `via-dashboard`+`import` →
admin queue), and `.github/workflows/fandom-import.yml` (**manual
dispatch** with category/depth/limit inputs: crawl → stage → gauntlet →
draft PR via `gh`; nothing merges without a human). Live lesson from
runs 1–2 (2026-08-07): Fandom's chapter/episode categories hold **no
direct articles** — only subcategories (One Piece Chapters → Chapters
by Volume → Volume N) — so `categoryMembers` now descends `depth`
subcategory levels (default 2, dedup + 300-category cap) and **throws
on MediaWiki error envelopes** instead of returning an empty list.
Run 3 then hit the required-`released_at` gate (Chapter Box has no
date → ADR-082 made it optional, v7); run 4 crawled/validated/pushed
**24 chapters** but `gh pr create` died on the missing `import` label —
PR #94 (Chapters 2–25) was opened + labelled manually, and the
workflow now creates both labels idempotently before opening the PR.
**First live import PRs: #94 (24 chapters) and #96 (8 episodes,
run 5 — data+labels green).** One admin toggle still blocks full
autonomy: the repo setting **"Allow GitHub Actions to create and
approve pull requests"** (Settings → Actions → General → Workflow
permissions) is off, so the workflow's final `gh pr create` is denied
and the PR must be opened by hand from the pushed `import/fandom-*`
branch until it is flipped. Remaining importer work:
volume/databook-card + remaining infobox mappers (the crawl report
ranks them by frequency), the AI prose-extraction pass. Next:
W-B detail view, W-F2 UX conventions.

**2026-08-08 — dashboard redesign (UX audit → ADR-083 → W-F2 layout
system → read-first form).** Grounded in a 9-agent code audit (124
file-anchored findings) + real Playwright screenshots (9 routes × 3
viewports, before/after). Shipped: **ADR-083** `recommended` property
tier + `recommended_relations` (schema-checked, flagged on
character/manga-chapter/anime-episode); **layout tokens** `--header-h`
/ `--page-px` + `bleed` utility (mobile full-bleed surfaces, `<Card
bleed>`); unified radii/focus/invalid recipes; ≥16px mobile form
controls (no iOS focus-zoom); single mobile nav (hamburger removed,
BottomNav Rules-of-Hooks crash fixed); **read-first entity form**
(filled rows collapse to value+provenance+×N summaries — Luffy mobile
page 3100px → ~1500px; recommended-empty rows visible with amber tag;
**live client Zod** via the browser-safe `entity-schema.ts` extraction
— same validator at form/server/CLI); **completeness meters**
(PropertyNav "x/y of a complete article", per-row list meters via
`server/completeness.ts`, content-based fill semantics); richer lists
(two-line rows + meters, grouped home with empty types collapsed,
localized plurals, actionable empty states); admin queue
(primary+overflow, confirm dialogs, `reloading` guard against
double-approve); drafts undo toasts; LoadFailed retry;
stale-while-refetch `useApiResource`; apparitions display names +
fallback "Other" group + pending badges. New W-F2 §layout/borders/
responsive + §field-states conventions in CONVENTIONS.md. Follow-ups
tracked in ROADMAP §4 task 5 (narratives editor, cross-field rules
ADR, microcopy sweep, external-images licensing decision).

**2026-08-08 (b) — UX v2 feedback batch (live mobile test) + ADR-084.**
All 20 tester points fixed on main: draft-tier hold-back (incomplete
entries stay out of diff/PR, amber "brouillon" badge — no more instant
red errors), humanized validation lines ("Entrée 2 · Depuis : valeur
manquante"), stacked per-entry summaries with C/E provenance, vocab
labels resolved everywhere (no raw "scientist"), multi-enum as a
stay-open select, source-type select trigger localized, relation
registry labels (relation_kind/known_publicly_since added → 17
qualifier types), multi-target relation add fixed (no more dead empty
chip), qualifier sheet lists ALL options with "—", locale switch
hydration bug fixed (SSR mismatch) + switcher is a Select, popups
full-width on mobile, drawer padding/footer responsive, save bar
responsive, sections-sheet reveal+scroll fixed, entity header History
link → GitHub file history. **ADR-084**: availability by stable
`external_id` + platform `link_template` (url now optional) — product
ids (ASIN, episode ids) stored once, links generated later.

**2026-08-08 (c) — ADR-085 rules + links panel + explorer + fix batch.**
Sixth catalogue group `rules` (declarative, ADVISORY — never blocking):
engine `schema-engine/src/rules.ts` (browser-safe, 6 tests) shared by
`check:coherence` (`RULE_FINDING`) and the form's amber advisory panel;
6 v1 rules (marine+bounty w/ Cross-Guild escape, single concurrent
devil fruit, 2 epistemic anti-patterns, unanchored death, until<since);
builtin `SYMMETRIC_RELATION_STORED_TWICE` — which found 3 REAL
double-stored family-of edges in the corpus (ace↔luffy, ace↔sabo,
luffy↔sabo), matching the dashboard's new conflicts detection.
**Links panel** (`GET /api/entities/:type/:slug/links` + panel on the
entity page): outgoing + reverse-scanned incoming edges with inverse
labels, deep links, and conflict detection (duplicate-symmetric,
duplicate-edge, qualifier-mismatch), 12 tests. **/explore** cross-type
audit grid (`GET /api/audit`, 9 tests): every entity × values with
resolved displays, per-row completeness, missing-recommended +
missing-translation badges, type/search/toggle filters, inline edit via
the drawer, virtualized. Plus the tester's 11-point fix batch: drawer
z-index (pencil dead behind the sheet), nested-<li> hydration bug,
multi-select scroll jump, locale-select compact popup, toolbar heights,
source-type trigger label (Base UI Select.Value ignores plain
children), picker slugs desktop-only, MultiEntityRef restyled (dashed
add, popup consistent), mobile bottom-sheet picker retired (anchored
autocomplete everywhere), empty-target relation entries render an
inline target picker. Per-item provenance on believed_by parked in
IDEAS.

**2026-08-08 (d) — UX v3 batch (17-point mobile test).** **/explore v2**:
type filter as the shared stay-open multi-select (no ids, harmonized
heights), rows always expanded without entity ids or edit buttons,
maintainer-chosen property columns with INLINE editing (no extra
dialog; reuses the drawer save endpoint), completeness hidden when
columns are chosen (amber missing-value warnings instead), audit
`since` refs rendered compact (`C1`, not `manga-chapter:1`). **In-app
history page** `/types/:type/:slug/history` (Octokit commit list per
file path; the entity-header History link is now internal). **Form
fixes**: schema-details badges moved to their own row (they overlapped
the value summary on mobile), sections sheet reveal+scroll fixed (the
Dialog scroll-lock was undoing the scroll — the retry now waits for
lock release), remove-✕ on the last entry deletes the property key
(phantom `{}` entry made it look dead), login autofocus removed
(mobile keyboard hid the GitHub button). **Links panel v2**: qualifier
keys resolve via the qualifier registry and enum values via
vocabularies (`side: whitebeard_allies` → « Camp : Alliés de Barbe
Blanche »), per-row edit affordance (outgoing → scrolls to the
relation editor; incoming → jumps to the storing entity), and
**double-stored symmetric edges reframed as an INFO note** (maintainer
call: both-sides storage is informative, never an error — the pipeline
generates inverses, so a missing opposite is by design). Registry
gained `role`/`side`/`outcome` (20 qualifier types). Popovers/selects
switched to `positionMethod='fixed'` (bottom-anchored popups grew the
document — phantom gap + stray scroll). Combobox chrome i18n'd.
Follow-up (same day): the UI locale now persists in a COOKIE
(`dashboard_locale`) read by the root loader during SSR (with
Accept-Language fallback for first visits), so the first paint is
already in the user's language — no EN→FR flash, `<html lang>` correct
server-side, and locale-dependent fetches (`/api/audit?locale=`) fire
once instead of EN-then-FR. localStorage kept as legacy fallback,
reconciled post-hydration. Also: /explore filters no longer sticky
(maintainer call), inline editing extended to the DEFAULT explore mode
(tap a value in the always-expanded rows — same CellEditor as columns
mode, booleans toggle in place), and the history page shows each
commit's changed lines inline (server fetches per-commit patches for
the newest 25 commits, `+`/`-` lines capped at 30 with a truncation
count — what changed is visible without clicking through to GitHub).

## 2026-08-08 (e) — Fandom character mapper v2

Two real defects fixed and two deterministic-resolution passes added
(`packages/importers/src/fandom/character.ts`, 224 tests green):

- **status vocab bug**: the mapper emitted the raw Fandom word
  `deceased`, which the `character-statuses` enum (`dead`,
  `presumed_dead`, `missing`, …) rejects at validation. Now mapped
  through longest-match patterns (incl. "Presumed Deceased"), with the
  status line's own Qref as `since` when cited.
- **bounty was not mapped at all**: `parseBountyEntries` parses the
  newest-first `<br>`-separated history into chronological entries
  with per-value `since` from each line's {{Qref}} (manga chapter
  preferred), skipping numberless lines and flagging unsourced ones.
- **registry-resolved relations**: affiliation/origin/residence/devil
  fruit `[[wikilinks]]` now resolve through the committed sync
  registry (exact title/redirect matches only) → `member-of` /
  `originates-from` / `resides-in` / `ate-fruit` relations with
  per-line `since`; "former"-annotated lines, unknown pages, and
  wrong-type targets stay warnings.
- **occupation matching**: exact case-insensitive matches against the
  `occupations` vocabulary labels (en/fr/id) become the multi_enum
  value; fuzzy strings stay warnings.

The CLI + crawl orchestrator thread the context (registry title index

- occupations index) automatically; calling the mapper without a
  context degrades to v1 warnings-only behaviour.

## 2026-08-08 (f) — entity form: value list + per-entry side sheet

Maintainer-requested rework of the property rows: the inline accordion
(EntryCards expanding in place) is gone. Each property now shows its
label + a FULL-WIDTH read list of value lines (summary + compact
provenance, one line per entry); tapping a line opens a right-side
sheet that groups the value input, the `since` anchor and EVERY other
qualifier in one surface (the "More options" list-all pattern, no
second hop). Remove lives in the sheet footer; adding an entry (or
revealing a property from the Sections nav) opens the new entry's
sheet immediately. `QualifierSheet.tsx` was split into reusable
`SideSheet` (controlled panel) + `QualifierRowList` (list-all body) +
the original trigger-owned `QualifierSheet` (still used by the
relations editor). Hotfix (same day): the SSR locale read broke
in the PRODUCTION bundle only — Rollup rewrote the loader's dynamic
`import('@tanstack/react-start/server')` into a self-import of the
SSR chunk, whose exports don't carry the h3 helpers ("getCookie is
not a function" on Vercel; dev was fine). Fixed by moving the read
into a `createServerFn` with static imports — the server-fn compiler
extracts the handler cleanly from both bundles. Verified on the built
nitro server (curl: cookie→fr, Accept-Language→fr, default→en) plus a
full Playwright pass against the prod build (form sheet, links panel,
explore locale=fr single fetch, history banner).

## 2026-08-08 (g) — history page: semantic property/value changes

Maintainer feedback: "afficher sous forme de changements de propriétés
et valeurs, pas en mode json". The per-commit raw `+`/`-` patch lines
are gone. `server/history-diff.ts` diffs the entity JSON at each
commit against its predecessor (file contents fetched per version —
listCommits is path-filtered so consecutive rows are consecutive
versions; the oldest commit of a complete history diffs against
nothing = creation) and reports grouped changes per property /
relation type. Values resolve through the audit display machinery
(vocab labels, translated keys, number+unit, ref display names,
compact `C96` provenance) in the requested `?locale=`. Multiset
semantics: an in-place edit reads as one removal + one addition. The
page renders label + red `−` / green `+` lines, groups kept whole
under a 20-line per-commit budget with a truncation note. 6 new
tests (230 total).

## 2026-08-08 (h) — quiet-by-default sweep + relations redesigned

Maintainer feedback batch: (1) /explore is READ-ONLY again — inline
editing (both modes), the drafts store and the bulk save bar are
deleted (−540 lines); the amber chip walls collapsed to ONE muted
gap line per row, the completeness meter is the only visual signal.
(2) The prod "phantom popups on reload" bug (draft auto-apply
tripping every PropertyRow's open-on-count-grow adjust) is structurally
fixed by the lifted single-editor state — verified by seeding an
IndexedDB draft (3 grown properties → 0 editors open after reload).
(3) "Par défaut, rien d'ouvert": the links panel no longer auto-opens
at ≥sm. (4) RelationsEditor rewritten to the property pattern —
full-width edge lines per relation type (target name + resolved
qualifier summary + C96 since), click → SideSheet (mobile) / inline
sticky panel (desktop), all qualifiers via QualifierRowList, remove in
footer, add-opens-editor, close-without-target deletes. (5) Inverse
relations VISIBLE without double storage: read-only `InferredRelations`
section (incoming edges from the links API, grouped by inverse label,
"auto" badge, pencil to the storing entity). (6) History lines carry
every qualifier ("Mort · C574 · Statut épistémique : Confirmé") and a
GLOBAL /history page lists recent data commits with per-entity change
groups (sidebar link under Explorer). Follow-up: the open entry editor
mirrors into `?edit=<propertyId>.<index>` on the entity route —
opening pushes a history entry, browser Back CLOSES the editor (and
still discards never-filled entries) instead of leaving the page;
explicit close pops the pushed entry so the stack stays balanced;
deep-linked `?edit` restores the editor. Drawer/new-entity forms keep
local-only state (`syncEditorToUrl` opt-in).

## 2026-08-08 (i) — Fandom volume mapper

`mapVolume` (`packages/importers/src/fandom/volume.ts`): Volume Box →
`volume` entity (number from the "Volume N" page title, EN title →
`volume.<n>.title` sidecar, JP release → `released_at` territory jp).
Schema gaps stay warnings: isbn/pages (no property), EN release
(`released_at` single-valued), chapters range (belongs on the chapter
side as `part-of-volume` — the warning lists the ordinal range).
Wired into `detectKind`/crawl + the CLI (`import:fandom volume …`).
**Fixture `volume-12.json` is SYNTHETIC** (network policy still denies
onepiece.fandom.com) — validate against a live capture on the first
CI run and replace, like chapter-1044/episode-1071 were. **Arc mapper
deliberately NOT built**: corpus arc ids are editorial shorthand
(`arc:wano` ↔ "Wano Country Arc"), so deterministic slugify would mint
diverging duplicates, and the required historical `name` needs a
human-chosen `since` anchor — arc pages keep ranking via
`unknownBoxes` until a live Arc Box capture proves a clean path.

**Current phase**: 4.3 (see ROADMAP). **Post-4.3 order re-sequenced by
ADR-032** (tooling-before-ingest): W-F → W-A → W-B → W-C → W-E → W-D,
then resume 3.5 → 6 → 7 → 8 → 9+. Workstream breakdown below
(§ "Active plan").

**2026-06-14 — schema expansion + consolidation campaign (ADR-060…069), all
merged.** Catalogue **34 entities / 89 properties / 62 relations / 59
vocabularies**. New media/production entities: `album`+`contains-track`
(ADR-060), `video-game` (ADR-061), `live-action-series`+`live-action-episode`
(ADR-062), `anime-special` OVA/TV-special/ONA (ADR-063), `live-performance`
(ADR-064), `merchandise` (ADR-065). Then five dedup/consolidation refactors
(all breaking, migrate-forward): relation dedup pass 3 (ADR-066), unified
release dates `released_at`+`territory` (ADR-067), dropped `canonicity` →
derive from `canon_scope` (ADR-068), and merged `references` into `features`
(ADR-069). **Migration system now exercised**: `0001`–`0004` under
`/data/migrations` (mostly no-ops on the current corpus; `0002` rewrote 10
chapter files); import via **relative path** to the engine, not the package
specifier (README fixed). The full **apply-all-pending migration runner** now
exists — `bun run migrate:all` (+ `--dry-run`/`--check`) with a committed
`applied.json` ledger (ADR-070). Remaining schema lag: §1 tree + §2
allowed-relations in INVENTORY only.

## Open / blocked threads — resume here

### 0. `apps/web` n'est déployé nulle part — DÉCISION MAINTENEUR REQUISE

Le wiki public **n'est en ligne sur aucun domaine**. `vercel.json`
construit le _dashboard_ (`apps/dashboard/.output`) ; rien ne construit
`apps/web`. Conséquence directe sur le brief : les chantiers UI (§5.1)
et SEO (§5.4 / priorité 4) ne valent rien tant que ça dure — on ne peut
pas acquérir de visiteurs Google sur un site qui n'existe pas.

Ce n'est pas un oubli de configuration, c'est un choix d'exécution que
la pile impose et que je n'ai pas tranché seul (règle CLAUDE.md « ask
before refactoring » + « deploy config jamais mergée à l'aveugle »,
leçon #23) :

`apps/web/server/db.ts` lit l'artefact via **`bun:sqlite`**, un builtin
du runtime Bun sans équivalent npm. `vite.config.ts` le déclare externe
et note explicitement que le serveur de production doit tourner sous
Bun. Or **Vercel exécute du Node**. Et la dépendance n'est pas locale à
`apps/web` : `packages/sdk/src/open.ts` et
`packages/db-builder/src/writer.ts` importent le même builtin.

Deux issues réelles :

- **A — héberger sous Bun** (Fly.io, Railway, un conteneur). Zéro
  changement de code : `bun run start` exécute déjà `.output/server/
  index.mjs`, le preset nitro `node-server` est le défaut hors Vercel.
  Coût : une plateforme de plus à opérer, et on quitte Vercel pour le
  wiki alors que le dashboard y reste.
- **B — rester sur Vercel** et introduire une couche d'accès SQLite
  choisie au runtime (`bun:sqlite` en dev sous Bun, `better-sqlite3`
  sous Node) — ce qu'ADR-012 avait explicitement anticipé (« read-side
  under Node if/when a serverless target requires it »). Coût : la
  couche touche `apps/web` ET `packages/sdk`, et l'artefact `.db` doit
  être embarqué dans la fonction selon le motif ADR-019. Ça mérite son
  ADR.

Ma recommandation : **B**, parce que garder une seule plateforme vaut
la couche d'abstraction, que l'ADR-012 la prévoit déjà, et que le
motif d'embarquement de l'artefact est éprouvé sur le dashboard. Mais
c'est un arbitrage d'infrastructure — dis-moi lequel et j'écris l'ADR
et le code. Rien ne part sur `main` avant.

### 1. Production dashboard `/api/*` 404 — ROOT CAUSE FOUND + FIXED (code)

- Symptom: `https://dashboard.one-piece.wiki/api/schemas` → Vercel edge
  `NOT_FOUND`, while SSR routes (`/`, `/types/character`, `/login`) work
  fine via the function. So the function deploys and runs — only
  `/api/*` is intercepted **before** reaching it.
- **Real root cause (proven 2026-06-13 by probing prod):** Vercel's
  legacy **zero-config Serverless Functions** convention treats a
  root-level `api/` directory as individual functions. With Root
  Directory = `apps/dashboard`, Vercel saw **`apps/dashboard/api/`** and
  reserved the **entire `/api/*` path prefix**, shadowing the nitro
  Build-Output catch-all (`/(.*) → /__server`). Proof: `/api/server`,
  `/api/session`, `/api/r2`, `/api/admin-promote` (= the `.ts`
  filenames) returned **500 FUNCTION_INVOCATION_FAILED** (Vercel built
  them as broken functions), while `/api/schemas` + any non-file path
  returned **404 NOT_FOUND**. The earlier "Vite preset / stale deploy /
  operational" theory was **wrong** — the deploy was current and the
  function was live; `/api/*` never reached it.
- **Fix (this PR):** renamed `apps/dashboard/api/` →
  `apps/dashboard/server/` so there is no root-level `api/` dir for
  Vercel to claim. The public URL `/api/*` is unchanged — it is the
  TanStack route path `src/routes/api/$.ts` (splat → `handleApiRequest`),
  independent of the server-lib dir name. Updated the 4 references:
  route import, dashboard `tsconfig.json` include, `package.json`
  `dev:api-legacy` script, `knip.json` entry. Typecheck + lint + vercel-
  preset build all green; only `__server.func` is emitted; catch-all
  config intact.
- **Verify after deploy** (routing effect can't be checked locally —
  DoD #7): `curl -s -o /dev/null -w "%{http_code}\n"
  https://dashboard.one-piece.wiki/api/schemas` → expect **200** (was
  404). Also confirm `/api/server` no longer 500s (should be handled by
  the splat now).
- Dead ends (do NOT repeat blind): #23 relocated `.vercel/output` via
  the buildCommand → **broke the build** (reverted #25); #27 removed
  `framework`/`outputDirectory` → made a preview 404 (closed). The
  repo-root `vercel.json` is **ignored** when Root Directory =
  `apps/dashboard`. **Never push deploy config blind** (CLAUDE.md
  Definition of done #7).
- The big post-build `tsc` **error flood** in the Vercel log (`Cannot
  find name 'process'`, `node:crypto`, `Buffer`, `NodeJS`, `Bun`,
  `S3Client.send`, plus a couple of "genuine-looking" ones like
  `string | { error: string }` in server.ts and the `id?` mismatch in
  generator.ts) is the **same root cause** as the 404: it is Vercel
  **compiling `apps/dashboard/api/*.ts` as zero-config serverless
  functions** in its own context without our `@types/bun`/`@types/node`.
  Proof: every erroring file is in the `api/*.ts` import graph (api/ +
  the packages it imports) — **zero errors come from `src/**`** (the
  2302-module tree nitro actually bundles). It is **non-fatal** (deploy
  exits 0) AND it disappears entirely once `api/` is renamed (PR #32):
  no `api/` dir → Vercel compiles nothing there → no tsc pass → no
  flood. The "genuine-looking" errors pass our CI typecheck and are
  artifacts of the degraded (types-missing) context, not real bugs.

### 2. Admin schema editor (Phase 5) — proposed, not started

- Goal: control fields / values / enums from the dashboard.
- Plan: **same dashboard app**, an admin-gated `/schema` section (not a
  separate app); reuse the schema-driven form generator + github-client
  PR flow + admin auth. Order, safest first: **vocabulary (enum)
  editor** (additive → PR label `vocabulary`) → property-type editor
  (+ impact analysis, reuse `bun run migrate`) → entity-type editor
  (admin-only, ≥2 reviews).
- ADR-027 deferred Phase 5; the maintainer wants it pulled forward →
  needs an ADR + reorder, then start with the vocab editor.

### 3. Codebase-audit backlog (pending)

From the 2026-06-13 audit. **Done this run**: db-builder derived fields
(is_first, primary_canon_scope), display-name dedup, github-client
save-flow tests, the migration helper. **Pending**:

- ~~**qualifiers schema-driven**~~ — **DONE (ADR-078):** the
  qualifier-type registry (`/data/schemas/qualifier-types/**`, 7 base +
  8 common) feeds loader → catalogue → `/api/schemas` →
  `resolveQualifiers(registry, locale, …)`. Follow-ups tracked in the
  ADR (relation-qualifier labels, UI_STRINGS overrides, coherence
  check on `default_qualifiers` ids).
- **db-builder inference engine** — public events reveal facts to
  participants; death events update status transitively. Needs Phase
  3.5 data to be useful.
- **multi-medium spoiler progression** — `packages/sdk/src/progression.ts`
  only models `manga_chapter`; add anime/film axes + cross-medium
  reachability (reaching an episode implies its adapted chapter).
- **Playwright e2e** for the entity-create → PR flow (none exists yet).
- **decompose god-modules** — `EntityForm.tsx` (~1876 L) and
  `server/server.ts` (~1776 L). **ADR-first**. Also burns down
  react-doctor's ~254 advisory findings (mostly react-hooks deps here).
- ~~**schema-driven display name**~~ — **DONE (ADR-031):** entity types
  declare an ordered `display_name_properties`; resolver defaults to
  `['name','title_key']` only when a type omits it. No data migration.
  **Follow-up the feature now unlocks:** `image` (→ `caption_key`) and
  `sbs` currently fall back to slug (no `name`/`title_key`) — give them
  real display names by declaring `display_name_properties` (own PR;
  it's a display behaviour change, left out of ADR-031 to keep it
  behaviour-preserving).
- ~~**relation epistemic axis**~~ — **DONE (ADR-037):** `epistemic_status`
  / `believed_by` / `known_truth_by` / `revealed_since` are now base
  qualifiers on every relation (engine-provided, guarded by
  `RELATION_DECLARES_BASE_QUALIFIER`), typed in both validators
  (`entity-loader` + generated printer), exposed as columns on the
  db-builder `relations` table (mirrored onto the inverse) and on the SDK
  `RelationRecord`. Unblocks disguise-of / same-identity-as (G-series) and
  secret-alliance / double-agent modelling. No data migration.

### 4. Data-model expansion (clusters) — in progress

Driven by `/docs/DATA_EXPANSION_PLAN.md` (Fandom-survey synthesis → clusters
C1–C9, each = one ADR + PR). **Shipped:** ADR-037 (relation epistemic axis),
ADR-039 (C4 devil-fruit identity/succession), ADR-040 (C6 weapon Meitō), ADR-041
(C2 character occupations/blood-types), ADR-042 (`check:compat` schema-evolution
lockfile + CI gate), ADR-043 (C3 organizations: sub-units/power-systems/member
nations), ADR-044 (C7-core: `person` entity + `voiced-by`/`portrayed-by` +
`marine-ranks` via `held_rank`), ADR-045 (C9a: location `region` + historised
`location_status` + crew territorial control), ADR-046 (materials: `material`
entity + `made-of` + Seastone's `nullifies_devil_fruits`), ADR-047 (C8a:
`semi_canon` tier + `wanted_poster`/`eyecatcher` + `arc_number`). **Remaining
(committed order — user said "tout"):** ~~C8-rest~~ **done 2026-06-14 evening**
(ADR-071/073 volume, ADR-074 sbs-qa, ADR-075 chapter enrichment — see the
dated entry at the top), C9-rest (race/concept additions,
ancient-weapon/artifact, event enrichment, `era` entity + the `[D]` structured
in-universe temporal value — biggest), C5 (fighting-styles/Haki/techniques), C1
(naming/i18n editions — invasive, deliberately last; note `name-types` already
carries `native_script`/`romanized`/`literal_meaning`). All clusters touch
DECISIONS.md +
INVENTORY.md, so **merge sequentially**: pull main, branch, `compat:snapshot`
per cluster. **INVENTORY refresh** (per-item sub-sections lag the true catalogue
counts) is tracked in `DATA_EXPANSION_PLAN.md` §5 — a catalogue-generated
rewrite, its own PR.

### 5. Universe scoping / G6 relocation — DONE

**Decision 2026-06-14** (user: avoid letting the debt grow): G6 done in two PRs,
both behaviour- and contract-preserving (loader re-merges `core ∪ one-piece`;
`forUniverse` is test-only; `compat.ts` ignores `universes`; merged catalogue
identical at 22/79/58/48).

- **PR1 — guard fix (ADR-048)** [merged #63]: `checkUniverseScopes` no longer
  treats the _applicability_ lists (`relation.valid_from_types`/`valid_to_types`,
  `property.applies_to_entity_types`) as dependencies; `forUniverse` filters them
  per universe. Kept: entity→properties, entity→allowed_relations,
  entity→display_name_properties, property→enum_ref, relation→qualifier-enum.
- **PR2 — relocation (ADR-049)**: moved the One-Piece closure into
  `data/universes/one-piece/schemas/`. **Core** (9 entities): `image`,
  `manga-chapter`, `anime-episode`, `film`, `arc`, `saga`, `event`, `person`,
  `databook` + 36 generic props + 17 universal relations + 24 meta/generic
  vocabs. **One Piece** (13 entities): `character`/`crew`/`organization`/
  `location`/`title`/`concept`/`race`/`ship`/`weapon`/`technique`/`devil-fruit`/
  `sbs`/`material` + their 43 props + 41 relations + 24 domain vocabs. Guard
  green (no `SCHEMA_UNIVERSE_SCOPE_LEAK`). New clusters: put One-Piece-specific
  schemas under `data/universes/one-piece/schemas/`, universal ones under
  `data/schemas/`.

### 6. Production & credits + availability programme — in progress

User asked (2026-06-14) for full anime/film production data + platform links.
A Fandom audit (Episode Box / Song Box / Movie Box) confirmed: per-episode staff
(director/storyboard/animation-dir/art-dir/screenplay), theme songs (28-field Song
Box), per-dub cast, film credits + regional releases. **All universal → core.**
Slices (each ADR + PR):

1. **`staffed-by`** episode/film → person (role qualifier) + person-roles
   (storyboard/art_director/lyricist/arranger/producer) + dub-studios+=netflix —
   **ADR-050 [done, #65]**.
2. **`theme-song`** entity + `theme-of` (→ anime-episode/film/arc; usage/sequence/
   episode_from/to/broadcast_version) + `theme-song-usage` vocab; credits reuse
   `staffed-by` (widened +=theme-song); `record_label`/`track_length` props; titles
   via `name` `name_type` — **ADR-051 [done, this PR]**.
3. Episode/film props: `tv_rating`, `anime_original`, `film_number` — **ADR-053
   [done, this PR]**. (Eyecatcher = `features` + `appearance_type: eyecatcher`,
   no new field. Per-dub titles/dates fold into C1 i18n.)
4. **Platform availability** (W-E): `streaming-platform` entity (name,
   `platform_kind` → `platform-kinds` streaming/reader/store, `homepage_url`) +
   `available-on` relation (anime-episode/manga-chapter/film → streaming-platform;
   qualifiers url/region/requires_subscription/subtitle_langs/dub_langs/
   verified_at/since) — **ADR-052 [done, this PR]**. **Amends ADR-028** —
   relation-to-entity, NOT the `object` value-type ADR-028 assumed (unbuilt;
   value-types are string/number/boolean/enum/multi_enum/date/entity_ref/
   source_ref/i18n_key/markdown). Live-action availability now works:
   `available-on` `valid_from` += `live-action-series`/`live-action-episode`
   (ADR-062).

**New-domain clusters** (user: "tout tout tout"; from a 4-agent Fandom audit).
**STATUS 2026-06-14 — all delivered** (see the dated summary at the top): `company`
(prior), `databook-card` (prior), `album` (ADR-060), `video-game` (ADR-061),
`live-action-series`+`live-action-episode` (ADR-062), `merchandise` (ADR-065),
plus stage shows as `live-performance` (ADR-064). **OVAs/specials changed approach**:
modelled as a dedicated **`anime-special`** entity with a `special_kind`
(ova/tv_special/ona) **format** axis (ADR-063), _not_ a new `ova` canon-scope value
— format is orthogonal to canonicity. Original (now-superseded) plan below:

- **Real-world `company` entity** (core) — devs/publishers/labels/studios/
  manufacturers; + `produced-by` relation (media → company, `role` qualifier).
  Foundational; unblocks games/merch/music/live-action. (Note: in-universe
  `organization` is OP-scoped; real-world companies are distinct + universal.)
- **`live-action-episode`** entity (+ season): Netflix series; reuse
  `staffed-by`/`portrayed-by`/`available-on`/`theme-song`, `canon_scope: live_action`.
- **Non-canon media**: specials → `anime-episode` + `anime_filler`; crossovers →
  `anime-episode` + `crossover`; OVAs → new `ova` canon-scope value; stage shows/
  musicals → new `live-performance` entity.
- **`databook-card`** entity (Vivre Card / Visual Dictionary): `card_number`,
  `card_kind` vocab (character/extra/skill/ship), measured-fact snapshot props
  (historised), `profiles` → character/df/ship, `sourced-from` → databook. NB the
  audit found **no six-axis stat hexagon** — cards are descriptive/measured.
- **`album`** entity + `contains-track` (album → theme-song, many-to-many,
  qualifiers disc/track_number/version_note); `album_kind` vocab; reuse
  `staffed-by` (widen += album). theme-song doubles as the track entity.
- **`video-game`** entity (Game Box: name/genre/platform/release/prev-next);
  `game-platforms` vocab; widen `features` += video-game (+ `appearance_type`
  playable/exclusive); dev/publisher via `produced-by` → company.
- **`merchandise`** entity (+ `product-line`, `product-type` vocabs);
  manufacturer/collab via `produced-by` → company.

## Active plan (ADR-032) — tooling before ingest

Six workstreams, built in this order; each ships as independent PR(s).
No runtime DB: live PR/contributor data is read from the GitHub API on
demand (module-level cache like `api.ts`); derived aggregates are
computed server-side or emitted as generated TS manifests under
`packages/` (cf. `packages/schemas/generated`); image bytes stay on R2.

- **W-F — UI-coherence foundation** — **DONE 2026-06-14 evening.** The
  `<Banner>`/`<Button>` halves had already shipped with the #85
  overhaul; the last piece — the shared **`useApiResource`** hook
  (`src/hooks/use-api-resource.ts`, no new dependency; note TanStack
  Query is NOT actually in the dep tree despite the earlier note) +
  the shared `<LoadFailed>` error banner — landed on PR #91, replacing
  the duplicated `useEffect`+`useState`+`.catch(setError)`+`Failed:`
  blocks in the 7 fetching routes (index, type list/table/new,
  entity edit, apparitions, source cast). Route-local derived state
  (cast/apparitions working sets, table drafts) seeds via
  `useEffect`-on-data. God-module decomposition (`EntityForm.tsx`
  1876 L, `inputs.tsx` 1103 L, `server/server.ts` 1776 L) remains a
  later **ADR-first** slice, done opportunistically as W-B/C/D touch
  those files.
- **W-A — DONE 2026-06-14 evening.** The `check:coherence` linter half
  had already shipped earlier; the last piece — the schema-driven
  qualifier registry (ADR-078, `/data/schemas/qualifier-types/**`) —
  landed on PR #91.
- **W-B — admin queue + contributors** — **slice 1 DONE 2026-06-14
  evening** (PR #91): `GET /api/admin/pulls` (github-client
  `listAdminQueue` + contributor parsed from the Contributors bullet),
  gated `/admin/queue` route (list, Approve-merge → promote, Reject →
  reject, Review link), `admin` flag on `/api/auth/me`. **Slice 2 DONE
  (same evening)**: in-app structured diff (`server/diff.ts` pure
  helpers + `GET /api/admin/pulls/:n/detail` + expandable queue rows).
  **Remaining W-B**: staged image previews, CI status,
  Request-changes action, and the
  `GET /api/contributors` + `/contributors` route aggregating by
  **parsing the PR-body Contributors bullet** (bot owns commits, so
  GitHub's author APIs don't reflect humans). `packages/contribution-
  stats` util; optional build-time `contributors.generated.ts`.
- **W-C — schema/enum/value editor** (pulls Phase 5 fwd). Vocabulary
  (enum) editor first (additive, PR label `vocabulary`) → property-type
  editor (+ impact analysis, reuse `bun run migrate`) → entity-type
  editor (admin-only, ≥2 reviews, incl. `display_name_properties`), PR
  label `schema-breaking`. Reuse the form generator + github-client.
- **W-E — availability links** (ADR-028, already designed). `availability`
  object property (`{platform,url,kind,region?,subtitle_langs?,
  dub_langs?,requires_subscription?,verified_at?}`, `allow_multiple`) on
  anime-episode/manga-chapter/film; `streaming-platforms` vocabulary.
  Prereq: `SCHEMA_SPEC` `object` value-type section (ADR-026) + a
  repeating-object-row form input. **Affiliate links = separate net-new
  ADR** (FTC disclosure, `rel="sponsored nofollow"`, program/tag model).
- **W-D — media library + image UX.** `/media` gallery (filter by
  license/format/spoiler/usage, search, "where used"); image **reuse
  picker** in the form (widen `depicted-by.valid_from_types` first);
  **display images** on entity detail/list/cards, spoiler-gated by
  `spoiler_since`; uploader polish (paste, bulk, optional crop/focal,
  inline license+attribution+alt-text gating, content-hash dedup).
  `packages/media` helper (URL resolution, srcset, blur). Responsive
  variants via Cloudflare = deploy-config, flag for platform.

## Décision produit en attente

- **Un axe sans curseur n'est pas filtré du tout.** `progress.ts`,
  `isSourceVisible` : `if (limit === null) return true;`. Un lecteur qui
  déclare seulement sa progression manga voit donc **tous** les épisodes
  d'anime, et réciproquement. C'est du comportement d'origine, resté
  invisible tant que le corpus n'avait aucun épisode ; l'import des 400
  premiers l'a révélé (un test anti-spoil sur le chapitre 1053 s'est mis
  à remonter `anime-episode:105`).
  Les deux lectures se défendent : filtrer à zéro cacherait toute la
  partie anime à quiconque ne renseigne que le manga ; ne pas filtrer
  expose des titres d'épisodes en avance sur le manga lu. **À trancher
  par le mainteneur**, puis ADR.

## Gotchas (so they don't bite again)

- **`bun run build:db` AVANT `bun test`, toujours.** Plusieurs suites
  lisent `dist/onepiece.db` sous `describe.skipIf(!hasArtifact)` : sans
  l'artefact elles ne rougissent pas, elles **disparaissent**, et le run
  annonce un vert serein sur des tests qui n'ont pas tourné. Ça a laissé
  passer l'import #94 avec deux tests rouges, et ça a repiégé la même
  personne sur #130 (« 680 pass » en local, deux échecs réels en CI sur
  le même commit). Le gauntlet du skill `toolchain` a été corrigé pour
  correspondre vraiment à la CI.
- **Un compte de population du corpus ne se code pas en dur dans un
  test.** `sequence.total` était figé à 34 : un import de chapitres l'a
  fait passer à 406 et a rougi un test qui portait sur la logique de
  séquence, pas sur la taille des données. Asserter la relation
  (gaté < non gaté), pas le nombre.
- **Un test anti-spoil s'énonce sur l'entité qu'il vise**, pas sur la
  taille du résultat. « le résultat est vide » ne tenait que tant que
  rien d'autre dans le corpus ne pouvait matcher : `1053` a fini par
  atteindre `anime-episode:105`, et un test sur le gating manga a échoué
  sur une entité anime dont il ne parlait pas.
- **`<nowiki>` est une échappe, pas du contenu.** `cleanValue` ne le
  retirait pas : 41 titres d'épisodes sur 400 sont arrivés dans le
  corpus en lisant `We are Friends<nowiki>!!</nowiki>`. Les balises
  partent, le texte reste.

- **Un crawl Fandom n'est jamais jeté** (ADR-116). L'ordre du workflow
  est stage → push → validate → PR ; la validation ne fait pas échouer
  le job. Si elle échoue, **corrige le fichier sur la branche d'import,
  ne relance pas le crawl** — dix minutes throttlées pour retomber sur
  le même fichier.
- **`workflow_dispatch` lit le workflow de la branche par défaut.** Un
  correctif de workflow qui vit sur une branche n'agit pas tant que la
  PR n'est pas mergée, sauf à déclencher explicitement sur ce ref.
- **Les noms de catégories Fandom ne se devinent pas et échouent en
  silence.** `Chapters` n'existe pas ; MediaWiki renvoie une liste vide
  pour une catégorie inexistante, donc le run réussit en affichant
  `0 page(s)`. Le vrai nom est `One Piece Chapters`, 0 page en direct et
  5 sous-catégories — d'où `depth: 3`. Liste complète :
  `docs/audits/fandom-structure-*.json` (2641 catégories).
- **Les sources avant les sujets.** Importer `Devil Fruits` avant les
  chapitres a produit 138 `ENTITY_REFERENCE_NOT_FOUND` : chaque `since`
  pointait vers un chapitre absent.
- **`schema_version` est figé à 1** (ADR-115) et rien ne branche sur sa
  valeur. `schema:versions` doit lire `0 behind` ; toute version ≠ 1
  qu'il signale est une constante d'importeur oubliée ou un crawl
  d'avant le reset arrivé après.

- **Build before committing**, and **deploy config can't be verified
  locally** — CLAUDE.md Definition of done #7. CI now builds the
  dashboard, but `vercel.json` / nitro preset changes only prove out on
  Vercel.
- commitlint allowed types: `feat fix refactor docs test chore data
  schema perf style` — **no `ci`** (use `chore` for tooling/CI).
- `react-doctor install` overwrites `.git/hooks/pre-commit` (hijacks
  lefthook) — restore with `bunx lefthook install`.
- dprint markdown turns a line starting with `+` into a list marker —
  don't start prose lines with `+`.
- Unit tests run on `bun test` (not Vitest — ADR-030).
- On Windows the working tree can drift to CRLF; `.gitattributes`
  enforces LF. Stage intentionally (the tree may show phantom CRLF
  diffs).

## Tooling in place

- Skills (`.claude/skills/`): `data-model`, `dashboard`, `toolchain`,
  plus vendor `react-doctor`.
- Gates: dprint (format), oxlint (correctness + suspicious = error,
  `no-unused-vars` = error), knip (dead files + deps; export-level off),
  react-doctor (advisory ratchet, non-blocking), CI dashboard build,
  commitlint, lefthook.
- `bun run migrate <file>` rewrites `/data` for schema renames in the
  pre-freeze regime (ADR-029/030).
- Full verify gauntlet: see the `toolchain` skill.
