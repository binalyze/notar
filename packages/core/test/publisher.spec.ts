import { describe, it, expect } from "vitest";
import {
  parsePublisher,
  isValidKeyId,
  keysUrl,
  dnsName,
  fetchKeyManifest,
  displaySafe,
  jsonSafe,
  generateKeyPair,
  uint8ToBase64,
} from "../src/index";

function parsed(input: string) {
  const r = parsePublisher(input);
  if (!r.ok) throw new Error(`expected valid publisher: ${input} (${r.reason})`);
  return r.value;
}

describe("parsePublisher", () => {
  it.each([
    ["example.com", "example.com", false],
    ["sub.example.co.uk", "sub.example.co.uk", false],
    ["Example.COM", "example.com", false],
    ["localhost", "localhost", true],
    ["localhost:5123", "localhost:5123", true],
    ["127.0.0.1:5000", "127.0.0.1:5000", true],
    ["localhost.evil.com", "localhost.evil.com", false],
    ["127.0.0.1.nip.io", "127.0.0.1.nip.io", false],
  ])("accepts %s", (input, canonical, local) => {
    const p = parsed(input);
    expect(p.canonical).toBe(canonical);
    expect(p.local).toBe(local);
  });

  it("separates host and port", () => {
    const p = parsed("localhost:5123");
    expect(p.host).toBe("localhost");
    expect(p.port).toBe(5123);
  });

  it.each([
    // userinfo
    "localhost@attacker.test:5125",
    "user:pw@example.com",
    "example.com@evil.com",
    // path, query, fragment, backslash
    "example.com/x",
    "example.com?x",
    "example.com#x",
    "example.com\\evil.com",
    // percent-encoding
    "example.com%2fx",
    "localhost%40evil.com",
    // ports
    "example.com:443",
    "example.com:8080",
    "localhost:0",
    "localhost:99999",
    "localhost:abc",
    "localhost:05123",
    "localhost:",
    // label shape
    "example.com.",
    "example..com",
    "-example.com",
    "example-.com",
    `${"a".repeat(64)}.com`,
    `${"a.".repeat(127)}com`,
    "intranet",
    "a_b.com",
    "*.example.com",
    "example.123",
    // numeric / alternate loopback and IP literals
    "2130706433",
    "0x7f.1",
    "127.1",
    "0177.0.0.1",
    "[::1]",
    "127.0.0.2",
    "1.2.3.4",
    // unicode / IDN
    "localhost\u3002evil.com",
    "ex\u0430mple.com",
    "\uFF45xample.com",
    "\u212Aey.com",
    "xn--exmple-4nf.com",
    // whitespace and control characters
    " example.com",
    "example.com\n",
    "example.com\r",
    "exa\u0000mple.com",
    "",
  ])("rejects %j", (input) => {
    expect(parsePublisher(input).ok).toBe(false);
  });

  it.each([[["example.com"]], [123], [null], [undefined], [{}]])("rejects non-string %j without throwing", (input) => {
    const r = parsePublisher(input);
    expect(r.ok).toBe(false);
  });
});

describe("keysUrl", () => {
  it("uses HTTPS for public hosts", () => {
    expect(keysUrl(parsed("Example.com"))).toEqual({
      ok: true,
      url: "https://example.com/.well-known/notar-keys.json",
      transport: "https",
    });
  });

  it("refuses local hosts without opt-in", () => {
    expect(keysUrl(parsed("localhost:5123")).ok).toBe(false);
  });

  it("uses HTTP for local hosts only with opt-in", () => {
    expect(keysUrl(parsed("localhost:5123"), true)).toEqual({
      ok: true,
      url: "http://localhost:5123/.well-known/notar-keys.json",
      transport: "http",
    });
  });

  it("never selects HTTP for prefix look-alikes", () => {
    const r = keysUrl(parsed("localhost.evil.com"), true);
    expect(r).toMatchObject({ ok: true, transport: "https", url: "https://localhost.evil.com/.well-known/notar-keys.json" });
  });
});

describe("isValidKeyId", () => {
  it.each(["key_ba1094403d05", "key-1", "k"])("accepts %s", (id) => {
    expect(isValidKeyId(id)).toBe(true);
  });

  it.each(["a.b", "", "x/y", "a".repeat(64), "key id", "k\n", 5, null])("rejects %j", (id) => {
    expect(isValidKeyId(id)).toBe(false);
  });
});

describe("dnsName", () => {
  it("builds the TXT name from a public host", () => {
    expect(dnsName(parsed("Example.com"), "key_x")).toBe("notar.key_x.example.com");
  });

  it("refuses local hosts", () => {
    expect(dnsName(parsed("localhost:5000"), "key_x")).toBeNull();
  });

  it("refuses invalid keyIds", () => {
    expect(dnsName(parsed("example.com"), "a.evil")).toBeNull();
  });
});

describe("fetchKeyManifest", () => {
  async function validKey() {
    const { publicKey } = await generateKeyPair();
    return { keyId: "key_test", algorithm: "ed25519", publicKey: uint8ToBase64(publicKey), expires: "2099-01-01T00:00:00.000Z" };
  }

  function recorder(respond: (url: string) => Response | Promise<Response>) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      return respond(url);
    }) as typeof globalThis.fetch;
    return { calls, fetch };
  }

  it("fetches over HTTPS with redirects disabled", async () => {
    const key = await validKey();
    const { calls, fetch } = recorder(() => Response.json({ keys: [key] }));
    const r = await fetchKeyManifest(parsed("example.com"), { fetch });
    expect(r).toMatchObject({ ok: true, transport: "https" });
    expect(r.ok && r.keys).toEqual([key]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://example.com/.well-known/notar-keys.json");
    expect(calls[0]!.init?.redirect).toBe("manual");
  });

  it("reports HTTP transport for opted-in local hosts", async () => {
    const key = await validKey();
    const { fetch } = recorder(() => Response.json({ keys: [key] }));
    const r = await fetchKeyManifest(parsed("localhost:5000"), { fetch, allowInsecureLocalhost: true });
    expect(r).toMatchObject({ ok: true, transport: "http" });
  });

  it("refuses local hosts without opt-in and never fetches", async () => {
    const { calls, fetch } = recorder(() => Response.json({ keys: [] }));
    const r = await fetchKeyManifest(parsed("localhost:5000"), { fetch });
    expect(r).toMatchObject({ ok: false, code: "INVALID_PUBLISHER" });
    expect(calls).toHaveLength(0);
  });

  it("treats a 3xx response as a failure without following it", async () => {
    const { calls, fetch } = recorder(() => new Response(null, { status: 302, headers: { location: "http://127.0.0.1:5125/" } }));
    const r = await fetchKeyManifest(parsed("attacker.test"), { fetch });
    expect(r).toMatchObject({ ok: false, code: "KEY_FETCH_FAILED" });
    expect(calls).toHaveLength(1);
  });

  it("treats an opaque redirect (browser manual mode) as a failure", async () => {
    const { fetch } = recorder(() => {
      const res = new Response(null, { status: 200 });
      Object.defineProperty(res, "type", { value: "opaqueredirect" });
      Object.defineProperty(res, "status", { value: 0 });
      return res;
    });
    const r = await fetchKeyManifest(parsed("attacker.test"), { fetch });
    expect(r).toMatchObject({ ok: false, code: "KEY_FETCH_FAILED" });
  });

  it("rejects a response whose final URL differs from the requested URL", async () => {
    const key = await validKey();
    const { fetch } = recorder(() => {
      const res = Response.json({ keys: [key] });
      Object.defineProperty(res, "url", { value: "http://127.0.0.1:5125/.well-known/notar-keys.json" });
      return res;
    });
    const r = await fetchKeyManifest(parsed("attacker.test"), { fetch });
    expect(r).toMatchObject({ ok: false, code: "KEY_FETCH_FAILED" });
  });

  it("times out a hanging server", async () => {
    const { fetch } = recorder(() => new Promise<Response>(() => {}));
    const r = await fetchKeyManifest(parsed("slow.test"), { fetch, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, code: "NETWORK_ERROR" });
  });

  it("rejects an oversized body", async () => {
    const { fetch } = recorder(() => new Response("x".repeat(65 * 1024)));
    const r = await fetchKeyManifest(parsed("big.test"), { fetch });
    expect(r).toMatchObject({ ok: false, code: "KEY_FETCH_FAILED" });
  });

  it("rejects a manifest without a keys array", async () => {
    const { fetch } = recorder(() => Response.json({ keys: "nope" }));
    const r = await fetchKeyManifest(parsed("bad.test"), { fetch });
    expect(r).toMatchObject({ ok: false, code: "KEY_FETCH_FAILED" });
  });

  it("drops malformed key entries", async () => {
    const key = await validKey();
    const { fetch } = recorder(() => Response.json({
      keys: [
        { ...key, keyId: "bad_type", publicKey: 42 },
        { ...key, keyId: "bad_len", publicKey: "AAAA" },
        { ...key, keyId: "bad_alg", algorithm: "rsa" },
        { keyId: "no_alg", publicKey: key.publicKey, expires: key.expires },
        { ...key, keyId: "bad_exp", expires: "soon" },
        key,
      ],
    }));
    const r = await fetchKeyManifest(parsed("mixed.test"), { fetch });
    expect(r.ok && r.keys.map((k) => k.keyId)).toEqual(["key_test"]);
  });

  it("maps a thrown fetch to NETWORK_ERROR", async () => {
    const { fetch } = recorder(() => { throw new TypeError("redirect mode is set to error"); });
    const r = await fetchKeyManifest(parsed("down.test"), { fetch });
    expect(r).toMatchObject({ ok: false, code: "NETWORK_ERROR" });
  });
});

describe("jsonSafe", () => {
  it("keeps valid JSON while escaping bidi and C1 characters", () => {
    const value = { publisher: "a\u202Eb", reason: "x\u0085y\nz" };
    const out = jsonSafe(value);
    for (const ch of ["\u202E", "\u0085"]) expect(out).not.toContain(ch);
    expect(JSON.parse(out)).toEqual(value);
  });
});

describe("displaySafe", () => {
  it("leaves plain ASCII unchanged", () => {
    expect(displaySafe("example.com (key_1)")).toBe("example.com (key_1)");
  });

  it.each([
    ["x\r  PASS", "x\\r  PASS"],
    ["\x1b[1A", "\\x1b[1A"],
    ["a\u202Eb", "a\\u202eb"],
    ["a\u0000b", "a\\x00b"],
    ["a\nb", "a\\nb"],
    ["a\u200Bb", "a\\u200bb"],
  ])("escapes %j", (input, expected) => {
    expect(displaySafe(input)).toBe(expected);
  });

  it("stringifies non-strings", () => {
    expect(displaySafe(["a"])).toBe("[\"a\"]");
    expect(displaySafe(undefined)).toBe("");
  });
});
