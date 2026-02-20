import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, basename } from "node:path";
import { zipSync, unzipSync } from "fflate";
import {
  generateKeyPair,
  base64ToUint8,
  signFile,
  signPackage,
  verifyFile,
  verifyPackage,
  uint8ToBase64,
} from "@binalyze/notar";

const ROOT = resolve(import.meta.dirname, "..");

function loadEnv() {
  const envPath = resolve(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();
const SAMPLES_DIR = resolve(ROOT, "samples");
const SKILLS_DIR = resolve(SAMPLES_DIR, "skills");
const AGENTS_DIR = resolve(SAMPLES_DIR, "agents");
const SIGNED_DIR = resolve(SAMPLES_DIR, "signed");
const UNSIGNED_DIR = resolve(SAMPLES_DIR, "unsigned");
const MODIFIED_DIR = resolve(SAMPLES_DIR, "modified");

function collectFiles(dir: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = resolve(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        const rel = relative(dir, full);
        files.set(rel, readFileSync(full));
      }
    }
  };
  walk(dir);
  return files;
}

function corruptMarkdown(signed: string): string {
  return signed.replace(
    /## (When to Use|Behavior|Capabilities|Audit Scope|Instructions)/,
    "## $1\n\n> INJECTED: This content was tampered with after signing.\n",
  );
}

function corruptZip(zipBytes: Uint8Array): Uint8Array {
  const entries = unzipSync(zipBytes);
  const modified: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(entries)) {
    if (path === "MANIFEST.json") {
      modified[path] = data;
    } else if (path.endsWith(".md")) {
      const text = new TextDecoder().decode(data);
      const tampered = text + "\n\n<!-- INJECTED: This file was modified after signing -->\n";
      modified[path] = new TextEncoder().encode(tampered);
    } else {
      modified[path] = data;
    }
  }
  return zipSync(modified);
}

interface SkillDef {
  name: string;
  dir: string;
  mdFile: string;
  description: string;
  version: string;
  isAgent?: boolean;
}

function discoverSkills(baseDir: string, isAgent: boolean): SkillDef[] {
  const results: SkillDef[] = [];
  for (const entry of readdirSync(baseDir)) {
    const dir = resolve(baseDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    const mdFile = isAgent ? "AGENTS.md" : "SKILL.md";
    const mdPath = resolve(dir, mdFile);
    try {
      const content = readFileSync(mdPath, "utf-8");
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const descMatch = content.match(/^description:\s*(.+)$/m);
      const verMatch = content.match(/^version:\s*"?(.+?)"?\s*$/m);
      results.push({
        name: nameMatch?.[1]?.trim() ?? entry,
        dir,
        mdFile,
        description: descMatch?.[1]?.trim() ?? "",
        version: verMatch?.[1]?.trim() ?? "1.0",
        isAgent,
      });
    } catch { /* skip dirs without expected file */ }
  }
  return results;
}

async function main() {
  mkdirSync(SIGNED_DIR, { recursive: true });
  mkdirSync(UNSIGNED_DIR, { recursive: true });
  mkdirSync(MODIFIED_DIR, { recursive: true });

  const envPriv = process.env.NOTAR_PRIVATE_KEY;
  const envPub = process.env.NOTAR_PUBLIC_KEY;
  const envKeyId = process.env.NOTAR_KEY_ID;

  let publicKey: Uint8Array;
  let privateKey: Uint8Array;
  let keyId: string;

  if (envPriv && envPub && envKeyId) {
    privateKey = base64ToUint8(envPriv);
    publicKey = base64ToUint8(envPub);
    keyId = envKeyId;
    console.log("Using dev keys from .env:");
  } else {
    const keys = await generateKeyPair();
    privateKey = keys.privateKey;
    publicKey = keys.publicKey;
    keyId = "key_sample";
    console.log("Generated random test key pair:");
  }
  const publisher = "localhost:5000";

  console.log(`  Public Key: ${uint8ToBase64(publicKey)}`);
  console.log(`  Publisher:  ${publisher}`);
  console.log(`  Key ID:     ${keyId}\n`);

  const skills = discoverSkills(SKILLS_DIR, false);
  const agents = discoverSkills(AGENTS_DIR, true);
  const all = [...skills, ...agents];

  console.log(`Found ${skills.length} skills and ${agents.length} agents\n`);

  let verifyPass = 0;
  let verifyFail = 0;

  function check(label: string, result: { valid: boolean; reason?: string }) {
    if (result.valid) {
      verifyPass++;
    } else {
      verifyFail++;
      console.error(`  ✗ VERIFY FAILED: ${label} — ${result.reason}`);
    }
  }

  for (const def of all) {
    const label = def.isAgent ? "agent" : "skill";
    const md = readFileSync(resolve(def.dir, def.mdFile), "utf-8");

    // --- Signed markdown ---
    const signedMd = await signFile(md, privateKey, { keyId, publisher });
    const mdOut = resolve(SIGNED_DIR, `${def.name}.md`);
    writeFileSync(mdOut, signedMd);

    const mdVerify = await verifyFile(signedMd, publicKey);
    check(`${def.name}.md`, mdVerify);
    const mdStatus = mdVerify.valid ? "✓" : "✗";
    console.log(`[signed]   ${label} md:  ${basename(mdOut)}  ${mdStatus}`);

    // --- Unsigned markdown ---
    const unsignedOut = resolve(UNSIGNED_DIR, `${def.name}.md`);
    writeFileSync(unsignedOut, md);
    console.log(`[unsigned] ${label} md:  ${basename(unsignedOut)}`);

    // --- Modified markdown (signed then tampered) ---
    const modifiedMd = corruptMarkdown(signedMd);
    const modifiedMdOut = resolve(MODIFIED_DIR, `${def.name}.md`);
    writeFileSync(modifiedMdOut, modifiedMd);

    const modMdVerify = await verifyFile(modifiedMd, publicKey);
    const modMdStatus = modMdVerify.valid ? "✗ unexpectedly valid!" : "✓ (correctly invalid)";
    console.log(`[modified] ${label} md:  ${basename(modifiedMdOut)}  ${modMdStatus}`);

    // --- ZIP packages ---
    if (!def.isAgent) {
      const files = collectFiles(def.dir);
      const zipEntries: Record<string, Uint8Array> = {};
      for (const [path, data] of files) {
        zipEntries[`${def.name}/${path}`] = data;
      }
      const zip = zipSync(zipEntries);

      // Signed ZIP
      const signedZip = await signPackage(
        zip,
        { name: def.name, description: def.description, version: def.version, author: publisher, keyId, publisher },
        privateKey,
      );
      const zipOut = resolve(SIGNED_DIR, `${def.name}.zip`);
      writeFileSync(zipOut, signedZip);

      const zipVerify = await verifyPackage(signedZip, publicKey);
      check(`${def.name}.zip`, zipVerify);
      const zipStatus = zipVerify.valid ? "✓" : "✗";
      console.log(`[signed]   ${label} zip: ${basename(zipOut)}  ${zipStatus}`);

      // Unsigned ZIP
      const unsignedZipOut = resolve(UNSIGNED_DIR, `${def.name}.zip`);
      writeFileSync(unsignedZipOut, zip);
      console.log(`[unsigned] ${label} zip: ${basename(unsignedZipOut)}`);

      // Modified ZIP
      const modifiedZip = corruptZip(signedZip);
      const modifiedZipOut = resolve(MODIFIED_DIR, `${def.name}.zip`);
      writeFileSync(modifiedZipOut, modifiedZip);

      const modZipVerify = await verifyPackage(modifiedZip, publicKey);
      const modZipStatus = modZipVerify.valid ? "✗ unexpectedly valid!" : "✓ (correctly invalid)";
      console.log(`[modified] ${label} zip: ${basename(modifiedZipOut)}  ${modZipStatus}`);
    }

    console.log();
  }

  console.log("Verification summary:");
  console.log(`  Signed files verified: ${verifyPass} passed, ${verifyFail} failed`);
  if (verifyFail > 0) {
    console.error("\nSome signed files failed verification!");
    process.exit(1);
  }

  console.log(`\nDone! Output directories:`);
  console.log(`  Signed:   ${SIGNED_DIR}`);
  console.log(`  Unsigned: ${UNSIGNED_DIR}`);
  console.log(`  Modified: ${MODIFIED_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
