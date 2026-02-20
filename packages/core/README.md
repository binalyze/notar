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

### Format-specific

- **`signFile(content, privateKey, opts)`** / **`signPackage(zip, metadata, privateKey)`**
- **`verifyFile(content, publicKey)`** / **`verifyPackage(zip, publicKey)`**

### Keys & Utilities

- **`generateKeyPair()`** — Generate an Ed25519 key pair
- **`uint8ToBase64(bytes)`** / **`base64ToUint8(str)`** — Base64 encoding utilities
- **`parseFrontMatter(content)`** / **`stringifyFrontMatter(data, body)`** — YAML front matter parsing
- **`fetchPublicKey(domain, keyId, options?)`** / **`fetchPublicKeys(domain, options?)`** — Key discovery
- **`validateSigningKey(privateKey, publisher, keyId, options?)`** — Pre-flight check that a private key matches a published public key

### DNS TXT Records

- **`parseDnsTxtRecord(txt)`** — Parse a DNS TXT record into a key record
- **`formatDnsTxtRecord(keyId, publicKey, expiresUnix)`** — Format a key record into a DNS TXT string

## License

MIT
