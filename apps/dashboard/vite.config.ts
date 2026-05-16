/**
 * ADR-018: TanStack Start replaces the dev-only "vite + concurrently
 * Bun API" setup. Two plugins drive it:
 *
 *  - `tanstackStart()` — file-based routing (incl. `server.handlers`
 *    on routes under `src/routes/api/`), SSR bundling, server-function
 *    transforms, and auto-generation of `routeTree.gen.ts` on every
 *    save under `srcDirectory`.
 *  - `nitro()` — packs the build into a deploy-ready server bundle
 *    (`.output/server/index.mjs` for `bun run start`) and lets the
 *    plugin pick a Vercel/Cloudflare/Node preset at deploy time.
 *
 * Plugin order matters: tanstackStart() MUST come before viteReact()
 * (Start sets up the SSR pipeline + server-route transform that React's
 * plugin then plugs into for JSX) and nitro() MUST come last (it
 * consumes the bundled output from the others). Mirrors the official
 * `examples/react/start-basic` template.
 *
 * No `server.proxy` block: requests to `/api/*` hit the same origin
 * and Start dispatches them to the file-based server routes (see
 * `src/routes/api/$.ts`). Single dev process, single deploy artefact.
 */
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({ srcDirectory: 'src' }),
    react(),
    nitro(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 4100,
  },
});
