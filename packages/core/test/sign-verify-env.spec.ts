import { describe, it, expect } from "vitest";
import { zipSync, unzipSync } from "fflate";
import {
  sign,
  verify,
  signFile,
  signPackage,
  verifyFile,
  verifyPackage,
  base64ToUint8,
  VerifyErrorCode,
} from "../src/index";

// Stable key material from .env — validates sign/verify with a known, fixed key pair.
const PUBLIC_KEY = base64ToUint8("s8InPsu4Crn91IblVYxBLWNxVCXUGhoGpo6dRoORG44=");
const PRIVATE_KEY = base64ToUint8("hvH2YOD08M3NNLSAm8RVsJrK4g67Ew7bnFkWplRv3tU=");
const KEY_ID = "key_ba1094403d05";

const SAMPLE_MD = `---
name: test-file
description: A test skill for verification
version: "1.0"
author: example.com
---
# Test File

This is a test body.
`;

const enc = (s: string) => new TextEncoder().encode(s);

// -- Markdown -----------------------------------------------------------------

describe("env keys: markdown sign + verify", () => {
  it("signs and verifies successfully", async () => {
    const signed = await signFile(SAMPLE_MD, PRIVATE_KEY, { keyId: KEY_ID, publisher: "example.com" });
    const result = await verifyFile(signed, PUBLIC_KEY);
    expect(result.valid).toBe(true);
    expect(result.details?.signers).toHaveLength(1);
    expect(result.details?.signers![0].keyId).toBe(KEY_ID);
  });

  it("works via unified API", async () => {
    const signed = await sign(SAMPLE_MD, PRIVATE_KEY, { keyId: KEY_ID });
    const result = await verify(signed, PUBLIC_KEY);
    expect(result.valid).toBe(true);
  });

  it("rejects body tampering", async () => {
    const signed = await signFile(SAMPLE_MD, PRIVATE_KEY, { keyId: KEY_ID });
    const tampered = signed.replace("test body", "hacked body");
    const result = await verifyFile(tampered, PUBLIC_KEY);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.NO_MATCHING_SIGNATURE);
  });

  it("rejects front-matter tampering", async () => {
    const signed = await signFile(SAMPLE_MD, PRIVATE_KEY, { keyId: KEY_ID });
    const tampered = signed.replace("test-file", "evil-file");
    const result = await verifyFile(tampered, PUBLIC_KEY);
    expect(result.valid).toBe(false);
  });

  it("rejects wrong public key", async () => {
    const signed = await signFile(SAMPLE_MD, PRIVATE_KEY, { keyId: KEY_ID });
    const wrongKey = base64ToUint8("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    const result = await verifyFile(signed, wrongKey);
    expect(result.valid).toBe(false);
  });

  it("preserves content through sign round-trip", async () => {
    const signed = await signFile(SAMPLE_MD, PRIVATE_KEY, { keyId: KEY_ID });
    expect(signed).toContain("# Test File");
    expect(signed).toContain("This is a test body.");
    expect(signed).toContain("name: test-file");
  });
});

// -- Package ------------------------------------------------------------------

describe("env keys: package sign + verify", () => {
  const metadata = {
    name: "test-pkg",
    description: "A test package",
    version: "1.0",
    author: "example.com",
    keyId: KEY_ID,
  };

  it("signs and verifies successfully", async () => {
    const zip = zipSync({ "main.py": enc("print('hello')"), "README.md": enc("# Hello") });
    const signed = await signPackage(zip, metadata, PRIVATE_KEY);
    const result = await verifyPackage(signed, PUBLIC_KEY);
    expect(result.valid).toBe(true);
    expect(result.details?.files!.every((f) => f.valid)).toBe(true);
  });

  it("works via unified API", async () => {
    const zip = zipSync({ "data.json": enc('{"ok":true}') });
    const signed = await sign(zip, PRIVATE_KEY, metadata);
    const result = await verify(signed, PUBLIC_KEY);
    expect(result.valid).toBe(true);
  });

  it("rejects file tampering", async () => {
    const zip = zipSync({ "main.py": enc("original") });
    const signed = await signPackage(zip, metadata, PRIVATE_KEY);
    const entries = unzipSync(signed);
    entries["main.py"] = enc("tampered");
    const tampered = zipSync(entries);
    const result = await verifyPackage(tampered, PUBLIC_KEY);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(VerifyErrorCode.HASH_MISMATCH);
  });

  it("rejects wrong public key", async () => {
    const zip = zipSync({ "main.py": enc("code") });
    const signed = await signPackage(zip, metadata, PRIVATE_KEY);
    const wrongKey = base64ToUint8("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    const result = await verifyPackage(signed, wrongKey);
    expect(result.valid).toBe(false);
  });

  it("verifies multi-file package integrity", async () => {
    const zip = zipSync({
      "src/main.ts": enc("export default {}"),
      "src/utils.ts": enc("export const x = 1"),
      "config.json": enc('{"version":1}'),
      "README.md": enc("# Package"),
    });
    const signed = await signPackage(zip, metadata, PRIVATE_KEY);
    const result = await verifyPackage(signed, PUBLIC_KEY);
    expect(result.valid).toBe(true);
    expect(result.details?.files).toHaveLength(4);
    expect(result.details?.files!.every((f) => f.valid)).toBe(true);
  });
});
