## Summary

<!-- What changed and why. -->

## Security checklist

- [ ] Listed every untrusted input this change reads (fields from signed files, request bodies, key manifests, DNS answers).
- [ ] No URL, hostname, or DNS name is built from untrusted input outside `packages/core/src/publisher.ts`.
- [ ] Network fetches for key discovery go through `fetchKeyManifest`.
- [ ] File-derived strings shown in the CLI/UI go through `displaySafe`.
- [ ] For a security fix: searched sibling code paths (core, CLI, Worker, SPA) for the same pattern and fixed them too.
- [ ] Added negative tests (malformed input, redirects, oversized/hostile responses) and `class-sweep.spec.ts` passes.

## Test plan

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
