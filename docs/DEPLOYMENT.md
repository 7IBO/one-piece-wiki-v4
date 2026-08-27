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

| Application      | Déployée ? | Runtime    | Notes                               |
| ---------------- | ---------- | ---------- | ----------------------------------- |
| `apps/dashboard` | oui        | Node       | seule cible du `vercel.json` racine |
| `apps/web`       | **non**    | Bun requis | le wiki public n'a aucune URL       |

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

## 3. Le vrai risque : embarquer la base dans le bundle

C'est ici que le déploiement échouera si on ne fait rien, et c'est le
point qui mérite l'attention.

- `dist/onepiece.db` est un **artefact de build gitignoré**, produit
  pendant le build Vercel (Turbo : `@onepiece-wiki/web#build` dépend de
  `@onepiece-wiki/db-builder#build:db`).
- `resolveDbPath()` le trouve en **remontant l'arborescence** à la
  recherche de `dist/onepiece.db`, et honore la variable
  `ONEPIECE_DB_PATH` si elle est définie.
- Or **Nitro trace les imports, pas les lectures de fichiers à
  l'exécution.** Un `existsSync` dans une boucle de remontée est
  invisible pour le traceur. Le `.db` ne sera donc pas inclus dans le
  bundle de la fonction, et le serveur lèvera son erreur « artefact
  manquant » en production alors que tout passe en local.

### ⚠️ Le raccourci à ne surtout pas prendre

Copier `dist/onepiece.db` dans `apps/web/public/` le rendrait
**téléchargeable publiquement**. La base contient l'intégralité du
corpus, tous curseurs confondus : n'importe qui pourrait l'ouvrir et
lire ce qui se passe mille chapitres plus loin. Cela détruirait la
promesse centrale du site.

Le filtrage anti-spoil n'a de valeur que parce qu'il est **fait côté
serveur**. La base ne doit jamais franchir la frontière réseau, ni comme
fichier statique, ni sérialisée dans le HTML.

### La bonne approche

Copier l'artefact dans la sortie **serveur** après le build, puis
pointer `ONEPIECE_DB_PATH` dessus. À implémenter et à vérifier sur la
plateforme :

1. Un hook post-build qui copie `dist/onepiece.db` dans le répertoire de
   sortie serveur de Nitro.
2. `ONEPIECE_DB_PATH` défini sur le chemin résultant dans les variables
   d'environnement du projet Vercel.
3. Vérification que le fichier survit au tracing (le bundle final doit
   le contenir).

## 4. Ce que le mainteneur doit faire sur la plateforme

Ces étapes ne sont pas scriptables depuis le dépôt :

1. **Créer un second projet Vercel** sur `7IBO/one-piece-wiki-v4`.
2. Régler sa **Root Directory** sur `apps/web`, et activer **« Include
   files outside the root directory »** — le build a besoin des
   workspaces et de `/data`.
3. Définir `ONEPIECE_DB_PATH` dans les variables d'environnement.
4. Brancher le domaine (`one-piece.wiki` est le nom retenu dans
   `WEB_APP.md`) sur ce projet, **pas** sur celui du dashboard.

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
