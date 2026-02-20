<script setup lang="ts">
import { RouterLink } from "vue-router";
import { ROUTES } from "@/constants/routes";
import { useConfig } from "@/composables/useConfig";
import Logo from "@/components/ui/Logo.vue";
import { Github, Linkedin, Twitter } from "lucide-vue-next";

const config = useConfig();
const currentYear = new Date().getFullYear();
</script>

<template>
  <footer class="border-t border-border bg-card/50">
    <div class="container mx-auto px-6 py-12">
      <div class="flex flex-col md:flex-row md:justify-between gap-8">
        <!-- Brand -->
        <div class="max-w-sm">
          <Logo variant="company" class="w-32 mb-4" />
          <p class="text-sm text-muted-foreground mb-4 max-w-sm">
            {{ config.product.tagline }}
          </p>
          <div class="flex items-center gap-3">
            <a
              v-if="config.company.social.linkedin"
              :href="config.company.social.linkedin"
              target="_blank"
              class="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin class="w-4 h-4" />
            </a>
            <a
              v-if="config.company.social.twitter"
              :href="config.company.social.twitter"
              target="_blank"
              class="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              aria-label="X"
            >
              <Twitter class="w-4 h-4" />
            </a>
            <a
              :href="config.product.github"
              target="_blank"
              class="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              aria-label="GitHub"
            >
              <Github class="w-4 h-4" />
            </a>
          </div>
        </div>

        <!-- Product -->
        <div>
          <h4 class="font-semibold text-foreground mb-4">Product</h4>
          <ul class="space-y-2">
            <li>
              <RouterLink
                :to="ROUTES.app"
                class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                App
              </RouterLink>
            </li>
            <li>
              <RouterLink
                :to="ROUTES.docs"
                class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Documentation
              </RouterLink>
            </li>
            <li>
              <a
                :href="config.product.github"
                target="_blank"
                class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            </li>
            <li>
              <a
                href="https://www.npmjs.com/package/@binalyze/notar"
                target="_blank"
                class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                npm Package
              </a>
            </li>
          </ul>
        </div>

        <!-- Company -->
        <div v-if="config.company.links.length">
          <h4 class="font-semibold text-foreground mb-4">{{ config.company.name }}</h4>
          <ul class="space-y-2">
            <li v-for="link in config.company.links" :key="link.url">
              <a
                :href="link.url"
                target="_blank"
                class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {{ link.label }}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom -->
      <div class="mt-12 pt-8 border-t border-border">
        <p class="text-sm text-muted-foreground">
          &copy; {{ currentYear }} {{ config.company.name }}. Open source under MIT License.
        </p>
      </div>
    </div>
  </footer>
</template>
