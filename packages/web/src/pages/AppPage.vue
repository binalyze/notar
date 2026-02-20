<script setup lang="ts">
import { ref } from "vue";
import type { AppTab } from "@/types";
import GenerateKeys from "@/components/tabs/GenerateKeys.vue";
import SignFile from "@/components/tabs/SignFile.vue";
import VerifyFile from "@/components/tabs/VerifyFile.vue";
import { KeyRound, FileSignature, ShieldCheck } from "lucide-vue-next";

const devPublicKey = typeof __DEV_PUBLIC_KEY__ === "undefined" ? "" : __DEV_PUBLIC_KEY__;
const devPrivateKey = typeof __DEV_PRIVATE_KEY__ === "undefined" ? "" : __DEV_PRIVATE_KEY__;
const devKeyId = typeof __DEV_KEY_ID__ === "undefined" ? "" : __DEV_KEY_ID__;

const activeTab = ref<AppTab>(devPrivateKey ? "sign" : "generate");
const generatedPrivateKey = ref(devPrivateKey);
const generatedPublicKey = ref(devPublicKey);
const generatedDomain = ref("");
const generatedKeyId = ref(devKeyId);
const keysGenerated = ref(0);

const tabs = [
  { id: "generate" as const, label: "Generate Keys", icon: KeyRound },
  { id: "sign" as const, label: "Sign File", icon: FileSignature },
  { id: "verify" as const, label: "Verify File", icon: ShieldCheck },
];
</script>

<template>
  <div class="py-8 md:py-12">
    <div class="container mx-auto px-6 max-w-3xl">
      <h1
        class="text-2xl md:text-3xl font-bold text-foreground mb-8 text-center"
      >
        Welcome to Notar!
      </h1>

      <!-- Tab bar -->
      <div class="flex border border-border rounded-lg overflow-hidden mb-8">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="[
            'flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
            activeTab === tab.id
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted',
          ]"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" class="w-4 h-4" />
          <span class="hidden sm:inline">{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab content -->
      <div class="bg-card border border-border rounded-lg p-6 md:p-8">
        <GenerateKeys
          v-show="activeTab === 'generate'"
          :dev-public-key="devPublicKey"
          :dev-private-key="devPrivateKey"
          :dev-key-id="devKeyId"
          @generated="generatedPrivateKey = $event; keysGenerated++"
          @public-key-set="generatedPublicKey = $event"
          @domain-set="generatedDomain = $event"
          @key-id-set="generatedKeyId = $event"
        />
        <SignFile
          v-show="activeTab === 'sign'"
          :initial-private-key="generatedPrivateKey"
          :initial-public-key="generatedPublicKey"
          :initial-publisher="generatedDomain"
          :initial-key-id="generatedKeyId"
        />
        <VerifyFile
          v-show="activeTab === 'verify'"
          :initial-public-key="generatedPublicKey"
          :keys-generated="keysGenerated"
        />
      </div>
    </div>
  </div>
</template>
