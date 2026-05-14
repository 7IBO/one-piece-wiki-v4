/**
 * bun run build:data — build the SQLite artifact + manifest from /data/.
 */
import { build } from '../builder.ts';

const result = await build();

process.stdout.write(
  `Built ${result.dbPath}\n`
    + `  entities=${result.write.counts.entities} `
    + `properties=${result.write.counts.properties} `
    + `relations=${result.write.counts.relations} `
    + `appearances=${result.write.counts.appearances}\n`
    + `Manifest at ${result.manifestPath}\n`,
);
