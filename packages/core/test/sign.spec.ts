import { describe, it, expect } from "vitest";
import { zipSync, unzipSync } from "fflate";
import {
  generateKeyPair,
  sign,
  signFile,
  signPackage,
  parseFile,
  buildManifest,
  buildSignablePayload,
  validateSigningKey,
  uint8ToBase64,
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

// -- signFile -----------------------------------------------------------------

describe("signFile", () => {
  it("adds an ed25519 signature entry", async () => {
    const { privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_abc", publisher: "signer.com" });
    expect(signed).toContain("signatures:");
    expect(signed).toContain("ed25519:");
    expect(signed).toContain("key_abc");
    expect(signed).toContain("signer.com");
  });

  it("defaults publisher to author when not specified", async () => {
    const { privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_abc" });
    const { data } = parseFile(signed);
    expect(data.signatures).toHaveLength(1);
    expect(data.signatures![0].publisher).toBe("example.com");
  });

  it("preserves original front matter fields", async () => {
    const { privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_abc" });
    const { data } = parseFile(signed);
    expect(data.name).toBe("test-file");
    expect(data.description).toBe("A test skill for unit tests");
    expect(data.version).toBe("1.0");
    expect(data.author).toBe("example.com");
  });

  it("preserves body content", async () => {
    const { privateKey } = await generateKeyPair();
    const signed = await signFile(SAMPLE_MD, privateKey, { keyId: "key_abc" });
    expect(signed).toContain("# Test File");
    expect(signed).toContain("This is a test body.");
  });

  it("supports multi-signing", async () => {
    const keyA = await generateKeyPair();
    const keyB = await generateKeyPair();
    const first = await signFile(SAMPLE_MD, keyA.privateKey, { keyId: "key_a", publisher: "author.com" });
    const second = await signFile(first, keyB.privateKey, { keyId: "key_b", publisher: "dist.com" });
    const { data } = parseFile(second);
    expect(data.signatures).toHaveLength(2);
    expect(data.signatures![0].keyId).toBe("key_a");
    expect(data.signatures![1].keyId).toBe("key_b");
  });

  it("preserves extra front matter fields", async () => {
    const md = `---
name: test
description: desc
version: "1.0"
author: example.com
license: MIT
tags: security
---
Body`;
    const { privateKey } = await generateKeyPair();
    const signed = await signFile(md, privateKey, { keyId: "k" });
    expect(signed).toContain("license: MIT");
    expect(signed).toContain("tags: security");
  });
});

// -- signPackage --------------------------------------------------------------

describe("signPackage", () => {
  it("creates MANIFEST.json with signature", async () => {
    const { privateKey } = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("print('hi')") });
    const signed = await signPackage(
      zip,
      { name: "test", description: "Pkg", version: "1.0", author: "example.com", keyId: "key_abc" },
      privateKey,
    );
    const entries = unzipSync(signed);
    expect("MANIFEST.json" in entries).toBe(true);
    const manifest = JSON.parse(new TextDecoder().decode(entries["MANIFEST.json"]));
    expect(manifest.signatures).toHaveLength(1);
    expect(manifest.signatures[0].value).toMatch(/^ed25519:/);
  });

  it("removes legacy SIGNATURE file", async () => {
    const { privateKey } = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("code"), SIGNATURE: enc("old") });
    const signed = await signPackage(
      zip,
      { name: "test", description: "Pkg", version: "1.0", author: "example.com", keyId: "k" },
      privateKey,
    );
    const entries = unzipSync(signed);
    expect("SIGNATURE" in entries).toBe(false);
  });

  it("uses explicit publisher when provided", async () => {
    const { privateKey } = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("code") });
    const signed = await signPackage(
      zip,
      { name: "test", description: "T", version: "1.0", author: "a.com", keyId: "k", publisher: "dist.com" },
      privateKey,
    );
    const entries = unzipSync(signed);
    const manifest = JSON.parse(new TextDecoder().decode(entries["MANIFEST.json"]));
    expect(manifest.signatures[0].publisher).toBe("dist.com");
  });

  it("manifest contains file hashes", async () => {
    const { privateKey } = await generateKeyPair();
    const zip = zipSync({ "a.txt": enc("aaa"), "b.txt": enc("bbb") });
    const signed = await signPackage(
      zip,
      { name: "test", description: "T", version: "1.0", author: "a.com", keyId: "k" },
      privateKey,
    );
    const entries = unzipSync(signed);
    const manifest = JSON.parse(new TextDecoder().decode(entries["MANIFEST.json"]));
    expect(manifest.files["a.txt"]).toMatch(/^sha256:/);
    expect(manifest.files["b.txt"]).toMatch(/^sha256:/);
  });

  it("does not include keyId at manifest top level", async () => {
    const { privateKey } = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("code") });
    const signed = await signPackage(
      zip,
      { name: "test", description: "T", version: "1.0", author: "a.com", keyId: "key_test" },
      privateKey,
    );
    const entries = unzipSync(signed);
    const manifest = JSON.parse(new TextDecoder().decode(entries["MANIFEST.json"]));
    expect(manifest.keyId).toBeUndefined();
    expect(manifest.signatures[0].keyId).toBe("key_test");
  });

  it("preserves existing signatures when re-signing", async () => {
    const keyA = await generateKeyPair();
    const keyB = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("code") });
    const first = await signPackage(
      zip,
      { name: "test", description: "T", version: "1.0", author: "a.com", keyId: "k1" },
      keyA.privateKey,
    );
    const second = await signPackage(
      first,
      { name: "test", description: "T", version: "1.0", author: "a.com", keyId: "k2" },
      keyB.privateKey,
    );
    const entries = unzipSync(second);
    const manifest = JSON.parse(new TextDecoder().decode(entries["MANIFEST.json"]));
    expect(manifest.signatures).toHaveLength(2);
  });
});

// -- unified sign() -----------------------------------------------------------

describe("sign (unified)", () => {
  it("signs markdown when given a string", async () => {
    const { privateKey } = await generateKeyPair();
    const result = await sign(SAMPLE_MD, privateKey, { keyId: "k1" });
    expect(typeof result).toBe("string");
    expect(result).toContain("signatures:");
    expect(result).toContain("ed25519:");
  });

  it("signs ZIP when given Uint8Array", async () => {
    const { privateKey } = await generateKeyPair();
    const zip = zipSync({ "file.txt": enc("hello") });
    const result = await sign(zip, privateKey, {
      name: "test", description: "T", version: "1.0", author: "a.com", keyId: "k1",
    });
    expect(result).toBeInstanceOf(Uint8Array);
    const entries = unzipSync(result);
    expect("MANIFEST.json" in entries).toBe(true);
  });
});

// -- parseFile ----------------------------------------------------------------

describe("parseFile", () => {
  it("parses valid front matter", () => {
    const { data, body } = parseFile(SAMPLE_MD);
    expect(data.name).toBe("test-file");
    expect(data.description).toBe("A test skill for unit tests");
    expect(data.version).toBe("1.0");
    expect(data.author).toBe("example.com");
    expect(body).toContain("# Test File");
  });

  it("throws on missing required fields", () => {
    expect(() => parseFile("---\nname: test\n---\nBody")).toThrow();
  });

  it("throws on empty front matter", () => {
    expect(() => parseFile("---\n---\nBody")).toThrow();
  });

  it("throws on no front matter", () => {
    expect(() => parseFile("Just plain text")).toThrow();
  });
});

// -- buildManifest ------------------------------------------------------------

describe("buildManifest", () => {
  it("hashes files with sha256 prefix", async () => {
    const files = new Map<string, Uint8Array>();
    files.set("a.txt", enc("hello"));
    files.set("b.txt", enc("world"));
    const manifest = await buildManifest(files, {
      name: "test", description: "T", version: "1.0", author: "a.com", keyId: "k",
    });
    expect(manifest.files["a.txt"]).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.files["b.txt"]).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.files["a.txt"]).not.toBe(manifest.files["b.txt"]);
  });

  it("excludes MANIFEST.json from file hashes", async () => {
    const files = new Map<string, Uint8Array>();
    files.set("a.txt", enc("hello"));
    files.set("MANIFEST.json", enc("{}"));
    const manifest = await buildManifest(files, {
      name: "test", description: "T", version: "1.0", author: "a.com", keyId: "k",
    });
    expect(manifest.files["MANIFEST.json"]).toBeUndefined();
    expect(manifest.files["a.txt"]).toBeDefined();
  });

  it("sorts file paths deterministically", async () => {
    const files = new Map<string, Uint8Array>();
    files.set("z.txt", enc("z"));
    files.set("a.txt", enc("a"));
    files.set("m.txt", enc("m"));
    const manifest = await buildManifest(files, {
      name: "test", description: "T", version: "1.0", author: "a.com", keyId: "k",
    });
    const keys = Object.keys(manifest.files);
    expect(keys).toEqual(["a.txt", "m.txt", "z.txt"]);
  });
});

// -- signature dedup ----------------------------------------------------------

describe("signFile dedup", () => {
  it("replaces existing signature with same keyId + publisher", async () => {
    const { privateKey } = await generateKeyPair();
    const first = await signFile(SAMPLE_MD, privateKey, { keyId: "key_a", publisher: "example.com" });
    const second = await signFile(first, privateKey, { keyId: "key_a", publisher: "example.com" });
    const { data } = parseFile(second);
    expect(data.signatures).toHaveLength(1);
    expect(data.signatures![0].keyId).toBe("key_a");
  });

  it("keeps signatures from different publishers", async () => {
    const keyA = await generateKeyPair();
    const keyB = await generateKeyPair();
    const first = await signFile(SAMPLE_MD, keyA.privateKey, { keyId: "key_a", publisher: "a.com" });
    const second = await signFile(first, keyB.privateKey, { keyId: "key_a", publisher: "b.com" });
    const { data } = parseFile(second);
    expect(data.signatures).toHaveLength(2);
  });

  it("keeps signatures with different keyIds", async () => {
    const { privateKey } = await generateKeyPair();
    const first = await signFile(SAMPLE_MD, privateKey, { keyId: "key_a", publisher: "example.com" });
    const second = await signFile(first, privateKey, { keyId: "key_b", publisher: "example.com" });
    const { data } = parseFile(second);
    expect(data.signatures).toHaveLength(2);
  });
});

describe("signPackage dedup", () => {
  it("replaces existing signature with same keyId + publisher", async () => {
    const { privateKey } = await generateKeyPair();
    const zip = zipSync({ "main.py": enc("code") });
    const first = await signPackage(
      zip,
      { name: "test", description: "T", version: "1.0", author: "a.com", keyId: "k1", publisher: "a.com" },
      privateKey,
    );
    const second = await signPackage(
      first,
      { name: "test", description: "T", version: "1.0", author: "a.com", keyId: "k1", publisher: "a.com" },
      privateKey,
    );
    const entries = unzipSync(second);
    const manifest = JSON.parse(new TextDecoder().decode(entries["MANIFEST.json"]));
    expect(manifest.signatures).toHaveLength(1);
  });
});

// -- validateSigningKey -------------------------------------------------------

function mockFetchWithKeys(keys: unknown[]) {
  return async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes(".well-known/notar-keys.json")) {
      return new Response(JSON.stringify({ keys }), { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };
}

describe("validateSigningKey", () => {
  it("succeeds when private key matches published public key", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const pubKeyB64 = uint8ToBase64(publicKey);
    const futureDate = new Date("2030-01-01T00:00:00Z").toISOString();

    await expect(
      validateSigningKey(privateKey, "example.com", "key_test", {
        fetch: mockFetchWithKeys([
          { keyId: "key_test", algorithm: "ed25519", publicKey: pubKeyB64, expires: futureDate },
        ]) as typeof globalThis.fetch,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when private key does not match published public key", async () => {
    const keyA = await generateKeyPair();
    const keyB = await generateKeyPair();
    const pubKeyB64 = uint8ToBase64(keyB.publicKey);
    const futureDate = new Date("2030-01-01T00:00:00Z").toISOString();

    await expect(
      validateSigningKey(keyA.privateKey, "example.com", "key_test", {
        fetch: mockFetchWithKeys([
          { keyId: "key_test", algorithm: "ed25519", publicKey: pubKeyB64, expires: futureDate },
        ]) as typeof globalThis.fetch,
      }),
    ).rejects.toThrow("does not match");
  });

  it("throws when keyId is not found", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const pubKeyB64 = uint8ToBase64(publicKey);
    const futureDate = new Date("2030-01-01T00:00:00Z").toISOString();

    await expect(
      validateSigningKey(privateKey, "example.com", "missing_key", {
        fetch: mockFetchWithKeys([
          { keyId: "key_test", algorithm: "ed25519", publicKey: pubKeyB64, expires: futureDate },
        ]) as typeof globalThis.fetch,
      }),
    ).rejects.toThrow("not found");
  });

  it("throws when key is expired", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const pubKeyB64 = uint8ToBase64(publicKey);
    const pastDate = new Date("2020-01-01T00:00:00Z").toISOString();

    await expect(
      validateSigningKey(privateKey, "example.com", "key_test", {
        fetch: mockFetchWithKeys([
          { keyId: "key_test", algorithm: "ed25519", publicKey: pubKeyB64, expires: pastDate },
        ]) as typeof globalThis.fetch,
      }),
    ).rejects.toThrow("expired");
  });

  it("throws when key is revoked", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const pubKeyB64 = uint8ToBase64(publicKey);
    const futureDate = new Date("2030-01-01T00:00:00Z").toISOString();

    await expect(
      validateSigningKey(privateKey, "example.com", "key_test", {
        fetch: mockFetchWithKeys([
          { keyId: "key_test", algorithm: "ed25519", publicKey: pubKeyB64, expires: futureDate, revoked: true },
        ]) as typeof globalThis.fetch,
      }),
    ).rejects.toThrow("revoked");
  });

  it("throws when key manifest cannot be fetched", async () => {
    const { privateKey } = await generateKeyPair();

    await expect(
      validateSigningKey(privateKey, "example.com", "key_test", {
        fetch: (async () => new Response("Not found", { status: 404 })) as typeof globalThis.fetch,
      }),
    ).rejects.toThrow("failed to fetch");
  });
});

// -- buildSignablePayload -----------------------------------------------------

describe("buildSignablePayload", () => {
  it("excludes signatures from payload", () => {
    const md = `---
name: test
description: desc
version: "1.0"
author: example.com
signatures:
  - keyId: k
    publisher: example.com
    value: "ed25519:abc"
---
Body`;
    const payload = buildSignablePayload(md, "example.com");
    expect(payload).not.toContain("signatures");
    expect(payload).toContain("example.com");
    expect(payload).toContain("Body");
  });

  it("sorts keys in JSON representation", () => {
    const payload = buildSignablePayload(SAMPLE_MD, "example.com");
    const jsonPart = payload.split("\n")[1];
    const parsed = JSON.parse(jsonPart);
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort());
  });
});
