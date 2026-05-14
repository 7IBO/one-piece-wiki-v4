import { writeFileSync } from 'node:fs';
import type { WriteResult } from './writer.ts';

export type Manifest = {
  built_at: string;
  data_version: string;
  counts: WriteResult['counts'];
};

export function writeManifest(path: string, result: WriteResult): Manifest {
  const manifest: Manifest = {
    built_at: new Date().toISOString(),
    data_version: process.env['DATA_VERSION'] ?? '0.0.0',
    counts: result.counts,
  };
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
