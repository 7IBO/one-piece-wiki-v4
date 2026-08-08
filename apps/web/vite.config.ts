/**
 * Public reader app (`apps/web`) — same TanStack Start recipe as
 * `apps/dashboard/vite.config.ts` (ADR-018): `tanstackStart()` BEFORE
 * `react()` (Start owns the SSR pipeline React's plugin plugs into),
 * `nitro()` LAST (it packs the bundled output). See the dashboard
 * config for the full rationale; only the port (4200) and the
 * `bun:sqlite` external differ.
 *
 * `bun:sqlite` is a Bun-runtime builtin with no npm counterpart —
 * Rollup cannot resolve it, so it is declared external for the SSR
 * bundle. The dev server and the production server must therefore run
 * under Bun (`bun --bun vite dev` / `bun .output/server/index.mjs`);
 * the read path never runs in the browser bundle.
 */
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import path from 'node:path';
import { defineConfig } from 'vite';

// Deploy preset mirror of the dashboard (ADR-019): Vercel auto-detects
// its build env, everything else falls back to a plain node-server
// bundle that `bun run start` executes under Bun.
const nitroPreset = process.env['NITRO_PRESET']
  ?? (process.env['VERCEL'] !== undefined ? 'vercel' : 'node-server');

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({ srcDirectory: 'src' }),
    react(),
    nitro({ config: { preset: nitroPreset } }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  ssr: {
    external: ['bun:sqlite'],
  },
  server: {
    port: 4200,
  },
});
