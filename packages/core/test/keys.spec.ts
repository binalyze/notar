import { describe, it, expect } from "vitest";
import { generateKeyPair, derivePublicKey, uint8ToBase64, base64ToUint8 } from "../src/index";

describe("generateKeyPair", () => {
  it("returns Uint8Array instances", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(privateKey).toBeInstanceOf(Uint8Array);
  });

  it("returns 32-byte Ed25519 keys", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    expect(publicKey.length).toBe(32);
    expect(privateKey.length).toBe(32);
  });

  it("generates unique key pairs", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    expect(uint8ToBase64(a.publicKey)).not.toBe(uint8ToBase64(b.publicKey));
    expect(uint8ToBase64(a.privateKey)).not.toBe(uint8ToBase64(b.privateKey));
  });

  it("public and private keys differ", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    expect(uint8ToBase64(publicKey)).not.toBe(uint8ToBase64(privateKey));
  });
});

describe("derivePublicKey", () => {
  it("derives the same public key as generateKeyPair", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const derived = await derivePublicKey(privateKey);
    expect(uint8ToBase64(derived)).toBe(uint8ToBase64(publicKey));
  });

  it("returns a 32-byte Uint8Array", async () => {
    const { privateKey } = await generateKeyPair();
    const derived = await derivePublicKey(privateKey);
    expect(derived).toBeInstanceOf(Uint8Array);
    expect(derived.length).toBe(32);
  });

  it("is deterministic for the same private key", async () => {
    const { privateKey } = await generateKeyPair();
    const a = await derivePublicKey(privateKey);
    const b = await derivePublicKey(privateKey);
    expect(uint8ToBase64(a)).toBe(uint8ToBase64(b));
  });

  it("derives different public keys for different private keys", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const pubA = await derivePublicKey(a.privateKey);
    const pubB = await derivePublicKey(b.privateKey);
    expect(uint8ToBase64(pubA)).not.toBe(uint8ToBase64(pubB));
  });
});

describe("base64 round-trip", () => {
  it("encodes and decodes correctly", () => {
    const original = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
    const encoded = uint8ToBase64(original);
    const decoded = base64ToUint8(encoded);
    expect(decoded).toEqual(original);
  });

  it("handles empty input", () => {
    expect(uint8ToBase64(new Uint8Array(0))).toBe("");
    expect(base64ToUint8("")).toEqual(new Uint8Array(0));
  });

  it("handles single byte", () => {
    const original = new Uint8Array([42]);
    expect(base64ToUint8(uint8ToBase64(original))).toEqual(original);
  });

  it("handles two bytes", () => {
    const original = new Uint8Array([42, 99]);
    expect(base64ToUint8(uint8ToBase64(original))).toEqual(original);
  });

  it("round-trips key pair bytes", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    expect(base64ToUint8(uint8ToBase64(publicKey))).toEqual(publicKey);
    expect(base64ToUint8(uint8ToBase64(privateKey))).toEqual(privateKey);
  });

  it("handles all byte values", () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    expect(base64ToUint8(uint8ToBase64(all))).toEqual(all);
  });

  it("strips whitespace and padding in decode", () => {
    const original = new Uint8Array([1, 2, 3]);
    const encoded = uint8ToBase64(original);
    const withSpaces = " " + encoded + " ";
    expect(base64ToUint8(withSpaces)).toEqual(original);
  });
});
