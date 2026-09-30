import { describe, it, expect } from "vitest";
import { formatResult } from "../src/cli/commands/verify";
import { VerifyErrorCode, type VerifyResult } from "../src/index";

describe("CLI verify output", () => {
  it("escapes control characters from file-derived fields", () => {
    const result: VerifyResult = {
      valid: false,
      code: VerifyErrorCode.INVALID_PUBLISHER,
      reason: "Invalid publisher",
      details: {
        author: "Jane\x1b[2K",
        signers: [{
          keyId: "k\r",
          publisher: "x\r  PASS notar.binalyze.ai (key) [https]",
          valid: false,
          code: VerifyErrorCode.INVALID_PUBLISHER,
          reason: "bad\x1b[1A",
        }],
        files: [{ path: "a\u202Etxt.exe", valid: false, code: VerifyErrorCode.HASH_MISMATCH }],
      },
    };
    const out = formatResult(result);
    for (const ch of ["\r", "\x1b", "\u202E"]) expect(out).not.toContain(ch);
    expect(out).toContain("FAIL x\\r  PASS notar.binalyze.ai");
    expect(out).toContain("Invalid Publisher");
  });

  it("labels HTTP key sources as insecure", () => {
    const out = formatResult({
      valid: true,
      details: { signers: [{ keyId: "k", publisher: "localhost:5000", valid: true, keySource: "http" }] },
    });
    expect(out).toContain("[http, insecure]");
  });
});
