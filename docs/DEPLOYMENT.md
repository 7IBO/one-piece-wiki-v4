# Déploiement

Comment les deux applications arrivent en ligne, et ce qui ne peut se
vérifier que sur la plateforme.

> **Règle du projet** (`/CLAUDE.md`, définition du « done », point 7) : la
> configuration de déploiement — `vercel.json`, preset nitro,
> `NITRO_PRESET` — **ne peut pas être vérifiée en local**. Elle ne se
> prouve que sur la plateforme. Ne jamais la merger à l'aveugle. Rappel
> de l'incident #23 : un changement de `buildCommand` passait tous les
> checks locaux et cassait le déploiement Vercel.

## 1. État actuel

| Application      | Déployée ? | Runtime | Notes                               |
| ---------------- | ---------- | ------- | ----------------------------------- |
| `apps/dashboard` | oui        | Node    | seule cible du `vercel.json` racine |
| `apps/web`       | oui        | Bun     | projet `one-piece-wiki-v4-web`      |

`vercel.json` à la racine :

```json
{
  "buildCommand": "bun install && bun run -F @onepiece-wiki/dashboard build",
  "outputDirectory": "apps/dashboard/.output"
}
```

Un projet Vercel ne construit qu'une application. Mettre le wiki en ligne
demande donc **un second projet Vercel** sur le même dépôt.

**C'est le premier goulot d'étranglement du projet.** Le design, la
recherche, le SEO et l'acquisition ne valent rien tant que le site n'est
accessible à personne (cf. `VISION.md` §1).

## 2. Le runtime : Bun est désormais supporté nativement

`apps/web/server/db.ts` importe `bun:sqlite`, qui n'existe que sous Bun.
C'était historiquement l'obstacle : les fonctions Vercel tournaient sous
Node, et ADR-012 avait anticipé une contingence « `better-sqlite3`
côté lecture sous Node si une cible serverless l'exige ».

**Cette contingence n'est plus nécessaire.** Vercel supporte
officiellement le runtime Bun sur ses fonctions (documentation mise à
jour le 2026-08-24). Il s'active par une clé de `vercel.json` :

```json
{ "bunVersion": "1.x" }
```

Seules `1.4.x` et `1.x` sont acceptées. Le dépôt tourne en Bun 1.3.11 en
local : `1.x` évite d'épingler une mineure que la plateforme n'aurait
pas.

Conséquence : **on garde un seul driver SQLite** pour le build et pour la
lecture, et l'abstraction Node envisagée par ADR-012 reste au placard.

## 3. Embarquer la base dans le bundle — résolu

Deux défauts se cachaient l'un derrière l'autre. Les deux sont corrigés.

### 3.1 L'artefact n'était pas embarqué

Nitro trace les `import`. `server/db.ts` localise la base par une
**remontée d'arborescence à l'exécution** (`resolveDbPath`), invisible
pour tout bundler. Le `.db` n'était donc pas tracé dans le déploiement,
et le serveur mourait sur :

```
SQLite artifact not found at /var/task/dist/onepiece.db
```

`apps/web/scripts/bundle-db.ts`, branché en fin de `build`, copie
l'artefact **à côté de l'entrée serveur** — dans
`.vercel/output/functions/__server.func/dist/` sur Vercel, dans
`.output/server/dist/` sinon. C'est exactement là que la remontée
existante aboutit : aucune variable d'environnement n'est nécessaire,
`ONEPIECE_DB_PATH` reste une échappatoire optionnelle.

### 3.2 L'artefact n'était pas autonome

Découvert en testant 3.1 : `dist/onepiece.db` faisait **4 Ko et
contenait zéro table**. Le db-builder ouvrait la base en
`journal_mode = WAL` et ne checkpointait jamais, donc les 543 Ko de
données vivaient dans `dist/onepiece.db-wal`.

Tout fonctionnait en local **uniquement parce que le fichier annexe se
trouvait à côté**. Le premier transport du seul `.db` livrait une base
vide — c'est ce qui s'est produit au premier essai de bundling.

`packages/db-builder/src/writer.ts` termine désormais par
`wal_checkpoint(TRUNCATE)` puis `journal_mode = DELETE` : l'artefact
est un fichier unique et autonome, sans annexes. WAL n'apportait rien à
une base lue en seule lecture.

**Vérifié de bout en bout** : base de la racine masquée, serveur
construit démarré, `/`, `/search?q=luffy`, `/character/monkey-d-luffy`
et `/manga-chapter/chapter-1044` répondent tous 200 avec du vrai
contenu.

### ⚠️ Le raccourci à ne surtout pas prendre

Copier `dist/onepiece.db` dans `apps/web/public/` le rendrait
**téléchargeable publiquement**. La base contient l'intégralité du
corpus, tous curseurs confondus : n'importe qui pourrait l'ouvrir et
lire ce qui se passe mille chapitres plus loin. Le filtrage anti-spoil
n'a de valeur que parce qu'il est fait côté serveur.

## 4. Ce que le mainteneur doit faire sur la plateforme

Ces étapes ne sont pas scriptables depuis le dépôt :

1. **Créer un second projet Vercel** sur `7IBO/one-piece-wiki-v4`. ✅ fait
2. Régler sa **Root Directory** sur `apps/web`, et activer **« Include
   files outside the root directory »** — le build a besoin des
   workspaces et de `/data`. ✅ fait
3. **Laisser les trois overrides ÉTEINTS** (Build Command, Output
   Directory, Install Command) : `apps/web/vercel.json` fournit les
   commandes et fait autorité. Un override **activé mais vide** n'est
   pas neutre — Vercel l'interprète comme « la sortie est la Root
   Directory » et a publié `apps/web/` **en statique**, servant le code
   source et renvoyant 404 sur toutes les routes.
4. Brancher le domaine (`one-piece.wiki` est le nom retenu dans
   `WEB_APP.md`) sur ce projet, **pas** sur celui du dashboard.

`ONEPIECE_DB_PATH` n'est **pas** nécessaire : le hook de build place
l'artefact là où la résolution le cherche déjà.

## 5. Contrainte de fond à garder en tête

Le corpus est lu depuis un fichier SQLite embarqué dans le déploiement.
C'est parfait pour de la donnée de référence qui ne change qu'au build,
ce qui est exactement notre modèle (`/data` en JSON est la source de
vérité ; SQLite est dérivé et jetable ; on n'écrit jamais dedans à
l'exécution).

En revanche, dès qu'on ajoutera des **comptes utilisateurs** (progression
personnelle, favoris, profil — cf. `VISION.md` §5.3), cette donnée-là
sera _mutable et par utilisateur_. Elle ne peut pas vivre dans un
artefact de build en lecture seule, ni dans `/data`. Il faudra un
véritable stockage d'exécution, et ce sera une décision d'architecture à
part entière, à consigner en ADR.
