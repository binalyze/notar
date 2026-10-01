# @binalyze/notar

Ed25519 file signing and verification library for Trust-First AI.

Sign markdown files and ZIP packages with Ed25519 signatures, then verify them against public keys served over HTTPS or DNS TXT records.

## Install

```bash
npm install @binalyze/notar
```

## Usage

### Sign & Verify

The `sign()` and `verify()` functions accept both markdown (`string`) and ZIP packages (`Uint8Array`), dispatching automatically based on input type.

```ts
import { generateKeyPair, sign, verify } from "@binalyze/notar";

const { publicKey, privateKey } = await generateKeyPair();

// Sign a markdown file
const signedMd = await sign(markdown, privateKey, {
  keyId: "my-key-id",
  publisher: "example.com",
});

// Sign a ZIP package
const signedZip = await sign(zipBytes, privateKey, {
  name: "my-package",
  description: "A signed package",
  version: "1.0.0",
  author: "Jane Doe",
  keyId: "my-key-id",
  publisher: "example.com",
});

// Verify either format
const result = await verify(signedMd, publicKey);
const zipResult = await verify(signedZip, publicKey);
// { valid: true, details: { author: "Jane Doe", signers: [...] } }
```

### Verify from Author Domain

Resolve the signer's public key automatically from `https://<domain>/.well-known/notar-keys.json`:

```ts
import { verifyFromAuthor } from "@binalyze/notar";

const result = await verifyFromAuthor(signedContent);
```

### Key Utilities

```ts
import {
  generateKeyPair,
  uint8ToBase64,
  base64ToUint8,
} from "@binalyze/notar";

const { publicKey, privateKey } = await generateKeyPair();
const publicKeyBase64 = uint8ToBase64(publicKey);
```

## API

### Unified (preferred)

- **`sign(input, privateKey, opts)`** — Sign markdown (`string`) or ZIP (`Uint8Array`). Options differ by type: `{ keyId, publisher? }` for markdown, `PackageMetadata` for ZIP.
- **`verify(input, publicKey)`** — Verify a signed markdown or ZIP against a known public key.
- **`verifyFromAuthor(input, options?)`** — Verify by auto-resolving the public key from the publisher domain (HTTPS + DNS TXT).

> **Verdict semantics (v2):** Without `expectedPublisher`, `verifyFromAuthor`
> requires at least one signature and every signature must verify. With
> `expectedPublisher`, only signatures from that publisher decide the verdict.
> A successful expected-publisher verification returns
> `details.identityVerified: true` and `details.trustedPublisher`. The `author`
> field is a claimed, unauthenticated display value.

```ts
const result = await verifyFromAuthor(signed, {
  expectedPublisher: "example.com",
});
```

> **Publisher rules (v2.0.1):** Keyless verification treats every `publisher`,
> `keyId`, and key manifest in a file as untrusted input. A publisher must be a
> bare, lowercase-insensitive ASCII hostname (`example.com`) with no userinfo,
> path, query, fragment, percent-encoding, port, IP literal, trailing dot, or
> IDN/punycode label; otherwise the signer fails with `INVALID_PUBLISHER` and no
> network request is made. Key manifests are fetched over HTTPS only, without
> following redirects, with a 5 s timeout and a 64 KiB size cap. `localhost` and
> `127.0.0.1` (optionally with a port) are fetched over plain HTTP only when
> `allowInsecureLocalhost: true` is passed (`--allow-insecure-localhost` in the
> CLI); `keySource` then reports `"http"`. Files with more than 16 signatures
> fail with `TOO_MANY_SIGNATURES`. With `expectedPublisher`, only that
> publisher's key is fetched. Pinned-key `verify(input, publicKey)` does not
> contact the network and does not validate `publisher`.

### Format-specific

- **`signFile(content, privateKey, opts)`** / **`signPackage(zip, metadata, privateKey)`**
- **`verifyFile(content, publicKey)`** / **`verifyPackage(zip, publicKey)`**

### Keys & Utilities

- **`generateKeyPair()`** — Generate an Ed25519 key pair
- **`uint8ToBase64(bytes)`** / **`base64ToUint8(str)`** — Base64 encoding utilities
- **`parseFrontMatter(content)`** / **`stringifyFrontMatter(data, body)`** — YAML front matter parsing
- **`fetchPublicKey(domain, keyId, options?)`** / **`fetchPublicKeys(domain, options?)`** — Key discovery
- **`validateSigningKey(privateKey, publisher, keyId, options?)`** — Pre-flight check that a private key matches a published public key
- **`parsePublisher(value)`** / **`keysUrl(parsed, allowInsecureLocalhost?)`** / **`dnsName(parsed, keyId)`** / **`fetchKeyManifest(parsed, options?)`** — The single validated path for key discovery; use these instead of building URLs yourself
- **`displaySafe(value)`** — Escape control and bidi characters in file-derived strings before displaying them

### DNS TXT Records

- **`parseDnsTxtRecord(txt)`** — Parse a DNS TXT record into a key record
- **`formatDnsTxtRecord(keyId, publicKey, expiresUnix)`** — Format a key record into a DNS TXT string

## License

MIT
