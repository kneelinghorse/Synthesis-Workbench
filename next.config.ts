import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Production build type-checks app code via tsconfig.build.json (which excludes
    // test fixtures + scripts). Full-tree type-checking is `npm run typecheck`.
    tsconfigPath: "./tsconfig.build.json",
  },
  env: {
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? "",
    OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? "",
    // Expose Foundry MCP base URL to client-side runtime (Preview Pane + tool UIs).
    // Note: Do not place secrets here; values are inlined into the JS bundle.
    OODS_FOUNDRY_MCP_URL: process.env.OODS_FOUNDRY_MCP_URL ?? "",
    NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL: process.env.OODS_FOUNDRY_MCP_URL ?? "",
    NEXT_PUBLIC_ANTHROPIC_ENABLED: process.env.ANTHROPIC_API_KEY
      ? "true"
      : "",
  },
};

export default nextConfig;
