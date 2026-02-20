<script setup lang="ts">
import { cn } from "@/utils/cn";

interface Props {
  class?: string;
  hoverable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  hoverable: false,
});
</script>

<template>
  <div
    :class="
      cn(
        'bg-card border border-border rounded-lg p-5 transition-all',
        { 'hover:border-muted-foreground/30 hover:shadow-sm cursor-pointer': hoverable },
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
