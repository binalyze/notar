import { ref } from "vue";

export function useFileUpload(accept?: string) {
  const file = ref<File | null>(null);
  const isDragging = ref(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging.value = false;
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) file.value = dropped;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging.value = true;
  }

  function handleDragLeave() {
    isDragging.value = false;
  }

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const selected = target.files?.[0];
    if (selected) file.value = selected;
  }

  function openFilePicker() {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    input.addEventListener("change", handleFileSelect);
    input.click();
  }

  function clear() {
    file.value = null;
  }

  return {
    file,
    isDragging,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
    clear,
  };
}
