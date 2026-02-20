<script setup lang="ts">
import { ref } from "vue";
import {
  ChevronRight,
  Loader2,
  FileText,
  FileArchive,
  ShieldCheck,
  ShieldAlert,
  FileQuestion,
  Download,
} from "lucide-vue-next";

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/binalyze/notar/main/samples";

interface SampleFile {
  name: string;
  label: string;
}

const SAMPLES: SampleFile[] = [
  { name: "hello-world.md", label: "Hello World" },
  { name: "hello-world.zip", label: "Hello World" },
];

interface SampleSection {
  dir: string;
  label: string;
  icon: typeof ShieldCheck;
  iconClass: string;
  labelClass: string;
}

const SECTIONS: SampleSection[] = [
  {
    dir: "unsigned",
    label: "Unsigned",
    icon: FileQuestion,
    iconClass: "text-muted-foreground",
    labelClass: "text-muted-foreground",
  },
  {
    dir: "signed/localhost",
    label: "Signed by localhost:5000",
    icon: ShieldCheck,
    iconClass: "text-success",
    labelClass: "text-success",
  },
  {
    dir: "signed/notar.binalyze.ai",
    label: "Signed by notar.binalyze.ai",
    icon: ShieldCheck,
    iconClass: "text-success",
    labelClass: "text-success",
  },
  {
    dir: "tampered",
    label: "Tampered (notar.binalyze.ai)",
    icon: ShieldAlert,
    iconClass: "text-destructive",
    labelClass: "text-destructive",
  },
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
    <div class="flex items-center gap-2 text-muted-foreground my-3">
      <div class="flex-1 border-t border-border" />
      <span class="text-xs uppercase tracking-wide">or</span>
      <div class="flex-1 border-t border-border" />
    </div>

    <div class="border border-border rounded-lg bg-muted/50 overflow-hidden">
      <button
        class="w-full flex items-center gap-1.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        @click="toggle()"
      >
        <ChevronRight
          :class="[
            'w-4 h-4 transition-transform duration-150',
            open && 'rotate-90',
          ]"
        />
        <span class="font-medium">Try a Sample SKILL</span>
        <span class="text-xs">(<a href="https://github.com/binalyze/notar/tree/main/samples" target="_blank" class="underline hover:text-foreground transition-colors" @click.stop>github.com/binalyze/notar/samples</a>)</span>
      </button>

      <div v-if="open" class="divide-y divide-border border-t border-border">
      <div
        v-for="section in SECTIONS"
        :key="section.dir"
        class="px-3 py-2.5"
      >
        <div class="flex items-center gap-1.5 mb-1.5">
          <component :is="section.icon" class="w-3.5 h-3.5" :class="section.iconClass" />
          <span
            class="text-xs font-semibold"
            :class="section.labelClass"
          >{{ section.label }}</span>
        </div>
        <div class="flex flex-wrap gap-1.5 ml-5">
          <div
            v-for="s in SAMPLES"
            :key="section.dir + '-' + s.name"
            :class="['inline-flex items-center text-xs rounded-md border overflow-hidden transition-colors', btnClass(section.dir, s.name)]"
          >
            <button
              :disabled="!!loadingKey"
              class="inline-flex items-center gap-1.5 px-2.5 py-1"
              @click="loadSample(section.dir, s.name)"
            >
              <Loader2 v-if="loadingKey === section.dir + '/' + s.name" class="w-3 h-3 animate-spin" />
              <FileArchive v-else-if="s.name.endsWith('.zip')" class="w-3 h-3" :class="selectedKey === section.dir + '/' + s.name ? 'text-success' : 'text-muted-foreground'" />
              <FileText v-else class="w-3 h-3" :class="selectedKey === section.dir + '/' + s.name ? 'text-success' : 'text-muted-foreground'" />
              {{ s.label }}
            </button>
            <button
              :disabled="!!loadingKey"
              class="border-l border-current/15 bg-black/[0.06] dark:bg-white/[0.06] px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide opacity-70"
              @click="loadSample(section.dir, s.name)"
            >{{ s.name.endsWith('.zip') ? 'ZIP' : 'MD' }}</button>
            <a
              :href="`${GITHUB_RAW_BASE}/${section.dir}/${s.name}`"
              target="_blank"
              class="border-l border-current/15 bg-black/[0.06] dark:bg-white/[0.06] px-1.5 py-1 opacity-70 hover:opacity-100 hover:text-primary transition-all"
              @click.stop
            >
              <Download class="w-3 h-3" />
            </a>
          </div>
        </div>
        <p v-if="errorKey?.startsWith(section.dir + '/')" class="ml-5 mt-1.5 text-xs text-destructive">
          Failed to load sample. Please check your connection and try again.
        </p>
      </div>
      </div>
    </div>
  </div>
</template>
