<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { ROUTES } from "@/constants/routes";
import { useConfig } from "@/composables/useConfig";
import Card from "@/components/ui/Card.vue";
import Button from "@/components/ui/Button.vue";
import {
  KeyRound,
  FileSignature,
  ShieldCheck,
  Package,
  Globe,
  Zap,
  Github,
  Copy,
  Check,
  AlertTriangle,
  Terminal,
  HelpCircle,
  Fingerprint,
  BadgeCheck,
  Lock,
  ArrowRight,
  ArrowDown,
} from "lucide-vue-next";

const config = useConfig();
const deployUrl = computed(
  () =>
    `https://deploy.workers.cloudflare.com/?url=${config.value.product.github}`,
);
const npxCommand = "npx @binalyze/notar";
const copied = ref(false);
function copyNpxCommand() {
  navigator.clipboard.writeText(npxCommand);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

const problems = [
  {
    icon: Terminal,
    title: "Markdown is an executable!",
    description:
      "Markdown can embed scripts, links, and dynamic content that agents and tools execute. Without signatures, a tampered file runs just like a trusted one.",
  },
  {
    icon: AlertTriangle,
    title: "Tampering Goes Undetected",
    description:
      "Files are shared across tools, pipelines, and teams with no integrity guarantees. A single modification can go unnoticed and compromise downstream decisions.",
  },
  {
    icon: HelpCircle,
    title: "No Proof of Origin",
    description:
      "When a file arrives in your inbox or pipeline, you have no cryptographic proof of who created it or whether it's been altered since.",
  },
];

const solutions = [
  {
    icon: Fingerprint,
    title: "Cryptographic Identity",
    description:
      "Ed25519 key pairs tie every signature to a verifiable author. You always know who signed a file.",
  },
  {
    icon: BadgeCheck,
    title: "Tamper-Proof Integrity",
    description:
      "Any modification after signing invalidates the signature. Even a single byte change is instantly detectable.",
  },
  {
    icon: Lock,
    title: "Trust at the File Level",
    description:
      "Signatures travel with the file itself — in Markdown front matter or ZIP manifests — so trust is portable and verifiable anywhere.",
  },
];

const steps = [
  {
    icon: KeyRound,
    title: "Generate Keys",
    description: [
      "Create a private key for signing and a public key for verification.",
      "Host your public key on your domain so others can discover it automatically.",
    ],
  },
  {
    icon: FileSignature,
    title: "Sign Files",
    description: [
      "Sign Markdown or ZIP files using your private key.",
      "The signature is embedded directly in the file — no sidecars or extra files needed.",
      "Works in the browser, CLI, or SDK.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Verify Authenticity",
    description: [
      "Anyone can verify a signed file with the signer's public key.",
      "Public keys are resolved automatically from the signer's domain.",
      "Verify in the browser, CLI, or SDK.",
    ],
  },
];

const features = [
  {
    icon: KeyRound,
    title: "Cryptographic Signing",
    description:
      "Industry-standard cryptography for secure, tamper-proof file signing.",
  },
  {
    icon: Package,
    title: "MD & ZIP Support",
    description:
      "Sign markdown files with front matter or ZIP packages with manifests.",
  },
  {
    icon: Globe,
    title: "Key Publishing",
    description:
      "Publish keys via HTTPS .well-known or DNS TXT records for domain verification.",
  },
  {
    icon: Github,
    title: "Open Source",
    description:
      "Free and open source. Inspect the code, contribute, or self-host.",
  },
  {
    icon: Zap,
    title: "Fast & Global",
    description:
      "Runs on the edge for fast, global availability with zero cold starts.",
  },
  {
    icon: ShieldCheck,
    title: "Stateless & Private",
    description:
      "No data persistence. Files are processed in memory and discarded immediately.",
  },
];
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="py-14 md:py-20 bg-background border-b border-border/60">
      <div class="container mx-auto px-6 text-center">
        <h1
          class="text-4xl md:text-6xl font-bold text-foreground tracking-tight"
        >
          Trust-First
          <span class="text-primary">AI</span>
        </h1>
        <p class="mt-6 text-lg md:text-xl text-foreground max-w-2xl mx-auto">
          {{ config.product.tagline }}
        </p>
        <div
          class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <RouterLink :to="ROUTES.app">
            <Button size="lg">Get Started</Button>
          </RouterLink>
          <a :href="config.product.github" target="_blank">
            <Button variant="outline" size="lg">
              <Github class="w-5 h-5 mr-2" />
              View on GitHub
            </Button>
          </a>
        </div>
      </div>
    </section>

    <!-- Problem -->
    <section class="py-20 bg-muted border-y border-border/60">
      <div class="container mx-auto px-6">
        <h2 class="text-3xl font-bold text-foreground text-center mb-4">
          The Problem
        </h2>
        <p class="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
          In an AI-driven world, content trust is broken by default.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card
            v-for="problem in problems"
            :key="problem.title"
            class="text-center"
          >
            <div
              class="w-12 h-12 bg-destructive/10 rounded-xl flex items-center justify-center mx-auto mb-4"
            >
              <component :is="problem.icon" class="w-6 h-6 text-destructive" />
            </div>
            <h3
              class="text-lg font-semibold text-foreground mb-2 whitespace-pre-line"
            >
              {{ problem.title }}
            </h3>
            <p class="text-sm text-muted-foreground">
              {{ problem.description }}
            </p>
          </Card>
        </div>
      </div>
    </section>

    <!-- Solution -->
    <section class="py-20">
      <div class="container mx-auto px-6">
        <h2 class="text-3xl font-bold text-foreground text-center mb-4">
          The Solution
        </h2>
        <p class="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
          Notar brings cryptographic trust to every file — free and open source.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card
            v-for="solution in solutions"
            :key="solution.title"
            class="text-center"
          >
            <div
              class="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4"
            >
              <component :is="solution.icon" class="w-6 h-6 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-foreground mb-2">
              {{ solution.title }}
            </h3>
            <p class="text-sm text-muted-foreground">
              {{ solution.description }}
            </p>
          </Card>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section class="py-20 bg-muted border-y border-border/60">
      <div class="container mx-auto px-6">
        <h2 class="text-3xl font-bold text-foreground text-center mb-4">
          How It Works
        </h2>
        <p class="text-muted-foreground text-center max-w-2xl mx-auto mb-14">
          Three simple steps to sign and verify any file.
        </p>
        <!-- Desktop flow -->
        <div class="hidden md:flex items-stretch max-w-5xl mx-auto gap-0">
          <template v-for="(step, i) in steps" :key="i">
            <div
              class="flex-1 relative bg-card border border-border rounded-xl p-6 flex flex-col"
            >
              <div
                class="absolute -top-3 left-5 px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold"
              >
                Step {{ i + 1 }}
              </div>
              <div class="flex items-center gap-3 mt-1 mb-4">
                <div
                  class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"
                >
                  <component :is="step.icon" class="w-5 h-5 text-primary" />
                </div>
                <h3 class="text-lg font-semibold text-foreground">
                  {{ step.title }}
                </h3>
              </div>
              <div class="text-sm text-muted-foreground space-y-2">
                <p v-for="(line, j) in step.description" :key="j">
                  {{ line }}
                </p>
              </div>
            </div>
            <div
              v-if="i < steps.length - 1"
              class="flex items-center shrink-0 px-1"
            >
              <ArrowRight class="w-5 h-5 text-muted-foreground" />
            </div>
          </template>
        </div>
        <!-- Mobile flow -->
        <div
          class="flex md:hidden flex-col items-center max-w-sm mx-auto gap-0"
        >
          <template v-for="(step, i) in steps" :key="i">
            <div
              class="w-full relative bg-card border border-border rounded-xl p-5"
            >
              <div
                class="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold"
              >
                Step {{ i + 1 }}
              </div>
              <div class="flex items-center gap-3 mt-1 mb-3">
                <div
                  class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"
                >
                  <component :is="step.icon" class="w-4 h-4 text-primary" />
                </div>
                <h3 class="text-base font-semibold text-foreground">
                  {{ step.title }}
                </h3>
              </div>
              <div class="text-sm text-muted-foreground space-y-2">
                <p v-for="(line, j) in step.description" :key="j">
                  {{ line }}
                </p>
              </div>
            </div>
            <div v-if="i < steps.length - 1" class="py-2">
              <ArrowDown class="w-4 h-4 text-muted-foreground" />
            </div>
          </template>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="py-20">
      <div class="container mx-auto px-6">
        <h2 class="text-3xl font-bold text-foreground text-center mb-12">
          Features
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card v-for="feature in features" :key="feature.title">
            <div
              class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3"
            >
              <component :is="feature.icon" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-lg font-semibold text-foreground mb-2">
              {{ feature.title }}
            </h3>
            <p class="text-sm text-muted-foreground">
              {{ feature.description }}
            </p>
          </Card>
        </div>
      </div>
    </section>

    <!-- Deploy -->
    <section class="py-20 bg-muted border-y border-border/60">
      <div class="container mx-auto px-6 text-center">
        <h2 class="text-3xl font-bold text-foreground mb-4">Deploy Your Own</h2>
        <p class="text-muted-foreground mb-8 max-w-lg mx-auto">
          Fork, rebrand, and deploy your own instance in one click.
        </p>
        <a :href="deployUrl" target="_blank">
          <img
            src="https://deploy.workers.cloudflare.com/button"
            alt="Deploy to Cloudflare"
            class="mx-auto"
          />
        </a>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-20">
      <div class="container mx-auto px-6 text-center">
        <h2 class="text-3xl font-bold text-foreground mb-4">
          Start signing now
        </h2>
        <p class="text-muted-foreground mb-8 max-w-lg mx-auto">
          Use the web app or run the CLI directly with npx — no install needed.
        </p>
        <div
          class="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <RouterLink :to="ROUTES.app">
            <Button size="lg">Open App</Button>
          </RouterLink>
          <div
            class="px-5 py-3 bg-muted rounded-lg font-mono text-sm text-foreground flex items-center gap-3"
          >
            <span>{{ npxCommand }}</span>
            <button
              class="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              @click="copyNpxCommand"
            >
              <Check v-if="copied" class="w-4 h-4 text-green-500" />
              <Copy v-else class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
