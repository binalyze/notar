<script setup lang="ts">
import { ref, computed } from "vue";
import { CheckCircle, XCircle, ChevronRight, Globe, Server } from "lucide-vue-next";
import { VerifyErrorCode } from "@binalyze/notar";
import type { SignerResult } from "@binalyze/notar";

const props = defineProps<{ signer: SignerResult; index?: number }>();
const expanded = ref(true);

const ERROR_LABELS: Record<string, string> = {
  [VerifyErrorCode.MALFORMED_SIGNATURE]: "Malformed Signature",
  [VerifyErrorCode.MISSING_KEY_ID]: "Missing Key ID",
  [VerifyErrorCode.SIGNATURE_MISMATCH]: "Content Modified",
  [VerifyErrorCode.KEY_NOT_FOUND]: "Key Not Found",
  [VerifyErrorCode.KEY_EXPIRED]: "Key Expired",
  [VerifyErrorCode.KEY_REVOKED]: "Key Revoked",
  [VerifyErrorCode.KEY_FETCH_FAILED]: "Key Fetch Failed",
  [VerifyErrorCode.NETWORK_ERROR]: "Network Error",
  [VerifyErrorCode.DNS_RESOLUTION_FAILED]: "DNS Resolution Failed",
};

const label = computed(() => {
  if (props.signer.valid) return "Valid Signature";
  if (props.signer.code && ERROR_LABELS[props.signer.code]) return ERROR_LABELS[props.signer.code];
  return "Invalid Signature";
});

const isWarning = computed(() =>
  props.signer.code === VerifyErrorCode.KEY_EXPIRED || props.signer.code === VerifyErrorCode.KEY_REVOKED,
);

const containerClass = computed(() => {
  if (props.signer.valid) return "border-success/30 bg-success/5";
  if (isWarning.value) return "border-amber-500/30 bg-amber-500/5";
  return "border-destructive/30 bg-destructive/5";
});

const labelColor = computed(() => {
  if (props.signer.valid) return "text-success";
  if (isWarning.value) return "text-amber-500";
  return "text-destructive";
});
</script>

<template>
  <div :class="['rounded-lg border p-3 transition-colors', containerClass]">
    <button
      class="flex items-center gap-2 w-full text-left"
      @click="expanded = !expanded"
    >
      <CheckCircle v-if="signer.valid" class="w-4 h-4 text-success shrink-0" />
      <XCircle v-else-if="isWarning" class="w-4 h-4 text-amber-500 shrink-0" />
      <XCircle v-else class="w-4 h-4 text-destructive shrink-0" />
      <span v-if="index" class="text-xs text-muted-foreground shrink-0">#{{ index }}</span>
      <span :class="['text-sm font-semibold shrink-0', labelColor]">{{ label }}</span>
      <span class="text-xs text-muted-foreground truncate">{{ signer.publisher || "" }}</span>
      <ChevronRight
        :class="['w-3.5 h-3.5 text-muted-foreground transition-transform ml-auto shrink-0', expanded && 'rotate-90']"
      />
    </button>
    <div v-if="expanded" class="mt-2 pt-2 border-t border-border/50 text-xs">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <span class="text-muted-foreground">Publisher</span>
        <code class="text-foreground">{{ signer.publisher || "(unknown)" }}</code>
        <span class="text-muted-foreground">Key ID</span>
        <code class="text-foreground">{{ signer.keyId || "(none)" }}</code>
        <template v-if="signer.keySource">
          <span class="text-muted-foreground flex items-center gap-1">
            <Globe v-if="signer.keySource === 'https'" class="w-3 h-3" />
            <Server v-else class="w-3 h-3" />
            Key Source
          </span>
          <span class="text-foreground">{{ signer.keySource === "https" ? "HTTPS (.well-known)" : "DNS TXT" }}</span>
        </template>
        <template v-if="signer.keyExpires">
          <span class="text-muted-foreground">Key Expires</span>
          <span class="text-foreground">{{ new Date(signer.keyExpires).toLocaleDateString() }}</span>
        </template>
        <template v-if="signer.reason">
          <span class="text-muted-foreground">Reason</span>
          <span class="text-foreground">{{ signer.reason }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
