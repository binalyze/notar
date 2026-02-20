import { defineCommand } from "citty";
import { readFileSync, writeFileSync } from "fs";
import { resolve, extname, basename } from "path";
import {
  sign as notarSign,
  base64ToUint8,
  parseFrontMatter,
} from "../../index.js";
import { unzipSync } from "fflate";

function signedFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return `${name}-signed`;
  return `${name.slice(0, dot)}-signed${name.slice(dot)}`;
}

async function readPrivateKey(): Promise<string> {
  const envKey = process.env.NOTAR_PRIVATE_KEY;
  if (envKey) return envKey.trim();

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const stdinKey = Buffer.concat(chunks).toString("utf-8").trim();
    if (stdinKey) return stdinKey;
  }

  console.error("Error: No private key provided.");
  console.error("Set NOTAR_PRIVATE_KEY environment variable or pipe via stdin.");
  process.exit(2);
}

export const sign = defineCommand({
  meta: { name: "sign", description: "Sign a file (.md or .zip)" },
  args: {
    file: { type: "positional", description: "File to sign", required: true },
    "key-id": { type: "string", description: "Key ID (optional)" },
    publisher: { type: "string", description: "Publisher domain" },
    author: { type: "string", description: "Author (freeform, defaults to publisher)" },
    output: { type: "string", description: "Output file path" },
  },
  async run({ args }) {
    const filePath = resolve(args.file);
    const ext = extname(filePath).toLowerCase();

    const privateKeyB64 = await readPrivateKey();
    let pk: Uint8Array;
    try {
      pk = base64ToUint8(privateKeyB64);
    } catch {
      console.error("Error: Invalid private key format.");
      process.exit(2);
    }

    const outPath = args.output ? resolve(args.output) : resolve(process.cwd(), signedFileName(basename(filePath)));

    if (ext === ".md") {
      const content = readFileSync(filePath, "utf-8");
      const parsed = parseFrontMatter(content);
      const sigs = parsed.data.signatures as Array<{ keyId?: string; publisher?: string }> | undefined;
      const keyId = args["key-id"] || sigs?.[0]?.keyId || undefined;
      const publisher = args.publisher || sigs?.[0]?.publisher || String(parsed.data.author || "");

      const signed = await notarSign(content, pk, { keyId, publisher });
      writeFileSync(outPath, signed);
      console.log(`Signed: ${outPath}`);
    } else if (ext === ".zip") {
      const bytes = new Uint8Array(readFileSync(filePath));
      let existingAuthor = "";
      let existingName = "";
      let existingDesc = "";
      let existingVersion = "";
      let existingKeyId = "";
      try {
        const entries = unzipSync(bytes);
        const manifestBytes = entries["MANIFEST.json"];
        if (manifestBytes) {
          const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
          existingAuthor = manifest.author || "";
          existingName = manifest.name || "";
          existingDesc = manifest.description || "";
          existingVersion = manifest.version || "";
          if (manifest.signatures?.[0]?.keyId) existingKeyId = manifest.signatures[0].keyId;
        }
      } catch { /* no existing manifest */ }

      const publisher = args.publisher || existingAuthor;
      const keyId = args["key-id"] || existingKeyId || undefined;
      const author = args.author || existingAuthor || publisher;

      const signed = await notarSign(bytes, pk, {
        name: existingName || basename(filePath, ext),
        description: existingDesc || "",
        version: existingVersion || "1.0.0",
        author,
        keyId,
        publisher,
      });
      writeFileSync(outPath, signed);
      console.log(`Signed: ${outPath}`);
    } else {
      console.error(`Error: Unsupported file type "${ext}". Expected .md or .zip`);
      process.exit(2);
    }
  },
});
