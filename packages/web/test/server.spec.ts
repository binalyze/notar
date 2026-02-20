import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { type ChildProcess, spawn, execSync } from "node:child_process";
import { resolve } from "node:path";

const PORT = 5111;
const BASE = `http://localhost:${PORT}`;
const PKG_DIR = resolve(import.meta.dirname, "..");

function freePort() {
  try {
    execSync(`lsof -ti :${PORT} | xargs kill -9 2>/dev/null`, { stdio: "ignore" });
  } catch { /* port may not be in use */ }
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch { /* server not ready yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

function startProc(command: string, args: string[]): ChildProcess {
  return spawn(command, args, { cwd: PKG_DIR, stdio: "ignore" });
}

async function stopProc(proc: ChildProcess) {
  proc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  freePort();
  await new Promise((r) => setTimeout(r, 500));
}

function apiTests() {
  test("GET /api/health returns JSON", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /api/health has security headers", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  test("GET /api/nonexistent returns 404 JSON", async () => {
    const res = await fetch(`${BASE}/api/nonexistent`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  test("GET / serves SPA HTML", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("GET /app serves SPA fallback", async () => {
    const res = await fetch(`${BASE}/app`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("GET /branding/preloader-dark.svg serves SVG asset", async () => {
    const res = await fetch(`${BASE}/branding/preloader-dark.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
  });

  test("POST /api/verify without content returns 400", async () => {
    const res = await fetch(`${BASE}/api/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing content or fileName" });
  });

  test("POST /api/lookup with missing fields returns 400", async () => {
    const res = await fetch(`${BASE}/api/lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing domain or keyId" });
  });
}

describe("dev mode", () => {
  let proc: ChildProcess;

  beforeAll(async () => {
    freePort();
    proc = startProc("pnpm", ["exec", "vite", "--port", String(PORT)]);
    await waitForServer();
  });

  afterAll(async () => {
    await stopProc(proc);
  });

  apiTests();
});

describe("preview mode", () => {
  let proc: ChildProcess;

  beforeAll(async () => {
    freePort();
    proc = startProc("pnpm", [
      "exec", "wrangler", "dev",
      "--config", "dist/notar/wrangler.json",
      "--port", String(PORT),
    ]);
    await waitForServer();
  });

  afterAll(async () => {
    await stopProc(proc);
  });

  apiTests();
});
