<script setup lang="ts">
import { onMounted, nextTick } from "vue";
import { RouterView } from "vue-router";
import { useConfig } from "@/composables/useConfig";
import Navbar from "@/components/layout/Navbar.vue";
import Footer from "@/components/layout/Footer.vue";

const config = useConfig();

function dismissPreloader() {
  document.getElementById("app")?.classList.add("ready");
  const el = document.getElementById("preloader");
  if (!el) return;
  el.classList.add("fade-out");
  el.addEventListener("transitionend", () => el.remove());
}

onMounted(async () => {
  document.title = `Notar - ${config.value.product.tagline}`;
  await nextTick();
  const elapsed =
    Date.now() -
    ((globalThis as unknown as Record<string, number>).__preloaderStart ||
      Date.now());
  const remaining = Math.max(0, 1500 - elapsed);
  setTimeout(() => {
    requestAnimationFrame(() => requestAnimationFrame(dismissPreloader));
  }, remaining);
});
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background text-foreground">
    <Navbar />
    <main class="flex-1 bg-card">
      <RouterView />
    </main>
    <Footer />
  </div>
</template>
