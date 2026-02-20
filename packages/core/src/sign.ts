import * as ed from "@noble/ed25519";
import * as fm from "./front-matter.js";
import { unzipSync, zipSync } from "fflate";
import { uint8ToBase64, base64ToUint8 } from "./utils.js";
import type {
  FrontMatter,
  KeyManifest,
  PackageManifest,
  PackageMetadata,
  SignatureEntry,
  SignFileOptions,
  ValidateSigningKeyOptions,
} from "./types.js";

const SIGNATURE_PREFIX = "ed25519:";
const EXCLUDED_FILES = new Set(["MANIFEST.json"]);

// -- Canonical parsing --------------------------------------------------------

export function parseFile(raw: string): { data: FrontMatter; body: string } {
  const parsed = fm.parse(raw);
  const data = parsed.data as FrontMatter;
  if (!data.name || !data.description || !data.version) {
    throw new Error("File must have name, description, and version in front matter");
  }
  return { data, body: parsed.content };
}

export function buildSignablePayload(raw: string, publisher: string): string {
  const { data, body } = parseFile(raw);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(data).sort()) {
    if (key === "signatures") continue;
    sorted[key] = data[key];
  }
  return publisher + "\n" + JSON.stringify(sorted) + "\n" + body.trim();
}

// -- Markdown signing ---------------------------------------------------------

export async function signFile(
  content: string,
  privateKey: Uint8Array,
  opts: SignFileOptions,
): Promise<string> {
  const { data, body } = parseFile(content);
  const resolvedPublisher = opts.publisher ?? data.author;
  if (!resolvedPublisher) {
    throw new Error("Publisher is required: provide opts.publisher or set author in front matter");
  }
  const payload = buildSignablePayload(content, resolvedPublisher);
  const payloadBytes = new TextEncoder().encode(payload);
  const signature = await ed.signAsync(payloadBytes, privateKey);
  const signatureStr = `${SIGNATURE_PREFIX}${uint8ToBase64(signature)}`;

  const resolvedKeyId = opts.keyId ?? "";
  const existing = (data.signatures ?? []).filter(
    (s) => !(s.keyId === resolvedKeyId && s.publisher === resolvedPublisher),
  );
  const entry: SignatureEntry = { keyId: resolvedKeyId, publisher: resolvedPublisher, value: signatureStr };

  const signedData: Record<string, unknown> = { ...data, signatures: [...existing, entry] };
  delete signedData.signature;

  return fm.stringify(body, signedData);
}

// -- Manifest -----------------------------------------------------------------

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalJson(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {});
  return JSON.stringify(sorted, null, 2);
}

export async function buildManifest(
  files: Map<string, Uint8Array>,
  metadata: PackageMetadata,
): Promise<PackageManifest> {
  const fileHashes: Record<string, string> = {};
  const sortedPaths = [...files.keys()].filter((p) => !EXCLUDED_FILES.has(p)).sort();

  for (const path of sortedPaths) {
    const hash = await sha256Hex(files.get(path)!);
    fileHashes[path] = `sha256:${hash}`;
  }

  return {
    name: metadata.name,
    description: metadata.description,
    version: metadata.version,
    author: metadata.author,
    files: fileHashes,
  };
}

// -- ZIP package signing ------------------------------------------------------

function extractFiles(zip: Uint8Array): Map<string, Uint8Array> {
  const entries = unzipSync(zip);
  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    files.set(path, data);
  }
  return files;
}

function packFiles(files: Map<string, Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, data] of files) {
    entries[path] = data;
  }
  return zipSync(entries);
}

export async function signPackage(
  zipBytes: Uint8Array,
  metadata: PackageMetadata,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  const files = extractFiles(zipBytes);

  const manifest = await buildManifest(files, metadata);
  const manifestWithoutSig = { ...manifest } as Record<string, unknown>;
  delete manifestWithoutSig.signatures;
  const resolvedPublisher = metadata.publisher ?? metadata.author;
  if (!resolvedPublisher) {
    throw new Error("Publisher is required: provide metadata.publisher or metadata.author");
  }
  const signable = resolvedPublisher + "\n" + canonicalJson(manifestWithoutSig);
  const signableBytes = new TextEncoder().encode(signable);

  const signature = await ed.signAsync(signableBytes, privateKey);
  const signatureStr = `${SIGNATURE_PREFIX}${uint8ToBase64(signature)}`;

  let existingSignatures: SignatureEntry[] = [];
  const oldManifestBytes = files.get("MANIFEST.json");
  if (oldManifestBytes) {
    try {
      const old = JSON.parse(new TextDecoder().decode(oldManifestBytes)) as PackageManifest;
      if (old.signatures) existingSignatures = old.signatures;
    } catch { /* ignore parse errors */ }
  }

  const resolvedKeyId = metadata.keyId ?? "";
  const entry: SignatureEntry = {
    keyId: resolvedKeyId,
    publisher: resolvedPublisher,
    value: signatureStr,
  };

  const deduped = existingSignatures.filter(
    (s) => !(s.keyId === resolvedKeyId && s.publisher === entry.publisher),
  );
  const signedManifest: PackageManifest = { ...manifest, signatures: [...deduped, entry] };
  const signedJson = JSON.stringify(signedManifest, null, 2);

  files.set("MANIFEST.json", new TextEncoder().encode(signedJson));
  files.delete("SIGNATURE"); // remove legacy file if present

  return packFiles(files);
}

// -- Pre-flight validation ----------------------------------------------------

function isLocal(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function keysUrl(publisher: string): string {
  const protocol = isLocal(publisher) ? "http" : "https";
  return `${protocol}://${publisher}/.well-known/notar-keys.json`;
}

export async function validateSigningKey(
  privateKey: Uint8Array,
  publisher: string,
  keyId?: string,
  options?: ValidateSigningKeyOptions,
): Promise<void> {
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const now = options?.now ?? new Date();
  const derivedPub = await ed.getPublicKeyAsync(privateKey);
  const derivedB64 = uint8ToBase64(derivedPub);

  const url = keysUrl(publisher);
  let manifest: KeyManifest;
  try {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = (await res.json()) as KeyManifest;
  } catch (e) {
    throw new Error(`Cannot validate key: failed to fetch ${url} — ${e instanceof Error ? e.message : e}`);
  }

  const candidates = keyId
    ? manifest.keys.filter((k) => k.keyId === keyId)
    : manifest.keys;

  if (candidates.length === 0) {
    throw new Error(keyId
      ? `Key "${keyId}" not found in ${publisher}'s key manifest`
      : `No keys found in ${publisher}'s key manifest`,
    );
  }

  for (const entry of candidates) {
    if (entry.revoked) continue;
    if (new Date(entry.expires) <= now) continue;
    const publishedBytes = base64ToUint8(entry.publicKey);
    if (derivedPub.length === publishedBytes.length && derivedPub.every((b, i) => b === publishedBytes[i])) {
      return; // match found
    }
  }

  if (keyId) {
    const entry = candidates[0];
    if (entry.revoked) throw new Error(`Key "${keyId}" has been revoked by ${publisher}`);
    if (new Date(entry.expires) <= now) throw new Error(`Key "${keyId}" has expired (${entry.expires})`);
    throw new Error(
      `Private key does not match the public key published at ${publisher} for keyId "${keyId}". ` +
      `Derived: ${derivedB64.slice(0, 16)}…, Published: ${entry.publicKey.slice(0, 16)}…`,
    );
  }
  throw new Error(`Private key does not match any valid key in ${publisher}'s key manifest`);
}

// -- Unified sign -------------------------------------------------------------

export async function sign(input: string, privateKey: Uint8Array, opts: SignFileOptions): Promise<string>;
export async function sign(input: Uint8Array, privateKey: Uint8Array, opts: PackageMetadata): Promise<Uint8Array>;
export async function sign(
  input: string | Uint8Array,
  privateKey: Uint8Array,
  opts: SignFileOptions | PackageMetadata,
): Promise<string | Uint8Array> {
  if (typeof input === "string") return signFile(input, privateKey, opts as SignFileOptions);
  return signPackage(input, opts as PackageMetadata, privateKey);
}
