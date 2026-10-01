import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Guards the bounty #1732 class: key-discovery hosts, URLs, and DNS names are built only in
// packages/core/src/publisher.ts. File-derived fields (publisher, author, keyId, domain) are
// attacker input and must never be interpolated into a URL or DNS name anywhere else.
// A reviewed exception carries a `class-sweep-allow: <reason>` comment on the same line.

const REPO = resolve(import.meta.dirname, "../../..");
const ROOTS = ["packages", "scripts"];
const SKIP_DIRS = new Set(["node_modules", "dist", "public", "test", ".wrangler"]);
const SOURCE = /\.(m?[jt]sx?|vue)$/;
const OWNER = "packages/core/src/publisher.ts";
const ALLOW = /class-sweep-allow: \S.{8,}/;

// Network calls are policed where key discovery happens; the SPA only calls its own API.
const FETCH_SCOPE = ["packages/core/src", "packages/web/helpers.ts", "packages/web/worker.ts"];

const RULES: Array<{ name: string; pattern: RegExp; scope?: string[] }> = [
  { name: "prefix-based local host check", pattern: /startsWith\(\s*["'`](localhost|127\.)/i },
  { name: "local host helper defined outside owner", pattern: /(function\s+|const\s+|let\s+)is_?local(host)?\b/i },
  { name: "keys URL builder outside owner", pattern: /function\s+keysUrl\b/ },
  { name: "URL built from untrusted field", pattern: /(https?:\/\/|\$\{[^}]*\}:\/\/)\$\{[^}]*\b(publisher|author|domain|keyId|host|entry)\b/ },
  { name: "URL built by concatenation", pattern: /["'`](https?:)?\/\/["'`]\s*\+|\+\s*["'`]\/\.well-known\//i },
  { name: "DNS name built from untrusted field", pattern: /notar\.\$\{|["'`]notar\.["'`]\s*\+/ },
  { name: "local host literal outside owner", pattern: /["'`](https?:\/\/)?(localhost|127\.0\.0\.1)\b/ },
  { name: "network fetch outside owner", pattern: /\b(fetch|fetchFn)\s*(\?\.)?\(/, scope: FETCH_SCOPE },
];

function walk(path: string): string[] {
  const abs = join(REPO, path);
  if (statSync(abs).isFile()) return [path];
  return readdirSync(abs).flatMap((name) => (SKIP_DIRS.has(name) ? [] : walk(join(path, name))));
}

export function sweep(files: Array<{ path: string; text: string }>): string[] {
  const hits: string[] = [];
  for (const { path, text } of files) {
    if (path === OWNER) continue;
    text.split("\n").forEach((line, i) => {
      if (ALLOW.test(line)) return;
      for (const rule of RULES) {
        if (rule.scope && !rule.scope.some((p) => path === p || path.startsWith(`${p}/`))) continue;
        if (rule.pattern.test(line)) hits.push(`${path}:${i + 1} ${rule.name}: ${line.trim()}`);
      }
    });
  }
  return hits;
}

describe("class sweep: key-discovery construction lives only in publisher.ts", () => {
  it("finds no violations in the source tree", () => {
    const files = ROOTS.flatMap(walk)
      .filter((p) => SOURCE.test(p) && !p.endsWith(".d.ts"))
      .map((p) => ({ path: relative(REPO, join(REPO, p)), text: readFileSync(join(REPO, p), "utf-8") }));
    expect(files.length).toBeGreaterThan(10);
    expect(sweep(files)).toEqual([]);
  });

  it.each([
    "const url = `https://${publisher}/.well-known/notar-keys.json`;",
    "return `${protocol}://${author}/.well-known/notar-keys.json`;",
    "const fqdn = `notar.${keyId}.${domain}`;",
    "if (host.startsWith(\"localhost\")) {}",
    "function isLocal(host: string) {}",
    "await fetch(url);",
    "await options.fetch?.(url);",
    "const url = \"https://\" + publisher + \"/.well-known/notar-keys.json\";",
    "const url = base + \"/.well-known/notar-keys.json\";",
    "const fqdn = \"notar.\" + keyId + \".\" + domain;",
    "const isLocalHost = (h: string) => h === \"localhost\";",
    "if (host === \"127.0.0.1\") {}",
  ])("detects %s", (line) => {
    expect(sweep([{ path: "packages/core/src/example.ts", text: line }])).not.toEqual([]);
  });

  it("honours a reviewed allow marker", () => {
    expect(sweep([{ path: "packages/core/src/example.ts", text: "await fetch(url); // class-sweep-allow: fixed endpoint" }])).toEqual([]);
  });

  it("rejects an allow marker without a reason", () => {
    expect(sweep([{ path: "packages/core/src/example.ts", text: "await fetch(url); // class-sweep-allow:" }])).toHaveLength(1);
  });
});
