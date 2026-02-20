import { defineCommand } from "citty";
import { readFileSync } from "fs";
import { resolve, extname } from "path";
import {
  verify as notarVerify,
  verifyFromAuthor,
  base64ToUint8,
  VerifyErrorCode,
} from "../../index.js";
import type { VerifyResult } from "../../index.js";

const CODE_LABELS: Record<string, string> = {
  [VerifyErrorCode.NO_SIGNATURES]: "No Signatures",
  [VerifyErrorCode.MALFORMED_SIGNATURE]: "Malformed Signature",
  [VerifyErrorCode.MISSING_KEY_ID]: "Missing Key ID",
  [VerifyErrorCode.SIGNATURE_MISMATCH]: "Content Modified",
  [VerifyErrorCode.NO_MATCHING_SIGNATURE]: "No Matching Signature",
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

function printResult(result: VerifyResult) {
  if (result.valid) {
    console.log("\n  Valid Signature\n");
  } else {
    const label = result.code ? CODE_LABELS[result.code] || result.code : "Invalid";
    console.log(`\n  ${label}`);
    if (result.reason) console.log(`    ${result.reason}`);
    console.log();
  }

  if (result.details?.author) {
    console.log(`  Author: ${result.details.author}`);
  }
  if (result.details?.signers) {
    for (const s of result.details.signers) {
      const status = s.valid ? "PASS" : "FAIL";
      const source = s.keySource ? ` [${s.keySource}]` : "";
      const expires = s.keyExpires ? ` expires ${s.keyExpires}` : "";
      console.log(`  ${status} ${s.publisher} (${s.keyId})${source}${expires}`);
      if (!s.valid && s.reason) console.log(`    ${s.reason}`);
    }
  }
  if (result.details?.files) {
    const failed = result.details.files.filter((f) => !f.valid);
    if (failed.length > 0) {
      console.log(`\n  File integrity issues:`);
      for (const f of failed) {
        console.log(`    ${f.path} -- ${f.code}`);
      }
    }
  }
}

export const verify = defineCommand({
  meta: { name: "verify", description: "Verify a signed file" },
  args: {
    file: { type: "positional", description: "File to verify", required: true },
    "public-key": { type: "string", description: "Public key (base64) to verify against" },
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

      if (args["public-key"]) {
        result = await notarVerify(input, base64ToUint8(args["public-key"]));
      } else {
        result = await verifyFromAuthor(input);
      }
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(2);
    }

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResult(result);
    }

    process.exit(result.valid ? 0 : 1);
  },
});
