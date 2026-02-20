<script setup lang="ts">
import { ref, computed } from "vue";
import { Copy, Check, Eye, EyeOff } from "lucide-vue-next";
import { useCopy } from "@/composables/useCopy";

const props = defineProps<{
  code: string;
  label?: string;
  secret?: boolean;
}>();

const emit = defineEmits<{ copied: [] }>();
const { copied, copy: doCopy } = useCopy();
const revealed = ref(false);
const masked = computed(() => "•".repeat(Math.min(props.code.length, 40)));

function copy(text: string) {
  doCopy(text);
  emit("copied");
}
</script>

<template>
  <div class="relative">
    <p v-if="label" class="text-xs font-medium text-muted-foreground mb-1.5">
      {{ label }}
    </p>
    <div class="relative bg-muted rounded-lg">
      <pre
        class="p-4 pr-20 text-sm overflow-x-auto whitespace-pre-wrap break-all font-mono text-foreground"
      >{{ secret && !revealed ? masked : code }}</pre>
      <div class="absolute top-2 right-2 flex items-center gap-1">
        <button
          v-if="secret"
          class="p-2 rounded-md hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
          :title="revealed ? 'Hide' : 'Reveal'"
          @click="revealed = !revealed"
        >
          <EyeOff v-if="revealed" class="w-4 h-4" />
          <Eye v-else class="w-4 h-4" />
        </button>
        <button
          class="p-2 rounded-md hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Copy"
          @click="copy(props.code)"
        >
          <Check v-if="copied" class="w-4 h-4 text-success" />
          <Copy v-else class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
