<script setup lang="ts">
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { ROUTES } from "@/constants/routes";
import { useConfig } from "@/composables/useConfig";
import Logo from "@/components/ui/Logo.vue";
import { Menu, X, Github } from "lucide-vue-next";

const config = useConfig();

const isMobileMenuOpen = ref(false);

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
};

const navItems = [
  { label: "App", to: ROUTES.app },
  { label: "Docs", to: ROUTES.docs },
];
</script>

<template>
  <header
    class="bg-zinc-950/95 backdrop-blur-lg sticky top-0 z-50 shadow-[0_1px_3px_0_rgb(0_0_0/0.3)]"
  >
    <nav class="container mx-auto px-6 h-16 flex items-center justify-between">
      <RouterLink :to="ROUTES.home" class="flex items-center gap-3">
        <Logo light class="h-7 w-auto -mt-0.5" />
      </RouterLink>

      <!-- Desktop Navigation -->
      <div class="hidden md:flex items-center gap-1">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="px-4 py-2 text-sm text-zinc-300 transition-colors rounded hover:bg-zinc-800 hover:text-white"
          active-class="!text-white !bg-zinc-800"
        >
          {{ item.label }}
        </RouterLink>
      </div>

      <!-- Desktop CTA -->
      <div class="hidden md:flex items-center gap-4">
        <a
          :href="config.product.github"
          target="_blank"
          class="p-2 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-white transition-colors"
          aria-label="GitHub"
        >
          <Github class="w-5 h-5" />
        </a>
        <RouterLink
          :to="ROUTES.app"
          class="px-5 py-2 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-400 transition-colors"
        >
          Get Started
        </RouterLink>
      </div>

      <!-- Mobile Menu Button -->
      <button
        class="md:hidden p-2 text-zinc-400 hover:text-white"
        aria-label="Toggle menu"
        @click="toggleMobileMenu"
      >
        <Menu v-if="!isMobileMenuOpen" class="w-6 h-6" />
        <X v-else class="w-6 h-6" />
      </button>
    </nav>

    <!-- Mobile Menu -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-show="isMobileMenuOpen"
        class="md:hidden border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-lg"
      >
        <div class="container mx-auto px-6 py-4 space-y-2">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="block px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors"
            @click="isMobileMenuOpen = false"
          >
            {{ item.label }}
          </RouterLink>

          <div class="border-t border-zinc-800 my-4" />

          <a
            :href="config.product.github"
            target="_blank"
            class="block px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors"
            @click="isMobileMenuOpen = false"
          >
            GitHub
          </a>

          <RouterLink
            :to="ROUTES.app"
            class="block w-full px-5 py-3 bg-blue-500 text-white rounded text-sm font-medium text-center hover:bg-blue-400 transition-colors"
            @click="isMobileMenuOpen = false"
          >
            Get Started
          </RouterLink>
        </div>
      </div>
    </Transition>
  </header>
</template>
