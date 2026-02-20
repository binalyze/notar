<script setup lang="ts">
import { computed } from "vue";
import { ShieldCheck, ShieldX, ShieldAlert, CheckCircle, XCircle, AlertCircle, Copy, Check } from "lucide-vue-next";
import { VerifyErrorCode } from "@binalyze/notar";
import type { SignerResult, FileIntegrityResult } from "@binalyze/notar";
import VerificationSteps from "./VerificationSteps.vue";
import SignerDetail from "./SignerDetail.vue";
import FileIntegrityList from "./FileIntegrityList.vue";
import { useCopy } from "@/composables/useCopy";

const props = defineProps<{
  valid: boolean;
  code?: string;
  reason?: string;
  details?: {
    name?: string;
    description?: string;
    version?: string;
    author?: string;
    signers?: SignerResult[];
    files?: FileIntegrityResult[];
  };
}>();

const { copied, copy } = useCopy();

const FORMAT_ERROR_CODES = new Set<string>([
  VerifyErrorCode.NO_SIGNATURES,
  VerifyErrorCode.MISSING_MANIFEST,
  VerifyErrorCode.HASH_MISMATCH,
  VerifyErrorCode.MISSING_FILE,
]);

const FORMAT_CODE_LABELS: Record<string, string> = {
  [VerifyErrorCode.NO_SIGNATURES]: "Unsigned File",
  [VerifyErrorCode.MISSING_MANIFEST]: "Missing Manifest",
  [VerifyErrorCode.HASH_MISMATCH]: "File Tampered",
  [VerifyErrorCode.MISSING_FILE]: "Missing File",
};

const formatValid = computed(() => {
  if (props.code && FORMAT_ERROR_CODES.has(props.code)) return false;
  const files = props.details?.files;
  if (files?.some((f) => !f.valid)) return false;
  return true;
});

const formatLabel = computed(() => {
  if (formatValid.value) return "Format: Valid";
  if (props.code && FORMAT_CODE_LABELS[props.code]) return `Format: ${FORMAT_CODE_LABELS[props.code]}`;
  return "Format: Invalid";
});

const formatColor = computed<"green" | "amber" | "red">(() => {
  if (formatValid.value) return "green";
  if (props.code === VerifyErrorCode.NO_SIGNATURES) return "amber";
  return "red";
});

const formatContainerClass = computed(() => {
  switch (formatColor.value) {
    case "green": return "bg-success/10 border-success/30";
    case "amber": return "bg-amber-500/10 border-amber-500/30";
    default: return "bg-destructive/10 border-destructive/30";
  }
});

const formatIconColor = computed(() => {
  switch (formatColor.value) {
    case "green": return "text-success";
    case "amber": return "text-amber-500";
    default: return "text-destructive";
  }
});

const formatSteps = computed(() => {
  const result: Array<{ label: string; detail?: string; status: "pass" | "fail" | "pending" }> = [];
  const signers = props.details?.signers;
  const files = props.details?.files;

  result.push({
    label: "Parse file",
    status: "pass",
  });

  if (props.code === VerifyErrorCode.NO_SIGNATURES) {
    result.push({ label: "Check signatures", detail: "No signatures found", status: "fail" });
    return result;
  }

  const count = signers?.length ?? 0;
  result.push({
    label: "Check signatures",
    detail: count > 0 ? `Found ${count} signature${count > 1 ? "s" : ""}` : undefined,
    status: count > 0 ? "pass" : "pending",
  });

  if (files && files.length > 0) {
    const allPassed = files.every((f) => f.valid);
    const failedCount = files.filter((f) => !f.valid).length;
    result.push({
      label: "Check file integrity",
      detail: allPassed
        ? `All ${files.length} files verified`
        : `${failedCount} file${failedCount > 1 ? "s" : ""} failed`,
      status: allPassed ? "pass" : "fail",
    });
  }

  return result;
});

const hasDocMeta = computed(() =>
  props.details?.name || props.details?.description || props.details?.version || props.details?.author,
);

const sortedSigners = computed(() => {
  return props.details?.signers ?? [];
});

const signaturesValid = computed(() => {
  const signers = sortedSigners.value;
  if (signers.length === 0) return false;
  return signers.every((s) => s.valid);
});

const signaturesColor = computed<"green" | "amber" | "red">(() => {
  const signers = sortedSigners.value;
  if (signers.length === 0) return "red";
  if (signers.every((s) => s.valid)) return "green";
  if (signers.some((s) => s.valid)) return "amber";
  return "red";
});

const signaturesContainerClass = computed(() => {
  switch (signaturesColor.value) {
    case "green": return "bg-success/10 border-success/30";
    case "amber": return "bg-amber-500/10 border-amber-500/30";
    default: return "bg-destructive/10 border-destructive/30";
  }
});

const signaturesIconColor = computed(() => {
  switch (signaturesColor.value) {
    case "green": return "text-success";
    case "amber": return "text-amber-500";
    default: return "text-destructive";
  }
});

const signaturesLabel = computed(() => {
  const signers = sortedSigners.value;
  if (signers.length === 0) return "Signature: None";
  const valid = signers.filter((s) => s.valid).length;
  return `Signature: ${valid}/${signers.length} Valid`;
});

function buildReport(): string {
  const lines: string[] = [];
  if (props.details?.signers) {
    const valid = props.details.signers.filter((s) => s.valid).length;
    lines.push(`Signature: ${valid}/${props.details.signers.length} Valid`);
    for (const s of props.details.signers) {
      const label = s.valid ? "VALID" : "INVALID";
      const parts = [`  ${label} ${s.publisher}${s.keyId ? ` (${s.keyId})` : ""}`];
      if (s.keySource) parts.push(`[${s.keySource}]`);
      if (s.code) parts.push(`— ${s.code}`);
      lines.push(parts.join(" "));
    }
    lines.push("");
  }
  lines.push(`Format: ${formatValid.value ? "Valid" : "Invalid"}`);
  if (props.details?.name) lines.push(`Name: ${props.details.name}`);
  if (props.details?.description) lines.push(`Description: ${props.details.description}`);
  if (props.details?.version) lines.push(`Version: ${props.details.version}`);
  if (props.details?.author) lines.push(`Author: ${props.details.author}`);
  if (props.details?.files) {
    const failed = props.details.files.filter((f) => !f.valid);
    if (failed.length > 0) {
      lines.push("");
      lines.push("File integrity issues:");
      for (const f of failed) lines.push(`  FAIL ${f.path} — ${f.code}`);
    }
  }
  return lines.join("\n");
}
</script>

<template>
  <div class="space-y-4">
    <!-- Signatures Section -->
    <div v-if="sortedSigners.length > 0" :class="['rounded-lg border', signaturesContainerClass]">
      <div class="p-4">
        <div class="flex items-center gap-3">
          <ShieldCheck v-if="signaturesValid" :class="['w-6 h-6 shrink-0', signaturesIconColor]" />
          <ShieldAlert v-else-if="signaturesColor === 'amber'" :class="['w-6 h-6 shrink-0', signaturesIconColor]" />
          <ShieldX v-else :class="['w-6 h-6 shrink-0', signaturesIconColor]" />
          <span class="font-semibold text-lg text-foreground">{{ signaturesLabel }}</span>
          <button
            class="ml-auto p-1.5 rounded-md hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy verification report"
            @click="copy(buildReport())"
          >
            <Check v-if="copied" class="w-4 h-4 text-success" />
            <Copy v-else class="w-4 h-4" />
          </button>
        </div>
      </div>
      <div class="px-4 pb-4 space-y-2">
        <SignerDetail
          v-for="(signer, i) in sortedSigners"
          :key="i"
          :signer="signer"
          :index="sortedSigners.length - i"
        />
      </div>
    </div>

    <!-- Format Section -->
    <div :class="['rounded-lg border', formatContainerClass]">
      <div class="p-4">
        <div class="flex items-center gap-3">
          <CheckCircle v-if="formatValid" :class="['w-6 h-6 shrink-0', formatIconColor]" />
          <AlertCircle v-else-if="formatColor === 'amber'" :class="['w-6 h-6 shrink-0', formatIconColor]" />
          <XCircle v-else :class="['w-6 h-6 shrink-0', formatIconColor]" />
          <span class="font-semibold text-lg text-foreground">{{ formatLabel }}</span>
          <button
            v-if="sortedSigners.length === 0"
            class="ml-auto p-1.5 rounded-md hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy verification report"
            @click="copy(buildReport())"
          >
            <Check v-if="copied" class="w-4 h-4 text-success" />
            <Copy v-else class="w-4 h-4" />
          </button>
        </div>
        <p v-if="!formatValid && reason" class="text-sm text-muted-foreground mt-1 ml-9">{{ reason }}</p>
      </div>

      <div class="px-4 pb-3 border-t border-border/30 pt-3">
        <VerificationSteps :steps="formatSteps" />
      </div>

      <div v-if="hasDocMeta" class="px-4 pb-3 border-t border-border/30 pt-3">
        <p class="text-xs font-medium text-muted-foreground mb-1.5">Document</p>
        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <template v-if="details!.name">
            <span class="text-muted-foreground">Name</span>
            <span class="text-foreground font-medium">{{ details!.name }}</span>
          </template>
          <template v-if="details!.description">
            <span class="text-muted-foreground">Description</span>
            <span class="text-foreground">{{ details!.description }}</span>
          </template>
          <template v-if="details!.version">
            <span class="text-muted-foreground">Version</span>
            <code class="text-foreground">{{ details!.version }}</code>
          </template>
          <template v-if="details!.author">
            <span class="text-muted-foreground">Author</span>
            <code class="text-foreground">{{ details!.author }}</code>
          </template>
        </div>
      </div>

      <!-- File Integrity (ZIP) -->
      <div v-if="details?.files && details.files.length > 0" class="px-4 pb-4">
        <FileIntegrityList :files="details.files" />
      </div>
    </div>
  </div>
</template>
