import { Hono } from "hono";
import { cors } from "hono/cors";
import { rateLimiter } from "hono-rate-limiter";
import { base64ToUint8, verify, verifyFromAuthor } from "@binalyze/notar";
import { MAX_FILE_SIZE, isMarkdownName, isZipName, decodeFileContent, isLocalhost, assetFetch, checkHttpsKey, checkDnsKey } from "./helpers";

const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.use("*", cors());

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

app.get("/health", (c) => c.json({ status: "ok" }));

let limiter: ReturnType<typeof rateLimiter<{ Bindings: Env }>>;
app.post("*", (c, next) => {
  limiter ??= rateLimiter<{ Bindings: Env }>({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-7",
    keyGenerator: (c) =>
      c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown",
    message: { error: "Too many requests" },
  });
  return limiter(c, next);
});

app.post("/verify", async (c) => {
  let body: { content?: string; fileName?: string; publicKey?: string; fromAuthor?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { content, fileName, publicKey: publicKeyB64, fromAuthor } = body;
  if (!content || !fileName) {
    return c.json({ error: "Missing content or fileName" }, 400);
  }

  const estimatedSize = Math.ceil(content.length * 0.75);
  if (estimatedSize > MAX_FILE_SIZE) {
    return c.json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB` }, 413);
  }

  if (!isMarkdownName(fileName) && !isZipName(fileName)) {
    return c.json({ error: "Unsupported file type. Expected .md or .zip" }, 400);
  }

  const input = decodeFileContent(content, fileName);

  if (fromAuthor) {
    const devMode = c.env.BUILD_MODE !== "production";
    const result = await verifyFromAuthor(input, { fetch: assetFetch(c.env.ASSETS, devMode) });
    return c.json(result);
  }

  if (typeof publicKeyB64 === "string" && publicKeyB64) {
    const result = await verify(input, base64ToUint8(publicKeyB64));
    return c.json(result);
  }

  return c.json({ error: "Provide publicKey or set fromAuthor to true" }, 400);
});

app.post("/lookup", async (c) => {
  let body: { domain: string; keyId: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const { domain, keyId } = body;
  if (!domain || !keyId) {
    return c.json({ error: "Missing domain or keyId" }, 400);
  }

  const local = isLocalhost(domain);
  const devMode = c.env.BUILD_MODE !== "production";
  const fetchOpts = local ? { fetch: assetFetch(c.env.ASSETS, devMode) } : undefined;

  const [https, dns] = await Promise.all([
    checkHttpsKey(domain, keyId, fetchOpts),
    checkDnsKey(domain, keyId),
  ]);
  return c.json({ https, dns });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
