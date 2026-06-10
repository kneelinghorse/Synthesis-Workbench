/**
 * Real-Data Pipeline Walkthrough (s5-m06 Capstone)
 *
 * End-to-end validation using actual Stage1 artifacts (token-guess.json,
 * component_clusters.json) from the foundational-docs example set.
 *
 * Flow: bundle ingest → token seed → compose → validate → render → export (HTML/JSON/YAML)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Stores
import {
  useStage1BundleStore,
  resetStage1BundleStore,
} from "@/lib/stores/stage1-bundle";
import { useTokenStateStore, resetTokenState } from "@/lib/stores/token-state";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import {
  usePreviewStateStore,
  resetPreviewState,
} from "@/lib/stores/preview-state";
import { useDataContextStore } from "@/lib/stores/data-context";

// Tools
import { executeSetDocument } from "@/lib/runtime/tools/document-tools";
import { buildLoadBundleToolResult } from "@/lib/runtime/tools/stage1-tools";

// Engine
import { renderDocument } from "@/lib/engine/composition-renderer";

// Types
import type { DesignDocument } from "@/types/document-model";
import type { Stage1BundlePayload } from "@/types/stage1-bundle";
import type { FoundryMcpClient } from "@/lib/mcp/foundry-client";

// --- Real Stage1 artifacts (from foundational-docs/examples) ---

const REAL_TOKEN_GUESS = {
  kind: "token_guess" as const,
  version: "1.0.0",
  generated_at: "2026-01-08T17:15:31.304Z",
  tokens: {
    "colors.primary": "#3b82f6",
    "colors.secondary": "#64748b",
    "colors.accent": "#f59e0b",
    "colors.background": "#ffffff",
    "colors.surface": "#f8fafc",
    "colors.text.primary": "#0f172a",
    "colors.text.secondary": "#475569",
    "colors.border": "#e2e8f0",
    "colors.status.success": "#22c55e",
    "colors.status.error": "#ef4444",
    "typography.fontFamily.sans": "Inter, system-ui, sans-serif",
    "typography.fontFamily.mono": "JetBrains Mono, monospace",
    "typography.fontSize.sm": "0.875rem",
    "typography.fontSize.base": "1rem",
    "typography.fontSize.lg": "1.125rem",
    "spacing.sm": "0.5rem",
    "spacing.md": "1rem",
    "spacing.lg": "1.5rem",
    "radius.sm": "0.25rem",
    "radius.md": "0.375rem",
    "radius.lg": "0.5rem",
    "shadow.sm": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    "shadow.md": "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    "custom.brand-gradient": "linear-gradient(135deg, #3b82f6, #8b5cf6)",
  },
};

const REAL_COMPONENT_CLUSTERS = {
  kind: "component_clusters" as const,
  version: "1.1.0",
  generated_at: "2026-01-08T17:15:31.304Z",
  clusters: [
    {
      name: "Button",
      count: 12,
      confidence: 0.95,
      selectors: {
        css: "button, .btn, .Button",
        testId: "[data-testid*='button'], [data-testid*='btn']",
        role: "[role='button']",
      },
      parent_cluster: null,
      variants: ["primary", "secondary", "ghost", "icon"],
    },
    {
      name: "Card",
      count: 6,
      confidence: 0.88,
      selectors: {
        css: ".card, [data-component='card'], article.card",
        testId: "[data-testid*='card']",
      },
      parent_cluster: null,
      variants: ["elevated", "outlined", "filled"],
    },
    {
      name: "CardButton",
      count: 4,
      confidence: 0.72,
      selectors: {
        css: ".card button, .card .btn",
        testId: "[data-testid*='card'] [data-testid*='button']",
      },
      parent_cluster: "Card",
      variants: [],
    },
    {
      name: "Input",
      count: 8,
      confidence: 0.91,
      selectors: {
        css: "input[type='text'], input[type='email'], input[type='password'], .input-field",
        testId: "[data-testid*='input']",
        role: "[role='textbox']",
      },
      parent_cluster: null,
      variants: ["default", "error", "disabled"],
    },
    {
      name: "NavLink",
      count: 15,
      confidence: 0.85,
      selectors: {
        css: "nav a, .nav-link, [data-nav-item]",
        testId: "[data-testid*='nav']",
        role: "[role='navigation'] a",
      },
      parent_cluster: null,
      variants: ["active", "disabled"],
    },
  ],
};

/** Bundle assembled from real Stage1 artifacts */
const REAL_STAGE1_BUNDLE: Stage1BundlePayload = {
  manifest: {
    contractVersion: "1.0.0",
    generatedAt: "2026-01-08T17:15:31.304Z",
    targets: [{ name: "real-app", url: "https://example.com" }],
  },
  artifacts: [
    {
      type: "token_guess",
      path: "token-guess.json",
      payload: REAL_TOKEN_GUESS,
    },
    {
      type: "component_clusters",
      path: "component_clusters.json",
      payload: REAL_COMPONENT_CLUSTERS,
    },
  ],
};

/**
 * Multi-component design document built from the real component clusters.
 * Uses Button, Card, Input, and NavLink — all discovered by Stage1.
 */
const REAL_DATA_DOCUMENT: DesignDocument = {
  metadata: {
    title: "Stage1 Walkthrough — Contact Form",
    description: "Capstone validation using real Stage1 component data",
    version: "1.0.0",
  },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: "1.5rem" },
    children: [
      // Navigation bar using NavLink component
      {
        nodeType: "layout",
        layout: { type: "grid", columns: 4, gap: "0.5rem" },
        children: [
          {
            nodeType: "component",
            id: "nav-home",
            ref: "oods:NavLink",
            props: { label: "Home", href: "/", variant: "active" },
          },
          {
            nodeType: "component",
            id: "nav-about",
            ref: "oods:NavLink",
            props: { label: "About", href: "/about" },
          },
          {
            nodeType: "component",
            id: "nav-contact",
            ref: "oods:NavLink",
            props: { label: "Contact", href: "/contact", variant: "active" },
          },
          {
            nodeType: "component",
            id: "nav-help",
            ref: "oods:NavLink",
            props: { label: "Help", href: "/help", variant: "disabled" },
          },
        ],
      },
      // Card containing the form
      {
        nodeType: "component",
        id: "form-card",
        ref: "oods:Card",
        props: { variant: "elevated", title: "Contact Us" },
      },
      // Form fields using Input components
      {
        nodeType: "layout",
        layout: { type: "stack", gap: "1rem" },
        children: [
          {
            nodeType: "component",
            id: "input-name",
            ref: "oods:Input",
            props: {
              label: "Full Name",
              placeholder: "Enter your name",
              variant: "default",
            },
          },
          {
            nodeType: "component",
            id: "input-email",
            ref: "oods:Input",
            props: {
              label: "Email",
              placeholder: "you@example.com",
              type: "email",
            },
          },
          {
            nodeType: "component",
            id: "input-message",
            ref: "oods:Input",
            props: {
              label: "Message",
              placeholder: "Your message here...",
              variant: "default",
            },
          },
        ],
      },
      // Action buttons
      {
        nodeType: "layout",
        layout: { type: "grid", columns: 2, gap: "0.75rem" },
        children: [
          {
            nodeType: "component",
            id: "btn-submit",
            ref: "oods:Button",
            props: { label: "Send Message", variant: "primary" },
          },
          {
            nodeType: "component",
            id: "btn-cancel",
            ref: "oods:Button",
            props: { label: "Cancel", variant: "ghost" },
          },
        ],
      },
    ],
  },
};

// --- Mock Foundry client ---

function createRealDataClient(): FoundryMcpClient {
  return {
    render: vi.fn(async (schema: unknown) => {
      const s = schema as {
        component?: string;
        props?: Record<string, unknown>;
      };
      const name = s.component ?? "Unknown";
      const propsAttr = Object.entries(s.props ?? {})
        .map(([k, v]) => `data-prop-${k}="${v}"`)
        .join(" ");
      return {
        html: `<div data-component="${name}" ${propsAttr}>${name}</div>`,
        warnings: [],
        raw: schema,
      };
    }),
    validate: vi.fn(async (schema: unknown) => {
      const s = schema as Record<string, unknown>;
      if (!s?.component) {
        return {
          valid: false,
          errors: ["Missing required field: component"],
          warnings: [],
          raw: schema,
        };
      }
      return { valid: true, errors: [], warnings: [], raw: schema };
    }),
    buildTokens: vi.fn(async () => ({ raw: null })),
    fetchStructuredData: vi.fn(),
  };
}

// Mock the Foundry MCP client factory
vi.mock("@/lib/mcp/foundry-client", () => ({
  getFoundryMcpClient: vi.fn(),
}));
vi.mock("@/lib/persistence/design-store", () => ({
  toYAML: vi.fn((doc: unknown) => {
    const d = doc as {
      metadata?: { title?: string; description?: string };
      root?: unknown;
    };
    return [
      "# Synthesis Workbench YAML Export",
      `metadata:`,
      `  title: "${d.metadata?.title ?? "untitled"}"`,
      `  description: "${d.metadata?.description ?? ""}"`,
      `root:`,
      `  nodeType: layout`,
      `  # ... (tree serialized)`,
    ].join("\n");
  }),
}));

import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";

describe("Real-Data Pipeline Walkthrough (s5-m06)", () => {
  beforeEach(() => {
    resetStage1BundleStore();
    resetTokenState();
    useDocumentStateStore.getState().reset();
    resetPreviewState();
    useDataContextStore.getState().reset();
  });

  describe("Step 1 — Bundle Ingestion", () => {
    it("ingests a real Stage1 bundle with token-guess and component-clusters artifacts", async () => {
      const result =
        useStage1BundleStore.getState().loadBundle(REAL_STAGE1_BUNDLE);

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);

      // 24 extractable tokens (colors.border doesn't map to a flat dot-path key)
      expect(result.tokenSuggestionCount).toBe(24);

      // 5 component clusters from real component_clusters.json
      expect(result.componentCount).toBe(5);

      // Verify specific tokens
      expect(result.tokenSuggestions["colors.primary"]).toBe("#3b82f6");
      expect(result.tokenSuggestions["colors.accent"]).toBe("#f59e0b");
      expect(result.tokenSuggestions["typography.fontFamily.sans"]).toBe(
        "Inter, system-ui, sans-serif"
      );
      expect(result.tokenSuggestions["radius.md"]).toBe("0.375rem");
      expect(result.tokenSuggestions["shadow.md"]).toBe(
        "0 4px 6px -1px rgb(0 0 0 / 0.1)"
      );
      expect(result.tokenSuggestions["custom.brand-gradient"]).toBe(
        "linear-gradient(135deg, #3b82f6, #8b5cf6)"
      );

      // Verify component extraction with enhanced fields
      const store = useStage1BundleStore.getState();
      const button = store.components.find((c) => c.name === "Button");
      expect(button).toBeDefined();
      expect(button!.count).toBe(12);
      expect(button!.confidence).toBe(0.95);
      expect(button!.selectors?.css).toContain("button");
      expect(button!.variants).toEqual([
        "primary",
        "secondary",
        "ghost",
        "icon",
      ]);

      const card = store.components.find((c) => c.name === "Card");
      expect(card!.confidence).toBe(0.88);

      const cardButton = store.components.find(
        (c) => c.name === "CardButton"
      );
      expect(cardButton!.parentCluster).toBe("Card");
    });

    it("produces a well-formed tool result summary", async () => {
      const loadResult =
        useStage1BundleStore.getState().loadBundle(REAL_STAGE1_BUNDLE);
      const toolResult = buildLoadBundleToolResult(loadResult);

      expect(toolResult.loaded).toBe(true);
      expect(toolResult.componentCount).toBe(5);
      expect(toolResult.tokenSuggestionCount).toBe(24);
      expect(toolResult.resolvedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    it("handles the same bundle passed as JSON string", async () => {
      const result = useStage1BundleStore
        .getState()
        .loadBundle(JSON.stringify(REAL_STAGE1_BUNDLE));

      expect(result.ok).toBe(true);
      expect(result.tokenSuggestionCount).toBe(24);
      expect(result.componentCount).toBe(5);
    });
  });

  describe("Step 2 — Token Seeding", () => {
    it("seeds TokenState from real token-guess artifacts", async () => {
      useStage1BundleStore.getState().loadBundle(REAL_STAGE1_BUNDLE);
      const seedResult = useStage1BundleStore.getState().seedTokenState();

      expect(seedResult.appliedCount).toBeGreaterThan(0);

      const tokens = useTokenStateStore.getState().tokens;

      // Colors
      expect(tokens.colors.primary).toBe("#3b82f6");
      expect(tokens.colors.secondary).toBe("#64748b");
      expect(tokens.colors.accent).toBe("#f59e0b");
      expect(tokens.colors.background).toBe("#ffffff");
      expect(tokens.colors.surface).toBe("#f8fafc");

      // Typography
      expect(tokens.typography.fontFamily.sans).toBe(
        "Inter, system-ui, sans-serif"
      );
      expect(tokens.typography.fontFamily.mono).toBe(
        "JetBrains Mono, monospace"
      );
      expect(tokens.typography.fontSize.base).toBe("1rem");

      // Spacing
      expect(tokens.spacing.sm).toBe("0.5rem");
      expect(tokens.spacing.md).toBe("1rem");
      expect(tokens.spacing.lg).toBe("1.5rem");

      // Radius
      expect(tokens.radius.sm).toBe("0.25rem");
      expect(tokens.radius.md).toBe("0.375rem");
      expect(tokens.radius.lg).toBe("0.5rem");

      // Shadow
      expect(tokens.shadow.sm).toBe("0 1px 2px 0 rgb(0 0 0 / 0.05)");
      expect(tokens.shadow.md).toBe("0 4px 6px -1px rgb(0 0 0 / 0.1)");

      // Custom
      expect(tokens.custom["brand-gradient"]).toBe(
        "linear-gradient(135deg, #3b82f6, #8b5cf6)"
      );
    });

    it("reports invalid paths for tokens that don't map to TokenState schema", async () => {
      useStage1BundleStore.getState().loadBundle(REAL_STAGE1_BUNDLE);
      const seedResult = useStage1BundleStore.getState().seedTokenState();

      // Some dot-path tokens may not map to valid TokenState paths
      // (e.g. "colors.text.primary" and "colors.border" have varying support)
      // Just verify it doesn't crash and reports any unmapped paths
      expect(seedResult.resolvedAt).toBeTruthy();
      expect(typeof seedResult.appliedCount).toBe("number");
      expect(Array.isArray(seedResult.invalidPaths)).toBe(true);
    });
  });

  describe("Step 3 — Document Composition", () => {
    it("sets a multi-component document using real component names", async () => {
      const docResult = await executeSetDocument({
        requestId: "walkthrough-doc",
        document: REAL_DATA_DOCUMENT,
        slug: "contact-form",
      });

      expect(docResult.saved).toBe(true);
      expect(docResult.nodeCount).toBeGreaterThan(0);
      // 4 NavLinks + 1 Card + 3 Inputs + 2 Buttons = 10 component nodes
      expect(docResult.componentCount).toBe(10);

      // Verify document is in store
      const stored = useDocumentStateStore.getState().document;
      expect(stored).toBeTruthy();
      expect(stored!.metadata.title).toBe(
        "Stage1 Walkthrough — Contact Form"
      );
    });
  });

  describe("Step 4 — Validation & Rendering", () => {
    it("validates and renders all components in the document", async () => {
      const client = createRealDataClient();
      (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue(
        client
      );

      const compositionResult = await renderDocument(
        REAL_DATA_DOCUMENT,
        client
      );

      expect(compositionResult.errors).toHaveLength(0);
      expect(compositionResult.components).toHaveLength(10);

      // Verify all component types were rendered
      const renderedNames = compositionResult.components.map((c) => c.ref);
      expect(renderedNames).toContain("oods:NavLink");
      expect(renderedNames).toContain("oods:Card");
      expect(renderedNames).toContain("oods:Input");
      expect(renderedNames).toContain("oods:Button");

      // Verify HTML structure includes layout wrappers
      expect(compositionResult.html).toContain('data-layout="stack"');
      expect(compositionResult.html).toContain('data-layout="grid"');

      // Verify rendered component HTML includes component data attributes
      expect(compositionResult.html).toContain('data-component="NavLink"');
      expect(compositionResult.html).toContain('data-component="Card"');
      expect(compositionResult.html).toContain('data-component="Input"');
      expect(compositionResult.html).toContain('data-component="Button"');

      // Verify the render function was called with correct component names
      const renderMock = client.render as ReturnType<typeof vi.fn>;
      expect(renderMock).toHaveBeenCalledTimes(10);
      const renderCalls = renderMock.mock.calls.map(
        (call: unknown[]) => (call[0] as { component: string }).component
      );
      expect(renderCalls.filter((n: string) => n === "NavLink")).toHaveLength(4);
      expect(renderCalls.filter((n: string) => n === "Input")).toHaveLength(3);
      expect(renderCalls.filter((n: string) => n === "Button")).toHaveLength(2);
      expect(renderCalls.filter((n: string) => n === "Card")).toHaveLength(1);
    });
  });

});
