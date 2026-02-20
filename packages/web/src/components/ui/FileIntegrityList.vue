<script setup lang="ts">
import { ref, computed } from "vue";
import { CheckCircle, XCircle, FileText, ChevronRight } from "lucide-vue-next";
import type { FileIntegrityResult } from "@binalyze/notar";

const props = defineProps<{ files: FileIntegrityResult[] }>();
const expandedPaths = ref(new Set<string>());

function toggle(path: string) {
  if (expandedPaths.value.has(path)) expandedPaths.value.delete(path);
  else expandedPaths.value.add(path);
}

const failedCount = computed(() => props.files.filter((f) => !f.valid).length);
</script>

<template>
  <div class="space-y-1">
    <p class="text-xs font-medium text-muted-foreground mb-1.5">
      File Integrity — {{ files.length }} files,
      <span v-if="failedCount === 0" class="text-success">all passed</span>
      <span v-else class="text-destructive">{{ failedCount }} failed</span>
    </p>
    <div
      v-for="file in files"
      :key="file.path"
      :class="['rounded-md border transition-colors', file.valid ? 'border-border/50' : 'border-destructive/30 bg-destructive/5']"
    >
      <button
        class="flex items-center gap-2 w-full text-left px-2.5 py-1.5"
        :disabled="file.valid"
        @click="!file.valid && toggle(file.path)"
      >
        <CheckCircle v-if="file.valid" class="w-3.5 h-3.5 text-success shrink-0" />
        <XCircle v-else class="w-3.5 h-3.5 text-destructive shrink-0" />
        <FileText class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span class="text-xs font-mono text-foreground truncate">{{ file.path }}</span>
        <ChevronRight
          v-if="!file.valid"
          :class="['w-3 h-3 text-muted-foreground transition-transform ml-auto shrink-0', expandedPaths.has(file.path) && 'rotate-90']"
        />
      </button>
      <div v-if="!file.valid && expandedPaths.has(file.path)" class="px-2.5 pb-2 space-y-0.5 text-xs">
        <div v-if="file.expectedHash" class="text-muted-foreground">
          Expected: <code class="text-foreground">{{ file.expectedHash }}</code>
        </div>
        <div v-if="file.actualHash" class="text-muted-foreground">
          Actual: <code class="text-destructive">{{ file.actualHash }}</code>
        </div>
        <div v-if="!file.actualHash" class="text-destructive">File missing from archive</div>
      </div>
    </div>
  </div>
</template>
