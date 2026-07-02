# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single Astro documentation site (`dev.mirrei.docs`, deploys to Cloudflare Workers/Pages via `@astrojs/cloudflare`). Package manager is **pnpm**. Standard scripts live in `package.json` (`dev`, `build`, `preview`).

### Node version (important, non-obvious)
- Astro 7 / Vite 8 require **Node >= 22.15** (they import `registerHooks` from `node:module`). The VM's default `node` (`/exec-daemon/node`) is v22.14.0 and will fail `astro build`/`astro dev` with `does not provide an export named 'registerHooks'`.
- The correct Node (nvm default `v22.22.2`) is used automatically in interactive bash shells (`~/.bashrc` prepends the nvm bin dir). If you ever see the wrong version, run commands with `PATH="$(dirname "$(nvm which default)"):$PATH"` prepended, or run inside a login shell (`bash -l`).

### Services / how to run
- **Docs site (dev):** `pnpm dev` → `astro dev` on `http://localhost:4321`. Serves the static docs. Note `/` redirects to `https://mirrei.dev`, and pages use `.html` file format (e.g. `/meister/js/2026/1.html`).
- **Interactive API routes are NOT served by `astro dev`.** The endpoints under `src/pages/api/**` (`feedback`, `wrong-code`, and the 2026 pixel canvas) import `env` from `cloudflare:workers` and use Cloudflare D1/KV bindings, which only exist in the workerd runtime. To exercise them end to end:
  1. `pnpm build`
  2. Apply the local D1 migration: `pnpm exec wrangler d1 migrations apply docs_meister_js_2026_pixel_canvas --local`
  3. `pnpm exec wrangler dev` (serves the built `dist/` with local D1/KV, e.g. on `http://localhost:8788`)
  - Example: `POST /api/meister/js/2026/pixels` with a JSON array of `{x,y,color}` paints pixels (persisted to local D1); `GET /api/meister/js/2026/pixels` returns them.

### Tests / lint
- There are **no test or lint scripts** and no CI in this repo. For type-checking you can run `pnpm astro check`.
