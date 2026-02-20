import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const ROOT = resolve(__dirname, "../..");

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const vars: Record<string, string> = {};
    for (const line of readFileSync(filePath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
    return vars;
  } catch {
    return {};
  }
}

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";
  const envFile = isDev ? resolve(ROOT, ".env.dev") : resolve(ROOT, ".env.prod");
  const env = loadEnvFile(envFile);
  return {
    plugins: [
      vue(),
      tailwindcss(),
      cloudflare({ configPath: resolve(__dirname, "wrangler.jsonc") }),
    ],
    root: "src",
    envPrefix: "NOTAR_",
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    build: {
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      port: 5000,
    },
    define: {
      __DEV_PRIVATE_KEY__: JSON.stringify(isDev ? (env.NOTAR_PRIVATE_KEY ?? "") : ""),
      __DEV_PUBLIC_KEY__: JSON.stringify(isDev ? (env.NOTAR_PUBLIC_KEY ?? "") : ""),
      __DEV_KEY_ID__: JSON.stringify(isDev ? (env.NOTAR_KEY_ID ?? "") : ""),
    },
  };
});
