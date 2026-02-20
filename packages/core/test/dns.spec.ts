import { describe, it, expect } from "vitest";
import { parseDnsTxtRecord, formatDnsTxtRecord } from "../src/index";

describe("parseDnsTxtRecord", () => {
  it("parses a valid TXT record", () => {
    const record = parseDnsTxtRecord("v=sk1; k=ed25519; p=abc123; exp=1700000000");
    expect(record).toEqual({
      version: "sk1",
      algorithm: "ed25519",
      publicKey: "abc123",
      expires: 1700000000,
    });
  });

  it("handles no spaces around semicolons", () => {
    const record = parseDnsTxtRecord("v=sk1;k=ed25519;p=abc;exp=1700000000");
    expect(record).not.toBeNull();
    expect(record!.publicKey).toBe("abc");
  });

  it("handles extra whitespace", () => {
    const record = parseDnsTxtRecord("  v=sk1 ;  k=ed25519 ;  p=key123 ;  exp=1700000000  ");
    expect(record).not.toBeNull();
    expect(record!.publicKey).toBe("key123");
  });

  it("returns null for wrong version", () => {
    expect(parseDnsTxtRecord("v=sk2; k=ed25519; p=abc; exp=1700000000")).toBeNull();
  });

  it("returns null for wrong algorithm", () => {
    expect(parseDnsTxtRecord("v=sk1; k=rsa; p=abc; exp=1700000000")).toBeNull();
  });

  it("returns null for missing fields", () => {
    expect(parseDnsTxtRecord("v=sk1; k=ed25519")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDnsTxtRecord("")).toBeNull();
  });

  it("returns null for null-ish input", () => {
    expect(parseDnsTxtRecord(null as unknown as string)).toBeNull();
    expect(parseDnsTxtRecord(undefined as unknown as string)).toBeNull();
  });

  it("returns null for invalid expiry", () => {
    expect(parseDnsTxtRecord("v=sk1; k=ed25519; p=abc; exp=notanumber")).toBeNull();
    expect(parseDnsTxtRecord("v=sk1; k=ed25519; p=abc; exp=-1")).toBeNull();
    expect(parseDnsTxtRecord("v=sk1; k=ed25519; p=abc; exp=0")).toBeNull();
  });

  it("returns null for malformed key=value pairs", () => {
    expect(parseDnsTxtRecord("v=sk1; ed25519; p=abc; exp=1700000000")).toBeNull();
  });
});

describe("formatDnsTxtRecord", () => {
  it("formats a DNS TXT record with correct structure", () => {
    const { fqdn, value } = formatDnsTxtRecord("key_test", "pubkey123", 1700000000);
    expect(fqdn).toBe("notar.key_test");
    expect(value).toBe("v=sk1; k=ed25519; p=pubkey123; exp=1700000000");
  });

  it("embeds keyId in FQDN", () => {
    const { fqdn } = formatDnsTxtRecord("my_key_2024", "pk", 9999999999);
    expect(fqdn).toBe("notar.my_key_2024");
  });

  it("produces parseable output", () => {
    const { value } = formatDnsTxtRecord("k1", "base64key", 1700000000);
    const parsed = parseDnsTxtRecord(value);
    expect(parsed).not.toBeNull();
    expect(parsed!.publicKey).toBe("base64key");
    expect(parsed!.expires).toBe(1700000000);
  });
});
