import * as ed from "@noble/ed25519";
import * as fm from "./front-matter.js";
import { unzipSync } from "fflate";
import { base64ToUint8 } from "./utils.js";
import { parseFile } from "./sign.js";
import { parsePublisher, dnsName, fetchKeyManifest, displaySafe, type ParsedPublisher } from "./publisher.js";
import {
  VerifyErrorCode,
  type DnsTxtKeyRecord,
  type FileIntegrityResult,
  type KeySource,
  type PackageManifest,
  type PublicKeyEntry,
  type SignatureEntry,
  type SignerResult,
  type VerifyOptions,
  type VerifyResult,
} from "./types.js";

const SIGNATURE_PREFIX = "ed25519:";
const MAX_SIGNATURES = 16;

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

function tooManySignatures(count: number): VerifyResult | null {
  if (count <= MAX_SIGNATURES) return null;
  return {
    valid: false,
    code: VerifyErrorCode.TOO_MANY_SIGNATURES,
    reason: `Too many signatures (${count}); at most ${MAX_SIGNATURES} are verified`,
  };
}

function publisherLabel(publisher: unknown): string {
  return typeof publisher === "string" ? publisher : displaySafe(publisher);
}

// Signature entries come from untrusted files; ZIP manifests are raw JSON with no type guarantees.
function checkEntrySignature(entry: SignatureEntry): { sig: Uint8Array } | { reason: string } {
  const e = entry as unknown as Record<string, unknown> | null;
  if (!e || typeof e.value !== "string" || !e.value.startsWith(SIGNATURE_PREFIX)) {
    return { reason: "Signature does not start with ed25519: prefix" };
  }
  if (e.keyId !== undefined && e.keyId !== null && typeof e.keyId !== "string") return { reason: "keyId must be a string" };
  const b64 = e.value.slice(SIGNATURE_PREFIX.length);
  const bytes = /^[A-Za-z0-9+/]+={0,2}$/.test(b64) ? base64ToUint8(b64) : null;
  if (bytes?.length !== 64) return { reason: "Signature is not a valid ed25519 signature" };
  return { sig: bytes };
}

async function safeVerify(sig: Uint8Array, payload: Uint8Array, publicKeyB64: string): Promise<boolean> {
  try {
    const publicKey = base64ToUint8(publicKeyB64);
    if (publicKey.length !== 32) return false;
    return await ed.verifyAsync(sig, payload, publicKey);
  } catch {
    return false;
  }
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
  const tooMany = tooManySignatures(signatures.length);
  if (tooMany) return tooMany;

  const basePayload = buildMdBasePayload(content);
  const signers: SignerResult[] = [];
  let anyValid = false;

  for (const entry of signatures) {
    // The publisher is part of the signed payload; a non-string would be coerced to the same bytes.
    const checked = typeof entry?.publisher === "string" ? checkEntrySignature(entry) : { reason: "publisher must be a string" };
    if ("reason" in checked) {
      signers.push({
        keyId: publisherLabel(entry?.keyId),
        publisher: publisherLabel(entry?.publisher),
        valid: false,
        code: VerifyErrorCode.MALFORMED_SIGNATURE,
        reason: checked.reason,
      });
      continue;
    }
    const sigBytes = checked.sig;
    const payloadBytes = scopePayload(basePayload, entry.publisher);
    const valid = await ed.verifyAsync(sigBytes, payloadBytes, publicKey).catch(() => false);
    signers.push({
      keyId: entry.keyId,
      publisher: publisherLabel(entry.publisher),
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

function findUnexpectedFiles(
  manifest: PackageManifest,
  files: Map<string, Uint8Array>,
): FileIntegrityResult[] {
  const allowed = new Set(Object.keys(manifest.files));
  const extras: FileIntegrityResult[] = [];
  for (const path of files.keys()) {
    if (path === "MANIFEST.json") continue;
    if (!allowed.has(path)) {
      extras.push({ path, valid: false, code: VerifyErrorCode.UNEXPECTED_FILE });
    }
  }
  return extras;
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
  const tooMany = tooManySignatures(signatures.length);
  if (tooMany) return tooMany;

  const manifestWithoutSig = { ...manifest } as Record<string, unknown>;
  delete manifestWithoutSig.signatures;
  const baseSignable = canonicalJson(manifestWithoutSig);

  const signers: SignerResult[] = [];
  let anyValid = false;

  for (const entry of signatures) {
    // The publisher is part of the signed payload; a non-string would be coerced to the same bytes.
    const checked = typeof entry?.publisher === "string" ? checkEntrySignature(entry) : { reason: "publisher must be a string" };
    if ("reason" in checked) {
      signers.push({
        keyId: publisherLabel(entry?.keyId),
        publisher: publisherLabel(entry?.publisher),
        valid: false,
        code: VerifyErrorCode.MALFORMED_SIGNATURE,
        reason: checked.reason,
      });
      continue;
    }
    const sigBytes = checked.sig;
    const signableBytes = scopePayload(baseSignable, entry.publisher);
    const valid = await ed.verifyAsync(sigBytes, signableBytes, publicKey).catch(() => false);
    signers.push({
      keyId: entry.keyId,
      publisher: publisherLabel(entry.publisher),
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

  const extras = findUnexpectedFiles(manifest, files);
  const fileResults = [...(await verifyManifestHashes(manifest, files)), ...extras];
  const hasFailedFile = fileResults.some((f) => !f.valid);
  if (hasFailedFile) {
    const firstFailed = fileResults.find((f) => !f.valid)!;
    return {
      valid: false,
      code: firstFailed.code,
      reason: failedFileReason(firstFailed),
      details: { ...docMeta(manifest), signers, files: fileResults },
    };
  }

  return {
    valid: true,
    details: { ...docMeta(manifest), signers, files: fileResults },
  };
}

function failedFileReason(f: FileIntegrityResult): string {
  switch (f.code) {
    case VerifyErrorCode.MISSING_FILE: return `Missing file: ${f.path}`;
    case VerifyErrorCode.UNEXPECTED_FILE: return `Unexpected file not in manifest: ${f.path}`;
    default: return `Hash mismatch for file: ${f.path}`;
  }
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
    const resp = await fetchFn(url, { // class-sweep-allow: fixed DoH endpoint, name is URL-encoded
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
  fqdn: string,
  keyId: string,
  options?: { fetch?: typeof globalThis.fetch; now?: Date },
): Promise<{ key?: PublicKeyEntry; source: "dns"; code?: VerifyErrorCode }> {
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const now = options?.now ?? new Date();

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
  return { fqdn: `notar.${keyId}`, value }; // class-sweep-allow: display-only record name for the key owner
}

// -- Key discovery ------------------------------------------------------------

function isKeyValid(key: PublicKeyEntry, now: Date): boolean {
  return checkKeyValidity(key, now) === null;
}

function requirePublisher(author: string): ParsedPublisher {
  const parsed = parsePublisher(author);
  if (!parsed.ok) throw new Error(`Invalid publisher: ${parsed.reason}`);
  return parsed.value;
}

async function fetchManifestKeys(author: string, options?: VerifyOptions): Promise<PublicKeyEntry[]> {
  const result = await fetchKeyManifest(requirePublisher(author), options);
  if (!result.ok) {
    throw new Error(`Failed to fetch keys${result.url ? ` from ${result.url}` : ""}: ${result.reason}`);
  }
  return result.keys;
}

export async function fetchPublicKeys(
  author: string,
  options?: VerifyOptions,
): Promise<PublicKeyEntry[]> {
  const now = options?.now ?? new Date();
  const keys = await fetchManifestKeys(author, options);
  return keys.filter((key) => isKeyValid(key, now));
}

export async function fetchPublicKey(
  author: string,
  keyId: string,
  options?: VerifyOptions,
): Promise<PublicKeyEntry | undefined> {
  const now = options?.now ?? new Date();
  const keys = await fetchManifestKeys(author, options);
  const key = keys.find((k) => k.keyId === keyId);
  if (!key) return undefined;
  if (!isKeyValid(key, now)) return undefined;
  return key;
}

interface ResolvedKey {
  key?: PublicKeyEntry;
  code?: VerifyErrorCode;
  source?: KeySource;
}

async function resolvePublicKeyFromHttps(
  publisher: ParsedPublisher,
  keyId: string,
  options?: VerifyOptions,
): Promise<ResolvedKey> {
  const now = options?.now ?? new Date();
  const result = await fetchKeyManifest(publisher, options);
  if (!result.ok) return { code: result.code, source: result.transport };

  const key = result.keys.find((k) => k.keyId === keyId);
  if (!key) {
    return { code: VerifyErrorCode.KEY_NOT_FOUND, source: result.transport };
  }

  const validity = checkKeyValidity(key, now);
  if (validity) {
    return { key, code: validity, source: result.transport };
  }

  return { key, source: result.transport };
}

async function resolvePublicKey(
  publisher: ParsedPublisher,
  keyId: string,
  options?: VerifyOptions,
): Promise<ResolvedKey> {
  const resolveTxt = options?.resolveTxt !== false;
  const httpsResult = await resolvePublicKeyFromHttps(publisher, keyId, options);

  // HTTPS is authoritative whenever it produces a definitive answer:
  //  - A key (valid, revoked, or expired).
  //  - KEY_NOT_FOUND from a successful response (publisher's manifest excludes the keyId).
  // DNS is consulted only as a fallback when HTTPS is unreachable
  // (network error, non-OK response, or otherwise no usable answer).
  const httpsAuthoritative =
    !!httpsResult.key || httpsResult.code === VerifyErrorCode.KEY_NOT_FOUND;

  const fqdn = dnsName(publisher, keyId);
  if (!resolveTxt || httpsAuthoritative || !fqdn) {
    return httpsResult;
  }

  const dns = await fetchPublicKeyFromDns(fqdn, keyId, {
    fetch: options?.fetch,
    now: options?.now,
  });
  if (dns.key) {
    return { key: dns.key, code: dns.code, source: "dns" };
  }
  return httpsResult;
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
  rawPublisher: string,
  publisher: ParsedPublisher,
  options?: VerifyOptions,
): Promise<SignerResult> {
  const candidates: Array<{ key: PublicKeyEntry; source: KeySource }> = [];
  let httpsAvailable = false;
  const now = options?.now ?? new Date();

  const manifest = await fetchKeyManifest(publisher, options);
  if (manifest.ok) {
    httpsAvailable = true;
    for (const key of manifest.keys) {
      if (isKeyValid(key, now)) candidates.push({ key, source: manifest.transport });
    }
  }

  // Only consult DNS when HTTPS is unreachable. Otherwise HTTPS is authoritative
  // (including for revocation), so a now-revoked-but-stale DNS record cannot
  // override the publisher's HTTPS key manifest.
  const fqdn = dnsName(publisher, "key");
  if (!httpsAvailable && options?.resolveTxt !== false && fqdn) {
    const dns = await fetchPublicKeyFromDns(fqdn, "key", {
      fetch: options?.fetch,
      now: options?.now,
    });
    if (dns.key && !dns.code) {
      candidates.push({ key: dns.key, source: "dns" });
    }
  }

  if (candidates.length === 0) {
    return {
      keyId: "",
      publisher: rawPublisher,
      valid: false,
      code: VerifyErrorCode.KEY_NOT_FOUND,
      reason: `No public keys found for ${publisher.canonical}`,
    };
  }

  const payloadBytes = scopePayload(basePayload, rawPublisher);
  for (const { key, source } of candidates) {
    if (await safeVerify(sigBytes, payloadBytes, key.publicKey)) {
      return { keyId: key.keyId, publisher: rawPublisher, valid: true, keySource: source, keyExpires: key.expires };
    }
  }

  return {
    keyId: "",
    publisher: rawPublisher,
    valid: false,
    code: VerifyErrorCode.SIGNATURE_MISMATCH,
    reason: `Signature does not match any of ${candidates.length} key(s) for ${publisher.canonical}`,
  };
}

async function verifySignatureEntry(
  basePayload: string,
  entry: SignatureEntry,
  options?: VerifyOptions,
  expected?: ParsedPublisher,
): Promise<SignerResult> {
  const keyId = typeof entry?.keyId === "string" ? entry.keyId : "";
  const rawPublisher = publisherLabel(entry?.publisher);
  const fail = (code: VerifyErrorCode, reason: string): SignerResult =>
    ({ keyId, publisher: rawPublisher, valid: false, code, reason });

  const checked = checkEntrySignature(entry);
  if ("reason" in checked) return fail(VerifyErrorCode.MALFORMED_SIGNATURE, checked.reason);

  const parsed = parsePublisher(entry.publisher);
  if (!parsed.ok) return fail(VerifyErrorCode.INVALID_PUBLISHER, `Invalid publisher: ${parsed.reason}`);
  const publisher = parsed.value;

  if (expected && publisher.canonical !== expected.canonical) {
    return fail(VerifyErrorCode.UNTRUSTED_PUBLISHER, "Not evaluated: publisher is not the expected publisher");
  }
  if (publisher.local && !options?.allowInsecureLocalhost) {
    return fail(VerifyErrorCode.INVALID_PUBLISHER, `Local publisher ${publisher.canonical} requires allowInsecureLocalhost`);
  }

  const sigBytes = checked.sig;

  if (!keyId) {
    return tryAllKeys(basePayload, sigBytes, rawPublisher, publisher, options);
  }

  const resolved = await resolvePublicKey(publisher, keyId, options);

  if (!resolved.key) {
    return {
      keyId,
      publisher: rawPublisher,
      valid: false,
      code: resolved.code ?? VerifyErrorCode.KEY_NOT_FOUND,
      reason: `Could not resolve public key for ${publisher.canonical} (${keyId})`,
      keySource: resolved.source,
    };
  }

  if (resolved.code === VerifyErrorCode.KEY_EXPIRED || resolved.code === VerifyErrorCode.KEY_REVOKED) {
    return {
      keyId,
      publisher: rawPublisher,
      valid: false,
      code: resolved.code,
      reason: resolved.code === VerifyErrorCode.KEY_EXPIRED
        ? `Key ${keyId} has expired`
        : `Key ${keyId} has been revoked`,
      keySource: resolved.source,
      keyExpires: resolved.key.expires,
    };
  }

  const payloadBytes = scopePayload(basePayload, rawPublisher);
  const valid = await safeVerify(sigBytes, payloadBytes, resolved.key.publicKey);

  return {
    keyId,
    publisher: rawPublisher,
    valid,
    keySource: resolved.source,
    keyExpires: resolved.key.expires,
    ...(!valid && {
      code: VerifyErrorCode.SIGNATURE_MISMATCH,
      reason: "Signature does not match content",
    }),
  };
}

interface KeylessVerdict {
  valid: boolean;
  code?: VerifyErrorCode;
  reason?: string;
  identityVerified: boolean;
  trustedPublisher?: string;
}

function canonicalPublisher(value: string): string | undefined {
  const parsed = parsePublisher(value);
  return parsed.ok ? parsed.value.canonical : undefined;
}

// A keyless verdict requires every signature, unless scoped to an expected publisher.
function computeKeylessVerdict(
  signers: SignerResult[],
  expected?: ParsedPublisher,
): KeylessVerdict {
  if (expected) {
    const scoped = signers.filter((s) => canonicalPublisher(s.publisher) === expected.canonical);
    if (scoped.length === 0) {
      return {
        valid: false,
        code: VerifyErrorCode.UNTRUSTED_PUBLISHER,
        reason: `No signature from expected publisher "${expected.canonical}"`,
        identityVerified: false,
      };
    }
    const failing = scoped.find((s) => !s.valid);
    if (failing) {
      return {
        valid: false,
        code: failing.code ?? VerifyErrorCode.SIGNATURE_MISMATCH,
        reason: failing.reason ?? `Verification failed for expected publisher "${expected.canonical}"`,
        identityVerified: false,
      };
    }
    return { valid: true, identityVerified: true, trustedPublisher: expected.canonical };
  }

  const failing = signers.find((s) => !s.valid);
  const hasValid = signers.some((s) => s.valid);
  if (signers.length === 0 || failing) {
    return {
      valid: false,
      code: hasValid ? failing?.code ?? VerifyErrorCode.SIGNATURE_MISMATCH : VerifyErrorCode.NO_MATCHING_SIGNATURE,
      reason: hasValid
        ? "One or more signatures failed verification"
        : "No valid signature found",
      identityVerified: false,
    };
  }
  return { valid: true, identityVerified: false };
}

// Checks that run before any network I/O for keyless verification.
function keylessPreflight(
  signatures: unknown,
  noneReason: string,
  options?: VerifyOptions,
): { signatures: SignatureEntry[]; expected?: ParsedPublisher } | VerifyResult {
  if (!Array.isArray(signatures) || signatures.length === 0) {
    return { valid: false, code: VerifyErrorCode.NO_SIGNATURES, reason: noneReason };
  }
  const tooMany = tooManySignatures(signatures.length);
  if (tooMany) return tooMany;
  if (options?.expectedPublisher === undefined) return { signatures };
  const expected = parsePublisher(options.expectedPublisher);
  if (!expected.ok) {
    return { valid: false, code: VerifyErrorCode.INVALID_PUBLISHER, reason: `Invalid expected publisher: ${expected.reason}` };
  }
  return { signatures, expected: expected.value };
}

async function verifyMdFromAuthor(
  raw: string,
  options?: VerifyOptions,
): Promise<VerifyResult> {
  const { data } = parseFile(raw);
  const preflight = keylessPreflight(data.signatures, "No signatures found in front matter", options);
  if ("valid" in preflight) return preflight;
  const { signatures, expected } = preflight;

  const basePayload = buildMdBasePayload(raw);

  const signers = await Promise.all(
    signatures.map((entry) => verifySignatureEntry(basePayload, entry, options, expected)),
  );

  const verdict = computeKeylessVerdict(signers, expected);
  const details = {
    ...docMeta(data),
    signers,
    identityVerified: verdict.identityVerified,
    ...(verdict.trustedPublisher && { trustedPublisher: verdict.trustedPublisher }),
  };
  if (!verdict.valid) {
    return { valid: false, code: verdict.code, reason: verdict.reason, details };
  }
  return { valid: true, details };
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
  const preflight = keylessPreflight(manifest.signatures, "No signatures found in manifest", options);
  if ("valid" in preflight) return preflight;
  const { signatures, expected } = preflight;

  const manifestWithoutSig = { ...manifest } as Record<string, unknown>;
  delete manifestWithoutSig.signatures;
  const baseSignable = canonicalJson(manifestWithoutSig);

  const signers = await Promise.all(
    signatures.map((entry) => verifySignatureEntry(baseSignable, entry, options, expected)),
  );

  const verdict = computeKeylessVerdict(signers, expected);
  const identity = {
    identityVerified: verdict.identityVerified,
    ...(verdict.trustedPublisher && { trustedPublisher: verdict.trustedPublisher }),
  };
  if (!verdict.valid) {
    return {
      valid: false,
      code: verdict.code,
      reason: verdict.reason,
      details: { ...docMeta(manifest), signers, ...identity },
    };
  }

  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    files.set(path, data);
  }

  const extras = findUnexpectedFiles(manifest, files);
  const fileResults = [...(await verifyManifestHashes(manifest, files)), ...extras];
  const hasFailedFile = fileResults.some((f) => !f.valid);
  if (hasFailedFile) {
    const firstFailed = fileResults.find((f) => !f.valid)!;
    return {
      valid: false,
      code: firstFailed.code,
      reason: failedFileReason(firstFailed),
      details: {
        ...docMeta(manifest),
        signers,
        files: fileResults,
        identityVerified: false,
      },
    };
  }

  return {
    valid: true,
    details: { ...docMeta(manifest), signers, files: fileResults, ...identity },
  };
}
