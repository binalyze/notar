import json from "@eslint/json";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.output/**",
      "**/.vscode/**",
      // Ignore all files except .json — TS/JS linting handled by oxlint
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "**/*.ts",
      "**/*.mts",
      "**/*.cts",
      "**/*.jsx",
      "**/*.tsx",
      "**/*.css",
      "**/*.vue",
    ],
  },
  {
    files: ["**/tsconfig*.json", "**/.oxlintrc.json"],
    ...json.configs.recommended,
    language: "json/jsonc",
  },
  {
    files: ["**/*.json"],
    ignores: ["**/tsconfig*.json", "**/.oxlintrc.json"],
    ...json.configs.recommended,
    language: "json/json",
  },
]);
