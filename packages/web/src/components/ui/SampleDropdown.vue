<script setup lang="ts">
import { ref } from "vue";
import {
  ChevronRight,
  Loader2,
  FileText,
  FileArchive,
  ShieldCheck,
  ShieldAlert,
} from "lucide-vue-next";

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/binalyze/notar/main/samples";

interface SampleFile {
  name: string;
  label: string;
}

const SAMPLES: SampleFile[] = [
  { name: "api-design.md", label: "API Design" },
  { name: "api-design.zip", label: "API Design" },
  { name: "code-review.md", label: "Code Review" },
  { name: "code-review.zip", label: "Code Review" },
  { name: "code-reviewer-agent.md", label: "Code Reviewer Agent" },
  { name: "devops-engineer-agent.md", label: "DevOps Engineer Agent" },
  { name: "git-workflow.md", label: "Git Workflow" },
  { name: "git-workflow.zip", label: "Git Workflow" },
  { name: "security-auditor-agent.md", label: "Security Auditor Agent" },
  { name: "security-awareness.md", label: "Security Awareness" },
  { name: "security-awareness.zip", label: "Security Awareness" },
];

const emit = defineEmits<{
  select: [file: File];
}>();

const open = ref(true);
const loadingKey = ref<string | null>(null);
const selectedKey = ref<string | null>(null);
const errorKey = ref<string | null>(null);

function toggle() {
  open.value = !open.value;
  if (open.value) errorKey.value = null;
}

function reset() {
  open.value = true;
  selectedKey.value = null;
  errorKey.value = null;
}

defineExpose({ reset });

async function loadSample(dir: string, fileName: string) {
  const key = `${dir}/${fileName}`;
  if (loadingKey.value) return;
  loadingKey.value = key;
  errorKey.value = null;
  try {
    const res = await fetch(`${GITHUB_RAW_BASE}/${dir}/${fileName}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const isZip = fileName.endsWith(".zip");
    const data = isZip ? await res.arrayBuffer() : await res.text();
    const type = isZip ? "application/zip" : "text/markdown";
    const file = new File([data], fileName, { type });
    selectedKey.value = key;
    emit("select", file);
    open.value = false;
  } catch {
    errorKey.value = key;
  } finally {
    loadingKey.value = null;
  }
}

function btnClass(dir: string, name: string) {
  const key = `${dir}/${name}`;
  if (errorKey.value === key)
    return "border-destructive/30 text-destructive bg-destructive/5";
  if (loadingKey.value === key)
    return "border-success/50 bg-success/10 text-success";
  if (selectedKey.value === key)
    return "border-success/50 bg-success/10 text-success";
  if (loadingKey.value)
    return "border-border bg-background text-foreground opacity-50 cursor-not-allowed";
  return "border-border bg-background text-foreground hover:bg-muted hover:border-muted-foreground/30";
}
</script>

<template>
  <div class="mt-3">
    <button
      class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      @click="toggle()"
    >
      <ChevronRight
        :class="[
          'w-4 h-4 transition-transform duration-150',
          open && 'rotate-90',
        ]"
      />
      <span class="font-medium">Or try a Sample SKILL</span>
    </button>

    <div
      v-if="open"
      class="mt-2 border border-border rounded-lg bg-muted/50 overflow-hidden"
    >
      <div class="px-3 pt-3 pb-1">
        <div class="flex items-center gap-1.5 mb-1.5">
          <ShieldCheck class="w-3.5 h-3.5 text-success" />
          <span
            class="text-xs font-semibold text-success uppercase tracking-wider"
            >Signed</span
          >
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in SAMPLES"
            :key="'signed-' + s.name"
            :disabled="!!loadingKey"
            :class="['inline-flex items-center text-xs rounded-md border overflow-hidden transition-colors', btnClass('signed', s.name)]"
            @click="loadSample('signed', s.name)"
          >
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1">
              <Loader2 v-if="loadingKey === 'signed/' + s.name" class="w-3 h-3 animate-spin" />
              <FileArchive v-else-if="s.name.endsWith('.zip')" class="w-3 h-3" :class="selectedKey === 'signed/' + s.name ? 'text-success' : 'text-muted-foreground'" />
              <FileText v-else class="w-3 h-3" :class="selectedKey === 'signed/' + s.name ? 'text-success' : 'text-muted-foreground'" />
              {{ s.label }}
            </span>
            <span class="border-l border-current/15 bg-black/[0.06] dark:bg-white/[0.06] px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">{{ s.name.endsWith('.zip') ? 'ZIP' : 'MD' }}</span>
          </button>
        </div>
      </div>
      <div class="px-3 pt-2 pb-3">
        <div class="flex items-center gap-1.5 mb-1.5">
          <ShieldAlert class="w-3.5 h-3.5 text-destructive" />
          <span
            class="text-xs font-semibold text-destructive uppercase tracking-wider"
            >Modified (Tampered)</span
          >
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in SAMPLES"
            :key="'modified-' + s.name"
            :disabled="!!loadingKey"
            :class="['inline-flex items-center text-xs rounded-md border overflow-hidden transition-colors', btnClass('modified', s.name)]"
            @click="loadSample('modified', s.name)"
          >
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1">
              <Loader2 v-if="loadingKey === 'modified/' + s.name" class="w-3 h-3 animate-spin" />
              <FileArchive v-else-if="s.name.endsWith('.zip')" class="w-3 h-3" :class="selectedKey === 'modified/' + s.name ? 'text-success' : 'text-muted-foreground'" />
              <FileText v-else class="w-3 h-3" :class="selectedKey === 'modified/' + s.name ? 'text-success' : 'text-muted-foreground'" />
              {{ s.label }}
            </span>
            <span class="border-l border-current/15 bg-black/[0.06] dark:bg-white/[0.06] px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">{{ s.name.endsWith('.zip') ? 'ZIP' : 'MD' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
