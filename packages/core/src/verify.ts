import * as ed from "@noble/ed25519";
import * as fm from "./front-matter.js";
import { unzipSync } from "fflate";
import { base64ToUint8 } from "./utils.js";
import { parseFile } from "./sign.js";
import {
  VerifyErrorCode,
  type DnsTxtKeyRecord,
  type FileIntegrityResult,
  type KeyManifest,
  type PackageManifest,
  type PublicKeyEntry,
  type SignatureEntry,
  type SignerResult,
  type VerifyOptions,
  type VerifyResult,
} from "./types.js";

const SIGNATURE_PREFIX = "ed25519:";

// -- Helpers ------------------------------------------------------------------

function buildMdBasePayload(raw: string): string {
  const { data } = parseFile(raw);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(data).sort()) {
    if (key === "signatures") continue;
    sorted[key] = data[key];
  }
  const { content } = fm.parse(raw);
  return JSON.stringify(sorted) + "\n" + content.trim();
}

function scopePayload(basePayload: string, publisher: string): Uint8Array {
  return new TextEncoder().encode(publisher + "\n" + basePayload);
}

function canonicalJson(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {});
  return JSON.stringify(sorted, null, 2);
}

function checkKeyValidity(
  key: PublicKeyEntry,
  now: Date,
): VerifyErrorCode | null {
  if (key.revoked) return VerifyErrorCode.KEY_REVOKED;
  if (new Date(key.expires) <= now) return VerifyErrorCode.KEY_EXPIRED;
  return null;
}

function docMeta(src: { name?: string; description?: string; version?: string; author?: string }) {
  return {
    name: src.name,
    description: src.description,
    version: src.version,
    author: src.author,
  };
}

// -- Markdown verification ----------------------------------------------------

export async function verifyFile(
  content: string,
  publicKey: Uint8Array,
): Promise<VerifyResult> {
  const { data } = parseFile(content);
  const signatures = data.signatures;

  if (!signatures || signatures.length === 0) {
    return {
      valid: false,
      code: VerifyErrorCode.NO_SIGNATURES,
      reason: "No signatures found in front matter",
    };
  }

  const basePayload = buildMdBasePayload(content);
  const signers: SignerResult[] = [];
  let anyValid = false;

  for (const entry of signatures) {
    if (!entry.value.startsWith(SIGNATURE_PREFIX)) {
      signers.push({
        keyId: entry.keyId,
        publisher: entry.publisher,
        valid: false,
        code: VerifyErrorCode.MALFORMED_SIGNATURE,
        reason: "Signature does not start with ed25519: prefix",
      });
      continue;
    }
    const sigBytes = base64ToUint8(entry.value.slice(SIGNATURE_PREFIX.length));
    const payloadBytes = scopePayload(basePayload, entry.publisher);
    const valid = await ed.verifyAsync(sigBytes, payloadBytes, publicKey);
    signers.push({
      keyId: entry.keyId,
      publisher: entry.publisher,
      valid,
      ...(!valid && {
        code: VerifyErrorCode.SIGNATURE_MISMATCH,
        reason: "Signature does not match content with provided key",
      }),
    });
    if (valid) anyValid = true;
  }

  if (!anyValid) {
    return {
      valid: false,
      code: VerifyErrorCode.NO_MATCHING_SIGNATURE,
      reason: "No matching signature for provided key",
      details: { ...docMeta(data), signers },
    };
  }

  return { valid: true, details: { ...docMeta(data), signers } };
}

// -- Manifest hash verification -----------------------------------------------

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyManifestHashes(
  manifest: PackageManifest,
  files: Map<string, Uint8Array>,
): Promise<FileIntegrityResult[]> {
  const results: FileIntegrityResult[] = [];
  for (const [path, expectedHash] of Object.entries(manifest.files)) {
    const fileData = files.get(path);
    if (!fileData) {
      results.push({
        path,
        valid: false,
        code: VerifyErrorCode.MISSING_FILE,
        expectedHash,
      });
      continue;
    }
    const actualHash = `sha256:${await sha256Hex(fileData)}`;
    if (actualHash !== expectedHash) {
      results.push({
        path,
        valid: false,
        code: VerifyErrorCode.HASH_MISMATCH,
        expectedHash,
        actualHash,
      });
    } else {
      results.push({ path, valid: true, expectedHash, actualHash });
    }
  }
  return results;
}

// -- ZIP package verification -------------------------------------------------

export async function verifyPackage(
  zipBytes: Uint8Array,
  publicKey: Uint8Array,
): Promise<VerifyResult> {
  const entries = unzipSync(zipBytes);
  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    files.set(path, data);
  }

  const manifestBytes = files.get("MANIFEST.json");
  if (!manifestBytes) {
    return {
      valid: false,
      code: VerifyErrorCode.MISSING_MANIFEST,
      reason: "Missing MANIFEST.json in package",
    };
  }

  const manifest: PackageManifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  const signatures = manifest.signatures;

  if (!signatures || signatures.length === 0) {
    return {
      valid: false,
      code: VerifyErrorCode.NO_SIGNATURES,
      reason: "No signatures found in manifest",
    };
  }

  const manifestWithoutSig = { ...manifest } as Record<string, unknown>;
  delete manifestWithoutSig.signatures;
  const baseSignable = canonicalJson(manifestWithoutSig);

  const signers: SignerResult[] = [];
  let anyValid = false;

  for (const entry of signatures) {
    if (!entry.value.startsWith(SIGNATURE_PREFIX)) {
      signers.push({
        keyId: entry.keyId,
        publisher: entry.publisher,
        valid: false,
        code: VerifyErrorCode.MALFORMED_SIGNATURE,
        reason: "Signature does not start with ed25519: prefix",
      });
      continue;
    }
    const sigBytes = base64ToUint8(entry.value.slice(SIGNATURE_PREFIX.length));
    const signableBytes = scopePayload(baseSignable, entry.publisher);
    const valid = await ed.verifyAsync(sigBytes, signableBytes, publicKey);
    signers.push({
      keyId: entry.keyId,
      publisher: entry.publisher,
      valid,
      ...(!valid && {
        code: VerifyErrorCode.SIGNATURE_MISMATCH,
        reason: "Signature does not match content with provided key",
      }),
    });
    if (valid) anyValid = true;
  }

  if (!anyValid) {
    return {
      valid: false,
      code: VerifyErrorCode.NO_MATCHING_SIGNATURE,
      reason: "No matching signature for provided key",
      details: { ...docMeta(manifest), signers },
    };
  }

  const fileResults = await verifyManifestHashes(manifest, files);
  const hasFailedFile = fileResults.some((f) => !f.valid);
  if (hasFailedFile) {
    const firstFailed = fileResults.find((f) => !f.valid)!;
    return {
      valid: false,
      code: firstFailed.code,
      reason: firstFailed.code === VerifyErrorCode.MISSING_FILE
        ? `Missing file: ${firstFailed.path}`
        : `Hash mismatch for file: ${firstFailed.path}`,
      details: { ...docMeta(manifest), signers, files: fileResults },
    };
  }

  return {
    valid: true,
    details: { ...docMeta(manifest), signers, files: fileResults },
  };
}

// -- DNS TXT ------------------------------------------------------------------

export function parseDnsTxtRecord(txt: string): DnsTxtKeyRecord | null {
  if (!txt || typeof txt !== "string") return null;

  const tags = new Map<string, string>();
  for (const part of txt.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) return null;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    tags.set(key, value);
  }

  const v = tags.get("v");
  const k = tags.get("k");
  const p = tags.get("p");
  const exp = tags.get("exp");

  if (!v || !k || !p || !exp) return null;
  if (v !== "sk1") return null;
  if (k !== "ed25519") return null;

  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum <= 0) return null;

  return { version: v, algorithm: k, publicKey: p, expires: expNum };
}

interface DohResponse {
  Status: number;
  Answer?: Array<{ type: number; data: string }>;
}

async function queryDnsTxt(
  name: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`;
    const resp = await fetchFn(url, {
      headers: { accept: "application/dns-json" },
      signal,
    });
    if (!resp.ok) return [];

    const data = (await resp.json()) as DohResponse;
    if (data.Status !== 0 || !data.Answer) return [];

    return data.Answer.filter((a) => a.type === 16).map((a) => a.data.replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}

async function fetchPublicKeyFromDns(
  author: string,
  keyId: string,
  options?: { fetch?: typeof globalThis.fetch; now?: Date },
): Promise<{ key?: PublicKeyEntry; source: "dns"; code?: VerifyErrorCode }> {
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const now = options?.now ?? new Date();

  const fqdn = `notar.${keyId}.${author}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const records = await queryDnsTxt(fqdn, fetchFn, controller.signal);

    for (const txt of records) {
      const parsed = parseDnsTxtRecord(txt);
      if (!parsed) continue;

      const entry: PublicKeyEntry = {
        keyId,
        algorithm: "ed25519",
        publicKey: parsed.publicKey,
        expires: new Date(parsed.expires * 1000).toISOString(),
      };

      const validity = checkKeyValidity(entry, now);
      if (validity) {
        return { key: entry, source: "dns", code: validity };
      }

      return { key: entry, source: "dns" };
    }

    return { source: "dns", code: VerifyErrorCode.KEY_NOT_FOUND };
  } catch {
    return { source: "dns", code: VerifyErrorCode.DNS_RESOLUTION_FAILED };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatDnsTxtRecord(
  keyId: string,
  publicKeyBase64: string,
  expiresUnix: number,
): { fqdn: string; value: string } {
  const value = `v=sk1; k=ed25519; p=${publicKeyBase64}; exp=${expiresUnix}`;
  return { fqdn: `notar.${keyId}`, value };
}

// -- Key discovery ------------------------------------------------------------

function isLocal(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function keysUrl(author: string): string {
  const protocol = isLocal(author) ? "http" : "https";
  return `${protocol}://${author}/.well-known/notar-keys.json`;
}

function isKeyValid(key: PublicKeyEntry, now: Date): boolean {
  return checkKeyValidity(key, now) === null;
}

export async function fetchPublicKeys(
  author: string,
  options?: VerifyOptions,
): Promise<PublicKeyEntry[]> {
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const now = options?.now ?? new Date();
  const url = keysUrl(author);

  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch keys from ${url}: ${response.status}`);
  }

  const manifest = (await response.json()) as KeyManifest;
  return manifest.keys.filter((key) => isKeyValid(key, now));
}

export async function fetchPublicKey(
  author: string,
  keyId: string,
  options?: VerifyOptions,
): Promise<PublicKeyEntry | undefined> {
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const now = options?.now ?? new Date();
  const url = keysUrl(author);

  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch keys from ${url}: ${response.status}`);
  }

  const manifest = (await response.json()) as KeyManifest;
  const key = manifest.keys.find((k) => k.keyId === keyId);
  if (!key) return undefined;
  if (!isKeyValid(key, now)) return undefined;
  return key;
}

interface ResolvedKey {
  key?: PublicKeyEntry;
  code?: VerifyErrorCode;
  source?: "https" | "dns";
}

async function resolvePublicKeyFromHttps(
  author: string,
  keyId: string,
  options?: VerifyOptions,
): Promise<ResolvedKey> {
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const now = options?.now ?? new Date();
  const url = keysUrl(author);

  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      return { code: VerifyErrorCode.KEY_FETCH_FAILED, source: "https" };
    }

    const manifest = (await response.json()) as KeyManifest;
    const key = manifest.keys.find((k) => k.keyId === keyId);
    if (!key) {
      return { code: VerifyErrorCode.KEY_NOT_FOUND, source: "https" };
    }

    const validity = checkKeyValidity(key, now);
    if (validity) {
      return { key, code: validity, source: "https" };
    }

    return { key, source: "https" };
  } catch {
    return { code: VerifyErrorCode.NETWORK_ERROR, source: "https" };
  }
}

async function resolvePublicKey(
  author: string,
  keyId: string,
  options?: VerifyOptions,
): Promise<ResolvedKey> {
  const resolveTxt = options?.resolveTxt !== false;

  const httpsPromise = resolvePublicKeyFromHttps(author, keyId, options);

  if (!resolveTxt) {
    return httpsPromise;
  }

  const dnsPromise = fetchPublicKeyFromDns(author, keyId, {
    fetch: options?.fetch,
    now: options?.now,
  }).then((r): ResolvedKey => ({
    key: r.key,
    code: r.code,
    source: r.source,
  }));

  try {
    return await Promise.any([
      httpsPromise.then((r) => r.key ? r : Promise.reject(r)),
      dnsPromise.then((r) => r.key ? r : Promise.reject(r)),
    ]);
  } catch {
    // Both failed — return HTTPS result for its error info
    const httpsResult = await httpsPromise;
    return httpsResult;
  }
}

// -- Unified verify -----------------------------------------------------------

export async function verify(
  input: string | Uint8Array,
  publicKey: Uint8Array,
): Promise<VerifyResult> {
  if (typeof input === "string") return verifyFile(input, publicKey);
  return verifyPackage(input, publicKey);
}

// -- Verify from author (unified) ---------------------------------------------

export async function verifyFromAuthor(
  input: string | Uint8Array,
  options?: VerifyOptions,
): Promise<VerifyResult> {
  if (typeof input === "string") {
    return verifyMdFromAuthor(input, options);
  }
  return verifyZipFromAuthor(input, options);
}

async function tryAllKeys(
  basePayload: string,
  sigBytes: Uint8Array,
  publisher: string,
  options?: VerifyOptions,
): Promise<SignerResult> {
  const candidates: Array<{ key: PublicKeyEntry; source: "https" | "dns" }> = [];

  try {
    const keys = await fetchPublicKeys(publisher, options);
    for (const key of keys) candidates.push({ key, source: "https" });
  } catch { /* HTTPS unavailable */ }

  if (options?.resolveTxt !== false) {
    const dns = await fetchPublicKeyFromDns(publisher, "key", {
      fetch: options?.fetch,
      now: options?.now,
    });
    if (dns.key && !dns.code) {
      const dup = candidates.some((c) => c.key.publicKey === dns.key!.publicKey);
      if (!dup) candidates.push({ key: dns.key, source: "dns" });
    }
  }

  if (candidates.length === 0) {
    return {
      keyId: "",
      publisher,
      valid: false,
      code: VerifyErrorCode.KEY_NOT_FOUND,
      reason: `No public keys found for ${publisher}`,
    };
  }

  const payloadBytes = scopePayload(basePayload, publisher);
  for (const { key, source } of candidates) {
    const pubKey = base64ToUint8(key.publicKey);
    const valid = await ed.verifyAsync(sigBytes, payloadBytes, pubKey);
    if (valid) {
      return { keyId: key.keyId, publisher, valid: true, keySource: source, keyExpires: key.expires };
    }
  }

  return {
    keyId: "",
    publisher,
    valid: false,
    code: VerifyErrorCode.SIGNATURE_MISMATCH,
    reason: `Signature does not match any of ${candidates.length} key(s) for ${publisher}`,
  };
}

async function verifySignatureEntry(
  basePayload: string,
  entry: SignatureEntry,
  options?: VerifyOptions,
): Promise<SignerResult> {
  const publisher = entry.publisher;

  if (!entry.value.startsWith(SIGNATURE_PREFIX)) {
    return {
      keyId: entry.keyId,
      publisher,
      valid: false,
      code: VerifyErrorCode.MALFORMED_SIGNATURE,
      reason: "Signature does not start with ed25519: prefix",
    };
  }

  const sigBytes = base64ToUint8(entry.value.slice(SIGNATURE_PREFIX.length));

  if (!entry.keyId) {
    return tryAllKeys(basePayload, sigBytes, publisher, options);
  }

  const resolved = await resolvePublicKey(publisher, entry.keyId, options);

  if (!resolved.key) {
    return {
      keyId: entry.keyId,
      publisher,
      valid: false,
      code: resolved.code ?? VerifyErrorCode.KEY_NOT_FOUND,
      reason: `Could not resolve public key for ${publisher} (${entry.keyId})`,
      keySource: resolved.source,
    };
  }

  if (resolved.code === VerifyErrorCode.KEY_EXPIRED || resolved.code === VerifyErrorCode.KEY_REVOKED) {
    return {
      keyId: entry.keyId,
      publisher,
      valid: false,
      code: resolved.code,
      reason: resolved.code === VerifyErrorCode.KEY_EXPIRED
        ? `Key ${entry.keyId} has expired`
        : `Key ${entry.keyId} has been revoked`,
      keySource: resolved.source,
      keyExpires: resolved.key.expires,
    };
  }

  const publicKey = base64ToUint8(resolved.key.publicKey);
  const payloadBytes = scopePayload(basePayload, publisher);
  const valid = await ed.verifyAsync(sigBytes, payloadBytes, publicKey);

  return {
    keyId: entry.keyId,
    publisher,
    valid,
    keySource: resolved.source,
    keyExpires: resolved.key.expires,
    ...(!valid && {
      code: VerifyErrorCode.SIGNATURE_MISMATCH,
      reason: "Signature does not match content",
    }),
  };
}

async function verifyMdFromAuthor(
  raw: string,
  options?: VerifyOptions,
): Promise<VerifyResult> {
  const { data } = parseFile(raw);
  const signatures = data.signatures;
  if (!signatures || signatures.length === 0) {
    return {
      valid: false,
      code: VerifyErrorCode.NO_SIGNATURES,
      reason: "No signatures found in front matter",
    };
  }

  const basePayload = buildMdBasePayload(raw);

  const signers = await Promise.all(
    signatures.map((entry) => verifySignatureEntry(basePayload, entry, options)),
  );

  const anyValid = signers.some((s) => s.valid);
  if (!anyValid) {
    return {
      valid: false,
      code: VerifyErrorCode.NO_MATCHING_SIGNATURE,
      reason: "No valid signature found",
      details: { ...docMeta(data), signers },
    };
  }
  return { valid: true, details: { ...docMeta(data), signers } };
}

async function verifyZipFromAuthor(
  zip: Uint8Array,
  options?: VerifyOptions,
): Promise<VerifyResult> {
  const entries = unzipSync(zip);
  const manifestBytes = entries["MANIFEST.json"];
  if (!manifestBytes) {
    return {
      valid: false,
      code: VerifyErrorCode.MISSING_MANIFEST,
      reason: "Missing MANIFEST.json in package",
    };
  }

  const manifest: PackageManifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  const signatures = manifest.signatures;
  if (!signatures || signatures.length === 0) {
    return {
      valid: false,
      code: VerifyErrorCode.NO_SIGNATURES,
      reason: "No signatures found in manifest",
    };
  }

  const manifestWithoutSig = { ...manifest } as Record<string, unknown>;
  delete manifestWithoutSig.signatures;
  const baseSignable = canonicalJson(manifestWithoutSig);

  const signers = await Promise.all(
    signatures.map((entry) => verifySignatureEntry(baseSignable, entry, options)),
  );

  const anyValid = signers.some((s) => s.valid);
  if (!anyValid) {
    return {
      valid: false,
      code: VerifyErrorCode.NO_MATCHING_SIGNATURE,
      reason: "No valid signature found",
      details: { ...docMeta(manifest), signers },
    };
  }

  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    files.set(path, data);
  }

  const fileResults = await verifyManifestHashes(manifest, files);
  const hasFailedFile = fileResults.some((f) => !f.valid);
  if (hasFailedFile) {
    const firstFailed = fileResults.find((f) => !f.valid)!;
    return {
      valid: false,
      code: firstFailed.code,
      reason: firstFailed.code === VerifyErrorCode.MISSING_FILE
        ? `Missing file: ${firstFailed.path}`
        : `Hash mismatch for file: ${firstFailed.path}`,
      details: { ...docMeta(manifest), signers, files: fileResults },
    };
  }

  return {
    valid: true,
    details: { ...docMeta(manifest), signers, files: fileResults },
  };
}
