# Contributing to Notar

Thank you for your interest in contributing to Notar.

## Prerequisites

- [Node.js 22](https://nodejs.org/)
- [pnpm](https://pnpm.io/)

## Setup

```bash
git clone https://github.com/binalyze/notar.git
cd notar
pnpm install
pnpm dev
```

## Project Structure

| Path | Description |
| --- | --- |
| `packages/core` | Ed25519 signing library + CLI (`@binalyze/notar`) |
| `packages/web` | Vue 3 SPA + Cloudflare Worker (`@binalyze/notar-web`) |

## Development

```bash
pnpm dev        # Run web app dev server
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm typecheck  # TypeScript type checking
pnpm lint       # Run oxlint + eslint
```

## Code Style

- TypeScript with strict mode enabled
- No JSDoc comments
- Minimal comments -- only where the logic is not self-evident
- Formatting: Prettier (run `pnpm format` before submitting)
- Linting: oxlint + eslint

## Pull Request Process

1. Branch from `main`.
2. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
3. Write tests for new or changed behavior.
4. Ensure all checks pass:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```
5. Open a pull request with a clear description of the changes.

## Reporting Issues

Use [GitHub Issues](https://github.com/binalyze/notar/issues) with the provided templates for bug reports and feature requests.
