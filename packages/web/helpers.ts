import { fetchKeyManifest, parseDnsTxtRecord, base64ToUint8, parsePublisher, dnsName, isLocalHost, VerifyErrorCode } from "@binalyze/notar";

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function isMarkdownName(name: string) {
  return name.endsWith(".md");
}

export function isZipName(name: string) {
  return name.endsWith(".zip");
}

export function decodeFileContent(content: string, fileName: string): string | Uint8Array {
  const bytes = base64ToUint8(content);
  return isMarkdownName(fileName) ? new TextDecoder().decode(bytes) : bytes;
}

// Plain-HTTP key discovery is only for local development: it needs an explicit
// opt-in variable AND a request that itself arrived on a local host. Any other
// deployment (default env, previews, workers.dev) fails closed.
export function allowInsecureLocalhost(env: Pick<Env, "ALLOW_INSECURE_LOCALHOST">, requestUrl: string): boolean {
  if (env.ALLOW_INSECURE_LOCALHOST !== "true") return false;
  return isLocalHost(new URL(requestUrl).hostname);
}

function requestUrl(req: RequestInfo | URL): string {
  if (typeof req === "string") return req;
  if (req instanceof URL) return req.href;
  return req.url;
}

export function assetFetch(assets: Fetcher, insecureLocal: boolean): typeof globalThis.fetch {
  return async (req, init) => {
    const url = new URL(requestUrl(req));
    if (insecureLocal && url.protocol === "http:" && isLocalHost(url.hostname)) {
      const path = url.pathname === "/.well-known/notar-keys.json" ? "/.well-known/notar-keys-dev.json" : url.pathname;
      const res = await assets.fetch(new Request(`http://localhost${path}`)); // class-sweep-allow: bundled assets, fixed host
      // Re-wrap so the response URL does not differ from the requested key URL.
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    return globalThis.fetch(req, init); // class-sweep-allow: passthrough; core builds and validates the URL
  };
}

type CheckResult = { found: boolean; error?: string };

export async function checkHttpsKey(
  domain: string,
  keyId: string,
  fetchOpts?: { fetch: typeof globalThis.fetch; allowInsecureLocalhost?: boolean },
): Promise<CheckResult> {
  const parsed = parsePublisher(domain);
  if (!parsed.ok) return { found: false, error: `Invalid domain: ${parsed.reason}` };
  const result = await fetchKeyManifest(parsed.value, fetchOpts);
  if (!result.ok) {
    if (!result.url) return { found: false, error: result.reason };
    if (result.code === VerifyErrorCode.NETWORK_ERROR) {
      return { found: false, error: `Could not reach ${result.url} — make sure the file is publicly accessible` };
    }
    return { found: false, error: `Invalid key manifest at ${result.url}: ${result.reason}` };
  }
  const key = result.keys.find((k) => k.keyId === keyId);
  if (!key) return { found: false, error: `No key with ID "${keyId}" found at ${result.url}` };
  if (key.revoked || new Date(key.expires) <= new Date()) {
    return { found: false, error: `Key "${keyId}" at ${result.url} is revoked or expired` };
  }
  return { found: true };
}

export async function checkDnsKey(domain: string, keyId: string): Promise<CheckResult> {
  const publisher = parsePublisher(domain);
  const fqdn = publisher.ok ? dnsName(publisher.value, keyId) : null;
  if (!fqdn) return { found: false, error: "DNS lookup is not available for this domain or key ID" };
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(fqdn)}&type=TXT`;
    const resp = await fetch(url, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) }); // class-sweep-allow: fixed DoH endpoint, name is URL-encoded
    if (!resp.ok) return { found: false, error: `DNS query failed with status ${resp.status}` };
    const data = (await resp.json()) as { Status: number; Answer?: Array<{ type: number; data: string }> };
    if (data.Status !== 0 || !data.Answer) {
      return { found: false, error: `No DNS TXT record found at ${fqdn}` };
    }
    const records = data.Answer.filter((a) => a.type === 16).map((a) => a.data.replaceAll(/(^"|"$)/g, ""));
    for (const txt of records) {
      const parsed = parseDnsTxtRecord(txt);
      if (parsed && parsed.expires * 1000 > Date.now()) return { found: true };
    }
    return { found: false, error: `DNS TXT record found at ${fqdn} but no valid, non-expired key matched` };
  } catch (e: unknown) {
    return { found: false, error: `DNS lookup failed for ${fqdn}: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}
