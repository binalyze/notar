# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
pnpm install              # install dependencies
pnpm dev                  # run web app dev server (Wrangler + Vite)
pnpm build                # build all packages
pnpm build:core           # build core library only
pnpm build:web            # build web app only
pnpm typecheck            # typecheck across the monorepo
pnpm test                 # run tests across the monorepo
pnpm lint                 # oxlint + eslint across the monorepo
pnpm format               # format with prettier (only when code is finalized)
pnpm setup                # generate keys and .env.dev
pnpm deploy               # generate keys, build, and deploy to Cloudflare
pnpm publish:core         # publish @binalyze/notar to npm
pnpm publish:core:dry     # dry-run publish (validates without uploading)
pnpm version:core <ver>   # bump core version (e.g. pnpm version:core patch)
```

To scope typechecking: `cd packages/<pkg> && pnpm typecheck`

## Architecture

Pnpm monorepo. Workspaces: `packages/*`.

### packages/core — Library + CLI (`@binalyze/notar`)
- Ed25519 file signing and verification library with built-in CLI
- Library: `import { sign, verify } from "@binalyze/notar"`
- CLI: `npx @binalyze/notar` (interactive) or `notar keygen|sign|verify`
- Published as a single npm package
- Dependencies: `@noble/ed25519`, `fflate`, `citty`, `consola`
- Tests: Vitest

### packages/web — Web App (`@binalyze/notar-web`)
- Vue 3 SPA + Cloudflare Worker (Hono)
- Styling: Tailwind CSS v4, shadcn-vue components, Lucide icons
- Build: Vite + Wrangler
- Depends on `@binalyze/notar` (workspace)

### Deployment
- Wrangler deploys the web worker to Cloudflare Workers
- Single `prod` stage (configured in `packages/web/wrangler.jsonc`)
- CI: GitHub Actions typechecks + lints on push to main/dev; runs tests

### npm Publishing
- `@binalyze/notar` publishes to npm from `packages/core`
- CI: `.github/workflows/publish.yml` runs on GitHub release or manual dispatch
- Requires `NPM_TOKEN` secret in GitHub repo settings
- `prepublishOnly` in core runs `tsc` build automatically before publish

## Rules

- Always use `pnpm`, never `npm`.
- Never do git write actions (`commit`, `restore`, etc.) unless explicitly asked. Read-only git commands are fine.
- No JSDoc comments — remove them when touching code that has them.
- No unnecessary or verbose comments. Keep comments brief and only where truly needed.
- Keep code vertically compact — no excessive blank lines.
- When adding shadcn-vue components (`pnpm dlx shadcn-vue@latest init`), remove the `cn` import from generated files — `cn` is auto-imported.
