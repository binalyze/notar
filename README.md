<p align="center">
  <img src="assets/github-header.png" alt="Notar" />
</p>

# Notar

**Free file signing and verification for Trust-First AI.**

Notar provides a core signing library published as an npm package and a web application for signing and verifying files in the browser.

## Deploy Your Own

Notar is designed to be forked and rebranded. It deploys to Cloudflare Workers.

1. Fork this repository
2. `pnpm install`
3. Customize `public/config.json` and replace SVGs in `public/branding/` (see [Customization](#customization))
4. `pnpm setup` to generate keys
5. `pnpm deploy`

The deploy assigns a `*.workers.dev` subdomain automatically. To use a custom domain, configure it in the Cloudflare dashboard under **Workers & Pages > your worker > Settings > Domains & Routes**.

## Quick Start

```bash
pnpm install
pnpm setup      # Generate keys and .env.dev
pnpm dev        # Run dev server (Vite + Wrangler)
```

Other commands:

```bash
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm typecheck  # Typecheck
pnpm lint       # Lint
```

### Key setup

`pnpm setup` generates two files (both gitignored):

- `.env.dev` -- environment variables for local development
- `packages/web/src/public/.well-known/notar-keys.json` -- the key manifest deployed to production

In **development mode** (`BUILD_MODE=development`, the default), the app serves `notar-keys-dev.json` instead, which contains the committed sample signing key. This means the pre-built sample files in `samples/signed/` always verify correctly during local development without any extra setup.

To regenerate keys, run `pnpm setup -- --force`.

## npm Package

```bash
npm install @binalyze/notar
```

### Unified API (preferred)

```ts
import { generateKeyPair, sign, verify, verifyFromAuthor } from "@binalyze/notar";

const { publicKey, privateKey } = await generateKeyPair();

// Sign a markdown file (string in, string out)
const signed = await sign(markdown, privateKey, {
  keyId: "my-key-id",
  publisher: "example.com",
});

// Verify with a known public key
const result = await verify(signed, publicKey);
// { valid: true, details: { author: "example.com", signers: [...] } }

// Or verify without a key -- auto-fetches from the author's domain
const result2 = await verifyFromAuthor(signed);
```

The `sign()` and `verify()` functions are overloaded: pass a `string` for markdown files, or a `Uint8Array` for ZIP packages.

### Format-specific API

```ts
import {
  signFile, signPackage,       // markdown / zip signing
  verifyFile, verifyPackage,   // markdown / zip verification
  parseFile, buildSignablePayload, buildManifest,
} from "@binalyze/notar";
```

### Key discovery & DNS

```ts
import {
  fetchPublicKey, fetchPublicKeys,
  parseDnsTxtRecord, formatDnsTxtRecord,
} from "@binalyze/notar";
```

### Utilities & types

```ts
import {
  generateKeyPair, uint8ToBase64, base64ToUint8,
  parseFrontMatter, stringifyFrontMatter,
} from "@binalyze/notar";

import type {
  VerifyResult, SignerResult, FileIntegrityResult,
  VerifyErrorCode, KeyPair, SignFileOptions, PackageMetadata,
  FrontMatter, PackageManifest, PublicKeyEntry, KeyManifest,
  SignatureEntry, VerifyOptions, DnsTxtKeyRecord,
} from "@binalyze/notar";
```

## CLI

The same npm package includes a CLI. Run interactively or use subcommands directly.

```bash
npx @binalyze/notar            # Interactive mode (prompts for action)
```

### `notar keygen`

Generate an Ed25519 key pair and a `notar-keys.json` file ready to deploy.

```bash
notar keygen --domain example.com
notar keygen --domain example.com --key-id my-key
```

Outputs the private key to the console (save it -- it is not stored) and writes `notar-keys.json` to the current directory. Also prints a DNS TXT record you can add as an alternative to HTTPS key hosting.

### `notar sign`

Sign a `.md` or `.zip` file. The private key is read from the `NOTAR_PRIVATE_KEY` environment variable or piped via stdin.

```bash
NOTAR_PRIVATE_KEY=<base64> notar sign document.md
NOTAR_PRIVATE_KEY=<base64> notar sign archive.zip --publisher example.com
NOTAR_PRIVATE_KEY=<base64> notar sign archive.zip --publisher example.com --author "Jane Doe"
echo "<base64>" | notar sign document.md --output signed.md
```

| Flag | Description |
| --- | --- |
| `--key-id` | Key ID (defaults to `key_YYYYMMDD`) |
| `--publisher` | Publisher domain (used for key resolution during verification) |
| `--author` | Author (freeform string, defaults to publisher) |
| `--output` | Output file path (defaults to `<name>-signed.<ext>`) |

### `notar verify`

Verify a signed `.md` or `.zip` file.

```bash
notar verify signed.md --public-key <base64>
notar verify signed.md                         # auto-fetches key from author domain
notar verify signed.zip --json                  # output JSON result
```

Without `--public-key`, the CLI resolves keys automatically from the publisher's domain (see [Key Discovery](#key-discovery)). Exits with code `0` on success, `1` on failure.

## Customization

The web app supports full rebranding through runtime configuration and static assets.

### 1. Runtime Configuration

Edit `public/config.json`. Partial configs are deep-merged with defaults, so you only need to include the fields you want to override.

```json
{
  "company": {
    "name": "Your Company",
    "website": "https://example.com",
    "logo": {
      "dark": "/branding/company-logo-dark.svg",
      "light": "/branding/company-logo-light.svg"
    },
    "social": {
      "linkedin": "https://linkedin.com/company/your-company",
      "twitter": "https://x.com/your-company"
    },
    "links": [{ "label": "Website", "url": "https://example.com" }]
  },
  "product": {
    "tagline": "Your tagline here.",
    "github": "https://github.com/you/notar",
    "npm": "@your-org/notar"
  },
  "preloader": {
    "logo": {
      "dark": "/branding/preloader-dark.svg",
      "light": "/branding/preloader-light.svg"
    }
  }
}
```

### 2. Branding Assets

Replace the SVG files in `public/branding/` to rebrand:

- `company-logo-dark.svg` / `company-logo-light.svg` -- main logo for dark and light themes
- `preloader-dark.svg` / `preloader-light.svg` -- loading screen logo

### 3. OG Images & GitHub Header

Regenerate social media OG images and the GitHub README header after changing branding:

```bash
pnpm generate:og
```

This generates `og-facebook.png`, `og-linkedin.png`, `og-twitter.png` in `public/` and `assets/github-header.png`. All images use the same satori-based pipeline. The text content is driven by the `og` section in `config.json`.

## Key Discovery

When verifying without an explicit public key, Notar resolves the signer's key automatically using the publisher domain and key ID from the signature. Two resolution methods run in parallel -- the first valid key wins.

### HTTPS (`.well-known`)

Notar fetches `https://<publisher-domain>/.well-known/notar-keys.json` and looks up the matching `keyId`:

```json
{
  "keys": [
    {
      "keyId": "your-key-id",
      "algorithm": "ed25519",
      "publicKey": "base64-encoded-public-key",
      "expires": "2026-01-01T00:00:00.000Z",
      "revoked": false
    }
  ]
}
```

Host this file on your domain (or add it to `public/.well-known/` in the web app).

### DNS TXT

Notar queries `notar.<keyId>.<domain>` via Cloudflare DNS-over-HTTPS. The TXT record format:

```
v=sk1; k=ed25519; p=<base64-public-key>; exp=<unix-timestamp>
```

The `notar keygen` CLI command prints the exact DNS record to add.

### Key validity

Resolved keys are checked for expiry and revocation before use. Expired or revoked keys cause verification to fail with `KEY_EXPIRED` or `KEY_REVOKED` error codes.

## Signing Formats

Notar supports two file formats, both using Ed25519 signatures.

### Markdown (`.md`)

Markdown files use YAML front matter. Required fields: `name`, `description`, `version`. The `author` field is optional and accepts any string. Signatures are appended to a `signatures` array in the front matter:

```yaml
---
name: My Document
description: Example signed document
version: "1.0.0"
author: Jane Doe
signatures:
  - keyId: key_20260101
    publisher: example.com
    value: "ed25519:<base64-signature>"
---
Document body here...
```

The signable payload is: `publisher + "\n" + sorted-metadata-JSON + "\n" + body`.

### ZIP packages (`.zip`)

ZIP packages contain arbitrary files plus a `MANIFEST.json` with SHA-256 hashes for every file and a `signatures` array:

```json
{
  "name": "my-package",
  "description": "Example signed package",
  "version": "1.0.0",
  "author": "Jane Doe",
  "files": {
    "README.md": "sha256:abc123...",
    "src/index.ts": "sha256:def456..."
  },
  "signatures": [
    {
      "keyId": "key_20260101",
      "publisher": "example.com",
      "value": "ed25519:<base64-signature>"
    }
  ]
}
```

The signable payload is: `publisher + "\n" + canonical-manifest-JSON` (manifest without `signatures`, keys sorted alphabetically). Verification also checks every file hash against the manifest.

## Architecture

Pnpm monorepo:

| Path            | Name                  | Description                                 |
| --------------- | --------------------- | ------------------------------------------- |
| `packages/core` | `@binalyze/notar`     | Ed25519 signing library + CLI (npm package) |
| `packages/web`  | `@binalyze/notar-web` | Vue 3 SPA + Cloudflare Worker (Hono)        |

**Core** depends on `@noble/ed25519` for cryptography, `fflate` for ZIP handling, and `citty`/`consola` for the CLI. **Web** uses Tailwind CSS v4, shadcn-vue components, and Lucide icons. All cryptographic operations in the web app happen client-side in the browser — no file data is sent to the server.

## Deployment

Deploys to Cloudflare Workers via Wrangler. Production deploys automatically generate a fresh key pair for `notar-keys.json` if one doesn't already exist.

```bash
pnpm deploy   # Generate keys (if needed), build, and deploy to Cloudflare
```

The deploy assigns a `*.workers.dev` URL by default. To use a custom domain, configure it in the Cloudflare dashboard under **Workers & Pages > your worker > Settings > Domains & Routes**.

CI (GitHub Actions) runs typechecks, linting, and tests on pushes to `main` and `dev`.

## License

MIT
