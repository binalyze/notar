<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/utils/cn";

interface Props {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "primary",
  size: "md",
  disabled: false,
  loading: false,
});

const classes = computed(() =>
  cn(
    "inline-flex items-center justify-center font-medium transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
    {
      "bg-primary text-white hover:bg-primary-hover focus:ring-primary":
        props.variant === "primary",
      "bg-secondary text-foreground hover:bg-secondary/80 focus:ring-secondary":
        props.variant === "secondary",
      "border border-border bg-transparent hover:bg-accent focus:ring-border":
        props.variant === "outline",
      "bg-transparent hover:bg-accent focus:ring-transparent":
        props.variant === "ghost",
      "px-3 py-1.5 text-sm": props.size === "sm",
      "px-4 py-2 text-base": props.size === "md",
      "px-6 py-3 text-lg": props.size === "lg",
    },
  ),
);
</script>

<template>
  <button :class="classes" :disabled="disabled || loading">
    <span v-if="loading" class="mr-2 animate-spin">
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </span>
    <slot />
  </button>
</template>
