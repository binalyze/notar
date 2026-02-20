<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import Button from "@/components/ui/Button.vue";
import DropZone from "@/components/ui/DropZone.vue";
import SampleDropdown from "@/components/ui/SampleDropdown.vue";
import ResultBadge from "@/components/ui/ResultBadge.vue";
import { unzipSync } from "fflate";
import { parseFrontMatter, uint8ToBase64 } from "@binalyze/notar";
import type { SignatureEntry, VerifyResult } from "@binalyze/notar";

interface FileMetadata {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  signatures?: SignatureEntry[];
}

const props = defineProps<{ initialPublicKey?: string }>();

const file = ref<File | null>(null);
const dropZoneRef = ref<InstanceType<typeof DropZone>>();
const sampleRef = ref<InstanceType<typeof SampleDropdown>>();
const mode = ref<"publisher" | "publicKey">("publisher");
const publicKey = ref(props.initialPublicKey ?? "");
const loading = ref(false);
const error = ref("");
const metadata = ref<FileMetadata | null>(null);
const result = ref<VerifyResult | null>(null);
const resultEl = ref<HTMLElement | null>(null);

const step1Done = computed(() => {
  if (mode.value === "publicKey") return !!publicKey.value.trim();
  return true;
});
const step3Ready = computed(() => !!file.value && step1Done.value);

watch(
  () => props.initialPublicKey,
  (val) => {
    if (val) publicKey.value = val;
  },
);

function resetForm() {
  file.value = null;
  mode.value = "publisher";
  publicKey.value = props.initialPublicKey ?? "";
  loading.value = false;
  error.value = "";
  metadata.value = null;
  result.value = null;
  sampleRef.value?.reset();
}

function onSampleSelect(f: File) {
  dropZoneRef.value?.setFile(f);
  onFileSelect(f);
}

function pickMode() {
  if (metadata.value?.signatures?.length) {
    mode.value = "publisher";
  }
}

function onFileSelect(f: File) {
  file.value = f;
  error.value = "";
  result.value = null;
  metadata.value = null;

  const isZip = f.name.endsWith(".zip") || f.type === "application/zip";
  const isMd =
    f.name.endsWith(".md") ||
    f.type === "text/markdown" ||
    f.type === "text/x-markdown";

  if (isMd) {
    f.text().then((text) => {
      const parsed = parseFrontMatter(text);
      const d = parsed.data;
      metadata.value = {
        name: d.name as string | undefined,
        description: d.description as string | undefined,
        version: d.version as string | undefined,
        author: d.author as string | undefined,
        signatures: d.signatures as SignatureEntry[] | undefined,
      };
      pickMode();
    });
  } else if (isZip) {
    f.arrayBuffer().then((buf) => {
      try {
        const entries = unzipSync(new Uint8Array(buf));
        const manifestBytes = entries["MANIFEST.json"];
        if (manifestBytes) {
          const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
          metadata.value = {
            name: manifest.name,
            description: manifest.description,
            version: manifest.version,
            author: manifest.author,
            signatures: manifest.signatures,
          };
          pickMode();
        }
      } catch {
        /* ignore parse errors */
      }
    });
  }
}

async function verify() {
  if (!file.value) return;
  loading.value = true;
  error.value = "";
  result.value = null;

  try {
    const buf = await file.value.arrayBuffer();
    const content = uint8ToBase64(new Uint8Array(buf));
    const body: Record<string, unknown> = {
      content,
      fileName: file.value.name,
    };
    if (mode.value === "publisher") {
      body.fromAuthor = true;
    } else {
      if (!publicKey.value) {
        error.value = "Please provide a public key";
        return;
      }
      body.publicKey = publicKey.value.trim();
    }

    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      error.value = data.error ?? `Server error (${res.status})`;
      return;
    }
    result.value = data as VerifyResult;

    await nextTick();
    resultEl.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Verification failed";
    await nextTick();
    resultEl.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    loading.value = false;
  }
}

watch([file, mode], () => {
  if (!file.value) return;
  if (mode.value === "publisher") verify();
  else if (mode.value === "publicKey" && publicKey.value.trim()) verify();
});

let pkTimer: ReturnType<typeof setTimeout>;
watch(publicKey, () => {
  clearTimeout(pkTimer);
  if (!file.value || mode.value !== "publicKey" || !publicKey.value.trim())
    return;
  pkTimer = setTimeout(() => verify(), 600);
});
</script>

<template>
  <div class="space-y-6">
    <!-- Step 1: Verification Method -->
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
            step1Done
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground',
          ]"
        >
          1
        </div>
        <h3 class="font-semibold text-foreground">Verification Method</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Choose how to resolve the public key for verification.
      </p>
      <div class="ml-10 space-y-4">
        <div class="flex gap-2">
          <button
            :class="[
              'px-4 py-2 text-sm rounded-lg transition-colors border',
              mode === 'publisher'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-foreground border-border hover:bg-muted',
            ]"
            @click="mode = 'publisher'"
          >
            From Publisher
          </button>
          <button
            :class="[
              'px-4 py-2 text-sm rounded-lg transition-colors border',
              mode === 'publicKey'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-foreground border-border hover:bg-muted',
            ]"
            @click="mode = 'publicKey'"
          >
            With Public Key
          </button>
        </div>

        <div v-if="mode === 'publicKey'" class="space-y-1.5">
          <label class="text-sm font-medium text-foreground"
            >Public Key (Base64)</label
          >
          <textarea
            v-model="publicKey"
            rows="3"
            placeholder="Paste the publisher's Ed25519 public key..."
            class="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        <div
          v-else
          class="p-3 bg-muted rounded-lg text-sm text-muted-foreground"
        >
          The public key will be automatically fetched from the publisher's
          domain using
          <code class="text-xs bg-background px-1 py-0.5 rounded"
            >.well-known/notar-keys.json</code
          >
          or DNS TXT records.
        </div>
      </div>
    </div>

    <!-- Step 2: Select File -->
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
            file
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground',
          ]"
        >
          2
        </div>
        <h3 class="font-semibold text-foreground">Select Signed File</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Drop or select a signed markdown or ZIP file to verify.
      </p>
      <div class="ml-10">
        <DropZone ref="dropZoneRef" @select="onFileSelect" @clear="resetForm" />
        <SampleDropdown ref="sampleRef" @select="onSampleSelect" />
      </div>
      <!-- Parsed metadata info box -->
      <div v-if="metadata" class="ml-10 bg-muted rounded-lg p-4 space-y-2">
        <p
          class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
        >
          File Metadata
        </p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <template v-if="metadata.name">
            <span class="text-muted-foreground">Name</span>
            <span class="text-foreground font-mono text-xs">{{
              metadata.name
            }}</span>
          </template>
          <template v-if="metadata.description">
            <span class="text-muted-foreground">Description</span>
            <span class="text-foreground text-xs">{{
              metadata.description
            }}</span>
          </template>
          <template v-if="metadata.version">
            <span class="text-muted-foreground">Version</span>
            <span class="text-foreground font-mono text-xs">{{
              metadata.version
            }}</span>
          </template>
          <template v-if="metadata.author">
            <span class="text-muted-foreground">Author</span>
            <span class="text-foreground font-mono text-xs">{{
              metadata.author
            }}</span>
          </template>
        </div>
        <div
          v-if="metadata.signatures && metadata.signatures.length > 0"
          class="mt-2"
        >
          <p class="text-xs text-muted-foreground mb-1">
            {{ metadata.signatures.length }} signature{{
              metadata.signatures.length > 1 ? "s" : ""
            }}
            found
          </p>
          <div
            v-for="(sig, i) in metadata.signatures"
            :key="i"
            class="text-xs py-0.5 space-y-0.5"
          >
            <div class="flex items-center gap-2">
              <span class="text-muted-foreground">Signer {{ i + 1 }}:</span>
              <code class="text-foreground">{{
                sig.publisher || "(unknown)"
              }}</code>
              <span v-if="sig.keyId" class="text-muted-foreground"
                >({{ sig.keyId }})</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 3: Verify -->
    <div :class="['space-y-3 transition-opacity', !step3Ready && 'opacity-50']">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
            result?.valid
              ? 'bg-success text-success-foreground'
              : result
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-primary-foreground',
          ]"
        >
          3
        </div>
        <h3 class="font-semibold text-foreground">Verify</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Run verification to check the file's signature and integrity.
      </p>
      <div v-if="step3Ready" class="ml-10 space-y-4">
        <div ref="resultEl" class="scroll-mt-20 space-y-4">
          <div
            v-if="error"
            class="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive"
          >
            {{ error }}
          </div>
          <ResultBadge
            v-if="result"
            :valid="result.valid"
            :code="result.code"
            :reason="result.reason"
            :details="result.details"
          />
        </div>
        <Button
          :loading="loading"
          :disabled="!step3Ready"
          :variant="result || error ? 'outline' : 'primary'"
          class="w-full"
          @click="verify"
        >
          {{ result || error ? "Retry Verification" : "Verify Signature" }}
        </Button>
      </div>
    </div>
  </div>
</template>
