---
title: Untrusted publisher string used as key-discovery URL authority
date: 2026-09-30
type: security
related: bounty #1732, PR #5 (VOC-3035/VOC-3036)
---

# Untrusted publisher string used as key-discovery URL authority

## What happened

Bounty #1732 showed that `verifyFromAuthor` built the key-manifest URL by concatenating the `publisher` value from the file being verified. `isLocal()` chose plain HTTP with `startsWith("localhost")` on the raw string. `localhost@attacker.test:5125` therefore selected HTTP, the URL parser routed it to `attacker.test:5125`, and the web Worker (which re-parsed the URL for routing) fetched the manifest in cleartext. The UI reported `HTTPS (.well-known)` because `keySource` was hardcoded.

The same `isLocal`/`keysUrl` copy existed in `sign.ts`, `packages/web/helpers.ts`, and `/api/lookup`. DNS names were built as `notar.${keyId}.${author}` from two unvalidated fields.

## Why the previous fix missed it

The pattern dates from the initial commit. PR #5 (verification trust binding) named the root cause in its own commit message — "the key-resolution domain taken from the untrusted file" — but fixed only the verdict layer. It treated `publisher` as an identity to compare, not as attacker input that also chooses a network destination and transport. Its plan had no requirement for input validation, and its tests used only well-formed hosts. The fix closed the reported symptom, not the bug class.

## The rule

Every field read from a signed artifact is attacker input. Before it reaches a network request, a filesystem path, a trust decision, or a display surface, it passes one shared validator.

File-derived fields in this codebase: `signatures[].publisher`, `signatures[].keyId`, `signatures[].value`, front matter / manifest `author`, `name`, `description`, `version`, ZIP `files` paths, and the key manifest returned by the publisher's server (including redirects, size, and shape).

## What changed (v2.0.1)

- `packages/core/src/publisher.ts` owns host parsing, URL and DNS-name construction, manifest fetching, and display escaping. Nothing else builds these.
- Publishers are bare printable-ASCII hostnames; the WHATWG parser must agree with our reading (round-trip check), which rejects userinfo, numeric loopback, Unicode dots, the Kelvin sign, and percent tricks.
- Manifest fetch: HTTPS only, `redirect: "manual"` with every redirect shape (3xx, `opaqueredirect`, `redirected`, differing `res.url`) refused, 5 s timeout, 64 KiB cap, schema-checked entries.
- HTTP only for exact `localhost` / `127.0.0.1` with `allowInsecureLocalhost`; the Worker enables it only with `ALLOW_INSECURE_LOCALHOST=true` (in `packages/web/.dev.vars`) and a local request host — never from `BUILD_MODE`, whose default is `development`.
- At most 16 signatures; with `expectedPublisher` only that publisher is contacted.
- `displaySafe` escapes control and bidi characters in CLI and UI output.

## Guards against regression

- `packages/core/test/class-sweep.spec.ts` fails the build if URL/DNS construction, prefix host checks, or network fetches appear outside `publisher.ts` without a reviewed `class-sweep-allow:` marker. Run against the pre-fix tree it reports every defect listed above.
- `CLAUDE.md` Security Rules and `.github/pull_request_template.md` security checklist.

## Runtime pitfall found in review

The first version used `redirect: "error"`. Node accepts it, but workerd (Cloudflare Workers) throws a `TypeError` for that mode, so every HTTPS key fetch on the deployed Worker failed and verification silently fell back to DNS. The Node-environment tests could not see it. Use `redirect: "manual"` and reject redirects explicitly, and exercise fetch-level changes under `wrangler dev` (workerd), not only under Node mocks.

## How to fix the next report

1. Write the reported PoC as a failing test.
2. Name the bug class, not the symptom.
3. Search every sibling path (core, CLI, Worker, SPA, scripts) for the class and list them in the plan.
4. Fix through the shared owner module; add negative tests for each sibling.
5. Extend `class-sweep.spec.ts` when the class has a greppable shape.
