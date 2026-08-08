/**
 * bun run build:db — build the SQLite artifact + manifest from /data/.
 * (`bun run build:data` is the historical alias; both run this file.)
 */
import { build } from '../builder.ts';

const result = await build();
const { counts } = result.write;

process.stdout.write(
  `Built ${result.dbPath}\n`
    + `  entities=${counts.entities} `
    + `properties=${counts.properties} `
    + `relations=${counts.relations} (inferred=${counts.relations_inferred}) `
    + `appearances=${counts.appearances} `
    + `translations=${counts.translations} `
    + `narratives=${counts.narratives}\n`
    + `Manifest at ${result.manifestPath}\n`,
);
