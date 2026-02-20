<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import Button from "@/components/ui/Button.vue";
import CodeBlock from "@/components/ui/CodeBlock.vue";
import { XCircle, ShieldCheck } from "lucide-vue-next";
import {
  generateKeyPair,
  uint8ToBase64,
  formatDnsTxtRecord,
} from "@binalyze/notar";

const props = defineProps<{
  devPublicKey?: string;
  devPrivateKey?: string;
  devKeyId?: string;
}>();

const hasDevKeys = computed(
  () => !!props.devPublicKey && !!props.devPrivateKey && !!props.devKeyId,
);

const emit = defineEmits<{
  generated: [privateKey: string];
  publicKeySet: [publicKey: string];
  domainSet: [domain: string];
  keyIdSet: [keyId: string];
}>();

const domain = ref(window.location.host);
const loading = ref(false);
const generated = ref(false);
const privateKey = ref("");
const publicKey = ref("");
const keyId = ref("");
const wellKnownJson = ref("");
const dnsTxtRecord = ref("");
const dnsTxtName = ref("");
const publishMode = ref<"https" | "dns">("dns");
const protocol = window.location.protocol + "//";

const validDomain = computed(() => {
  const d = domain.value.trim();
  if (!d || /\s/.test(d) || d.includes("://")) return false;
  return d.includes(".") || d.startsWith("localhost") || d.startsWith("127.0.0.1");
});

const completedSteps = ref(new Set<number>());
const keyCopied = ref(false);
const step2El = ref<HTMLElement | null>(null);
const step3El = ref<HTMLElement | null>(null);
const step4El = ref<HTMLElement | null>(null);

function scrollTo(el: { value: HTMLElement | null }) {
  nextTick(() => el.value?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function onStepCopied(step: number) {
  completedSteps.value.add(step);
  if (step === 3) scrollTo(step4El);
}

function confirmKeyCopied() {
  keyCopied.value = true;
  onStepCopied(2);
  scrollTo(step3El);
}

function generateKeyId(): string {
  const hex = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `key_${hex}`;
}

async function generate() {
  loading.value = true;
  try {
    let publicKeyB64: string;
    let privateKeyB64: string;
    let id: string;

    if (hasDevKeys.value && !generated.value) {
      publicKeyB64 = props.devPublicKey!;
      privateKeyB64 = props.devPrivateKey!;
      id = props.devKeyId!;
    } else {
      const keys = await generateKeyPair();
      publicKeyB64 = uint8ToBase64(keys.publicKey);
      privateKeyB64 = uint8ToBase64(keys.privateKey);
      id = generateKeyId();
    }

    const expires = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const expUnix = Math.floor(new Date(expires).getTime() / 1000);
    const dnsTxt = formatDnsTxtRecord(id, publicKeyB64, expUnix);

    privateKey.value = privateKeyB64;
    publicKey.value = publicKeyB64;
    keyId.value = id;
    wellKnownJson.value = JSON.stringify(
      {
        keys: [
          {
            keyId: id,
            algorithm: "ed25519",
            publicKey: publicKeyB64,
            expires,
            revoked: false,
          },
        ],
      },
      null,
      2,
    );
    dnsTxtRecord.value = dnsTxt.value;
    dnsTxtName.value = dnsTxt.fqdn;
    generated.value = true;
    keyCopied.value = false;
    scrollTo(step2El);
    emit("generated", privateKeyB64);
    emit("publicKeySet", publicKeyB64);
    emit("domainSet", domain.value.trim());
    emit("keyIdSet", id);
  } finally {
    loading.value = false;
  }
}

const validating = ref(false);
const validationResult = ref<{
  https: { found: boolean; error?: string };
  dns: { found: boolean; error?: string };
} | null>(null);
const validationError = ref("");

const validated = computed(() => {
  if (!validationResult.value) return false;
  const r = validationResult.value;
  return publishMode.value === "https" ? r.https.found : r.dns.found;
});

const validationErrorMessage = computed(() => {
  if (validationError.value) return validationError.value;
  if (!validationResult.value) return "";
  return publishMode.value === "https"
    ? validationResult.value.https.error
    : validationResult.value.dns.error;
});

async function validate() {
  validating.value = true;
  validationResult.value = null;
  validationError.value = "";
  try {
    const res = await fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: domain.value.trim(), keyId: keyId.value }),
    });
    if (!res.ok) {
      validationError.value = `Validation request failed (HTTP ${res.status}). Please try again.`;
      return;
    }
    try {
      validationResult.value = await res.json();
    } catch {
      validationError.value = "Server returned an invalid response. Is the API running?";
      return;
    }
    if (
      validationResult.value?.https.found ||
      validationResult.value?.dns.found
    ) {
      completedSteps.value.add(4);
    }
  } catch {
    validationError.value =
      "Could not reach the validation server. Check your connection and try again.";
  } finally {
    validating.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Step 1: Generate -->
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
            generated
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground',
          ]"
        >
          1
        </div>
        <h3 class="font-semibold text-foreground">Generate Key Pair</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Enter your domain and generate an Ed25519 key pair for signing files.
      </p>
      <div class="ml-10 space-y-3">
        <div class="flex items-center">
          <span
            class="px-3 py-2 bg-muted border border-r-0 border-border rounded-l-lg text-sm text-muted-foreground select-none"
            >{{ protocol }}</span
          >
          <input
            v-model="domain"
            type="text"
            placeholder="yourdomain.com"
            autocomplete="off"
            data-lpignore="true"
            data-1p-ignore
            data-form-type="other"
            class="flex-1 px-3 py-2 bg-background border border-border rounded-r-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            @keydown.enter="validDomain && !loading && generate()"
          />
        </div>
        <Button :disabled="!validDomain" :loading="loading" @click="generate">
          {{ generated ? "Regenerate Keys" : "Generate Keys" }}
        </Button>
      </div>
    </div>

    <!-- Step 2: Keys -->
    <div ref="step2El" :class="['space-y-3 transition-opacity scroll-mt-24', !generated && 'opacity-50']">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
            completedSteps.has(2)
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground',
          ]"
        >
          2
        </div>
        <h3 class="font-semibold text-foreground">Save Your Keys</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Copy and securely store your private and public keys.
      </p>
      <div v-if="generated" class="ml-10 space-y-4">
        <div
          class="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive"
        >
          Keep your private key secret. Never share it publicly.
        </div>
        <CodeBlock
          :code="privateKey"
          label="Private Key"
          secret
          @copied="onStepCopied(2)"
        />
        <Button
          :disabled="keyCopied"
          class="w-full"
          @click="confirmKeyCopied"
        >
          I Copied My Private Key
        </Button>
      </div>
    </div>

    <!-- Step 3: Publish -->
    <div ref="step3El" :class="['space-y-3 transition-opacity scroll-mt-24', (!generated || !keyCopied) && 'opacity-50']">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
            completedSteps.has(3)
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground',
          ]"
        >
          3
        </div>
        <h3 class="font-semibold text-foreground">Publish Your Public Key</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Choose how to publish your public key so others can verify your
        signatures.
      </p>
      <div v-if="generated && keyCopied" class="ml-10 space-y-4">
        <div class="flex gap-2">
          <button
            :class="[
              'px-4 py-2 text-sm rounded-lg transition-colors border',
              publishMode === 'dns'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-foreground border-border hover:bg-muted',
            ]"
            @click="publishMode = 'dns'"
          >
            DNS TXT Record
          </button>
          <button
            :class="[
              'px-4 py-2 text-sm rounded-lg transition-colors border',
              publishMode === 'https'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-foreground border-border hover:bg-muted',
            ]"
            @click="publishMode = 'https'"
          >
            HTTPS (.well-known)
          </button>
        </div>

        <template v-if="publishMode === 'https'">
          <p class="text-sm text-muted-foreground">
            Host this JSON at
            <code class="text-xs bg-muted px-1.5 py-0.5 rounded"
              >{{ protocol }}{{ domain }}/.well-known/notar-keys.json</code
            >
          </p>
          <CodeBlock
            :code="wellKnownJson"
            label="notar-keys.json"
            @copied="onStepCopied(3)"
          />
        </template>

        <template v-else>
          <p class="text-sm text-muted-foreground">
            Add this DNS TXT record to your domain:
          </p>
          <CodeBlock
            :code="dnsTxtName + '.' + domain"
            label="Record Name"
            @copied="onStepCopied(3)"
          />
          <CodeBlock
            :code="dnsTxtRecord"
            label="Record Value"
            @copied="onStepCopied(3)"
          />
        </template>
      </div>
    </div>

    <!-- Step 4: Validate -->
    <div ref="step4El" :class="['space-y-3 transition-opacity scroll-mt-24', (!generated || !keyCopied) && 'opacity-50']">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
            completedSteps.has(4)
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground',
          ]"
        >
          4
        </div>
        <h3 class="font-semibold text-foreground">Validate Configuration</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Verify that your public key is reachable from your domain.
      </p>
      <div v-if="generated && keyCopied" class="ml-10 space-y-4">
        <Button :loading="validating" @click="validate">Validate</Button>
        <div v-if="validationResult || validationError">
          <div
            v-if="validated"
            class="flex items-start gap-3 p-4 bg-success/10 border border-success/30 rounded-lg"
          >
            <ShieldCheck class="w-5 h-5 text-success shrink-0 mt-0.5" />
            <div>
              <p class="font-semibold text-foreground">Verified!</p>
              <p class="text-sm text-muted-foreground">
                Your public key is published and reachable. You can now sign
                files as
                <code class="text-xs bg-muted px-1.5 py-0.5 rounded">{{
                  domain
                }}</code
                >.
              </p>
            </div>
          </div>
          <div
            v-else
            class="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg"
          >
            <XCircle class="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p class="font-semibold text-foreground">Validation failed</p>
              <p class="text-sm text-muted-foreground">
                {{ validationErrorMessage }}
              </p>
              <p
                v-if="publishMode === 'https' && !validationError"
                class="text-xs text-muted-foreground mt-2"
              >
                Make sure
                <code class="bg-muted px-1 py-0.5 rounded"
                  >{{ protocol }}{{ domain }}/.well-known/notar-keys.json</code
                >
                is publicly accessible and contains your key.
              </p>
              <p
                v-if="publishMode === 'dns' && !validationError"
                class="text-xs text-muted-foreground mt-2"
              >
                Make sure the DNS TXT record for
                <code class="bg-muted px-1 py-0.5 rounded"
                  >notar.{{ keyId }}.{{ domain }}</code
                >
                is published and has propagated.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
