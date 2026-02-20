<script setup lang="ts">
import { computed } from "vue";
import { useConfig } from "@/composables/useConfig";
import logoDark from "@/assets/logo-dark.svg";
import logoLight from "@/assets/logo-light.svg";

const config = useConfig();

const props = withDefaults(
  defineProps<{
    variant?: "product" | "company";
    light?: boolean;
  }>(),
  {
    variant: "product",
    light: false,
  },
);

const src = computed(() => {
  if (props.variant === "company") {
    return props.light ? config.value.company.logo.light : config.value.company.logo.dark;
  }
  return props.light ? logoLight : logoDark;
});

const alt = computed(() => {
  return props.variant === "company" ? config.value.company.name : "Notar";
});
</script>

<template>
  <img
    :src="src"
    :alt="alt"
    draggable="false"
    class="object-contain select-none pointer-events-none"
  />
</template>
