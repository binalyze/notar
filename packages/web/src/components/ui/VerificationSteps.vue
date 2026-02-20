<script setup lang="ts">
import { CheckCircle, XCircle, Circle } from "lucide-vue-next";

interface Step {
  label: string;
  detail?: string;
  status: "pass" | "fail" | "pending";
}

defineProps<{ steps: Step[] }>();
</script>

<template>
  <div class="space-y-1">
    <div
      v-for="(step, i) in steps"
      :key="i"
      class="flex items-start gap-2.5 py-1"
    >
      <CheckCircle v-if="step.status === 'pass'" class="w-4 h-4 text-success shrink-0 mt-0.5" />
      <XCircle v-else-if="step.status === 'fail'" class="w-4 h-4 text-destructive shrink-0 mt-0.5" />
      <Circle v-else class="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <div class="min-w-0">
        <p class="text-sm text-foreground">{{ step.label }}</p>
        <p v-if="step.detail" class="text-xs text-muted-foreground">{{ step.detail }}</p>
      </div>
    </div>
  </div>
</template>
