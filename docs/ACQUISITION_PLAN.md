# Le worker d'acquisition : ce qui existe, ce qui manque, et où le mettre

Analyse de la demande « avoir notre worker pour récupérer toutes
données Fandom et TMDB », écrite après avoir **compté** le corpus, le
registre d'import et le catalogue Fandom — pas d'après les intentions
des docs.

## 1. Ce qui est déjà là

Il y a **déjà un worker**, et il fait presque tout ce qu'on lui
demanderait : `.github/workflows/fandom-import.yml`.

Son enchaînement est celui qu'on voudrait écrire, et il porte une
leçon chèrement payée dans son propre commentaire :

```
crawl → PUSH sur une branche → valide → rapporte → ouvre la PR
```

> « Run 8 mapped 398 chapters and threw every one away because a
> single staged file failed validation. » — d'où le push **avant**
> toute validation : le crawl est l'artefact cher et non rejouable,
> il atteint une branche avant qu'on ait le droit de le juger.

La PR sort étiquetée `via-dashboard` + `import`, donc elle atterrit
dans la file de modération du dashboard. **Rien ne merge sans
humain** (ADR-079 §4).

Six workflows existent sur le même modèle : `fandom-import`,
`fandom-sync`, `fandom-analyze`, `fandom-render`,
`fandom-chapter-render`, `fandom-arc-edges`.

## 2. Ce qui manque, mesuré

### Le crawl couvre trois types sur onze

Registre d'import (`data/import/fandom-pages.json`) : **2485 pages
suivies**, et rien d'autre.

| type            | pages suivies | entités au corpus |
| --------------- | ------------: | ----------------: |
| `manga-chapter` |          1193 |              1193 |
| `anime-episode` |          1176 |              1176 |
| `volume`        |           115 |               115 |
| `character`     |         **1** |                10 |
| tout le reste   |         **0** |                 — |

Les 49 arcs, le fruit, l'équipage, les sagas ne viennent pas du
crawl : ils ont été semés à la main ou importés par un autre chemin.

### Ce que Fandom porte et qu'on ne prend pas

D'après `docs/audits/fandom-structure-2026-08-27.json` (transclusions
réelles, plafonnées à 500 par l'échantillonnage) :

**Un mapper existe, zéro page importée** — c'est le trou immédiat :

| template         |                             pages | mapper            |
| ---------------- | --------------------------------: | ----------------- |
| Char Box         | **500+** (plafonné ; ~1500 réels) | `character` ✅    |
| Devil Fruit Box  |                               211 | `devil-fruit` ✅  |
| Crew Box         |                               149 | `crew` ✅         |
| Ship Box         |                               141 | `ship` ✅         |
| Organization Box |                               114 | `organization` ✅ |
| Weapon Box       |                               112 | `weapon` ✅       |
| Arc Box          |                                70 | `arc` ✅          |

**Aucun mapper** — invisibles tant qu'on n'en écrit pas un :

| template     |  pages | type au schéma  |
| ------------ | -----: | --------------- |
| Island Box   |    414 | (aucun)         |
| Song Box     |    207 | (aucun)         |
| Game Box     |     87 | (aucun)         |
| Race Box     |     41 | `race` déclaré  |
| Album Box    |     31 | `album` déclaré |
| Movie Box    |     28 | (aucun)         |
| Event Box    |     26 | `event` déclaré |
| **Saga Box** | **11** | `saga` déclaré  |

Soit **~1 300 pages** derrière des mappers qui existent et **~850**
derrière des mappers à écrire.

### TMDB n'existe pas

**Zéro ligne de code.** Les 40 occurrences du mot dans le dépôt sont
toutes dans `ROADMAP.md` et `IMAGES.md`, qui le planifient depuis la
phase 3.5 sans que rien n'ait été écrit.

Et c'est TMDB qui répond aux deux trous que j'ai mesurés côté rendu :

|              | manquant              | ce que TMDB apporte                                                     |
| ------------ | --------------------- | ----------------------------------------------------------------------- |
| **images**   | 2555 entités sur 2557 | une image par épisode (still, hotlink CDN, `license: tmdb-attribution`) |
| **français** | 2522 clés sur 2572    | titre + synopsis d'épisode en FR                                        |

Les 3 entités `image` du corpus pointent d'ailleurs sur
`images.onepiece-wiki.example` — **un domaine fictif**. Il n'y a
aucune vraie image, toute l'illustration du site est générée.

### Rien n'avance tout seul

Les six workflows sont en `workflow_dispatch` **manuel**.
`fandom-sync.yml` porte même sa ligne cron **en commentaire** :

```yaml
# schedule:
#   - cron: '17 6 * * *' # daily 06:17 UTC — enable deliberately.
```

À 25 pages par run, les ~1 300 pages à mapper demandent **une
cinquantaine de déclenchements à la main**.

### La frontière est par catégorie, pas globale

`--skip-known` fait avancer une catégorie donnée. Rien ne répond à
« combien reste-t-il au total, et par où continuer ». C'est ce qui
rend l'avancement manuel : il faut se souvenir de l'état.

## 3. Où mettre le worker

La demande dit « les app tournent sur Vercel ». Trois contraintes
décident, et aucune n'est négociable :

1. **La source de vérité est git.** `CLAUDE.md` : « The source of
   truth is JSON files in `/data` ». Un worker ne peut pas écrire
   dans une base — sa sortie est un commit et une PR.
2. **Rien ne merge sans humain** (ADR-079 §4). Le worker alimente la
   file de modération, il ne publie pas.
3. **Le crawl est long.** 1 500 personnages avec un batcher
   respectueux, ce sont des dizaines de minutes. Une fonction
   serverless Vercel plafonne à 60 s (Hobby) / 300 s (Pro).
   **Elle ne peut pas porter le crawl** — seulement le déclencher.

D'où la conclusion, qui est un peu moins excitante que « bâtissons un
worker » : **le bon worker est celui qu'on a déjà**. Un runner GitHub
Actions donne 6 h de timeout, un egress normal, les secrets, et le
dépôt est déjà sous la main — pas de checkout distant, pas de jeton à
fabriquer pour pousser. Un worker Vercel devrait de toute façon
pousser sur GitHub, avec moins de temps et plus de pièces.

Ce que Vercel apporte, en revanche, c'est le **poste de pilotage** :
le dashboard y tourne déjà, il a déjà une App GitHub et Octokit, il a
déjà la file de modération. Il lui manque le droit `actions: write`
sur l'App — un réglage, pas un chantier — pour déclencher les runs et
montrer la frontière.

## 4. Ce qu'il faut construire, par ordre de rendement

1. **Une frontière globale.** Un état lisible qui dit, par type :
   combien Fandom en porte, combien on en a, quelle catégorie reprend
   et où. Sans lui, tout le reste reste manuel. Le registre
   (`fandom-pages.json`) porte déjà la moitié de l'information.
2. **Un cron qui avance seul.** Décommenter `fandom-sync` est un
   geste ; le vrai travail est un run périodique qui lit la frontière,
   prend le prochain lot, et ouvre **une PR par lot** — assez petite
   pour être relue.
3. **Le client TMDB.** C'est ce qui débloque les images et le
   français, les deux trous les plus visibles à l'écran. Le chemin
   est déjà spécifié (ROADMAP phase 3.5, tâche 3) : `external_refs`,
   `aired_at_fr`, `tmdb-attribution`, une entité `image` par épisode.
4. **Les mappers manquants**, par volume décroissant : Island (414),
   Song (207), Game (87), Race (41), Album (31), Movie (28), Event
   (26), Saga (11). La saga passe devant tout le monde malgré ses 11
   pages : la planche « Progression » du manifeste en dépend
   structurellement (« groupé par saga ») et le corpus n'en a qu'une.

## 5. Ce qui reste à trancher (ADR obligatoire)

- **Le rythme et la taille des lots.** Une PR de 500 entités est
  irrelisible ; une PR de 25 en fait cinquante. Le compromis décide de
  l'utilisabilité de la file de modération.
- **`overwrite` sur un ré-import.** Le flag existe et le workflow
  prévient qu'il **écrase** ce qu'un humain a corrigé. Un worker
  périodique doit savoir distinguer « le mapper a appris à lire un
  champ de plus » de « quelqu'un a corrigé cette valeur à la main » —
  aujourd'hui il ne le sait pas.
- **Le quota Vercel.** Chaque PR d'import déclenche deux déploiements
  de preview. À une cinquantaine de PR, le plan gratuit (100
  déploiements/jour, à l'échelle du compte) se remplit. Il faut soit
  espacer, soit désactiver la preview sur les branches `import/*`.
