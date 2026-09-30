import { defineCommand } from "citty";
import { readFileSync } from "fs";
import { resolve, extname } from "path";
import {
  verify as notarVerify,
  verifyFromAuthor,
  base64ToUint8,
  displaySafe,
  jsonSafe,
  VerifyErrorCode,
} from "../../index.js";
import type { VerifyResult } from "../../index.js";

const CODE_LABELS: Record<string, string> = {
  [VerifyErrorCode.NO_SIGNATURES]: "No Signatures",
  [VerifyErrorCode.MALFORMED_SIGNATURE]: "Malformed Signature",
  [VerifyErrorCode.MISSING_KEY_ID]: "Missing Key ID",
  [VerifyErrorCode.SIGNATURE_MISMATCH]: "Content Modified",
  [VerifyErrorCode.NO_MATCHING_SIGNATURE]: "No Matching Signature",
  [VerifyErrorCode.UNTRUSTED_PUBLISHER]: "Untrusted Publisher",
  [VerifyErrorCode.INVALID_PUBLISHER]: "Invalid Publisher",
  [VerifyErrorCode.TOO_MANY_SIGNATURES]: "Too Many Signatures",
  [VerifyErrorCode.KEY_NOT_FOUND]: "Key Not Found",
  [VerifyErrorCode.KEY_EXPIRED]: "Key Expired",
  [VerifyErrorCode.KEY_REVOKED]: "Key Revoked",
  [VerifyErrorCode.KEY_FETCH_FAILED]: "Key Fetch Failed",
  [VerifyErrorCode.MISSING_MANIFEST]: "Missing Manifest",
  [VerifyErrorCode.MISSING_FILE]: "Missing File",
  [VerifyErrorCode.HASH_MISMATCH]: "File Tampered",
  [VerifyErrorCode.INVALID_FRONT_MATTER]: "Invalid Front Matter",
  [VerifyErrorCode.NETWORK_ERROR]: "Network Error",
  [VerifyErrorCode.DNS_RESOLUTION_FAILED]: "DNS Resolution Failed",
};

// Every string below except fixed labels comes from the verified file and is escaped.
export function formatResult(result: VerifyResult): string {
  const lines: string[] = [];
  const signers = result.details?.signers ?? [];
  const mixed = signers.some((s) => s.valid) && signers.some((s) => !s.valid);

  if (result.valid) {
    lines.push("", "  Valid Signature", "");
  } else {
    const label = result.code ? CODE_LABELS[result.code] || displaySafe(result.code) : "Invalid";
    lines.push("", `  ${label}`);
    if (result.reason) lines.push(`    ${displaySafe(result.reason)}`);
    if (mixed) {
      lines.push("    Warning: some signatures failed -- this file may have been tampered with.");
    }
    lines.push("");
  }

  if (result.details?.trustedPublisher) {
    lines.push(`  Verified publisher: ${displaySafe(result.details.trustedPublisher)}`);
  }
  if (result.details?.author) {
    lines.push(`  Author (claimed, unverified): ${displaySafe(result.details.author)}`);
  }
  for (const s of signers) {
    const status = s.valid ? "PASS" : "FAIL";
    const source = s.keySource ? ` [${s.keySource === "http" ? "http, insecure" : s.keySource}]` : "";
    const expires = s.keyExpires ? ` expires ${displaySafe(s.keyExpires)}` : "";
    lines.push(`  ${status} ${displaySafe(s.publisher)} (${displaySafe(s.keyId)})${source}${expires}`);
    if (!s.valid && s.reason) lines.push(`    ${displaySafe(s.reason)}`);
  }
  if (result.details?.files) {
    const failed = result.details.files.filter((f) => !f.valid);
    if (failed.length > 0) {
      lines.push("", "  File integrity issues:");
      for (const f of failed) {
        lines.push(`    ${displaySafe(f.path)} -- ${displaySafe(f.code)}`);
      }
    }
  }
  return lines.join("\n");
}

export const verify = defineCommand({
  meta: { name: "verify", description: "Verify a signed file" },
  args: {
    file: { type: "positional", description: "File to verify", required: true },
    "public-key": { type: "string", description: "Public key (base64) to verify against" },
    expect: { type: "string", description: "Expected publisher; verification passes only for a valid signature from this publisher" },
    "allow-insecure-localhost": { type: "boolean", description: "Allow fetching keys over plain HTTP from localhost / 127.0.0.1 (development only)", default: false },
    json: { type: "boolean", description: "Output JSON result", default: false },
  },
  async run({ args }) {
    const filePath = resolve(args.file);
    const ext = extname(filePath).toLowerCase();

    let result: VerifyResult;

    try {
      if (ext !== ".md" && ext !== ".zip") {
        console.error(`Error: Unsupported file type "${ext}". Expected .md or .zip`);
        process.exit(2);
      }

      const input: string | Uint8Array = ext === ".md"
        ? readFileSync(filePath, "utf-8")
        : new Uint8Array(readFileSync(filePath));
      const expectedPublisher = args.expect?.trim();

      if (args["public-key"] && args.expect) {
        console.error("Error: --expect cannot be combined with --public-key");
        process.exit(2);
      }
      if (args.expect && !expectedPublisher) {
        console.error("Error: --expect must not be empty");
        process.exit(2);
      }

      if (args["public-key"]) {
        result = await notarVerify(input, base64ToUint8(args["public-key"]));
      } else {
        result = await verifyFromAuthor(input, {
          ...(expectedPublisher && { expectedPublisher }),
          allowInsecureLocalhost: args["allow-insecure-localhost"],
        });
      }
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(2);
    }

    if (args.json) {
      console.log(jsonSafe(result));
    } else {
      console.log(formatResult(result));
    }

    process.exit(result.valid ? 0 : 1);
  },
});
