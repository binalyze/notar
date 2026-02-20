import { describe, it, expect } from "vitest";
import { parseFrontMatter, stringifyFrontMatter } from "../src/index";

describe("parseFrontMatter", () => {
  it("parses basic key-value pairs", () => {
    const { data, content } = parseFrontMatter("---\nname: test\nauthor: alice\n---\nBody");
    expect(data.name).toBe("test");
    expect(data.author).toBe("alice");
    expect(content).toBe("Body");
  });

  it("returns empty data for no front matter", () => {
    const { data, content } = parseFrontMatter("Just text");
    expect(Object.keys(data)).toHaveLength(0);
    expect(content).toBe("Just text");
  });

  it("parses quoted strings", () => {
    const { data } = parseFrontMatter('---\nversion: "1.0"\n---\nBody');
    expect(data.version).toBe("1.0");
  });

  it("parses booleans", () => {
    const { data } = parseFrontMatter("---\nactive: true\ndisabled: false\n---\nBody");
    expect(data.active).toBe(true);
    expect(data.disabled).toBe(false);
  });

  it("parses numbers", () => {
    const { data } = parseFrontMatter("---\ncount: 42\n---\nBody");
    expect(data.count).toBe(42);
  });

  it("preserves semver strings as strings", () => {
    const { data } = parseFrontMatter('---\nversion: "1.2.3"\n---\nBody');
    expect(data.version).toBe("1.2.3");
  });

  it("parses signatures array", () => {
    const md = `---
name: test
signatures:
  - keyId: k1
    publisher: a.com
    value: "ed25519:abc"
  - keyId: k2
    publisher: b.com
    value: "ed25519:def"
---
Body`;
    const { data } = parseFrontMatter(md);
    const sigs = data.signatures as Array<{ keyId: string; publisher: string; value: string }>;
    expect(sigs).toHaveLength(2);
    expect(sigs[0].keyId).toBe("k1");
    expect(sigs[0].publisher).toBe("a.com");
    expect(sigs[1].keyId).toBe("k2");
  });

  it("handles empty front matter block", () => {
    const { data } = parseFrontMatter("---\n---\nBody");
    expect(Object.keys(data)).toHaveLength(0);
  });

  it("handles values with colons", () => {
    const { data } = parseFrontMatter('---\nurl: "https://example.com"\n---\nBody');
    expect(data.url).toBe("https://example.com");
  });
});

describe("stringifyFrontMatter", () => {
  it("creates valid front matter block", () => {
    const result = stringifyFrontMatter("Body", { name: "test", version: "1.0" });
    expect(result).toContain("---\n");
    expect(result).toContain("name: test");
    expect(result).toContain("version:");
    expect(result).toContain("Body");
  });

  it("quotes strings that contain colons", () => {
    const result = stringifyFrontMatter("Body", { url: "https://example.com" });
    expect(result).toContain('"https://example.com"');
  });

  it("serializes signatures array", () => {
    const result = stringifyFrontMatter("Body", {
      name: "test",
      signatures: [{ keyId: "k1", publisher: "a.com", value: "ed25519:abc" }],
    });
    expect(result).toContain("signatures:");
    expect(result).toContain("  - keyId: k1");
    expect(result).toContain("    publisher: a.com");
  });

  it("skips undefined values", () => {
    const result = stringifyFrontMatter("Body", { name: "test", extra: undefined });
    expect(result).not.toContain("extra");
  });

  it("round-trips through parse → stringify", () => {
    const original = `---
name: test
description: desc
version: "1.0"
author: example.com
---
# Hello World`;
    const { data, content } = parseFrontMatter(original);
    const rebuilt = stringifyFrontMatter(content, data);
    const reparsed = parseFrontMatter(rebuilt);
    expect(reparsed.data.name).toBe("test");
    expect(reparsed.data.description).toBe("desc");
    expect(reparsed.content).toContain("# Hello World");
  });
});
