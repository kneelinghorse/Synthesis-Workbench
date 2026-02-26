import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "src/lib/runtime/adapters/anthropic.test.ts",
      "src/lib/runtime/adapters/ollama.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "test/**/*.test.ts",
      "test/**/*.test.tsx",
    ],
  },
})
