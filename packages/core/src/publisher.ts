import { base64ToUint8 } from "./utils.js";
import { VerifyErrorCode, type PublicKeyEntry } from "./types.js";

// Every publisher, keyId, and key manifest read from a signed artifact is attacker input.
// All host parsing, URL/DNS-name construction, and key-manifest fetching lives here.

export interface ParsedPublisher {
  host: string;
  port?: number;
  local: boolean;
  canonical: string;
}

export type PublisherParseResult =
  | { ok: true; value: ParsedPublisher }
  | { ok: false; reason: string };

export type Transport = "https" | "http";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}
const PRINTABLE_ASCII = /^[\x21-\x7E]+$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PORT = /^[1-9][0-9]{0,4}$/;
const KEY_ID = /^[A-Za-z0-9_-]{1,63}$/;
const MAX_HOST_LENGTH = 253;

function fail(reason: string): PublisherParseResult {
  return { ok: false, reason };
}

export function parsePublisher(input: unknown): PublisherParseResult {
  if (typeof input !== "string") return fail("publisher must be a string");
  if (!PRINTABLE_ASCII.test(input)) return fail("publisher must contain only printable ASCII characters");
  if (/[@/\\?#%[\]]/.test(input)) return fail("publisher must be a bare hostname (no userinfo, path, query, fragment, or encoding)");

  const lower = input.toLowerCase();
  const parts = lower.split(":");
  if (parts.length > 2) return fail("publisher contains more than one ':'");
  const [host, portStr] = parts as [string, string | undefined];
  const local = isLocalHost(host);

  let port: number | undefined;
  if (portStr !== undefined) {
    if (!local) return fail("a port is only allowed for localhost and 127.0.0.1");
    if (!PORT.test(portStr) || Number(portStr) > 65535) return fail("port must be an integer between 1 and 65535");
    port = Number(portStr);
  }

  if (!local) {
    if (host.length > MAX_HOST_LENGTH) return fail("hostname is too long");
    const labels = host.split(".");
    if (labels.length < 2) return fail("hostname must contain at least one dot");
    for (const label of labels) {
      if (!LABEL.test(label)) return fail("hostname labels must be 1-63 letters, digits, or inner hyphens");
      if (label.startsWith("xn--")) return fail("internationalized (punycode) hostnames are not supported");
    }
    if (!/[a-z]/.test(labels[labels.length - 1]!)) return fail("top-level domain must not be numeric");
  }

  // The WHATWG parser must agree with our reading of the host; any rewrite means ambiguity.
  let parsedHost: string;
  try {
    const url = new URL(`https://${host}/`);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return fail("publisher must be a bare hostname");
    }
    parsedHost = url.hostname;
  } catch {
    return fail("publisher is not a valid hostname");
  }
  if (parsedHost !== host) return fail("publisher is not in canonical hostname form");

  const canonical = port === undefined ? host : `${host}:${port}`;
  return { ok: true, value: { host, ...(port !== undefined && { port }), local, canonical } };
}

export function isValidKeyId(keyId: unknown): keyId is string {
  return typeof keyId === "string" && KEY_ID.test(keyId);
}

export type KeysUrlResult =
  | { ok: true; url: string; transport: Transport }
  | { ok: false; reason: string };

export function keysUrl(publisher: ParsedPublisher, allowInsecureLocalhost = false): KeysUrlResult {
  if (publisher.local && !allowInsecureLocalhost) {
    return { ok: false, reason: `local publisher ${publisher.canonical} requires allowInsecureLocalhost` };
  }
  const transport: Transport = publisher.local ? "http" : "https";
  const url = new URL("/.well-known/notar-keys.json", `${transport}://${publisher.canonical}`).href;
  return { ok: true, url, transport };
}

export function dnsName(publisher: ParsedPublisher, keyId: string): string | null {
  if (publisher.local || !isValidKeyId(keyId)) return null;
  return `notar.${keyId}.${publisher.host}`;
}

// -- Key manifest fetch -------------------------------------------------------

const MANIFEST_TIMEOUT_MS = 5000;
const MANIFEST_MAX_BYTES = 64 * 1024;

export interface FetchKeyManifestOptions {
  fetch?: typeof globalThis.fetch;
  allowInsecureLocalhost?: boolean;
  timeoutMs?: number;
}

export type KeyManifestResult =
  | { ok: true; keys: PublicKeyEntry[]; url: string; transport: Transport }
  | { ok: false; code: VerifyErrorCode; reason: string; url?: string; transport?: Transport };

class ManifestError extends Error {
  constructor(readonly code: VerifyErrorCode, message: string) {
    super(message);
  }
}

async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > max) throw new ManifestError(VerifyErrorCode.KEY_FETCH_FAILED, "key manifest is too large");
  if (!res.body) {
    const text = await res.text();
    if (text.length > max) throw new ManifestError(VerifyErrorCode.KEY_FETCH_FAILED, "key manifest is too large");
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new ManifestError(VerifyErrorCode.KEY_FETCH_FAILED, "key manifest is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function isKeyEntry(value: unknown): value is PublicKeyEntry {
  if (!value || typeof value !== "object") return false;
  const k = value as Record<string, unknown>;
  if (typeof k.keyId !== "string" || !k.keyId || k.keyId.length > 128) return false;
  if (k.algorithm !== "ed25519") return false;
  if (typeof k.publicKey !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(k.publicKey)) return false;
  if (base64ToUint8(k.publicKey).length !== 32) return false;
  if (typeof k.expires !== "string" || Number.isNaN(Date.parse(k.expires))) return false;
  if (k.revoked !== undefined && typeof k.revoked !== "boolean") return false;
  return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ManifestError(VerifyErrorCode.NETWORK_ERROR, "key manifest request timed out"));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function fetchKeyManifest(
  publisher: ParsedPublisher,
  options?: FetchKeyManifestOptions,
): Promise<KeyManifestResult> {
  const target = keysUrl(publisher, options?.allowInsecureLocalhost);
  if (!target.ok) return { ok: false, code: VerifyErrorCode.INVALID_PUBLISHER, reason: target.reason };
  const { url, transport } = target;
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const controller = new AbortController();

  try {
    const keys = await withTimeout((async () => {
      let res: Response;
      try {
        // "manual" instead of "error": workerd rejects redirect:"error". Every redirect shape is refused below.
        res = await fetchFn(url, { redirect: "manual", signal: controller.signal });
      } catch {
        throw new ManifestError(VerifyErrorCode.NETWORK_ERROR, `failed to fetch ${url}`);
      }
      if (res.redirected || (res.url && res.url !== url)) {
        throw new ManifestError(VerifyErrorCode.KEY_FETCH_FAILED, "key manifest request was redirected");
      }
      if (res.type === "opaqueredirect" || res.status === 0 || (res.status >= 300 && res.status < 400)) {
        throw new ManifestError(VerifyErrorCode.KEY_FETCH_FAILED, "key manifest redirects are not followed");
      }
      if (!res.ok) throw new ManifestError(VerifyErrorCode.KEY_FETCH_FAILED, `key manifest returned HTTP ${res.status}`);

      let manifest: unknown;
      try {
        manifest = JSON.parse(await readCapped(res, MANIFEST_MAX_BYTES));
      } catch (e) {
        if (e instanceof ManifestError) throw e;
        throw new ManifestError(VerifyErrorCode.KEY_FETCH_FAILED, "key manifest is not valid JSON");
      }
      const list = (manifest as { keys?: unknown } | null)?.keys;
      if (!Array.isArray(list)) throw new ManifestError(VerifyErrorCode.KEY_FETCH_FAILED, "key manifest has no keys array");
      return list.filter(isKeyEntry);
    })(), options?.timeoutMs ?? MANIFEST_TIMEOUT_MS, controller);
    return { ok: true, keys, url, transport };
  } catch (e) {
    if (e instanceof ManifestError) return { ok: false, code: e.code, reason: e.message, url, transport };
    return { ok: false, code: VerifyErrorCode.NETWORK_ERROR, reason: `failed to fetch ${url}`, url, transport };
  } finally {
    controller.abort();
  }
}

// -- Display ------------------------------------------------------------------

const NAMED_ESCAPES: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const FORMAT_CHARS = new Set([0xad, 0x61c, 0x180e, 0xfeff]);

// C0/C1 controls plus invisible and bidi formatting characters that can spoof terminal or UI output.
function isUnsafeChar(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || FORMAT_CHARS.has(code)
    || (code >= 0x200b && code <= 0x200f) || (code >= 0x2028 && code <= 0x202e) || (code >= 0x2060 && code <= 0x2069);
}

export function displaySafe(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (!isUnsafeChar(code)) {
      out += ch;
      continue;
    }
    out += NAMED_ESCAPES[ch] ?? (code <= 0xff ? `\\x${code.toString(16).padStart(2, "0")}` : `\\u${code.toString(16).padStart(4, "0")}`);
  }
  return out;
}
