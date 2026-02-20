#!/usr/bin/env node

// pnpm exec / npm exec change cwd to the package dir — restore the user's actual cwd
if (process.env.INIT_CWD) process.chdir(process.env.INIT_CWD);

import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import { keygen } from "./commands/keygen.js";
import { sign } from "./commands/sign.js";
import { verify } from "./commands/verify.js";

const require = createRequire(import.meta.url);
const { version: VERSION } = require("../../package.json") as { version: string };

const LOGO = [
  "███╗   ██╗ ██████╗ ████████╗ █████╗ ██████╗ ",
  "████╗  ██║██╔═══██╗╚══██╔══╝██╔══██╗██╔══██╗",
  "██╔██╗ ██║██║   ██║   ██║   ███████║██████╔╝",
  "██║╚██╗██║██║   ██║   ██║   ██╔══██║██╔══██╗",
  "██║ ╚████║╚██████╔╝   ██║   ██║  ██║██║  ██║",
  "╚═╝  ╚═══╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝",
].join("\n");

function cancelled(value: unknown): value is symbol {
  return typeof value === "symbol";
}

function printBanner() {
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  console.log();
  console.log(cyan(LOGO));
  console.log(dim(`     ${bold("Ed25519")} / Trust-First AI ${dim(`v${VERSION}`)}`));
  console.log();
}

async function promptKeygen() {
  const domain = await consola.prompt("Your domain (e.g. example.com):", { type: "text" });
  if (cancelled(domain) || !domain) return;
  const keyId = await consola.prompt("Key ID (leave empty for auto):", { type: "text", default: "" });
  if (cancelled(keyId)) return;
  const args = ["keygen", "--domain", domain];
  if (keyId) args.push("--key-id", keyId);
  return args;
}

async function promptSign() {
  const file = await consola.prompt("File to sign (.md or .zip):", { type: "text" });
  if (cancelled(file) || !file) return;
  const publisher = await consola.prompt("Publisher domain (optional):", { type: "text", default: "" });
  if (cancelled(publisher)) return;
  const author = await consola.prompt("Author (optional, defaults to publisher):", { type: "text", default: "" });
  if (cancelled(author)) return;
  const args = ["sign", file];
  if (publisher) args.push("--publisher", publisher);
  if (author) args.push("--author", author);
  return args;
}

async function promptVerify() {
  const file = await consola.prompt("File to verify (.md or .zip):", { type: "text" });
  if (cancelled(file) || !file) return;
  return ["verify", file];
}

const prompters: Record<string, () => Promise<string[] | undefined>> = {
  keygen: promptKeygen,
  sign: promptSign,
  verify: promptVerify,
};

async function interactive() {
  printBanner();

  const action = await consola.prompt("What would you like to do?", {
    type: "select",
    options: [
      { label: "Generate a key pair", value: "keygen", hint: "create Ed25519 keys" },
      { label: "Sign a file", value: "sign", hint: ".md or .zip" },
      { label: "Verify a signed file", value: "verify", hint: "check signature" },
    ],
  });
  if (cancelled(action)) return;

  console.log();
  const args = await prompters[action]?.();
  if (!args) return;

  process.argv = [process.argv[0], process.argv[1], ...args];
  return runMain(main);
}

const main = defineCommand({
  meta: { name: "notar", description: "Ed25519 file signing and verification CLI", version: VERSION },
  subCommands: { keygen, sign, verify },
});

const hasSubCommand = process.argv.slice(2).some((a) => ["keygen", "sign", "verify"].includes(a));
if (hasSubCommand) {
  runMain(main);
} else {
  interactive();
}
