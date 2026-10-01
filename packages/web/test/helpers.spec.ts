import { describe, test, expect } from "vitest";
import { allowInsecureLocalhost, assetFetch } from "../helpers";

describe("allowInsecureLocalhost", () => {
  test.each([
    [{ ALLOW_INSECURE_LOCALHOST: "true" }, "http://localhost:5000/api/verify", true],
    [{ ALLOW_INSECURE_LOCALHOST: "true" }, "http://127.0.0.1:5123/api/verify", true],
    [{ ALLOW_INSECURE_LOCALHOST: "true" }, "https://notar.example.workers.dev/api/verify", false],
    [{ ALLOW_INSECURE_LOCALHOST: "true" }, "http://localhost.evil.com/api/verify", false],
    [{ ALLOW_INSECURE_LOCALHOST: "1" }, "http://localhost:5000/api/verify", false],
    [{ BUILD_MODE: "development" }, "http://localhost:5000/api/verify", false],
    [{}, "http://localhost:5000/api/verify", false],
  ])("env %j at %s -> %s", (env, url, expected) => {
    expect(allowInsecureLocalhost(env as Env, url)).toBe(expected);
  });
});

describe("assetFetch", () => {
  const assets = {
    fetch: async (req: Request) => new Response(JSON.stringify({ path: new URL(req.url).pathname }), { status: 200 }),
  } as unknown as Fetcher;

  test("serves the dev manifest for an exact local host when opted in", async () => {
    const res = await assetFetch(assets, true)("http://localhost:5000/.well-known/notar-keys.json");
    expect(await res.json()).toEqual({ path: "/.well-known/notar-keys-dev.json" });
    expect(res.url).toBe("");
  });

  test("never routes to assets without opt-in", async () => {
    let globalCalled = false;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => { globalCalled = true; return new Response("x"); }) as typeof fetch;
    try {
      await assetFetch(assets, false)("http://localhost:5000/.well-known/notar-keys.json");
    } finally {
      globalThis.fetch = original;
    }
    expect(globalCalled).toBe(true);
  });

  test("does not treat userinfo or look-alike hosts as local", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => { seen.push(String(input)); return new Response("x"); }) as typeof fetch;
    try {
      await assetFetch(assets, true)("https://localhost.evil.com/.well-known/notar-keys.json");
    } finally {
      globalThis.fetch = original;
    }
    expect(seen).toEqual(["https://localhost.evil.com/.well-known/notar-keys.json"]);
  });
});
