/**
 * Le handle SQLite suit `ONEPIECE_DB_PATH`, même après un premier
 * appel.
 *
 * Ce test existe à cause d'un échec CI que rien ne reproduisait en
 * local : les sept tests de `display-name.test.ts` tombaient sur
 * « no view for character/renamed-later », c'est-à-dire que la fixture
 * (une COPIE de l'artefact avec deux entités greffées) n'était jamais
 * lue. La cause n'était pas dans le code testé mais dans `db.ts`, qui
 * mémoïsait son handle SANS retenir le chemin ouvert : le premier
 * appelant décidait pour tout le processus.
 *
 * Ça tenait tant que Bun donnait à chaque FICHIER de test son propre
 * registre de modules. Sans cette isolation — CI tournait Bun 1.3.6,
 * la machine de dev 1.3.11 — un fichier plus tôt (views, search)
 * ouvrait l'artefact réel et la fixture était ignorée en silence.
 *
 * Le test ne dépend d'aucune isolation : il fait les deux appels dans
 * LE MÊME processus, ce qui est précisément la condition qui cassait.
 */
import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REAL_DB = resolve(import.meta.dirname, '..', '..', '..', '..', 'dist', 'onepiece.db');
const hasArtifact = existsSync(REAL_DB);

let workdir: string | null = null;

/**
 * Remet la variable comme elle était. Appelé DANS le test, pas dans un
 * `afterAll` : la variable est globale au processus, donc la laisser
 * posée le temps d'un hook suffit à ce qu'un autre fichier ouvre la
 * copie — puis la trouve supprimée. C'est la faute que ce test même a
 * commise en premier jet : 53 suites sont tombées d'un coup.
 */
function restore(previous: string | undefined): void {
  if (previous === undefined) delete process.env['ONEPIECE_DB_PATH'];
  else process.env['ONEPIECE_DB_PATH'] = previous;
}

afterAll(() => {
  if (workdir !== null) rmSync(workdir, { recursive: true, force: true });
});

test.skipIf(!hasArtifact)('un changement de ONEPIECE_DB_PATH rouvre la base', async () => {
  const db = await import('../db.ts');

  // 1. Premier appel : l'artefact réel, qui ne contient pas notre marqueur.
  const before = db.getEntityBySlug('character', 'db-path-probe');
  expect(before).toBeNull();

  // 2. Une COPIE, plus une entité greffée — ce que fait la fixture des
  //    noms d'affichage.
  workdir = mkdtempSync(join(tmpdir(), 'op-db-path-'));
  const copy = join(workdir, 'onepiece.db');
  copyFileSync(REAL_DB, copy);
  const grafted = new Database(copy);
  grafted.run(
    `INSERT INTO entities (id, type, slug, schema_version, first_appearance_source,
       last_appearance_source, primary_canon_scope, canonical_name_key, data)
     VALUES ('character:db-path-probe', 'character', 'db-path-probe', 1,
       NULL, NULL, NULL, NULL, '{}')`,
  );
  grafted.close();

  // 3. Le même processus, le même module : le handle doit SUIVRE.
  const previous = process.env['ONEPIECE_DB_PATH'];
  process.env['ONEPIECE_DB_PATH'] = copy;
  let after;
  try {
    after = db.getEntityBySlug('character', 'db-path-probe');
  } finally {
    restore(previous);
  }
  expect(after).not.toBeNull();
  expect(after?.id).toBe('character:db-path-probe');

  // Et l'on revient bien à l'artefact réel : le marqueur disparaît.
  expect(db.getEntityBySlug('character', 'db-path-probe')).toBeNull();
});
