<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useConfig } from "@/composables/useConfig";
import Card from "@/components/ui/Card.vue";
import CodeBlock from "@/components/ui/CodeBlock.vue";

const config = useConfig();

const sections = [
  { id: "manifesto", label: "Manifesto" },
  { id: "what-is-notar", label: "What is Notar?" },
  { id: "signing-formats", label: "Signing Formats" },
  { id: "cli", label: "CLI" },
  { id: "npm-package", label: "npm Package" },
  { id: "key-discovery", label: "Key Discovery" },
  { id: "api-reference", label: "API Reference" },
] as const;

const activeSection = ref<string>(sections[0].id);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  const sectionEls = sections
    .map((s) => document.getElementById(s.id))
    .filter(Boolean) as HTMLElement[];

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeSection.value = entry.target.id;
        }
      }
    },
    { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
  );

  for (const el of sectionEls) observer.observe(el);
});

onUnmounted(() => {
  observer?.disconnect();
});

const npmInstall = computed(() => `npm install ${config.value.product.npm}`);

const usageExample = `import { generateKeyPair, sign, verify, verifyFromAuthor } from "@binalyze/notar";

// Generate a key pair
const { publicKey, privateKey } = await generateKeyPair();

// Sign a markdown file (string in, string out)
const signed = await sign(markdown, privateKey, {
  keyId: "my-key-id",
  publisher: "example.com",
});

// Verify with a known public key
const result = await verify(signed, publicKey);
console.log(result.valid); // true

// Or verify without a key — auto-fetches from the author's domain
const result2 = await verifyFromAuthor(signed);`;

const zipExample = `import { sign, verify } from "@binalyze/notar";

// Sign a ZIP package (Uint8Array in, Uint8Array out)
const signedZip = await sign(zipBytes, privateKey, {
  name: "my-package",
  description: "Example signed package",
  version: "1.0.0",
  author: "Jane Doe",
  keyId: "my-key-id",
  publisher: "example.com",
});

// Verify a signed ZIP
const result = await verify(signedZip, publicKey);`;

const cliKeygen = `# Generate a key pair
notar keygen --domain example.com
notar keygen --domain example.com --key-id my-key`;

const cliSign = `# Sign a file (private key from env var or stdin)
NOTAR_PRIVATE_KEY=<base64> notar sign document.md
NOTAR_PRIVATE_KEY=<base64> notar sign archive.zip --publisher example.com
NOTAR_PRIVATE_KEY=<base64> notar sign archive.zip --publisher example.com --author "Jane Doe"
echo "<base64>" | notar sign document.md --output signed.md`;

const cliVerify = `# Verify with an explicit public key
notar verify signed.md --public-key <base64>

# Auto-fetch key from the author's domain
notar verify signed.md

# Output JSON result
notar verify signed.zip --json`;

const wellKnownExample = `{
  "keys": [
    {
      "keyId": "your-key-id",
      "algorithm": "ed25519",
      "publicKey": "base64-encoded-public-key",
      "expires": "2026-01-01T00:00:00.000Z",
      "revoked": false
    }
  ]
}`;

const dnsExample = `v=sk1; k=ed25519; p=<base64-public-key>; exp=<unix-timestamp>`;
</script>

<template>
  <div class="py-8 md:py-12">
    <div class="container mx-auto px-6">
      <div class="flex gap-10">
        <!-- Left sidebar -->
        <nav class="hidden lg:block w-56 shrink-0" aria-label="Documentation">
          <div class="sticky top-24">
            <h2
              class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3"
            >
              Documentation
            </h2>
            <ul class="space-y-1">
              <li v-for="section in sections" :key="section.id">
                <a
                  :href="`#${section.id}`"
                  :class="[
                    'block text-sm py-1.5 px-3 rounded-md transition-colors',
                    activeSection === section.id
                      ? 'text-primary font-medium bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground',
                  ]"
                >
                  {{ section.label }}
                </a>
              </li>
            </ul>
          </div>
        </nav>

        <!-- Content -->
        <div class="flex-1 min-w-0 max-w-3xl">
          <h1 class="text-3xl font-bold text-foreground mb-2">Documentation</h1>
          <p class="text-muted-foreground mb-6">
            Learn how to use Notar to sign and verify files with cryptographic
            signatures.
          </p>

          <!-- Mobile table of contents -->
          <nav class="lg:hidden mb-10 border border-border rounded-lg p-4">
            <h2
              class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
            >
              Table of Contents
            </h2>
            <ul class="space-y-0.5">
              <li v-for="section in sections" :key="section.id">
                <a
                  :href="`#${section.id}`"
                  :class="[
                    'block text-sm py-1 transition-colors',
                    activeSection === section.id
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  ]"
                >
                  {{ section.label }}
                </a>
              </li>
            </ul>
          </nav>

          <div class="space-y-12">
            <!-- Manifesto -->
            <section id="manifesto" class="scroll-mt-24">
              <h2 class="text-2xl font-bold text-foreground mb-4">Manifesto</h2>
              <div class="border-l-4 border-primary pl-5 py-1 space-y-4">
                <p class="text-lg font-semibold text-foreground leading-snug">
                  SKILLS.md is not a text format. It is an executable.
                </p>
                <p class="text-sm text-muted-foreground leading-relaxed">
                  When an AI agent reads a Markdown file, it follows the
                  instructions inside. That makes every
                  <code class="text-xs bg-muted px-1 py-0.5 rounded">.md</code>
                  file a potential vector — for prompt injection, for data
                  exfiltration, for unauthorized actions on behalf of the user.
                </p>
                <p class="text-sm text-muted-foreground leading-relaxed">
                  Notar exists because trust must come before execution. Before
                  an agent acts on a file, it should be able to verify who wrote
                  it and that the contents haven't been tampered with. Signing
                  is not optional — it is the minimum bar for safety.
                </p>
                <p class="text-sm text-muted-foreground leading-relaxed">
                  We believe the community building AI tools has a
                  responsibility to prioritize trust and safety from the ground
                  up. Not as an afterthought. Not as a premium feature. As a
                  foundation.
                </p>
                <p class="text-sm font-medium text-foreground">
                  Sign your files. Verify before you trust. Build safe defaults.
                </p>
              </div>
            </section>

            <!-- What is Notar -->
            <section id="what-is-notar" class="scroll-mt-24">
              <h2 class="text-2xl font-bold text-foreground mb-4">
                What is Notar?
              </h2>
              <Card>
                <p class="text-sm text-muted-foreground leading-relaxed">
                  Notar is a free, open-source file signing and verification
                  toolkit. It uses Ed25519 public-key cryptography to sign
                  <code class="text-xs bg-muted px-1 py-0.5 rounded">.md</code>
                  and
                  <code class="text-xs bg-muted px-1 py-0.5 rounded">.zip</code>
                  files, allowing anyone to verify their authenticity and
                  integrity. All operations happen entirely client-side —
                  no file data ever leaves your browser.
                </p>
              </Card>
            </section>

            <!-- Signing Formats -->
            <section id="signing-formats" class="scroll-mt-24">
              <h2 class="text-2xl font-bold text-foreground mb-4">
                Signing Formats
              </h2>
              <div class="space-y-4">
                <Card>
                  <h3 class="font-semibold text-foreground mb-2">
                    Markdown Files (.md)
                  </h3>
                  <p class="text-sm text-muted-foreground leading-relaxed">
                    Markdown files use YAML front matter with required fields:
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">name</code>,
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">description</code>, and
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">version</code>.
                    The <code class="text-xs bg-muted px-1 py-0.5 rounded">author</code> field is optional and accepts any string.
                    Signing creates a canonical payload from the publisher, sorted metadata, and body content, then appends the signature to a
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">signatures</code>
                    array in the front matter. Multiple signers can co-sign the same file.
                  </p>
                </Card>
                <Card>
                  <h3 class="font-semibold text-foreground mb-2">
                    ZIP Packages (.zip)
                  </h3>
                  <p class="text-sm text-muted-foreground leading-relaxed">
                    ZIP files are signed by computing SHA-256 hashes of all
                    files and generating a
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">MANIFEST.json</code>
                    containing the hashes, package metadata, and a
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">signatures</code>
                    array. Verification checks both the cryptographic signatures and every
                    file hash against the manifest, detecting any tampering.
                  </p>
                </Card>
              </div>
            </section>

            <!-- CLI -->
            <section id="cli" class="scroll-mt-24">
              <h2 class="text-2xl font-bold text-foreground mb-4">CLI</h2>
              <p class="text-sm text-muted-foreground mb-4">
                The npm package includes a CLI. Run
                <code class="text-xs bg-muted px-1 py-0.5 rounded">npx @binalyze/notar</code>
                for interactive mode, or use subcommands directly.
              </p>
              <div class="space-y-4">
                <Card>
                  <h3 class="font-semibold text-foreground mb-2">
                    notar keygen
                  </h3>
                  <p class="text-sm text-muted-foreground mb-3">
                    Generate an Ed25519 key pair. Writes
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">notar-keys.json</code>
                    to the current directory and prints the private key and DNS TXT record instructions.
                  </p>
                  <CodeBlock :code="cliKeygen" />
                </Card>
                <Card>
                  <h3 class="font-semibold text-foreground mb-2">
                    notar sign
                  </h3>
                  <p class="text-sm text-muted-foreground mb-3">
                    Sign a
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">.md</code> or
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">.zip</code> file.
                    The private key is read from the
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">NOTAR_PRIVATE_KEY</code>
                    environment variable or piped via stdin.
                    Supports
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">--author</code> (freeform string) and
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">--publisher</code> (domain for key resolution).
                  </p>
                  <CodeBlock :code="cliSign" />
                </Card>
                <Card>
                  <h3 class="font-semibold text-foreground mb-2">
                    notar verify
                  </h3>
                  <p class="text-sm text-muted-foreground mb-3">
                    Verify a signed file. Without
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">--public-key</code>,
                    keys are resolved automatically from the publisher's domain.
                    Exits with code 0 on success, 1 on failure.
                  </p>
                  <CodeBlock :code="cliVerify" />
                </Card>
              </div>
            </section>

            <!-- npm Package -->
            <section id="npm-package" class="scroll-mt-24">
              <h2 class="text-2xl font-bold text-foreground mb-4">
                npm Package
              </h2>
              <CodeBlock :code="npmInstall" label="Install" />
              <div class="mt-4">
                <CodeBlock :code="usageExample" label="Unified API" />
              </div>
              <div class="mt-4">
                <CodeBlock :code="zipExample" label="ZIP Package Signing" />
              </div>
            </section>

            <!-- Key Discovery -->
            <section id="key-discovery" class="scroll-mt-24">
              <h2 class="text-2xl font-bold text-foreground mb-4">
                Key Discovery
              </h2>
              <p class="text-sm text-muted-foreground mb-4">
                When verifying without an explicit public key, Notar resolves
                the signer's key automatically using the publisher domain and
                key ID from the signature. Two methods run in parallel — the
                first valid key wins.
              </p>
              <div class="space-y-4">
                <Card>
                  <h3 class="font-semibold text-foreground mb-2">
                    HTTPS (.well-known)
                  </h3>
                  <p class="text-sm text-muted-foreground mb-3">
                    Host a JSON key manifest at
                    <code class="text-xs bg-muted px-1 py-0.5 rounded"
                      >https://yourdomain.com/.well-known/notar-keys.json</code
                    >
                  </p>
                  <CodeBlock :code="wellKnownExample" />
                </Card>
                <Card>
                  <h3 class="font-semibold text-foreground mb-2">
                    DNS TXT Record
                  </h3>
                  <p class="text-sm text-muted-foreground mb-3">
                    Add a TXT record at
                    <code class="text-xs bg-muted px-1 py-0.5 rounded"
                      >notar.&lt;keyId&gt;.yourdomain.com</code
                    >.
                    The
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">notar keygen</code>
                    CLI command prints the exact record to add.
                  </p>
                  <CodeBlock :code="dnsExample" />
                </Card>
                <Card>
                  <h3 class="font-semibold text-foreground mb-2">
                    Key Validity
                  </h3>
                  <p class="text-sm text-muted-foreground leading-relaxed">
                    Resolved keys are checked for expiry and revocation before
                    use. Expired or revoked keys cause verification to fail with
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">KEY_EXPIRED</code> or
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">KEY_REVOKED</code>
                    error codes.
                  </p>
                </Card>
              </div>
            </section>

            <!-- API Reference -->
            <section id="api-reference" class="scroll-mt-24">
              <h2 class="text-2xl font-bold text-foreground mb-4">
                API Reference
              </h2>
              <p class="text-sm text-muted-foreground mb-4">
                All cryptographic operations — key generation, signing, and
                verification — happen entirely client-side in the browser
                using the
                <code class="text-xs bg-muted px-1 py-0.5 rounded">@binalyze/notar</code>
                library. No file data leaves the browser. The Cloudflare
                Worker provides additional endpoints for programmatic use.
              </p>
              <div class="space-y-3">
                <Card>
                  <div class="flex items-center gap-2 mb-2">
                    <span
                      class="px-2 py-0.5 bg-success/20 text-success text-xs font-bold rounded"
                      >POST</span
                    >
                    <code class="text-sm font-mono text-foreground"
                      >/api/verify</code
                    >
                  </div>
                  <p class="text-sm text-muted-foreground">
                    Server-side verification endpoint. Send JSON with
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">content</code>
                    (base64-encoded file),
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">fileName</code>
                    (<code class="text-xs bg-muted px-1 py-0.5 rounded">.md</code> or
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">.zip</code>),
                    and either
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">publicKey</code>
                    (base64) or
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">fromAuthor: true</code>
                    to auto-resolve the key from the publisher's domain.
                    The web UI uses this endpoint for verification. Also
                    available for external integrations.
                  </p>
                </Card>
                <Card>
                  <div class="flex items-center gap-2 mb-2">
                    <span
                      class="px-2 py-0.5 bg-success/20 text-success text-xs font-bold rounded"
                      >POST</span
                    >
                    <code class="text-sm font-mono text-foreground"
                      >/api/lookup</code
                    >
                  </div>
                  <p class="text-sm text-muted-foreground">
                    Check if a public key is reachable for a given domain and key ID.
                    Send JSON with
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">domain</code>
                    and
                    <code class="text-xs bg-muted px-1 py-0.5 rounded">keyId</code>.
                    Returns HTTPS and DNS resolution status.
                  </p>
                </Card>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
