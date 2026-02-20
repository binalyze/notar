import { fetchPublicKey, parseDnsTxtRecord, base64ToUint8 } from "@binalyze/notar";

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

export function isLocalhost(host: string) {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function requestUrl(req: RequestInfo | URL): string {
  if (typeof req === "string") return req;
  if (req instanceof URL) return req.href;
  return req.url;
}

export function assetFetch(assets: Fetcher, devMode?: boolean): typeof globalThis.fetch {
  return (req, init) => {
    const url = requestUrl(req);
    if (isLocalhost(new URL(url).hostname)) {
      let path = new URL(url).pathname;
      if (devMode && path === "/.well-known/notar-keys.json") {
        path = "/.well-known/notar-keys-dev.json";
      }
      return assets.fetch(new Request(`http://localhost${path}`));
    }
    return globalThis.fetch(req, init);
  };
}

type CheckResult = { found: boolean; error?: string };

export async function checkHttpsKey(
  domain: string,
  keyId: string,
  fetchOpts?: { fetch: typeof globalThis.fetch },
): Promise<CheckResult> {
  const local = isLocalhost(domain);
  const wellKnownUrl = `${local ? "http" : "https"}://${domain}/.well-known/notar-keys.json`;
  try {
    const key = await fetchPublicKey(domain, keyId, fetchOpts);
    return key ? { found: true } : { found: false, error: `No key with ID "${keyId}" found at ${wellKnownUrl}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Failed to fetch")) {
      return { found: false, error: `Could not reach ${wellKnownUrl} — make sure the file is publicly accessible` };
    }
    if (msg.includes("JSON")) {
      return { found: false, error: `The response from ${wellKnownUrl} is not valid JSON` };
    }
    if (msg.includes("internal error")) {
      return { found: false, error: `The server at ${domain} returned an internal error — the .well-known/notar-keys.json endpoint may be misconfigured` };
    }
    return { found: false, error: `Failed to validate HTTPS key: ${msg}` };
  }
}

export async function checkDnsKey(domain: string, keyId: string): Promise<CheckResult> {
  const fqdn = `notar.${keyId}.${domain}`;
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(fqdn)}&type=TXT`;
    const resp = await fetch(url, { headers: { accept: "application/dns-json" } });
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
