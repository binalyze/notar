<script setup lang="ts">
import { RouterLink } from "vue-router";
import { ROUTES } from "@/constants/routes";
import Button from "@/components/ui/Button.vue";
</script>

<template>
  <div class="flex items-center justify-center min-h-[60vh] py-20">
    <div class="text-center">
      <p class="text-7xl font-bold text-primary mb-4">404</p>
      <h1 class="text-2xl font-bold text-foreground mb-2">Page Not Found</h1>
      <p class="text-muted-foreground mb-8">
        The page you're looking for doesn't exist.
      </p>
      <RouterLink :to="ROUTES.home">
        <Button>Go Home</Button>
      </RouterLink>
    </div>
  </div>
</template>
