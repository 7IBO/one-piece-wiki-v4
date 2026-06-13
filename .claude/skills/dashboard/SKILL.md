---
name: dashboard
description: Use when working in apps/dashboard — TanStack Start routes, the schema-driven form generator, the /api/* server endpoints, Base UI components, or anything touching the dashboard's build or Vercel deploy. Covers server routes, the Vercel Build-Output gotcha, the frontend import rule, and the PR-based write flow.
version: "1.0.0"
---

# Dashboard (TanStack Start)

Admin editing app. Reads via server functions; writes open GitHub PRs.
Full architecture: `/docs/DASHBOARD_ARCHITECTURE.md`, ADR-018/019.

## Stack & patterns

- **TanStack Start** (file-based routing + server routes), **Base UI**
  with **Tailwind v4**, **React Hook Form** + the zod resolver, and
  **TanStack Query** for server state.
- **API**: every `/api/*` request goes through the splat server route
  `src/routes/api/$.ts` → `handleApiRequest` in `api/server.ts`. Add a
  new endpoint to that route table — do not scatter one file per
  endpoint.
- **Forms are 100% schema-driven** — no per-entity-type form code. If
  you're special-casing `character`, stop and drive it from the schema.
- **No business logic in components** — logic lives in `/packages`,
  imported. Components compose data + behaviour.
- **Writes → PRs** via `packages/github-client` (optimistic lock by
  file SHA, resume-PR, bulk cast edits). Never write `/data` directly
  at runtime.

## Frontend import rule

Under `apps/dashboard/src/**`, import WITHOUT `.ts`/`.tsx` extensions
(Vite resolves; `bun run check:frontend-extensions` enforces it). The
`api/` and `packages/` trees DO use explicit extensions.

## Deploy — do NOT regress (ADR / PR #23)

The nitro **`vercel`** preset (active when `VERCEL` is set) emits the
**Vercel Build Output API** to `apps/dashboard/.vercel/output/`:
`config.json` routes `/(.*) → /__server` plus the serverless function
in `functions/__server.func/`.

- `vercel.json` must **NOT** declare a static `outputDirectory` /
  `framework` — that makes Vercel serve `.output` statically and never
  deploy the function, 404-ing **every** `/api/*` route (and SSR) while
  the static shell still loads.
- The Vercel project Root Directory is the repo root, so the
  `buildCommand` relocates `apps/dashboard/.vercel/output` →
  repo-root `.vercel/output` where Vercel reads the Build Output API.

Symptom to recognise: app shell loads but `/api/schemas`,
`/api/auth/me`, … return 404 in production only.
