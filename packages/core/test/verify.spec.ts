import { describe, it, expect } from "vitest";
import { zipSync, unzipSync } from "fflate";
import {
  generateKeyPair,
  sign,
  signFile,
  signPackage,
  verify,
  verifyFile,
  verifyPackage,
  verifyFromAuthor,
  uint8ToBase64,
  VerifyErrorCode,
} from "../src/index";

const SAMPLE_MD = `---
name: test-file
description: A test skill for unit tests
version: "1.0"
author: example.com
---
# Test File

This is a test body.
`;

const enc = (s: string) => new TextEncoder().encode(s);
const PKG_META = { name: "test", description: "Test", version: "1.0", author: "example.com", keyId: "key_test" };

// -- verifyFile ---------------------------------------------------------------

describe("verifyFile", () => {
  it("verifies a correctly signed file", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test", publisher: "example.com" });
    const result = await verifyFile(signed, publicKey);
    expect(result.valid).toBe(true);
    expect(result.code).toBeUndefined();
    expect(result.details?.author).toBe("example.com");
    expect(result.details?.signers).toHaveLength(1);
    expect(result.details?.signers![0].valid).toBe(true);
  });

  it("rejects tampered body", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test" });
    const tampered = signed.replace("Test File", "Evil File");
    const result = await verifyFile(tampered, publicKey);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.NO_MATCHING_SIGNATURE);
    expect(result.details?.signers![0].code).toBe(VerifyErrorCode.SIGNATURE_MISMATCH);
  });

  it("rejects tampered front matter", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test" });
    const tampered = signed.replace("test-file", "hacked-file");
    const result = await verifyFile(tampered, publicKey);
    expect(result.valid).toBe(false);
  });

  it("rejects wrong public key", async () => {
    const keyA = await generateKeyPair();
    const keyB = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, keyA.privateKey, { keyId: "key_test" });
    const result = await verifyFile(signed, keyB.publicKey);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.NO_MATCHING_SIGNATURE);
  });

  it("returns NO_SIGNATURES when unsigned", async () => {
    const { publicKey } = await generateKeyPair();
    const result = await verifyFile(SAMPLE_MD, publicKey);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.NO_SIGNATURES);
  });

  it("reports MALFORMED_SIGNATURE for bad prefix", async () => {
    const { publicKey } = await generateKeyPair();
    const md = `---
name: test-file
description: A test skill
version: "1.0"
author: example.com
signatures:
  - keyId: key_test
    publisher: example.com
    value: "rsa:abc123"
---
# Test
`;
    const result = await verifyFile(md, publicKey);
    expect(result.valid).toBe(false);
    expect(result.details?.signers![0].code).toBe(VerifyErrorCode.MALFORMED_SIGNATURE);
  });

  it("verifies multi-signed file with both keys", async () => {
    const keyA = await generateKeyPair();
    const keyB = await generateKeyPair();
    const first = await signFile(SAMPLE_MD, keyA.privateKey, { keyId: "key_a", publisher: "author.com" });
    const second = await signFile(first, keyB.privateKey, { keyId: "key_b", publisher: "dist.com" });

    const resultA = await verifyFile(second, keyA.publicKey);
    expect(resultA.valid).toBe(true);
    expect(resultA.details?.signers!.find((s) => s.keyId === "key_a")?.valid).toBe(true);

    const resultB = await verifyFile(second, keyB.publicKey);
    expect(resultB.valid).toBe(true);
    expect(resultB.details?.signers!.find((s) => s.keyId === "key_b")?.valid).toBe(true);
  });

  it("reports per-signer results in multi-signed file", async () => {
    const keyA = await generateKeyPair();
    const keyB = await generateKeyPair();
    const keyC = await generateKeyPair();
    const first = await signFile(SAMPLE_MD, keyA.privateKey, { keyId: "key_a", publisher: "a.com" });
    const second = await signFile(first, keyB.privateKey, { keyId: "key_b", publisher: "b.com" });

    const result = await verifyFile(second, keyC.publicKey);
    expect(result.valid).toBe(false);
    expect(result.details?.signers).toHaveLength(2);
    expect(result.details?.signers!.every((s) => !s.valid)).toBe(true);
  });
});

// -- verifyPackage ------------------------------------------------------------

describe("verifyPackage", () => {
  it("verifies a correctly signed package", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("print('hi')") });
    const signed = await signPackage(zip, PKG_META, privateKey);
    const result = await verifyPackage(signed, publicKey);
    expect(result.valid).toBe(true);
    expect(result.details?.author).toBe("example.com");
    expect(result.details?.files!.every((f) => f.valid)).toBe(true);
  });

  it("rejects missing MANIFEST.json", async () => {
    const { publicKey } = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("code") });
    const result = await verifyPackage(zip, publicKey);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.MISSING_MANIFEST);
  });

  it("rejects manifest with no signatures", async () => {
    const { publicKey } = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("code"), "MANIFEST.json": enc("{}") });
    const result = await verifyPackage(zip, publicKey);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.NO_SIGNATURES);
  });

  it("rejects wrong public key", async () => {
    const keyA = await generateKeyPair();
    const keyB = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("code") });
    const signed = await signPackage(zip, PKG_META, keyA.privateKey);
    const result = await verifyPackage(signed, keyB.publicKey);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.NO_MATCHING_SIGNATURE);
  });

  it("detects hash mismatch on tampered file", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("print('hi')") });
    const signed = await signPackage(zip, PKG_META, privateKey);
    const entries = unzipSync(signed);
    entries["main.py"] = enc("print('evil')");
    const tampered = zipSync(entries);
    const result = await verifyPackage(tampered, publicKey);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.HASH_MISMATCH);
    const failed = result.details?.files!.find((f) => !f.valid);
    expect(failed?.path).toBe("main.py");
    expect(failed?.expectedHash).not.toBe(failed?.actualHash);
  });

  it("detects missing file referenced in manifest", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const zip = zipSync({ "a.txt": enc("a"), "b.txt": enc("b") });
    const signed = await signPackage(zip, PKG_META, privateKey);
    const entries = unzipSync(signed);
    delete entries["b.txt"];
    const tampered = zipSync(entries);
    const result = await verifyPackage(tampered, publicKey);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.MISSING_FILE);
  });

  it("reports MALFORMED_SIGNATURE for bad prefix in manifest", async () => {
    const { publicKey } = await generateKeyPair();
    const manifest = JSON.stringify({
      name: "test", description: "T", version: "1.0", author: "a.com",
      files: { "a.txt": "sha256:abc" },
      signatures: [{ keyId: "k", publisher: "a.com", value: "rsa:bad" }],
    });
    const zip = zipSync({ "a.txt": enc("a"), "MANIFEST.json": enc(manifest) });
    const result = await verifyPackage(zip, publicKey);
    expect(result.valid).toBe(false);
    expect(result.details?.signers![0].code).toBe(VerifyErrorCode.MALFORMED_SIGNATURE);
  });

  it("verifies package with multiple files", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const zip = zipSync({
      "src/main.py": enc("import os"),
      "src/utils.py": enc("def helper(): pass"),
      "README.md": enc("# My Package"),
      "config.json": enc('{"key": "value"}'),
    });
    const signed = await signPackage(zip, PKG_META, privateKey);
    const result = await verifyPackage(signed, publicKey);
    expect(result.valid).toBe(true);
    expect(result.details?.files).toHaveLength(4);
  });
});

// -- unified verify() ---------------------------------------------------------

describe("verify (unified)", () => {
  it("verifies markdown when given a string", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test" });
    const result = await verify(signed, publicKey);
    expect(result.valid).toBe(true);
  });

  it("verifies ZIP when given Uint8Array", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const zip = zipSync({ "file.txt": enc("hello") });
    const signed = await signPackage(zip, PKG_META, privateKey);
    const result = await verify(signed, publicKey);
    expect(result.valid).toBe(true);
  });

  it("rejects tampered markdown", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test" });
    const result = await verify(signed.replace("Test File", "Hacked"), publicKey);
    expect(result.valid).toBe(false);
  });

  it("rejects tampered ZIP", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const zip = zipSync({ "file.txt": enc("hello") });
    const signed = await signPackage(zip, PKG_META, privateKey);
    const entries = unzipSync(signed);
    entries["file.txt"] = enc("hacked");
    const result = await verify(zipSync(entries), publicKey);
    expect(result.valid).toBe(false);
  });
});

// -- sign + verify round-trip -------------------------------------------------

describe("sign + verify round-trip", () => {
  it("markdown round-trip with unified API", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const signed = await sign(SAMPLE_MD, privateKey, { keyId: "key_test" });
    const result = await verify(signed, publicKey);
    expect(result.valid).toBe(true);
  });

  it("package round-trip with unified API", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const zip = zipSync({ "data.json": enc('{"ok":true}') });
    const signed = await sign(zip, privateKey, PKG_META);
    const result = await verify(signed, publicKey);
    expect(result.valid).toBe(true);
  });

  it("markdown: sign → tamper → verify fails", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const signed = await sign(SAMPLE_MD, privateKey, { keyId: "k" });
    const tampered = (signed as string).replace("test body", "hacked body");
    const result = await verify(tampered, publicKey);
    expect(result.valid).toBe(false);
  });

  it("package: sign → tamper → verify fails", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const zip = zipSync({ "data.txt": enc("original") });
    const signed = await sign(zip, privateKey, PKG_META) as Uint8Array;
    const entries = unzipSync(signed);
    entries["data.txt"] = enc("tampered");
    const result = await verify(zipSync(entries), publicKey);
    expect(result.valid).toBe(false);
  });
});

// -- verifyFromAuthor ---------------------------------------------------------

function mockFetchWithKeys(keys: unknown[]) {
  return async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes(".well-known/notar-keys.json")) {
      return new Response(JSON.stringify({ keys }), { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };
}

describe("verifyFromAuthor", () => {
  it("verifies markdown via HTTPS key resolution", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test", publisher: "example.com" });
    const pubKeyB64 = uint8ToBase64(publicKey);
    const futureDate = new Date("2030-01-01T00:00:00Z").toISOString();

    const result = await verifyFromAuthor(signed, {
      fetch: mockFetchWithKeys([
        { keyId: "key_test", algorithm: "ed25519", publicKey: pubKeyB64, expires: futureDate },
      ]) as typeof globalThis.fetch,
      resolveTxt: false,
    });
    expect(result.valid).toBe(true);
    expect(result.details?.signers![0].keySource).toBe("https");
  });

  it("verifies ZIP via HTTPS key resolution", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const zip = zipSync({ "file.txt": enc("hello") });
    const signed = await signPackage(zip, PKG_META, privateKey);
    const pubKeyB64 = uint8ToBase64(publicKey);
    const futureDate = new Date("2030-01-01T00:00:00Z").toISOString();

    const result = await verifyFromAuthor(signed, {
      fetch: mockFetchWithKeys([
        { keyId: "key_test", algorithm: "ed25519", publicKey: pubKeyB64, expires: futureDate },
      ]) as typeof globalThis.fetch,
      resolveTxt: false,
    });
    expect(result.valid).toBe(true);
  });

  it("reports expired key", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test", publisher: "example.com" });
    const pubKeyB64 = uint8ToBase64(publicKey);
    const pastDate = new Date("2020-01-01T00:00:00Z").toISOString();

    const result = await verifyFromAuthor(signed, {
      fetch: mockFetchWithKeys([
        { keyId: "key_test", algorithm: "ed25519", publicKey: pubKeyB64, expires: pastDate },
      ]) as typeof globalThis.fetch,
      resolveTxt: false,
    });
    expect(result.valid).toBe(false);
    expect(result.details?.signers![0].code).toBe(VerifyErrorCode.KEY_EXPIRED);
  });

  it("reports revoked key", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test", publisher: "example.com" });
    const pubKeyB64 = uint8ToBase64(publicKey);
    const futureDate = new Date("2030-01-01T00:00:00Z").toISOString();

    const result = await verifyFromAuthor(signed, {
      fetch: mockFetchWithKeys([
        { keyId: "key_test", algorithm: "ed25519", publicKey: pubKeyB64, expires: futureDate, revoked: true },
      ]) as typeof globalThis.fetch,
      resolveTxt: false,
    });
    expect(result.valid).toBe(false);
    expect(result.details?.signers![0].code).toBe(VerifyErrorCode.KEY_REVOKED);
  });

  it("tries all keys when keyId is missing", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test", publisher: "example.com" });
    // Strip keyId from the signature entry
    const stripped = signed.replace(/keyId: key_test/, "keyId: \"\"");
    const pubB64 = uint8ToBase64(publicKey);
    const keysJson = { keys: [{ keyId: "key_test", algorithm: "ed25519", publicKey: pubB64, expires: "2099-01-01T00:00:00Z" }] };
    const mockFetch = (async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (u.includes("notar-keys.json")) return new Response(JSON.stringify(keysJson));
      return new Response("Not found", { status: 404 });
    }) as typeof globalThis.fetch;
    const result = await verifyFromAuthor(stripped, { fetch: mockFetch, resolveTxt: false });
    expect(result.valid).toBe(true);
    expect(result.details?.signers![0].keyId).toBe("key_test");
    expect(result.details?.signers![0].keySource).toBe("https");
  });

  it("returns KEY_NOT_FOUND when keyId is missing and no keys available", async () => {
    const md = `---
name: test-file
description: A test skill
version: "1.0"
author: example.com
signatures:
  - keyId: ""
    publisher: example.com
    value: "ed25519:abc123"
---
# Test
`;
    const result = await verifyFromAuthor(md, {
      fetch: (async () => new Response("Not found", { status: 404 })) as typeof globalThis.fetch,
      resolveTxt: false,
    });
    expect(result.valid).toBe(false);
    expect(result.details?.signers![0].code).toBe(VerifyErrorCode.KEY_NOT_FOUND);
  });

  it("reports KEY_FETCH_FAILED when server returns error", async () => {
    const { privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test", publisher: "example.com" });

    const result = await verifyFromAuthor(signed, {
      fetch: (async () => new Response("Server error", { status: 500 })) as typeof globalThis.fetch,
      resolveTxt: false,
    });
    expect(result.valid).toBe(false);
    expect(result.details?.signers![0].code).toBe(VerifyErrorCode.KEY_FETCH_FAILED);
  });

  it("reports KEY_NOT_FOUND when keyId not in manifest", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test", publisher: "example.com" });
    const pubKeyB64 = uint8ToBase64(publicKey);
    const futureDate = new Date("2030-01-01T00:00:00Z").toISOString();

    const result = await verifyFromAuthor(signed, {
      fetch: mockFetchWithKeys([
        { keyId: "different_key", algorithm: "ed25519", publicKey: pubKeyB64, expires: futureDate },
      ]) as typeof globalThis.fetch,
      resolveTxt: false,
    });
    expect(result.valid).toBe(false);
    expect(result.details?.signers![0].code).toBe(VerifyErrorCode.KEY_NOT_FOUND);
  });

  it("reports NETWORK_ERROR on fetch exception", async () => {
    const { privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_test", publisher: "example.com" });

    const result = await verifyFromAuthor(signed, {
      fetch: (() => { throw new Error("network down"); }) as unknown as typeof globalThis.fetch,
      resolveTxt: false,
    });
    expect(result.valid).toBe(false);
    expect(result.details?.signers![0].code).toBe(VerifyErrorCode.NETWORK_ERROR);
  });

  it("unsigned file returns NO_SIGNATURES", async () => {
    const result = await verifyFromAuthor(SAMPLE_MD, {
      fetch: (async () => new Response("", { status: 404 })) as typeof globalThis.fetch,
      resolveTxt: false,
    });
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.NO_SIGNATURES);
  });

  it("unsigned ZIP returns MISSING_MANIFEST", async () => {
    const zip = zipSync({ "file.txt": enc("hello") });
    const result = await verifyFromAuthor(zip, {
      fetch: (async () => new Response("", { status: 404 })) as typeof globalThis.fetch,
      resolveTxt: false,
    });
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.MISSING_MANIFEST);
  });
});
