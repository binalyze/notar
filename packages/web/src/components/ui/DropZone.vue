<script setup lang="ts">
import { Upload, X, FileText, FileArchive } from "lucide-vue-next";
import { useFileUpload } from "@/composables/useFileUpload";

const props = withDefaults(
  defineProps<{
    accept?: string;
    label?: string;
  }>(),
  {
    accept: ".md,.zip",
    label: "Drop a file here or click to browse",
  },
);

const emit = defineEmits<{
  select: [file: File];
  clear: [];
}>();

const { file, isDragging, handleDrop, handleDragOver, handleDragLeave, openFilePicker, clear } =
  useFileUpload(props.accept);

function onDrop(e: DragEvent) {
  handleDrop(e);
  if (file.value) emit("select", file.value);
}

function onPick() {
  const input = document.createElement("input");
  input.type = "file";
  if (props.accept) input.accept = props.accept;
  input.addEventListener("change", (e) => {
    const selected = (e.target as HTMLInputElement).files?.[0];
    if (selected) {
      file.value = selected;
      emit("select", selected);
    }
  });
  input.click();
}

function onClear() {
  clear();
  emit("clear");
}

function setFile(f: File) {
  file.value = f;
}

defineExpose({ setFile });

const isZip = (name: string) => name.endsWith(".zip");
</script>

<template>
  <div
    :class="[
      'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors',
      isDragging
        ? 'border-primary bg-primary/5'
        : 'border-border hover:border-muted-foreground/50',
    ]"
    @drop="onDrop"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @click="!file && onPick()"
  >
    <template v-if="!file">
      <Upload class="w-8 h-8 mx-auto mb-3 text-primary" />
      <p class="text-sm text-muted-foreground">{{ label }}</p>
      <p class="text-xs text-muted-foreground mt-1">Supports .md and .zip files</p>
    </template>
    <template v-else>
      <div class="flex items-center justify-center gap-3">
        <FileArchive v-if="isZip(file.name)" class="w-6 h-6 text-primary shrink-0" />
        <FileText v-else class="w-6 h-6 text-primary shrink-0" />
        <div class="text-left min-w-0">
          <p class="text-sm font-medium text-foreground truncate">{{ file.name }}</p>
          <p class="text-xs text-muted-foreground">
            {{ (file.size / 1024).toFixed(1) }} KB
          </p>
        </div>
        <button
          class="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Remove file"
          @click.stop="onClear"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </template>
  </div>
</template>
