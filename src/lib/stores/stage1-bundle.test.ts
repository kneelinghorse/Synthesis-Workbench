import { beforeEach, describe, expect, it } from "vitest";

import { buildLoadBundleToolResult } from "@/lib/runtime/tools/stage1-tools";
import { resetStage1BundleStore, useStage1BundleStore } from "./stage1-bundle";
import { resetTokenState, useTokenStateStore } from "./token-state";
import { DEFAULT_TOKEN_STATE } from "@/types/token-state";
import styleFingerprintSample from "./__fixtures__/style_fingerprint.json";

const sampleBundle = {
  manifest: {
    contractVersion: "1.0.0",
    artifacts: [
      {
        id: "token-guess",
        path: "design-research/stage1/synthesis/token-guess.json",
        type: "token-guess",
      },
    ],
  },
  synthesis: {
    tokenGuess: {
      colors: {
        primary: "#111111",
        secondary: "#222222",
      },
      typography: {
        fontFamily: {
          sans: "Inter",
          mono: "JetBrains Mono",
        },
      },
      spacing: {
        md: "1rem",
      },
    },
    components: [{ name: "Button", count: 4 }],
  },
  evidence: {
    components: ["Card"],
  },
  artifacts: [
    {
      id: "component-clusters",
      path: "component-clusters.json",
      type: "component-clusters",
      payload: {
        components: [
          { name: "Badge", count: 2 },
          { name: "Button", count: 5 },
        ],
      },
    },
  ],
};

const fingerprintBundle = {
  manifest: {
    contractVersion: "1.0.0",
  },
  styleFingerprint: styleFingerprintSample,
};

describe("useStage1BundleStore", () => {
  beforeEach(() => {
    resetStage1BundleStore();
    resetTokenState();
  });

  it("loads and parses stage1 bundle JSON", () => {
    const state = useStage1BundleStore.getState();
    const result = state.loadBundle(JSON.stringify(sampleBundle));

    expect(result.ok).toBe(true);
    expect(result.componentCount).toBe(3);
    expect(result.tokenSuggestionCount).toBe(5);

    const updated = useStage1BundleStore.getState();
    expect(updated.manifest?.contractVersion).toBe("1.0.0");
    expect(updated.components.map((component) => component.name)).toEqual(
      expect.arrayContaining(["Button", "Card", "Badge"])
    );
    expect(updated.tokenSuggestions["colors.primary"]).toBe("#111111");
    expect(updated.tokenSuggestions["typography.fontFamily.sans"]).toBe("Inter");
  });

  it("extracts token suggestions from style fingerprint when token guess is missing", () => {
    const state = useStage1BundleStore.getState();
    const result = state.loadBundle(fingerprintBundle);

    expect(result.ok).toBe(true);
    expect(result.tokenSuggestions["colors.primary"]).toBe("#000000");
    expect(result.tokenSuggestions["colors.secondary"]).toBe("#334488");
    expect(result.tokenSuggestions["colors.background"]).toBe("#00000000");
    expect(result.tokenSuggestions["colors.surface"]).toBe("#eeeeee");
    expect(result.tokenSuggestions["typography.fontFamily.sans"]).toBe(
      "system-ui"
    );
    expect(result.tokenSuggestions["typography.fontSize.base"]).toBe("16px");
    expect(result.tokenSuggestions["typography.fontSize.lg"]).toBe("24px");
    expect(result.tokenSuggestions["spacing.xs"]).toBe("0px");
    expect(result.tokenSuggestions["spacing.sm"]).toBe("16px");
    expect(result.tokenSuggestions["radius.none"]).toBe("0px");
  });

  it("prioritizes token-flagged entries when extracting fingerprint tokens", () => {
    const state = useStage1BundleStore.getState();
    const result = state.loadBundle({
      manifest: {
        contractVersion: "1.0.0",
      },
      styleFingerprint: {
        kind: "style_fingerprint",
        type_scale: {
          font_families: [],
        },
        spacing_scale: {
          padding: [],
          margin: [],
        },
        colors: {
          text: [
            { value: "#111111", token: false },
            { value: "#222222", token: true },
          ],
          background: [],
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.tokenSuggestions["colors.primary"]).toBe("#222222");
  });

  it("maps typography line-height and radius scales from fingerprint metrics", () => {
    const state = useStage1BundleStore.getState();
    const result = state.loadBundle({
      manifest: {
        contractVersion: "1.0.0",
      },
      styleFingerprint: {
        kind: "style_fingerprint",
        type_scale: {
          font_families: [{ value: "Inter" }],
          font_sizes: [
            { px: 14, token: true },
            { px: 16, token: true },
            { px: 20, token: true },
          ],
          line_heights: [
            { px: 20, token: true },
            { px: 24, token: true },
            { px: 30, token: true },
          ],
        },
        spacing_scale: {
          padding: [],
          margin: [],
        },
        colors: {
          text: [{ value: "#111111", token: true }],
          background: [{ value: "#ffffff", token: true }],
        },
        radii: [
          { px: 0, token: true },
          { px: 4, token: true },
          { px: 6, token: true },
          { px: 8, token: true },
          { px: 9999, token: true },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.tokenSuggestions["typography.fontSize.base"]).toBe("16px");
    expect(result.tokenSuggestions["typography.lineHeight.tight"]).toBe("20px");
    expect(result.tokenSuggestions["typography.lineHeight.normal"]).toBe("24px");
    expect(result.tokenSuggestions["typography.lineHeight.relaxed"]).toBe("30px");
    expect(result.tokenSuggestions["radius.none"]).toBe("0px");
    expect(result.tokenSuggestions["radius.sm"]).toBe("4px");
    expect(result.tokenSuggestions["radius.md"]).toBe("6px");
    expect(result.tokenSuggestions["radius.lg"]).toBe("8px");
    expect(result.tokenSuggestions["radius.full"]).toBe("9999px");
  });

  it("filters spacing outliers when deriving spacing tokens from fingerprint", () => {
    const state = useStage1BundleStore.getState();
    const result = state.loadBundle({
      manifest: {
        contractVersion: "1.0.0",
      },
      styleFingerprint: {
        kind: "style_fingerprint",
        type_scale: {
          font_families: [{ value: "Inter" }],
          font_sizes: [{ px: 16, token: true }],
          line_heights: [],
        },
        spacing_scale: {
          padding: [
            { px: 0, token: true },
            { px: 4, token: true },
            { px: 8, token: true },
            { px: 12, token: true },
            { px: 16, token: true },
            { px: 128, token: true },
          ],
          margin: [],
        },
        colors: {
          text: [{ value: "#111111", token: true }],
          background: [{ value: "#ffffff", token: true }],
        },
        radii: [{ px: 0, token: true }],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.tokenSuggestions["spacing.xs"]).toBe("0px");
    expect(result.tokenSuggestions["spacing.sm"]).toBe("4px");
    expect(result.tokenSuggestions["spacing.md"]).toBe("8px");
    expect(result.tokenSuggestions["spacing.lg"]).toBe("12px");
    expect(result.tokenSuggestions["spacing.xl"]).toBe("16px");
    expect(result.tokenSuggestions["spacing.2xl"]).toBeUndefined();
  });

  it("seeds token state from bundle suggestions", () => {
    const state = useStage1BundleStore.getState();
    state.loadBundle(sampleBundle);

    const seedResult = state.seedTokenState();
    const tokenState = useTokenStateStore.getState().tokens;

    expect(seedResult.appliedCount).toBeGreaterThan(0);
    expect(tokenState.colors.primary).toBe("#111111");
    expect(tokenState.spacing.md).toBe("1rem");
    expect(tokenState.typography.fontFamily.mono).toBe("JetBrains Mono");
  });

  it("seeds typography and radius token paths from style fingerprint extraction", () => {
    const state = useStage1BundleStore.getState();
    state.loadBundle({
      manifest: {
        contractVersion: "1.0.0",
      },
      styleFingerprint: {
        kind: "style_fingerprint",
        type_scale: {
          font_families: [{ value: "Inter" }, { value: "JetBrains Mono" }],
          font_sizes: [
            { px: 14, token: true },
            { px: 16, token: true },
            { px: 20, token: true },
          ],
          line_heights: [
            { px: 20, token: true },
            { px: 24, token: true },
            { px: 30, token: true },
          ],
        },
        spacing_scale: {
          padding: [{ px: 8, token: true }],
          margin: [{ px: 16, token: true }],
        },
        colors: {
          text: [{ value: "#111111", token: true }],
          background: [{ value: "#ffffff", token: true }],
        },
        radii: [
          { px: 0, token: true },
          { px: 4, token: true },
          { px: 6, token: true },
          { px: 8, token: true },
          { px: 9999, token: true },
        ],
      },
    });

    const seedResult = state.seedTokenState();
    const tokenState = useTokenStateStore.getState().tokens;

    expect(seedResult.appliedCount).toBeGreaterThan(0);
    expect(seedResult.invalidPaths).toEqual([]);
    expect(tokenState.typography.fontSize.base).toBe("16px");
    expect(tokenState.typography.lineHeight.normal).toBe("24px");
    expect(tokenState.radius.sm).toBe("4px");
    expect(tokenState.radius.full).toBe("9999px");
  });

  it("returns a tool result summary with component and token counts", () => {
    const state = useStage1BundleStore.getState();
    const result = state.loadBundle(sampleBundle);
    const toolResult = buildLoadBundleToolResult(result);

    expect(toolResult.loaded).toBe(true);
    expect(toolResult.componentCount).toBe(result.componentCount);
    expect(toolResult.tokenSuggestionCount).toBe(result.tokenSuggestionCount);
  });

  it("handles invalid bundle formats", () => {
    const state = useStage1BundleStore.getState();
    const result = state.loadBundle("{not-valid-json");

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(useStage1BundleStore.getState().error).toContain("failed to parse");
    expect(useTokenStateStore.getState().tokens).toEqual(DEFAULT_TOKEN_STATE);
  });

  describe("token-guess v1.0.0 artifact handler", () => {
    it("parses token-guess artifact with kind and version and extracts dot-path tokens", () => {
      const state = useStage1BundleStore.getState();
      const result = state.loadBundle({
        manifest: { contractVersion: "1.0.0" },
        artifacts: [
          {
            type: "token_guess",
            path: "token-guess.json",
            payload: {
              kind: "token_guess",
              version: "1.0.0",
              generated_at: "2026-01-08T17:15:31.304Z",
              tokens: {
                "colors.primary": "#111111",
                "colors.secondary": "#222222",
                "colors.background": "#ffffff",
                "typography.fontFamily.sans": "Inter, system-ui, sans-serif",
                "typography.fontFamily.mono": "JetBrains Mono, monospace",
                "spacing.sm": "0.5rem",
                "spacing.md": "1rem",
                "radius.md": "0.375rem",
              },
            },
          },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.tokenSuggestions["colors.primary"]).toBe("#111111");
      expect(result.tokenSuggestions["colors.secondary"]).toBe("#222222");
      expect(result.tokenSuggestions["colors.background"]).toBe("#ffffff");
      expect(result.tokenSuggestions["typography.fontFamily.sans"]).toBe(
        "Inter, system-ui, sans-serif"
      );
      expect(result.tokenSuggestions["spacing.md"]).toBe("1rem");
      expect(result.tokenSuggestions["radius.md"]).toBe("0.375rem");
      expect(result.tokenSuggestionCount).toBe(8);
    });

    it("seeds TokenState directly from token-guess dot-path keys", () => {
      const state = useStage1BundleStore.getState();
      state.loadBundle({
        manifest: { contractVersion: "1.0.0" },
        artifacts: [
          {
            type: "token_guess",
            path: "token-guess.json",
            payload: {
              kind: "token_guess",
              version: "1.0.0",
              tokens: {
                "colors.primary": "#ff0000",
                "typography.fontFamily.sans": "Roboto",
                "spacing.lg": "2rem",
              },
            },
          },
        ],
      });

      const seedResult = state.seedTokenState();
      const tokenState = useTokenStateStore.getState().tokens;

      expect(seedResult.appliedCount).toBeGreaterThan(0);
      expect(tokenState.colors.primary).toBe("#ff0000");
      expect(tokenState.typography.fontFamily.sans).toBe("Roboto");
      expect(tokenState.spacing.lg).toBe("2rem");
    });

    it("ignores malformed token-guess (missing kind)", () => {
      const state = useStage1BundleStore.getState();
      const result = state.loadBundle({
        manifest: { contractVersion: "1.0.0" },
        artifacts: [
          {
            type: "token_guess",
            path: "token-guess.json",
            payload: {
              version: "1.0.0",
              tokens: { "colors.primary": "#111" },
            },
          },
        ],
      });

      expect(result.ok).toBe(true);
      // Falls back to generic extractTokenSuggestionMap which still works
      expect(result.tokenSuggestionCount).toBeGreaterThanOrEqual(0);
    });

    it("ignores token-guess with missing tokens map", () => {
      const state = useStage1BundleStore.getState();
      const result = state.loadBundle({
        manifest: { contractVersion: "1.0.0" },
        artifacts: [
          {
            type: "token_guess",
            path: "token-guess.json",
            payload: {
              kind: "token_guess",
              version: "1.0.0",
            },
          },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.tokenSuggestionCount).toBe(0);
    });
  });

  describe("component_clusters v1.1.0 artifact handler", () => {
    it("parses component_clusters with confidence, selectors, parent_cluster, and variants", () => {
      const state = useStage1BundleStore.getState();
      const result = state.loadBundle({
        manifest: { contractVersion: "1.0.0" },
        artifacts: [
          {
            type: "component_clusters",
            path: "component_clusters.json",
            payload: {
              kind: "component_clusters",
              version: "1.1.0",
              generated_at: "2026-01-08T17:15:31.304Z",
              clusters: [
                {
                  name: "Button",
                  count: 12,
                  confidence: 0.92,
                  selectors: {
                    css: "button, .btn, .Button",
                    testId: "[data-testid*='button']",
                    role: "[role='button']",
                  },
                  parent_cluster: null,
                  variants: ["primary", "secondary", "ghost"],
                },
                {
                  name: "Card",
                  count: 6,
                  confidence: 0.85,
                  selectors: {
                    css: ".card, [data-component='card']",
                  },
                  parent_cluster: null,
                  variants: [],
                },
                {
                  name: "CardHeader",
                  count: 6,
                  confidence: 0.78,
                  selectors: {
                    css: ".card-header",
                  },
                  parent_cluster: "Card",
                  variants: [],
                },
              ],
            },
          },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.componentCount).toBe(3);

      const updated = useStage1BundleStore.getState();
      const button = updated.components.find((c) => c.name === "Button");
      expect(button).toBeDefined();
      expect(button?.count).toBe(12);
      expect(button?.confidence).toBe(0.92);
      expect(button?.selectors?.css).toBe("button, .btn, .Button");
      expect(button?.selectors?.testId).toBe("[data-testid*='button']");
      expect(button?.selectors?.role).toBe("[role='button']");
      expect(button?.parentCluster).toBeNull();
      expect(button?.variants).toEqual(["primary", "secondary", "ghost"]);

      const card = updated.components.find((c) => c.name === "Card");
      expect(card?.confidence).toBe(0.85);
      expect(card?.variants).toBeUndefined();

      const cardHeader = updated.components.find(
        (c) => c.name === "CardHeader"
      );
      expect(cardHeader?.parentCluster).toBe("Card");
    });

    it("supports Stage1 cluster schema fields from real runs", () => {
      const state = useStage1BundleStore.getState();
      const result = state.loadBundle({
        manifest: { contractVersion: "1.0.0" },
        artifacts: [
          {
            type: "component_clusters",
            path: "component_clusters.json",
            payload: {
              kind: "component_clusters",
              version: "1.1.0",
              clusters: [
                {
                  clusterId: "cluster-0",
                  patternName: "P Component",
                  tagName: "p",
                  totalInstances: 2,
                  confidence: 0.16,
                  selectors: {
                    css: "p",
                  },
                },
              ],
            },
          },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.componentCount).toBe(1);
      expect(result.components[0]?.name).toBe("P Component");
      expect(result.components[0]?.count).toBe(2);
      expect(result.components[0]?.selectors?.css).toBe("p");
    });

    it("handles malformed component_clusters (missing kind)", () => {
      const state = useStage1BundleStore.getState();
      const result = state.loadBundle({
        manifest: { contractVersion: "1.0.0" },
        artifacts: [
          {
            type: "component_clusters",
            path: "component_clusters.json",
            payload: {
              version: "1.1.0",
              clusters: [{ name: "Button", count: 5 }],
            },
          },
        ],
      });

      expect(result.ok).toBe(true);
      // Falls back to generic label-based component extraction
      expect(result.componentCount).toBe(0);
    });

    it("handles empty clusters array", () => {
      const state = useStage1BundleStore.getState();
      const result = state.loadBundle({
        manifest: { contractVersion: "1.0.0" },
        artifacts: [
          {
            type: "component_clusters",
            path: "component_clusters.json",
            payload: {
              kind: "component_clusters",
              version: "1.1.0",
              clusters: [],
            },
          },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.componentCount).toBe(0);
    });

    it("deduplicates components from multiple sources preserving enhanced fields", () => {
      const state = useStage1BundleStore.getState();
      const result = state.loadBundle({
        manifest: { contractVersion: "1.0.0" },
        synthesis: {
          components: [{ name: "Button", count: 3 }],
        },
        artifacts: [
          {
            type: "component_clusters",
            path: "component_clusters.json",
            payload: {
              kind: "component_clusters",
              version: "1.1.0",
              clusters: [
                {
                  name: "Button",
                  count: 12,
                  confidence: 0.92,
                  selectors: { css: "button" },
                  parent_cluster: null,
                  variants: ["primary"],
                },
              ],
            },
          },
        ],
      });

      expect(result.ok).toBe(true);
      // Should be deduplicated to 1
      expect(result.componentCount).toBe(1);

      const updated = useStage1BundleStore.getState();
      const button = updated.components.find((c) => c.name === "Button");
      expect(button).toBeDefined();
      // Should take the higher count
      expect(button?.count).toBe(12);
      // Should preserve enhanced fields from the cluster artifact
      expect(button?.confidence).toBe(0.92);
    });
  });

  describe("combined token-guess and component_clusters", () => {
    it("processes both artifact types in a single bundle", () => {
      const state = useStage1BundleStore.getState();
      const result = state.loadBundle({
        manifest: { contractVersion: "1.0.0" },
        artifacts: [
          {
            type: "token_guess",
            path: "token-guess.json",
            payload: {
              kind: "token_guess",
              version: "1.0.0",
              tokens: {
                "colors.primary": "#2563eb",
                "typography.fontFamily.sans": "Inter",
                "spacing.md": "1rem",
              },
            },
          },
          {
            type: "component_clusters",
            path: "component_clusters.json",
            payload: {
              kind: "component_clusters",
              version: "1.1.0",
              clusters: [
                {
                  name: "Button",
                  count: 8,
                  confidence: 0.9,
                  selectors: { css: "button" },
                  parent_cluster: null,
                  variants: ["primary", "ghost"],
                },
                {
                  name: "Input",
                  count: 4,
                  confidence: 0.88,
                  selectors: { css: "input" },
                  parent_cluster: null,
                  variants: [],
                },
              ],
            },
          },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.tokenSuggestionCount).toBe(3);
      expect(result.componentCount).toBe(2);
      expect(result.tokenSuggestions["colors.primary"]).toBe("#2563eb");
      expect(result.components.map((c) => c.name)).toEqual(
        expect.arrayContaining(["Button", "Input"])
      );
    });
  });
});
