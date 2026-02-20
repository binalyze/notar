import { defineCommand } from "citty";
import { writeFileSync } from "fs";
import { resolve } from "path";
import {
  generateKeyPair,
  uint8ToBase64,
  formatDnsTxtRecord,
} from "../../index.js";

export const keygen = defineCommand({
  meta: { name: "keygen", description: "Generate an Ed25519 key pair" },
  args: {
    domain: { type: "string", description: "Your domain (e.g. example.com)", required: true },
    "key-id": { type: "string", description: "Key ID (defaults to key_YYYYMMDD)" },
  },
  async run({ args }) {
    const domain = args.domain;
    const today = new Date();
    const keyId = args["key-id"] || `key_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

    const { publicKey, privateKey } = await generateKeyPair();
    const publicKeyB64 = uint8ToBase64(publicKey);
    const privateKeyB64 = uint8ToBase64(privateKey);

    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const expUnix = Math.floor(new Date(expires).getTime() / 1000);
    const dns = formatDnsTxtRecord(keyId, publicKeyB64, expUnix);

    const keysJson = JSON.stringify({
      keys: [{
        keyId,
        algorithm: "ed25519",
        publicKey: publicKeyB64,
        expires,
        revoked: false,
      }],
    }, null, 2);

    const outPath = resolve(process.cwd(), "notar-keys.json");
    writeFileSync(outPath, keysJson);

    console.log(`\nKey pair generated for domain: ${domain}\n`);
    console.log(`  Key ID:      ${keyId}`);
    console.log(`  Private Key: ${privateKeyB64}    <- SAVE THIS. It will NOT be stored.\n`);
    console.log(`  Public key written to: ${outPath}`);
    console.log(`  Deploy this file to: https://${domain}/.well-known/notar-keys.json\n`);
    console.log(`  Or add a DNS TXT record:`);
    console.log(`    Name:  ${dns.fqdn}.${domain}`);
    console.log(`    Value: ${dns.value}\n`);
  },
});
